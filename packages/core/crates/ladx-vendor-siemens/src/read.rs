//! SCL in, IR out. The direction that did not exist.
//!
//! Until now Siemens conversion ran one way: IR to SCL. That makes LADX a
//! writer for Siemens and a reader for Rockwell, which means a Siemens house
//! gets nothing out of the analysis, the tracing, the drift checks, or the
//! handover pack, because none of them can see the program.
//!
//! Two things this reader is careful about.
//!
//! It reads the SCL it can, and says plainly which statements it could not.
//! An importer that quietly drops what it does not understand produces an IR
//! that looks complete and is missing rungs, and every analysis downstream then
//! reports confidently on a program that is not the one on the machine. So a
//! statement it cannot parse becomes a rung carrying the original text, marked
//! unread, rather than nothing.
//!
//! And boolean assignment is not ladder. `A := B AND C;` maps onto a rung
//! cleanly; `IF ... THEN ... END_IF` with several assignments inside does not,
//! and neither does anything with intermediate state. Where the shape does not
//! fit a rung, it is kept and marked rather than bent into one.

use ladx_ir::{
    Instruction, IrProject, Logic, OpCode, Operand, Pou, PouBody, PouKind, Rung, Tag, Vendor,
    VendorDetail,
};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ReadFidelity {
    /// Read into ladder with nothing lost.
    Exact,
    /// Read, but the ladder is a fair rendering rather than the same thing.
    Approximate,
    /// Kept as text. Not read.
    Unread,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadNote {
    pub fidelity: ReadFidelity,
    /// Where in the file, so it can be found.
    pub at: String,
    pub detail: String,
    /// The SCL itself, for anything not fully read.
    pub source: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadResult {
    pub project: IrProject,
    pub notes: Vec<ReadNote>,
}

impl ReadResult {
    pub fn unread(&self) -> usize {
        self.notes.iter().filter(|n| n.fidelity == ReadFidelity::Unread).count()
    }

    /// Whether the IR is the whole program. The answer downstream analysis
    /// needs before it says anything confident.
    pub fn is_complete(&self) -> bool {
        self.unread() == 0
    }

    pub fn summary(&self) -> String {
        let n = |f: ReadFidelity| self.notes.iter().filter(|x| x.fidelity == f).count();
        format!(
            "{} read exactly, {} approximated, {} not read",
            n(ReadFidelity::Exact),
            n(ReadFidelity::Approximate),
            n(ReadFidelity::Unread)
        )
    }
}

/* ─────────────────────────────── tokens ─────────────────────────────── */

#[derive(Debug, Clone, PartialEq)]
enum Tok {
    /// A symbol, with the quotes stripped and any `.Q` kept on.
    Sym(String),
    Num(f64),
    Time(String),
    Bool(bool),
    And,
    Or,
    Not,
    Open,
    Close,
    Op(String),
    Comma,
    Assign,
}

fn lex(s: &str) -> Option<Vec<Tok>> {
    let mut out = Vec::new();
    let b: Vec<char> = s.chars().collect();
    let mut i = 0;
    while i < b.len() {
        let c = b[i];
        if c.is_whitespace() {
            i += 1;
            continue;
        }
        match c {
            '(' => {
                out.push(Tok::Open);
                i += 1;
            }
            ')' => {
                out.push(Tok::Close);
                i += 1;
            }
            ',' => {
                out.push(Tok::Comma);
                i += 1;
            }
            ':' if b.get(i + 1) == Some(&'=') => {
                out.push(Tok::Assign);
                i += 2;
            }
            '"' => {
                let mut j = i + 1;
                while j < b.len() && b[j] != '"' {
                    j += 1;
                }
                if j >= b.len() {
                    return None; // unterminated symbol
                }
                let mut name: String = b[i + 1..j].iter().collect();
                j += 1;
                // "Timer".Q and "Struct".Member both continue the symbol.
                while b.get(j) == Some(&'.') {
                    let mut k = j + 1;
                    while k < b.len() && (b[k].is_alphanumeric() || b[k] == '_') {
                        k += 1;
                    }
                    if k == j + 1 {
                        break;
                    }
                    name.push('.');
                    name.extend(&b[j + 1..k]);
                    j = k;
                }
                out.push(Tok::Sym(name));
                i = j;
            }
            '<' | '>' | '=' => {
                let mut op = c.to_string();
                if matches!(b.get(i + 1), Some('=') | Some('>')) && c != '=' {
                    op.push(b[i + 1]);
                    i += 1;
                }
                out.push(Tok::Op(op));
                i += 1;
            }
            _ if c.is_ascii_digit() => {
                let mut j = i;
                while j < b.len() && (b[j].is_ascii_digit() || b[j] == '.') {
                    j += 1;
                }
                let text: String = b[i..j].iter().collect();
                out.push(Tok::Num(text.parse().ok()?));
                i = j;
            }
            _ if c.is_alphabetic() || c == '_' || c == '#' => {
                let mut j = i;
                while j < b.len() && (b[j].is_alphanumeric() || b[j] == '_' || b[j] == '#') {
                    j += 1;
                }
                let mut word: String = b[i..j].iter().collect();
                // T#5s, and the ms suffix that follows the identifier chars.
                if word.eq_ignore_ascii_case("T") && b.get(j) == Some(&'#') {
                    let mut k = j + 1;
                    while k < b.len() && (b[k].is_alphanumeric() || b[k] == '_') {
                        k += 1;
                    }
                    word = b[i..k].iter().collect();
                    out.push(Tok::Time(word));
                    i = k;
                    continue;
                }
                // An unquoted identifier is still a symbol; TIA only requires
                // quotes where the name needs them.
                match word.to_uppercase().as_str() {
                    "AND" => out.push(Tok::And),
                    "OR" => out.push(Tok::Or),
                    "NOT" => out.push(Tok::Not),
                    "TRUE" => out.push(Tok::Bool(true)),
                    "FALSE" => out.push(Tok::Bool(false)),
                    _ => {
                        let mut name = word;
                        while b.get(j) == Some(&'.') {
                            let mut k = j + 1;
                            while k < b.len() && (b[k].is_alphanumeric() || b[k] == '_') {
                                k += 1;
                            }
                            if k == j + 1 {
                                break;
                            }
                            name.push('.');
                            name.extend(&b[j + 1..k]);
                            j = k;
                        }
                        out.push(Tok::Sym(name));
                    }
                }
                i = j;
            }
            _ => return None, // something this reader does not know
        }
    }
    Some(out)
}

/* ───────────────────────── expression to ladder ─────────────────────── */

struct P<'a> {
    t: &'a [Tok],
    i: usize,
    n: usize,
    /// Instance name to the bit it watches. An `R_TRIG` instance read as `.Q`
    /// is a one-shot on that bit, and reading it as a plain contact on a tag
    /// called `R_TRIG_Run_Req.DN` would import a program with an edge missing
    /// and an invented tag in its place.
    edges: &'a BTreeMap<String, (String, OpCode)>,
}

impl<'a> P<'a> {
    fn peek(&self) -> Option<&Tok> {
        self.t.get(self.i)
    }
    fn next_id(&mut self) -> String {
        self.n += 1;
        format!("s{}", self.n)
    }

    /// OR binds loosest, so it is the outermost parallel.
    fn or(&mut self) -> Option<Logic> {
        let mut branches = vec![self.and()?];
        while self.peek() == Some(&Tok::Or) {
            self.i += 1;
            branches.push(self.and()?);
        }
        Some(if branches.len() == 1 {
            branches.pop().unwrap()
        } else {
            Logic::Parallel { children: branches }
        })
    }

    fn and(&mut self) -> Option<Logic> {
        let mut items = vec![self.unary()?];
        while self.peek() == Some(&Tok::And) {
            self.i += 1;
            items.push(self.unary()?);
        }
        Some(if items.len() == 1 { items.pop().unwrap() } else { Logic::Series { children: items } })
    }

    fn unary(&mut self) -> Option<Logic> {
        if self.peek() == Some(&Tok::Not) {
            self.i += 1;
            let inner = self.unary()?;
            // NOT over a single contact is a negated contact. NOT over a group
            // has no ladder equivalent, and inverting each leaf would be a
            // different rung, so that case is refused rather than guessed.
            return match inner {
                Logic::Element { instruction }
                    if instruction.op == OpCode::Contact =>
                {
                    Some(Logic::Element {
                        instruction: Instruction { op: OpCode::ContactNegated, ..instruction },
                    })
                }
                _ => None,
            };
        }
        self.atom()
    }

    fn atom(&mut self) -> Option<Logic> {
        match self.peek()?.clone() {
            Tok::Open => {
                self.i += 1;
                let inner = self.or()?;
                if self.peek() != Some(&Tok::Close) {
                    return None;
                }
                self.i += 1;
                Some(inner)
            }
            Tok::Sym(name) => {
                self.i += 1;
                // A comparison, if an operator follows.
                if let Some(Tok::Op(op)) = self.peek().cloned() {
                    self.i += 1;
                    let rhs = match self.peek()?.clone() {
                        Tok::Num(v) => Operand::Number { value: v },
                        Tok::Sym(s) => Operand::Tag { name: member_from_s7(&s) },
                        _ => return None,
                    };
                    self.i += 1;
                    let code = match op.as_str() {
                        "=" => OpCode::Equal,
                        "<>" => OpCode::NotEqual,
                        ">" => OpCode::Greater,
                        "<" => OpCode::Less,
                        ">=" => OpCode::GreaterOrEqual,
                        "<=" => OpCode::LessOrEqual,
                        _ => return None,
                    };
                    let id = self.next_id();
                    return Some(Logic::Element {
                        instruction: Instruction {
                            id,
                            op: code,
                            operands: vec![Operand::Tag { name: member_from_s7(&name) }, rhs],
                            vendor: None,
                        },
                    });
                }
                let id = self.next_id();
                let base = name.split('.').next().unwrap_or(&name);
                if let Some((clk, op)) = self.edges.get(base) {
                    return Some(Logic::Element {
                        instruction: Instruction {
                            id,
                            op: op.clone(),
                            operands: vec![Operand::Tag { name: clk.clone() }],
                            vendor: None,
                        },
                    });
                }
                Some(Logic::Element {
                    instruction: Instruction {
                        id,
                        op: OpCode::Contact,
                        operands: vec![Operand::Tag { name: member_from_s7(&name) }],
                        vendor: None,
                    },
                })
            }
            _ => None,
        }
    }
}

fn expression(
    toks: &[Tok],
    seed: usize,
    edges: &BTreeMap<String, (String, OpCode)>,
) -> Option<Logic> {
    let mut p = P { t: toks, i: 0, n: seed, edges };
    let out = p.or()?;
    if p.i == toks.len() {
        Some(out)
    } else {
        None // trailing tokens mean this reader misread the shape
    }
}

/* ────────────────────────────── statements ──────────────────────────── */

/// Split into statements, keeping the comment that sits above each one and
/// dropping nothing silently.
struct Stmt {
    comment: Option<String>,
    text: String,
    line: usize,
    /// A rung the writer could not express in SCL and carried as a comment.
    /// Read back as a rung, because a rung that leaves as a comment and comes
    /// home as nothing is a rung the next analysis will not know about.
    carried: Option<Carried>,
}

#[derive(Clone)]
struct Carried {
    /// The instruction as the writer named it, "PID", or "an unrecognised
    /// instruction" where even that was unknown.
    mnemonic: String,
    /// What it worked on.
    operands: Vec<String>,
    /// The condition it sat under, where there was one.
    condition: Option<String>,
}

fn statements(src: &str) -> (Vec<Stmt>, Vec<(usize, String)>) {
    let mut out = Vec::new();
    let mut regions = Vec::new();
    let mut pending: Vec<String> = Vec::new();
    let mut buf = String::new();
    let mut start = 1;
    // Declarations are read separately. Left in the statement stream they do
    // not merely produce junk statements, they swallow the statement after
    // END_VAR, because a declaration block does not end the way a statement
    // does.
    let mut in_declarations = false;

    for (n, raw) in src.lines().enumerate() {
        let line = n + 1;
        let trimmed = raw.trim();

        let upper = trimmed.to_uppercase();
        if upper.starts_with("END_VAR") {
            in_declarations = false;
            continue;
        }
        if upper == "VAR"
            || upper.starts_with("VAR ")
            || upper.starts_with("VAR_INPUT")
            || upper.starts_with("VAR_OUTPUT")
            || upper.starts_with("VAR_IN_OUT")
            || upper.starts_with("VAR_TEMP")
            || upper.starts_with("VAR CONSTANT")
        {
            in_declarations = true;
            continue;
        }
        if in_declarations {
            continue;
        }

        // The generator writes POU headers as a comment. Read them back.
        if let Some(name) = trimmed
            .strip_prefix("//")
            .map(str::trim)
            .and_then(|c| c.strip_prefix('\u{2500}').map(|_| c))
        {
            let name = name.trim_matches(|c: char| c == '\u{2500}' || c.is_whitespace());
            if !name.is_empty() {
                regions.push((line, name.to_string()));
                pending.clear();
                continue;
            }
        }

        if let Some(c) = trimmed.strip_prefix("//") {
            let c = c.trim();
            // The two shapes the writer uses to carry a rung it could not
            // convert. Recognised here so they come back as rungs.
            let split_call = |text: &str| -> (String, Vec<String>) {
                match (text.find('('), text.rfind(')')) {
                    (Some(o), Some(cl)) if cl > o => (
                        text[..o].trim().to_string(),
                        split_args(&text[o + 1..cl])
                            .into_iter()
                            .map(|a| a.trim().trim_matches('"').to_string())
                            .filter(|a| !a.is_empty())
                            .collect(),
                    ),
                    _ => (text.trim().to_string(), Vec::new()),
                }
            };
            let carried = c
                .strip_prefix("not converted:")
                .map(|rest| {
                    let (mnemonic, operands) = split_call(rest);
                    Carried { mnemonic, operands, condition: None }
                })
                .or_else(|| {
                    c.split_once(" under: ").map(|(m, cond)| {
                        let (mnemonic, operands) = split_call(m);
                        Carried {
                            mnemonic,
                            operands,
                            condition: Some(cond.trim().to_string()),
                        }
                    })
                });
            if let Some(carried) = carried {
                if buf.trim().is_empty() {
                    out.push(Stmt {
                        comment: (!pending.is_empty()).then(|| pending.join(" ")),
                        text: c.to_string(),
                        line,
                        carried: Some(carried),
                    });
                    pending.clear();
                    continue;
                }
            }
            if buf.trim().is_empty() {
                pending.push(c.to_string());
            }
            continue;
        }
        if trimmed.is_empty() {
            if buf.trim().is_empty() {
                pending.clear();
            }
            continue;
        }
        if buf.trim().is_empty() {
            start = line;
        }
        buf.push_str(trimmed);
        buf.push(' ');

        // A semicolon ends an ordinary statement. Inside an IF it does not:
        // the assignment in the body has one too, so an IF ends only at its
        // END_IF, whether that is on the same line or three lines down.
        let up = buf.to_uppercase();
        let ends = if up.trim_start().starts_with("IF ") {
            up.contains("END_IF") && trimmed.ends_with(';')
        } else {
            trimmed.ends_with(';')
        };
        if ends {
            out.push(Stmt {
                comment: (!pending.is_empty()).then(|| pending.join(" ")),
                text: buf.trim().to_string(),
                line: start,
                carried: None,
            });
            buf.clear();
            pending.clear();
        }
    }
    if !buf.trim().is_empty() {
        out.push(Stmt {
            comment: (!pending.is_empty()).then(|| pending.join(" ")),
            text: buf.trim().to_string(),
            line: start,
            carried: None,
        });
    }
    (out, regions)
}

fn unread(stmt: &Stmt, why: &str) -> (Rung, ReadNote) {
    let id = format!("r{}", stmt.line);
    (
        Rung {
            id: id.clone(),
            comment: stmt.comment.clone(),
            logic: Logic::empty(),
            outputs: vec![Instruction {
                id: format!("{id}_unread"),
                op: OpCode::Unsupported,
                operands: vec![],
                vendor: Some(VendorDetail {
                    original_mnemonic: "SCL".into(),
                    attributes: vec![("source".to_string(), stmt.text.clone())],
                }),
            }],
        },
        ReadNote {
            fidelity: ReadFidelity::Unread,
            at: format!("line {}", stmt.line),
            detail: why.to_string(),
            source: Some(stmt.text.clone()),
        },
    )
}

/// The inverse of `scl::member_for_s7`.
///
/// S7 timers expose Q and ET; the IR spells those DN and ACC, and every
/// analysis in ladx-ir, the graph, the tracer, the sequence reader, matches on
/// the IR spelling. Leaving a tag as `Dwell.Q` would import a program whose
/// timer nothing downstream recognises as a timer, which fails quietly.
fn member_from_s7(name: &str) -> String {
    let Some((base, member)) = name.split_once('.') else { return name.to_string() };
    let ir = match member.to_ascii_uppercase().as_str() {
        "Q" => "DN",
        "ET" => "ACC",
        "PT" => "PRE",
        _ => return name.to_string(),
    };
    format!("{base}.{ir}")
}

/// An SCL type name as an IR type. Anything unrecognised keeps its name rather
/// than being flattened to BOOL, which would be a silent lie about the tag.
fn data_type_of(name: &str) -> ladx_ir::DataType {
    use ladx_ir::DataType as D;
    match name.to_uppercase().as_str() {
        "BOOL" => D::Bool,
        "INT" | "SINT" | "USINT" | "UINT" | "WORD" | "BYTE" => D::Int,
        "DINT" | "UDINT" | "DWORD" => D::Dint,
        "REAL" | "LREAL" => D::Real,
        "STRING" | "WSTRING" | "CHAR" => D::String,
        "TON_TIME" | "TOF_TIME" | "TON" | "TOF" | "TP" | "IEC_TIMER" => D::Timer,
        "CTU" | "CTD" | "CTUD" | "IEC_COUNTER" => D::Counter,
        other => D::Named { name: other.to_string() },
    }
}

/// Instance name to declared type, lowercased for lookup.
fn declaration_types(src: &str) -> BTreeMap<String, String> {
    declarations(src)
        .into_iter()
        .map(|t| {
            let ty = match &t.data_type {
                ladx_ir::DataType::Named { name } => name.clone(),
                other => format!("{other:?}"),
            };
            (t.name.to_lowercase(), ty)
        })
        .collect()
}

/// Declarations, so the tags exist even where the logic does not read.
fn declarations(src: &str) -> Vec<Tag> {
    let mut tags = Vec::new();
    let mut inside = false;
    for line in src.lines() {
        let t = line.trim();
        let upper = t.to_uppercase();
        if upper.starts_with("VAR") {
            inside = true;
            continue;
        }
        if upper.starts_with("END_VAR") {
            inside = false;
            continue;
        }
        if !inside {
            continue;
        }
        let t = t.trim_end_matches(';');
        let Some((name, ty)) = t.split_once(':') else { continue };
        let name = name.trim().trim_matches('"');
        if name.is_empty() {
            continue;
        }
        tags.push(Tag {
            name: name.to_string(),
            data_type: data_type_of(ty.trim()),
            address: None,
            initial_value: None,
            comment: None,
            field: None,
        });
    }
    tags
}

/// Read SCL into the IR.
pub fn read_scl(name: &str, src: &str) -> ReadResult {
    let (stmts, regions) = statements(src);
    let mut notes = Vec::new();
    let mut declared = declarations(src);

    // Statements belong to the region above them.
    let region_at = |line: usize| -> String {
        regions
            .iter()
            .rev()
            .find(|(l, _)| *l < line)
            .map(|(_, n)| n.clone())
            .unwrap_or_else(|| "Main".to_string())
    };

    // An edge instance is set up by its call and used later, so the calls have
    // to be known before any statement is read.
    let mut edges: BTreeMap<String, (String, OpCode)> = BTreeMap::new();
    let declared_types: BTreeMap<String, String> = declaration_types(src);
    for stmt in &stmts {
        let body = stmt.text.trim_end_matches(';').trim();
        let (Some(open), Some(close)) = (body.find('('), body.rfind(')')) else { continue };
        let instance = body[..open].trim().trim_matches('"').to_string();
        let ty = declared_types.get(&instance.to_lowercase()).map(String::as_str).unwrap_or("");
        let op = match ty.to_uppercase().as_str() {
            "R_TRIG" => OpCode::RisingEdge,
            "F_TRIG" => OpCode::FallingEdge,
            _ => continue,
        };
        let Some((k, v)) = body[open + 1..close].split_once(":=") else { continue };
        if !k.trim().eq_ignore_ascii_case("CLK") {
            continue;
        }
        edges.insert(instance, (v.trim().trim_matches('"').to_string(), op));
    }

    let mut by_pou: BTreeMap<String, Vec<Rung>> = BTreeMap::new();
    let mut seed = 0usize;

    for stmt in &stmts {
        // The call that drives an edge instance is the mechanism, not a rung.
        // The rung it belongs to is the one that reads its Q.
        let head = stmt.text.split('(').next().unwrap_or("").trim().trim_matches('"');
        if edges.contains_key(head) {
            notes.push(ReadNote {
                fidelity: ReadFidelity::Approximate,
                at: format!("line {}", stmt.line),
                detail: format!(
                    "Read as a one-shot on {}, not as a rung of its own. In SCL an edge needs an \
                     instance and a call; in ladder it is one contact.",
                    edges[head].0
                ),
                source: None,
            });
            continue;
        }

        let pou = region_at(stmt.line);
        let body = stmt.text.trim_end_matches(';').trim().to_string();
        let id = format!("r{}", stmt.line);

        if let Some(carried) = &stmt.carried {
            let logic = carried
                .condition
                .as_deref()
                .and_then(lex)
                .and_then(|t| {
                    seed += 100;
                    expression(&t, seed, &edges)
                })
                .unwrap_or_else(Logic::empty);
            by_pou.entry(pou).or_default().push(Rung {
                id: id.clone(),
                comment: stmt.comment.clone(),
                logic,
                outputs: vec![Instruction {
                    id: format!("{id}_out"),
                    op: OpCode::Unsupported,
                    operands: carried
                        .operands
                        .iter()
                        .map(|o| match o.parse::<f64>() {
                            Ok(value) => Operand::Number { value },
                            Err(_) => Operand::Tag { name: o.clone() },
                        })
                        .collect(),
                    vendor: Some(VendorDetail {
                        original_mnemonic: carried.mnemonic.clone(),
                        attributes: vec![("carried_as".into(), "comment".into())],
                    }),
                }],
            });
            notes.push(ReadNote {
                fidelity: ReadFidelity::Approximate,
                at: format!("line {}", stmt.line),
                detail: format!(
                    "{} was carried out of the program as a comment because it has no SCL form, \
                     and is read back as an unsupported instruction so the rung still exists. It \
                     still does nothing: it named an instruction S7 has no equivalent for, and \
                     coming home has not given it one.",
                    carried.mnemonic
                ),
                source: Some(stmt.text.clone()),
            });
            continue;
        }

        // A block call carries `:=` inside its brackets, so it has to be
        // recognised before assignment or every timer in the file is read as
        // an assignment to a target with a bracket in its name, fails, and is
        // reported unread.
        let is_call = match (body.find('('), body.find(":=")) {
            (Some(open), Some(assign)) => assign > open,
            (Some(_), None) => true,
            _ => false,
        };

        // IF <cond> THEN "Tag" := TRUE; END_IF  is a latch.
        let upper = body.to_uppercase();
        let parsed: Option<(Rung, ReadFidelity, String)> = if upper.starts_with("IF ") {
            read_latch(&body, &id, stmt, &mut seed, &edges)
        } else if is_call {
            read_call(&body, &id, stmt, &mut seed, &edges)
        } else if let Some((lhs, rhs)) = body.split_once(":=") {
            read_assignment(lhs, rhs, &id, stmt, &mut seed, &edges)
        } else {
            None
        };

        match parsed {
            Some((rung, fidelity, detail)) => {
                notes.push(ReadNote {
                    fidelity,
                    at: format!("line {}", stmt.line),
                    detail,
                    source: (fidelity != ReadFidelity::Exact).then(|| stmt.text.clone()),
                });
                by_pou.entry(pou).or_default().push(rung);
            }
            None => {
                let (rung, note) = unread(
                    stmt,
                    "This statement has no ladder equivalent this reader is willing to guess at. \
                     It is carried through as text so nothing downstream reports on a program \
                     that is missing it.",
                );
                notes.push(note);
                by_pou.entry(pou).or_default().push(rung);
            }
        }
    }

    // SCL has no rung. A ladder rung with two outputs on one set of conditions
    // leaves as two statements, and nothing in the text says they were one.
    // Consecutive statements sharing exactly the same condition are rejoined:
    // the outputs run in the same order, on the same conditions, so the
    // behaviour is identical, and leaving them apart inflates every rung count
    // in every report downstream.
    for (pou, rungs) in by_pou.iter_mut() {
        let mut merged: Vec<Rung> = Vec::new();
        for rung in rungs.drain(..) {
            // A statement carrying its own comment was written as its own
            // thing, so joining it would lose that text. Only unannotated
            // statements are joined.
            let joinable = rung.comment.is_none()
                && merged.last().is_some_and(|prev: &Rung| {
                    same_conditions(&prev.logic, &rung.logic)
                        && !matches!(prev.logic, Logic::Series { ref children } if children.is_empty())
                        && prev.outputs.iter().chain(&rung.outputs).all(|i| i.op.is_output())
                });
            if joinable {
                let prev = merged.last_mut().unwrap();
                notes.push(ReadNote {
                    fidelity: ReadFidelity::Approximate,
                    at: format!("{pou}/{}", rung.id),
                    detail: "Joined to the statement above it, which has the same conditions. SCL \
                             cannot write two outputs on one rung, so this is most likely one \
                             rung that was split on the way out. The behaviour is the same either \
                             way; the rung count is not."
                        .into(),
                    source: None,
                });
                prev.outputs.extend(rung.outputs);
            } else {
                merged.push(rung);
            }
        }
        *rungs = merged;
    }

    // Anything written to that was never declared is still a tag.
    let mut seen: Vec<String> = declared.iter().map(|t| t.name.to_lowercase()).collect();
    for rungs in by_pou.values() {
        for r in rungs {
            for i in r.outputs.iter().chain(r.logic.instructions()) {
                // The operand of a call is a routine, not a tag. Declaring it
                // as one puts a BOOL called Sequence in the tag list, which
                // then turns up in the I/O list and the drift report as a tag
                // the HMI has never heard of.
                if i.op == OpCode::Call {
                    continue;
                }
                for o in &i.operands {
                    if let Operand::Tag { name } = o {
                        let base = name.split('.').next().unwrap_or(name).to_string();
                        if !seen.contains(&base.to_lowercase()) {
                            seen.push(base.to_lowercase());
                            declared.push(Tag {
                                name: base,
                                data_type: ladx_ir::DataType::Bool,
                                address: None,
                                initial_value: None,
                                comment: None,
                                field: None,
                            });
                        }
                    }
                }
            }
        }
    }

    let pous = by_pou
        .into_iter()
        .map(|(name, rungs)| Pou {
            name: name.clone(),
            kind: PouKind::Program,
            body: PouBody::Ladder { rungs },
            local_tags: Vec::new(),
            comment: None,
            container: None,
        })
        .collect::<Vec<_>>();

    // Said once, because it is true of every tag and it is the difference
    // between an IR that can be checked against an I/O schedule and one that
    // cannot.
    notes.push(ReadNote {
        fidelity: ReadFidelity::Approximate,
        at: "tag list".into(),
        detail: "SCL text carries no hardware addresses, so no tag read from it has one. The \
                 addresses live in the TIA hardware configuration, not in the block source, and \
                 anything that needs them, the I/O list, the drift check against a schedule, has \
                 to get them from there."
            .into(),
        source: None,
    });

    if pous.is_empty() {
        notes.push(ReadNote {
            fidelity: ReadFidelity::Unread,
            at: "the file".into(),
            detail: "Nothing in this file was read as logic. Check it is SCL.".into(),
            source: None,
        });
    }

    let mut project = IrProject::new(name);
    // The program came from S7, and saying so is what makes an export back to
    // Siemens pick the right dialect instead of guessing.
    project.source_vendor = Some(Vendor::Siemens);
    project.tags = declared;
    project.entry_point = pous.first().map(|p| p.name.clone());
    project.pous = pous;

    ReadResult { project, notes }
}

fn read_assignment(
    lhs: &str,
    rhs: &str,
    id: &str,
    stmt: &Stmt,
    seed: &mut usize,
    edges: &BTreeMap<String, (String, OpCode)>,
) -> Option<(Rung, ReadFidelity, String)> {
    let target = lhs.trim().trim_matches('"').to_string();
    if target.is_empty() || target.contains(' ') {
        return None;
    }
    // `"Step" := 0;` is a move, not a coil. Reading it as a coil would make
    // an integer register look like a bit.
    if let Ok(value) = rhs.trim().trim_end_matches(';').trim().parse::<f64>() {
        return Some((
            Rung {
                id: id.to_string(),
                comment: stmt.comment.clone(),
                logic: Logic::empty(),
                outputs: vec![Instruction {
                    id: format!("{id}_out"),
                    op: OpCode::Move,
                    operands: vec![Operand::Number { value }, Operand::Tag { name: target }],
                    vendor: None,
                }],
            },
            ReadFidelity::Exact,
            String::new(),
        ));
    }

    let toks = lex(rhs)?;
    *seed += 100;
    let logic = expression(&toks, *seed, edges)?;
    Some((
        Rung {
            id: id.to_string(),
            comment: stmt.comment.clone(),
            logic,
            outputs: vec![Instruction {
                id: format!("{id}_out"),
                op: OpCode::Coil,
                operands: vec![Operand::Tag { name: target }],
                vendor: None,
            }],
        },
        ReadFidelity::Exact,
        String::new(),
    ))
}

/// `IF <cond> THEN "Tag" := TRUE; END_IF` is a latch. Anything else inside an
/// IF is more than one rung, and is not read.
fn read_latch(
    body: &str,
    id: &str,
    stmt: &Stmt,
    seed: &mut usize,
    edges: &BTreeMap<String, (String, OpCode)>,
) -> Option<(Rung, ReadFidelity, String)> {
    let upper = body.to_uppercase();
    let then = upper.find(" THEN")?;
    let end = upper.rfind("END_IF")?;
    let cond = &body[2..then];
    let inner = body[then + 5..end].trim().trim_end_matches(';').trim();

    // More than one statement inside the IF is more than one rung, and
    // splitting it would invent an execution order the SCL did not state.
    if inner.contains(';') {
        return None;
    }

    let out = if let Some((lhs, rhs)) = inner.split_once(":=") {
        let target = lhs.trim().trim_matches('"').to_string();
        if target.is_empty() || target.contains(' ') {
            return None;
        }
        match rhs.trim().to_uppercase().as_str() {
            // A conditional set of a bit is a latch.
            "TRUE" => Instruction {
                id: format!("{id}_out"),
                op: OpCode::SetCoil,
                operands: vec![Operand::Tag { name: target }],
                vendor: None,
            },
            "FALSE" => Instruction {
                id: format!("{id}_out"),
                op: OpCode::ResetCoil,
                operands: vec![Operand::Tag { name: target }],
                vendor: None,
            },
            // A conditional write of a value is a move. This is how every
            // step register in every sequence is written, so a reader that
            // cannot do it cannot read a sequence.
            _ => {
                let value = rhs.trim().parse::<f64>().ok()?;
                Instruction {
                    id: format!("{id}_out"),
                    op: OpCode::Move,
                    operands: vec![
                        Operand::Number { value },
                        Operand::Tag { name: target },
                    ],
                    vendor: None,
                }
            }
        }
    } else {
        // IF <cond> THEN "Routine"(); END_IF is a conditional call.
        let open = inner.find('(')?;
        if inner[open..].trim_end_matches(')').trim_end_matches('(').trim() != "" {
            return None; // a call with arguments is not a bare call
        }
        let name = inner[..open].trim().trim_matches('"').to_string();
        if name.is_empty() || name.contains(' ') {
            return None;
        }
        Instruction {
            id: format!("{id}_out"),
            op: OpCode::Call,
            operands: vec![Operand::Tag { name }],
            vendor: None,
        }
    };

    let toks = lex(cond)?;
    *seed += 100;
    let logic = expression(&toks, *seed, edges)?;
    Some((
        Rung { id: id.to_string(), comment: stmt.comment.clone(), logic, outputs: vec![out] },
        ReadFidelity::Exact,
        String::new(),
    ))
}

/// `"Jam_Timer"(IN := <expr>, PT := T#5s);` is a timer.
fn read_call(
    body: &str,
    id: &str,
    stmt: &Stmt,
    seed: &mut usize,
    edges: &BTreeMap<String, (String, OpCode)>,
) -> Option<(Rung, ReadFidelity, String)> {
    let open = body.find('(')?;
    let close = body.rfind(')')?;
    let instance = body[..open].trim().trim_matches('"').to_string();
    if instance.is_empty() || instance.contains(' ') {
        return None;
    }

    let mut in_expr = None;
    let mut preset = None;
    for arg in split_args(&body[open + 1..close]) {
        let (k, v) = arg.split_once(":=")?;
        match k.trim().to_uppercase().as_str() {
            "IN" => in_expr = Some(v.trim().to_string()),
            "PT" => preset = Some(v.trim().to_string()),
            _ => return None, // an argument this reader does not know
        }
    }
    let (in_expr, preset) = (in_expr?, preset?);
    let ms = crate::time::parse_iec_duration(&preset)?;

    let toks = lex(&in_expr)?;
    *seed += 100;
    let logic = expression(&toks, *seed, edges)?;

    Some((
        Rung {
            id: id.to_string(),
            comment: stmt.comment.clone(),
            logic,
            outputs: vec![Instruction {
                id: format!("{id}_out"),
                op: OpCode::TimerOn,
                operands: vec![
                    Operand::Tag { name: instance },
                    Operand::Number { value: ms as f64 },
                ],
                vendor: Some(VendorDetail {
                    original_mnemonic: "TON_TIME".into(),
                    attributes: vec![("PT".to_string(), preset)],
                }),
            }],
        },
        ReadFidelity::Approximate,
        "A Siemens TON instance is not the same object as a Rockwell timer: its done bit and \
         elapsed time are addressed differently, and the instance data lives with the block. The \
         rung is equivalent; the storage is not."
            .into(),
    ))
}

/// Whether two condition trees are the same logic.
///
/// Not `==`: every instruction carries a generated id, so two identical
/// conditions read from two statements never compare equal. The ids are
/// bookkeeping, not part of the logic.
fn same_conditions(a: &Logic, b: &Logic) -> bool {
    match (a, b) {
        (Logic::Element { instruction: x }, Logic::Element { instruction: y }) => {
            x.op == y.op && x.operands == y.operands
        }
        (Logic::Series { children: x }, Logic::Series { children: y })
        | (Logic::Parallel { children: x }, Logic::Parallel { children: y }) => {
            x.len() == y.len() && x.iter().zip(y).all(|(p, q)| same_conditions(p, q))
        }
        _ => false,
    }
}

fn split_args(s: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut depth = 0;
    let mut cur = String::new();
    for c in s.chars() {
        match c {
            '(' => {
                depth += 1;
                cur.push(c);
            }
            ')' => {
                depth -= 1;
                cur.push(c);
            }
            ',' if depth == 0 => {
                out.push(cur.trim().to_string());
                cur.clear();
            }
            _ => cur.push(c),
        }
    }
    if !cur.trim().is_empty() {
        out.push(cur.trim().to_string());
    }
    out
}
