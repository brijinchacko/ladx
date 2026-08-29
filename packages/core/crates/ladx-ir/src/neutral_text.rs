//! Rockwell neutral text: the string form a rung takes inside an L5X file.
//!
//! An L5X does not store a rung as a drawing. It stores a line like
//!
//! ```text
//! XIC(Start_PB)[XIC(Motor),XIC(Start_PB)]XIO(Stop_PB)OTE(Motor);
//! ```
//!
//! and the editor reconstructs the picture. The grammar is small:
//!
//! - `MNEMONIC(a,b,c)` is one instruction, operands comma separated
//! - `[ leg , leg ]` is a parallel branch, each leg a sequence of instructions
//! - branches nest
//! - `;` ends the rung
//!
//! Two details make it less obvious than it looks. Commas do double duty: they
//! separate operands inside parentheses AND legs inside brackets, so the parser
//! has to know which one it is in. And a branch can appear on the output side,
//! where `[OTE(a),OTE(b)]` means one rung driving two coils rather than a
//! parallel condition.
//!
//! Reading this is the whole of the Rockwell import path, so it is written to
//! fail loudly on anything it does not understand rather than to guess.

use crate::{Instruction, Logic, OpCode, Operand, Rung, VendorDetail};

#[derive(Debug, thiserror::Error, PartialEq)]
pub enum TextError {
    #[error("unexpected character {found:?} at position {at}")]
    Unexpected { at: usize, found: char },
    #[error("unclosed {what} opened at position {at}")]
    Unclosed { at: usize, what: &'static str },
    #[error("empty instruction mnemonic at position {at}")]
    EmptyMnemonic { at: usize },
}

/// One parsed rung: the condition side, and the outputs it drives.
pub fn parse_rung(text: &str, id: impl Into<String>) -> Result<Rung, TextError> {
    let items = Parser::new(text).parse_sequence(0)?;

    // The output side is the trailing run of output instructions. Splitting on
    // "is this an output?" rather than on position is what lets a rung with a
    // branch of two coils, or with no coil at all, both come out right.
    let split = items
        .iter()
        .rposition(|item| !item.is_output())
        .map(|i| i + 1)
        .unwrap_or(0);

    let (condition, output) = items.split_at(split);

    let logic = if condition.is_empty() {
        Logic::empty()
    } else {
        Logic::Series {
            children: condition.iter().map(Item::to_logic).collect(),
        }
    };

    let mut outputs = Vec::new();
    for item in output {
        item.collect_instructions(&mut outputs);
    }

    Ok(Rung {
        id: id.into(),
        comment: None,
        logic: crate::plcopen_graph::normalise(logic),
        outputs,
    })
}

/// A parsed element: either one instruction or a parallel branch of sequences.
#[derive(Debug, Clone)]
enum Item {
    Instr(Instruction),
    Branch(Vec<Vec<Item>>),
}

impl Item {
    /// Whether this belongs on the output side of the rung.
    ///
    /// A branch counts as output only when every leg is, which is what
    /// distinguishes `[OTE(a),OTE(b)]` (two coils) from a parallel condition.
    fn is_output(&self) -> bool {
        match self {
            Item::Instr(i) => i.op.is_output(),
            Item::Branch(legs) => {
                !legs.is_empty() && legs.iter().all(|leg| leg.iter().all(Item::is_output))
            }
        }
    }

    fn to_logic(&self) -> Logic {
        match self {
            Item::Instr(i) => Logic::Element { instruction: i.clone() },
            Item::Branch(legs) => Logic::Parallel {
                children: legs
                    .iter()
                    .map(|leg| Logic::Series {
                        children: leg.iter().map(Item::to_logic).collect(),
                    })
                    .collect(),
            },
        }
    }

    fn collect_instructions(&self, out: &mut Vec<Instruction>) {
        match self {
            Item::Instr(i) => out.push(i.clone()),
            Item::Branch(legs) => {
                for leg in legs {
                    for item in leg {
                        item.collect_instructions(out);
                    }
                }
            }
        }
    }
}

struct Parser<'a> {
    src: &'a [u8],
    pos: usize,
    /// Instruction ids are positional, so the same text always parses to the
    /// same ids and a re-import diffs cleanly against the original.
    counter: usize,
}

impl<'a> Parser<'a> {
    fn new(text: &'a str) -> Self {
        Self { src: text.as_bytes(), pos: 0, counter: 0 }
    }

    fn peek(&self) -> Option<char> {
        self.src.get(self.pos).map(|b| *b as char)
    }

    fn skip_space(&mut self) {
        while matches!(self.peek(), Some(c) if c.is_ascii_whitespace()) {
            self.pos += 1;
        }
    }

    /// A run of instructions and branches, stopping at `,` `]` `;` or the end.
    fn parse_sequence(&mut self, depth: usize) -> Result<Vec<Item>, TextError> {
        let mut items = Vec::new();
        loop {
            self.skip_space();
            match self.peek() {
                None | Some(';') => break,
                Some(',') | Some(']') if depth > 0 => break,
                Some('[') => {
                    let open = self.pos;
                    self.pos += 1;
                    items.push(Item::Branch(self.parse_branch(open, depth + 1)?));
                }
                Some(c) if c.is_ascii_alphanumeric() || c == '_' => {
                    items.push(Item::Instr(self.parse_instruction()?));
                }
                Some(c) => return Err(TextError::Unexpected { at: self.pos, found: c }),
            }
        }
        Ok(items)
    }

    /// The legs of a `[...]`, already past the opening bracket.
    fn parse_branch(&mut self, open: usize, depth: usize) -> Result<Vec<Vec<Item>>, TextError> {
        let mut legs = Vec::new();
        loop {
            legs.push(self.parse_sequence(depth)?);
            self.skip_space();
            match self.peek() {
                Some(',') => {
                    self.pos += 1;
                }
                Some(']') => {
                    self.pos += 1;
                    return Ok(legs);
                }
                _ => return Err(TextError::Unclosed { at: open, what: "branch" }),
            }
        }
    }

    fn parse_instruction(&mut self) -> Result<Instruction, TextError> {
        let start = self.pos;
        while matches!(self.peek(), Some(c) if c.is_ascii_alphanumeric() || c == '_') {
            self.pos += 1;
        }
        let mnemonic = String::from_utf8_lossy(&self.src[start..self.pos]).to_string();
        if mnemonic.is_empty() {
            return Err(TextError::EmptyMnemonic { at: start });
        }

        let mut operands = Vec::new();
        self.skip_space();
        if self.peek() == Some('(') {
            let open = self.pos;
            self.pos += 1;
            operands = self.parse_operands(open)?;
        }

        self.counter += 1;
        let op = OpCode::from_rockwell(&mnemonic);

        Ok(Instruction {
            id: format!("i{}", self.counter),
            op,
            operands,
            // Keep the original spelling always, not only when unmapped: an
            // exporter targeting Rockwell can then reproduce the exact mnemonic
            // instead of inferring it back, and the conversion report can say
            // what the source actually wrote.
            vendor: Some(VendorDetail {
                original_mnemonic: mnemonic,
                attributes: Vec::new(),
            }),
        })
    }

    /// Operands, already past the opening parenthesis.
    ///
    /// Nesting matters: `MOV(SUB(a,b),dest)` puts a comma inside a nested call
    /// that must not split the outer operand list, so brackets and parens are
    /// counted rather than searched for.
    fn parse_operands(&mut self, open: usize) -> Result<Vec<Operand>, TextError> {
        let mut operands = Vec::new();
        let mut current = String::new();
        let mut depth = 0usize;

        loop {
            match self.peek() {
                None => return Err(TextError::Unclosed { at: open, what: "operand list" }),
                Some('(') => {
                    depth += 1;
                    current.push('(');
                    self.pos += 1;
                }
                Some(')') if depth > 0 => {
                    depth -= 1;
                    current.push(')');
                    self.pos += 1;
                }
                Some(')') => {
                    self.pos += 1;
                    push_operand(&mut operands, &current);
                    return Ok(operands);
                }
                Some(',') if depth == 0 => {
                    self.pos += 1;
                    push_operand(&mut operands, &current);
                    current.clear();
                }
                Some(c) => {
                    current.push(c);
                    self.pos += 1;
                }
            }
        }
    }
}

fn push_operand(out: &mut Vec<Operand>, raw: &str) {
    let text = raw.trim();
    if text.is_empty() {
        return;
    }
    // A bare number is a literal; anything else is a tag reference. Rockwell
    // writes both in the same position, so the distinction is by shape.
    match text.parse::<f64>() {
        Ok(value) => out.push(Operand::Number { value }),
        Err(_) => out.push(Operand::Tag { name: text.to_string() }),
    }
}

/// Why a rung could not be written back as Rockwell neutral text.
#[derive(Debug, thiserror::Error, PartialEq)]
pub enum WriteError {
    #[error("{op:?} has no Rockwell equivalent and nothing was preserved to write instead")]
    NoEquivalent { op: OpCode },
    #[error("an unsupported instruction arrived with no record of what it originally was")]
    LostOrigin,
}

/// A rung, written back out as Rockwell neutral text.
///
/// The inverse of [`parse_rung`], and it has to be exact rather than merely
/// plausible: this is what an export writes into somebody's project file.
///
/// The interesting case is [`OpCode::Unsupported`]. LADX could not read the
/// instruction on the way in, so it kept the mnemonic and operands verbatim,
/// and writing it back means putting that original back exactly as it was
/// found. That is the whole preservation contract, and it is the difference
/// between a round trip that returns somebody's project and one that returns a
/// project with the PID loop quietly missing.
pub fn rung_to_text(rung: &Rung) -> Result<String, WriteError> {
    let mut out = String::new();
    write_logic(&rung.logic, &mut out)?;
    for output in &rung.outputs {
        write_instruction(output, &mut out)?;
    }
    out.push(';');
    Ok(out)
}

fn write_logic(logic: &Logic, out: &mut String) -> Result<(), WriteError> {
    match logic {
        Logic::Element { instruction } => write_instruction(instruction, out),
        Logic::Series { children } => {
            for c in children {
                write_logic(c, out)?;
            }
            Ok(())
        }
        Logic::Parallel { children } => {
            out.push('[');
            for (i, c) in children.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                write_logic(c, out)?;
            }
            out.push(']');
            Ok(())
        }
    }
}

fn write_instruction(i: &Instruction, out: &mut String) -> Result<(), WriteError> {
    let mnemonic = match i.op {
        // Put back exactly what was found, which is the only honest thing to
        // write for something LADX never understood.
        OpCode::Unsupported => {
            let v = i.vendor.as_ref().ok_or(WriteError::LostOrigin)?;
            v.original_mnemonic.clone()
        }
        ref op => op
            .clone()
            .to_rockwell()
            .ok_or_else(|| WriteError::NoEquivalent { op: op.clone() })?
            .to_string(),
    };

    out.push_str(&mnemonic);
    out.push('(');
    for (n, operand) in i.operands.iter().enumerate() {
        if n > 0 {
            out.push(',');
        }
        match operand {
            Operand::Tag { name } => out.push_str(name),
            Operand::Text { value } => out.push_str(value),
            Operand::Number { value } => {
                // Written back in the shape it was read in. A preset that went
                // in as 1000 must not come out as 1000.0: Studio 5000 accepts
                // both, but a diff against the customer's original file would
                // light up on every timer in the project.
                if value.fract() == 0.0 && value.is_finite() {
                    out.push_str(&format!("{}", *value as i64));
                } else {
                    out.push_str(&format!("{value}"));
                }
            }
        }
    }
    out.push(')');
    Ok(())
}

impl OpCode {
    /// Map a Rockwell mnemonic onto the neutral instruction set.
    ///
    /// Unknown mnemonics become [`OpCode::Unsupported`] rather than an error.
    /// A project is thousands of rungs and one unrecognised AOI should not stop
    /// the import; it should show up in the conversion report as the one thing
    /// that needs a human.
    pub fn from_rockwell(mnemonic: &str) -> OpCode {
        match mnemonic.to_ascii_uppercase().as_str() {
            "XIC" => OpCode::Contact,
            "XIO" => OpCode::ContactNegated,
            "ONS" | "OSR" => OpCode::RisingEdge,
            "OSF" => OpCode::FallingEdge,
            "OTE" => OpCode::Coil,
            "OTL" => OpCode::SetCoil,
            "OTU" => OpCode::ResetCoil,
            "TON" => OpCode::TimerOn,
            "TOF" => OpCode::TimerOff,
            "RTO" => OpCode::TimerRetentive,
            "CTU" => OpCode::CountUp,
            "CTD" => OpCode::CountDown,
            "RES" => OpCode::Reset,
            "EQU" => OpCode::Equal,
            "NEQ" => OpCode::NotEqual,
            "GRT" => OpCode::Greater,
            "LES" => OpCode::Less,
            "GEQ" => OpCode::GreaterOrEqual,
            "LEQ" => OpCode::LessOrEqual,
            "MOV" => OpCode::Move,
            "ADD" => OpCode::Add,
            "SUB" => OpCode::Subtract,
            "MUL" => OpCode::Multiply,
            "DIV" => OpCode::Divide,
            "JSR" => OpCode::Call,
            "JMP" => OpCode::Jump,
            "LBL" => OpCode::Label,
            "RET" => OpCode::Return,
            _ => OpCode::Unsupported,
        }
    }

    /// The Rockwell spelling, for the export direction.
    pub fn to_rockwell(self) -> Option<&'static str> {
        Some(match self {
            OpCode::Contact => "XIC",
            OpCode::ContactNegated => "XIO",
            OpCode::RisingEdge => "ONS",
            OpCode::FallingEdge => "OSF",
            OpCode::Coil => "OTE",
            OpCode::SetCoil => "OTL",
            OpCode::ResetCoil => "OTU",
            OpCode::TimerOn => "TON",
            OpCode::TimerOff => "TOF",
            OpCode::TimerRetentive => "RTO",
            OpCode::CountUp => "CTU",
            OpCode::CountDown => "CTD",
            OpCode::Reset => "RES",
            OpCode::Equal => "EQU",
            OpCode::NotEqual => "NEQ",
            OpCode::Greater => "GRT",
            OpCode::Less => "LES",
            OpCode::GreaterOrEqual => "GEQ",
            OpCode::LessOrEqual => "LEQ",
            OpCode::Move => "MOV",
            OpCode::Add => "ADD",
            OpCode::Subtract => "SUB",
            OpCode::Multiply => "MUL",
            OpCode::Divide => "DIV",
            OpCode::Call => "JSR",
            OpCode::Jump => "JMP",
            OpCode::Label => "LBL",
            OpCode::Return => "RET",
            // No Rockwell equivalent: a negated coil is drawn differently, and
            // Unsupported has nothing to render.
            OpCode::CoilNegated | OpCode::Unsupported => return None,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tags(logic: &Logic) -> Vec<String> {
        logic
            .instructions()
            .iter()
            .filter_map(|i| match i.operands.first() {
                Some(Operand::Tag { name }) => Some(name.clone()),
                _ => None,
            })
            .collect()
    }

    #[test]
    fn plain_series() {
        let rung = parse_rung("XIC(Start)XIO(Stop)OTE(Motor);", "r1").unwrap();
        assert_eq!(tags(&rung.logic), vec!["Start", "Stop"]);
        assert_eq!(rung.outputs.len(), 1);
        assert_eq!(rung.outputs[0].op, OpCode::Coil);
    }

    #[test]
    fn seal_in_branch() {
        // The circuit the whole product is built around.
        let rung = parse_rung("[XIC(Start),XIC(Motor)]XIO(Stop)OTE(Motor);", "r1").unwrap();
        match &rung.logic {
            Logic::Series { children } => {
                assert_eq!(children.len(), 2, "branch then Stop");
                assert!(matches!(children[0], Logic::Parallel { .. }));
            }
            other => panic!("expected a series, got {other:?}"),
        }
        assert_eq!(rung.outputs.len(), 1);
    }

    #[test]
    fn nested_branches() {
        let rung = parse_rung("XIC(A)[XIC(B)[XIC(C),XIC(D)],XIC(E)]OTE(F);", "r1").unwrap();
        let names = tags(&rung.logic);
        assert!(names.contains(&"C".to_string()) && names.contains(&"D".to_string()));
        assert_eq!(rung.outputs.len(), 1);
    }

    #[test]
    fn branch_of_outputs_is_all_output() {
        // Two coils driven by one condition, not a parallel condition.
        let rung = parse_rung("XIC(A)[OTE(B),OTE(C)];", "r1").unwrap();
        assert_eq!(tags(&rung.logic), vec!["A"]);
        assert_eq!(rung.outputs.len(), 2, "both coils are outputs");
    }

    #[test]
    fn timer_keeps_its_operands() {
        let rung = parse_rung("XIC(Run)TON(T1,1000,0);", "r1").unwrap();
        let timer = &rung.outputs[0];
        assert_eq!(timer.op, OpCode::TimerOn);
        assert_eq!(timer.operands.len(), 3);
        assert!(matches!(&timer.operands[0], Operand::Tag { name } if name == "T1"));
        assert!(matches!(timer.operands[1], Operand::Number { value } if value == 1000.0));
    }

    #[test]
    fn nested_call_does_not_split_operands() {
        // The comma inside SUB(...) belongs to SUB, not to MOV.
        let rung = parse_rung("MOV(SUB(a,b),dest);", "r1").unwrap();
        assert_eq!(rung.outputs.len(), 1);
        assert_eq!(rung.outputs[0].operands.len(), 2, "SUB(a,b) and dest");
    }

    #[test]
    fn unknown_mnemonic_survives_as_unsupported() {
        // A custom AOI. The rung must still import.
        let rung = parse_rung("XIC(A)MyCustomAOI(x,y)OTE(B);", "r1").unwrap();
        let unsupported: Vec<_> = rung
            .logic
            .instructions()
            .into_iter()
            .chain(rung.outputs.iter())
            .filter(|i| i.op == OpCode::Unsupported)
            .collect();
        assert_eq!(unsupported.len(), 1);
        assert_eq!(
            unsupported[0].vendor.as_ref().map(|v| v.original_mnemonic.as_str()),
            Some("MyCustomAOI"),
            "the original spelling is kept so the report can name it"
        );
    }

    #[test]
    fn empty_rung_parses() {
        let rung = parse_rung(";", "r1").unwrap();
        assert_eq!(rung.logic, Logic::empty());
        assert!(rung.outputs.is_empty());
    }

    #[test]
    fn unclosed_branch_is_an_error() {
        assert!(matches!(
            parse_rung("XIC(A)[XIC(B)OTE(C);", "r1"),
            Err(TextError::Unclosed { .. })
        ));
    }

    #[test]
    fn unclosed_operand_list_is_an_error() {
        assert!(matches!(
            parse_rung("XIC(A", "r1"),
            Err(TextError::Unclosed { .. })
        ));
    }

    #[test]
    fn whitespace_is_tolerated() {
        // Hand-edited files and copy-paste both introduce it.
        let a = parse_rung("XIC(Start)XIO(Stop)OTE(Motor);", "r1").unwrap();
        let b = parse_rung("  XIC( Start ) XIO( Stop )  OTE( Motor ) ; ", "r1").unwrap();
        assert_eq!(tags(&a.logic), tags(&b.logic));
        assert_eq!(a.outputs[0].operands, b.outputs[0].operands);
    }

    #[test]
    fn mnemonics_round_trip() {
        for text in ["XIC", "XIO", "OTE", "OTL", "TON", "CTU", "MOV", "GRT", "JSR"] {
            let op = OpCode::from_rockwell(text);
            assert_ne!(op, OpCode::Unsupported, "{text} should map");
            assert_eq!(op.to_rockwell(), Some(text), "{text} should round trip");
        }
    }
}

#[cfg(test)]
mod write_tests {
    use super::*;

    /// text -> IR -> text, byte for byte.
    ///
    /// The strongest statement available about an importer and an exporter that
    /// have to agree, and the one that would catch a mapping that is wrong in
    /// both directions in a way that cancels out on a single pass.
    fn round_trip(text: &str) {
        let rung = parse_rung(text, "r1").unwrap_or_else(|e| panic!("{text:?} did not parse: {e}"));
        let back = rung_to_text(&rung).unwrap_or_else(|e| panic!("{text:?} did not write: {e}"));
        assert_eq!(back, text, "round trip changed the rung");
    }

    #[test]
    fn a_plain_series_survives() {
        round_trip("XIC(Start)XIO(Stop)OTE(Motor);");
    }

    #[test]
    fn a_seal_in_survives() {
        round_trip("[XIC(Start_PB),XIC(Motor)]XIO(Stop_PB)OTE(Motor);");
    }

    #[test]
    fn nested_branches_survive() {
        round_trip("XIC(a)[XIC(b),[XIC(c),XIC(d)]XIC(e)]OTE(f);");
    }

    #[test]
    fn timers_keep_their_preset_shape() {
        // 1000, not 1000.0. A diff against the customer's own file would
        // otherwise light up on every timer in the project.
        round_trip("XIC(Run)TON(T1,1000,0);");
    }

    #[test]
    fn several_outputs_survive() {
        round_trip("XIC(Reset)OTU(A)OTU(B)OTU(C);");
    }

    #[test]
    fn an_empty_rung_survives() {
        round_trip("OTE(Always);");
    }

    /// The preservation contract, in the direction that matters.
    ///
    /// LADX could not read PID on the way in, so it kept the mnemonic and
    /// operands. Writing it back must put the original back exactly. If this
    /// fails, an export hands somebody their project with the loop missing.
    #[test]
    fn an_instruction_ladx_never_understood_comes_back_unchanged() {
        round_trip("XIC(Enable)PID(Loop,PV,CV);");

        let rung = parse_rung("XIC(Enable)PID(Loop,PV,CV);", "r1").unwrap();
        let pid = rung
            .logic
            .instructions()
            .into_iter()
            .chain(rung.outputs.iter())
            .find(|i| i.op == OpCode::Unsupported)
            .expect("PID should be unsupported");
        assert_eq!(pid.vendor.as_ref().unwrap().original_mnemonic, "PID");
    }

    /// An unsupported instruction that has lost its origin cannot be written,
    /// and must say so rather than inventing a mnemonic.
    #[test]
    fn an_unsupported_instruction_with_no_origin_is_refused() {
        let rung = Rung {
            id: "r1".into(),
            comment: None,
            logic: Logic::empty(),
            outputs: vec![Instruction {
                id: "i1".into(),
                op: OpCode::Unsupported,
                operands: vec![Operand::Tag { name: "x".into() }],
                vendor: None,
            }],
        };
        assert_eq!(rung_to_text(&rung), Err(WriteError::LostOrigin));
    }

    /// A negated coil is drawn, not written, in Rockwell. Refused loudly
    /// rather than silently turned into an OTE, which would invert the logic.
    #[test]
    fn a_negated_coil_is_refused_rather_than_mangled() {
        let rung = Rung {
            id: "r1".into(),
            comment: None,
            logic: Logic::empty(),
            outputs: vec![Instruction {
                id: "i1".into(),
                op: OpCode::CoilNegated,
                operands: vec![Operand::Tag { name: "Motor".into() }],
                vendor: None,
            }],
        };
        assert_eq!(
            rung_to_text(&rung),
            Err(WriteError::NoEquivalent { op: OpCode::CoilNegated })
        );
    }

    /// And the other direction: IR -> text -> IR, over the shapes the fixtures
    /// use. Catches a writer that produces something readable but different.
    #[test]
    fn the_ir_survives_a_trip_through_text() {
        for text in [
            "XIC(Start)XIO(Stop)OTE(Motor);",
            "[XIC(A),XIC(B),XIC(C)]OTE(Any);",
            "XIC(Run)TON(T1,5000,0);",
            "EQU(Step,10)XIC(Done)MOV(20,Step);",
            "XIC(Enable)PID(Loop,PV,CV);",
        ] {
            let first = parse_rung(text, "r1").unwrap();
            let written = rung_to_text(&first).unwrap();
            let second = parse_rung(&written, "r1").unwrap();
            assert_eq!(second, first, "IR changed through text for {text:?}");
        }
    }
}
