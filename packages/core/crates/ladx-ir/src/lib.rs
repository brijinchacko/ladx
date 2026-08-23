//! The LADX intermediate representation.
//!
//! Every PLC file LADX reads is parsed *into* this; every file it writes is
//! generated *out of* it; language transforms operate *on* it; the simulator
//! runs it; the AI edits it. That is the whole point, with N importers and M
//! exporters you get N×M conversion paths for N+M of work, and no brand ever
//! needs to know about another brand.
//!
//! # Why it looks like PLCopen, and where it doesn't
//!
//! The shape follows PLCopen TC6 XML v2.01 (the IEC 61131-3 interchange
//! format), because being close to a standard is what keeps the format honest
//! and the exporters cheap. Two deliberate departures:
//!
//! 1. **Ladder logic is a tree here, a graph there.** TC6 stores a rung as a
//!    flat list of elements wired by `localId`/`refLocalId`, which you have to
//!    walk from the left power rail to reconstruct meaning. That is a fine wire
//!    format and a miserable thing to edit, reason about, or diff. LADX stores
//!    the series/parallel tree that the graph *means*. Conversion between the
//!    two lives in [`plcopen_graph`], and is lossless in both directions for
//!    the subset LADX supports.
//!
//! 2. **Vendor detail is kept, not discarded.** A conversion that silently
//!    drops what it did not understand is worse than one that refuses, so
//!    anything unmapped is preserved in [`Instruction::vendor`] and surfaced in
//!    the conversion report rather than thrown away.
//!
//! # Versioning
//!
//! Every document carries [`IR_VERSION`]. Stored projects outlive schema
//! decisions, so migrations are a first-class concern from v1 rather than
//! something bolted on at v2.

use serde::{Deserialize, Serialize};
use ts_rs::TS;

pub mod neutral_text;
pub mod plcopen_graph;
pub mod to_st;

/// Bumped whenever a stored document would no longer round-trip. See
/// [`migrate`] for the upgrade path.
pub const IR_VERSION: u32 = 1;

/* ────────────────────────────── project ────────────────────────────── */

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../types/src/generated/ir/")]
pub struct IrProject {
    /// Always written as [`IR_VERSION`]; read as whatever the file said.
    pub ir_version: u32,
    pub name: String,
    /// Where this came from, when it came from somewhere. Drives dialect
    /// choices on export and explains instructions that need explaining.
    pub source_vendor: Option<Vendor>,
    /// Programs, functions and function blocks.
    pub pous: Vec<Pou>,
    /// Controller-scope tags. POU-scope tags live on the POU.
    pub tags: Vec<Tag>,
    /// User-defined types (UDTs / STRUCTs).
    pub data_types: Vec<DataTypeDef>,
}

impl IrProject {
    pub fn new(name: impl Into<String>) -> Self {
        Self {
            ir_version: IR_VERSION,
            name: name.into(),
            source_vendor: None,
            pous: Vec::new(),
            tags: Vec::new(),
            data_types: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../types/src/generated/ir/")]
pub enum Vendor {
    Rockwell,
    Siemens,
    Beckhoff,
    Codesys,
    Schneider,
    Mitsubishi,
    Omron,
    OpenPlc,
}

/* ──────────────────────────────── POU ──────────────────────────────── */

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../types/src/generated/ir/")]
pub struct Pou {
    pub name: String,
    pub kind: PouKind,
    pub body: PouBody,
    /// POU-scope tags, locals, and for a function block its interface.
    pub local_tags: Vec<Tag>,
    pub comment: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../types/src/generated/ir/")]
pub enum PouKind {
    Program,
    Function,
    FunctionBlock,
}

/// The five IEC languages, as far as LADX models them today.
///
/// Ladder and Structured Text are represented structurally. The rest are
/// carried as source text so that importing a project containing them is
/// lossless even before LADX can transform them: a file you cannot convert is
/// still a file you should not corrupt.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../types/src/generated/ir/")]
#[serde(tag = "language", rename_all = "camelCase")]
pub enum PouBody {
    Ladder { rungs: Vec<Rung> },
    StructuredText { source: String },
    FunctionBlockDiagram { source: String },
    SequentialFunctionChart { source: String },
    InstructionList { source: String },
}

impl PouBody {
    pub fn language_name(&self) -> &'static str {
        match self {
            PouBody::Ladder { .. } => "LD",
            PouBody::StructuredText { .. } => "ST",
            PouBody::FunctionBlockDiagram { .. } => "FBD",
            PouBody::SequentialFunctionChart { .. } => "SFC",
            PouBody::InstructionList { .. } => "IL",
        }
    }
}

/* ─────────────────────────────── ladder ────────────────────────────── */

/// One rung: a condition side that either passes power or doesn't, and the
/// outputs it drives when it does.
///
/// Splitting condition from output is not cosmetic. It is what makes "does this
/// rung conduct?" a single question with a single answer, which is what both
/// the simulator and the LD→ST transform are built on.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../types/src/generated/ir/")]
pub struct Rung {
    pub id: String,
    pub comment: Option<String>,
    /// The condition side. [`Logic::Series`] with no children is an empty rung,
    /// which conducts, the same as a real rung with nothing in it.
    pub logic: Logic,
    /// Coils and output instructions, evaluated left to right.
    pub outputs: Vec<Instruction>,
}

/// The condition side as a series/parallel tree.
///
/// Two levels is the minimum that expresses real ladder: series contacts are a
/// chain, and a seal-in is a second branch in parallel with the first. Anything
/// flatter cannot represent the motor latch, which is the first thing anybody
/// learns.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../types/src/generated/ir/")]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Logic {
    /// A single instruction in the condition path.
    Element { instruction: Instruction },
    /// All children must conduct.
    Series { children: Vec<Logic> },
    /// Any child conducting is enough.
    Parallel { children: Vec<Logic> },
}

impl Logic {
    /// An empty rung. Conducts, like a real one with nothing in it.
    pub fn empty() -> Self {
        Logic::Series { children: Vec::new() }
    }

    /// Every instruction in the tree, in evaluation order.
    pub fn instructions(&self) -> Vec<&Instruction> {
        let mut out = Vec::new();
        self.walk(&mut |i| out.push(i));
        out
    }

    fn walk<'a>(&'a self, f: &mut impl FnMut(&'a Instruction)) {
        match self {
            Logic::Element { instruction } => f(instruction),
            Logic::Series { children } | Logic::Parallel { children } => {
                for c in children {
                    c.walk(f);
                }
            }
        }
    }
}

/* ──────────────────────────── instructions ─────────────────────────── */

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../types/src/generated/ir/")]
pub struct Instruction {
    pub id: String,
    pub op: OpCode,
    /// Operands in the order the instruction takes them. What each position
    /// means is defined per [`OpCode`]; see [`OpCode::operand_names`].
    pub operands: Vec<Operand>,
    /// Anything the importer understood but the IR has no first-class place
    /// for, the vendor mnemonic it came from, extra parameters, flags. Kept so
    /// a conversion can report what it could not express instead of pretending
    /// it did not exist.
    pub vendor: Option<VendorDetail>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../types/src/generated/ir/")]
pub struct VendorDetail {
    /// The instruction as the source platform spelled it, e.g. "XIC", "TON_10".
    pub original_mnemonic: String,
    /// Untranslated key/values, kept verbatim.
    pub attributes: Vec<(String, String)>,
}

/// A tag reference or a literal.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../types/src/generated/ir/")]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Operand {
    Tag { name: String },
    Number { value: f64 },
    Text { value: String },
}

/// The instruction set LADX models natively.
///
/// Deliberately neutral names rather than one vendor's mnemonics. `Contact`
/// beats `XIC` because a Siemens exporter should not have to un-learn Rockwell
/// spelling to write a normally-open contact: and a Rockwell exporter writes
/// `XIC` from it just as easily.
///
/// Anything outside this set imports as [`OpCode::Unsupported`] with the
/// original preserved in [`Instruction::vendor`]. The rung still round-trips;
/// the conversion report names what needs a human.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../types/src/generated/ir/")]
#[serde(rename_all = "camelCase")]
pub enum OpCode {
    // Bit logic, condition side
    /// Normally open. Rockwell XIC, Siemens `-| |-`.
    Contact,
    /// Normally closed. Rockwell XIO, Siemens `-|/|-`.
    ContactNegated,
    /// Rising edge, one scan. Rockwell ONS, Siemens P.
    RisingEdge,
    /// Falling edge, one scan.
    FallingEdge,

    // Bit logic, output side
    /// Non-retentive coil. Rockwell OTE.
    Coil,
    /// Negated coil.
    CoilNegated,
    /// Set / latch. Rockwell OTL, Siemens S.
    SetCoil,
    /// Reset / unlatch. Rockwell OTU, Siemens R.
    ResetCoil,

    // Timers and counters
    TimerOn,
    TimerOff,
    TimerRetentive,
    CountUp,
    CountDown,
    /// Reset a timer or counter.
    Reset,

    // Compare
    Equal,
    NotEqual,
    Greater,
    Less,
    GreaterOrEqual,
    LessOrEqual,

    // Move and math
    Move,
    Add,
    Subtract,
    Multiply,
    Divide,

    // Program control
    /// Call another POU.
    Call,
    Jump,
    Label,
    Return,

    /// Imported but not modelled. Original is in [`Instruction::vendor`].
    Unsupported,
}

impl OpCode {
    /// Whether this belongs on the condition side or the output side.
    ///
    /// Some instructions legitimately appear on both (a comparison can gate a
    /// rung or be evaluated as an output), so this reports where it *usually*
    /// sits rather than enforcing anything.
    pub fn is_output(&self) -> bool {
        matches!(
            self,
            OpCode::Coil
                | OpCode::CoilNegated
                | OpCode::SetCoil
                | OpCode::ResetCoil
                | OpCode::TimerOn
                | OpCode::TimerOff
                | OpCode::TimerRetentive
                | OpCode::CountUp
                | OpCode::CountDown
                | OpCode::Reset
                | OpCode::Move
                | OpCode::Add
                | OpCode::Subtract
                | OpCode::Multiply
                | OpCode::Divide
                | OpCode::Call
                | OpCode::Jump
                | OpCode::Return
        )
    }

    /// What each operand position means, for editors and error messages.
    pub fn operand_names(&self) -> &'static [&'static str] {
        match self {
            OpCode::Contact
            | OpCode::ContactNegated
            | OpCode::RisingEdge
            | OpCode::FallingEdge
            | OpCode::Coil
            | OpCode::CoilNegated
            | OpCode::SetCoil
            | OpCode::ResetCoil
            | OpCode::Reset => &["tag"],
            OpCode::TimerOn | OpCode::TimerOff | OpCode::TimerRetentive => &["timer", "preset"],
            OpCode::CountUp | OpCode::CountDown => &["counter", "preset"],
            OpCode::Equal
            | OpCode::NotEqual
            | OpCode::Greater
            | OpCode::Less
            | OpCode::GreaterOrEqual
            | OpCode::LessOrEqual => &["a", "b"],
            OpCode::Move => &["source", "destination"],
            OpCode::Add | OpCode::Subtract | OpCode::Multiply | OpCode::Divide => {
                &["a", "b", "destination"]
            }
            OpCode::Call => &["pou"],
            OpCode::Jump | OpCode::Label => &["label"],
            OpCode::Return | OpCode::Unsupported => &[],
        }
    }
}

/* ─────────────────────────────── tags ──────────────────────────────── */

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../types/src/generated/ir/")]
pub struct Tag {
    pub name: String,
    pub data_type: DataType,
    /// Physical address where the source had one: `I0.0`, `%QX0.1`, `N7:0`.
    /// Absent for symbolic-only tags, which is most of them on modern platforms.
    pub address: Option<String>,
    pub initial_value: Option<Operand>,
    pub comment: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../types/src/generated/ir/")]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum DataType {
    Bool,
    Int,
    Dint,
    Real,
    String,
    Timer,
    Counter,
    /// A user-defined type, by name. Resolved against
    /// [`IrProject::data_types`].
    Named { name: String },
    Array { of: Box<DataType>, length: u32 },
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../types/src/generated/ir/")]
pub struct DataTypeDef {
    pub name: String,
    pub members: Vec<Tag>,
}

/* ───────────────────────────── migration ───────────────────────────── */

#[derive(Debug, thiserror::Error)]
pub enum IrError {
    #[error("unsupported IR version {found}; this build understands up to {supported}")]
    UnsupportedVersion { found: u32, supported: u32 },
}

/// Bring a document up to [`IR_VERSION`].
///
/// A no-op at v1, it exists now so that the first real migration is an edit to
/// a function that already has callers and tests, rather than a new concept
/// introduced under pressure.
pub fn migrate(mut project: IrProject) -> Result<IrProject, IrError> {
    if project.ir_version > IR_VERSION {
        return Err(IrError::UnsupportedVersion {
            found: project.ir_version,
            supported: IR_VERSION,
        });
    }
    // Future: match on project.ir_version and step forward one version at a time.
    project.ir_version = IR_VERSION;
    Ok(project)
}
