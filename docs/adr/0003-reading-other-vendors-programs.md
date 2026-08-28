# ADR 0003, Reading other vendors' PLC programs

**Date:** 2026-08-28
**Status:** Proposed. Legal review required before any of this ships.

## Context

Convert today is an export tool wearing an interchange tool's name. It reads
LADX's own JSON and writes Structured Text, Siemens SCL, Rockwell neutral text
and PLCopen XML. There is no path in from any other vendor, so "convert a PLC
program" currently means "convert a program you wrote here".

The ask is to read the major brands and convert between them. That runs
straight into the rule in `CLAUDE.md`, "don't add new vendor connectors without
an ADR", and into a legal question that decides the whole shape of the feature.

## The legal question, which comes first

**Nothing below is legal advice, and none of it should ship without a real
opinion.** What follows is the analysis that shapes the engineering.

How the program data is obtained matters far more than which vendor it came
from. There are three cases.

### 1. Documented export formats. Clear.

Rockwell **L5X** and **L5K**, PLCopen **TC6 XML**, Siemens **SCL/AWL** source
export, Siemens **SimaticML XML**. These are published interchange formats whose
stated purpose is being read and written by other software. Rockwell ships the
L5X schema with Studio 5000 as `L5XSchema.xsd`, and documents import/export in
its own manuals.

Reading a file the customer exported from software they licensed is not reverse
engineering. The customer is doing something their licence permits, and handing
us the result. This is where every legitimate migration tool operates, and it is
where LADX should operate.

### 2. Proprietary binary project files. Restricted, and not ours to rely on.

`.ACD` (Rockwell), `.ap17`/`.ap18`/`.zap` (Siemens), `.gx3` (Mitsubishi), `.STU`
(Schneider), Omron Sysmac projects. Reading these means reverse engineering an
undocumented binary.

In the EU, Article 6 of the Software Directive permits decompilation that is
indispensable for interoperability, and Article 9(1) makes EULA terms forbidding
it unenforceable for that purpose. The right is narrow: the information may not
be used for other goals, may not be passed on beyond what interoperability
requires, and may not be used to write a substantially similar program.

The part that settles it for LADX: **that right belongs to a lawful licensee of
the software being decompiled.** It is granted to the person who licensed
Studio 5000, not to a vendor building a general purpose converter for everybody
else. We are not in the position the exception was written for.

The United States is not more permissive. DMCA 1201(f) has an interoperability
exception and *Sega v. Accolade* and *Sony v. Connectix* support intermediate
copying for interoperability, but there is no equivalent of Article 9(1), so a
contractual prohibition can still bind.

Third party parsers for these formats exist publicly. Their existence is not a
legal opinion and is not a defence.

### 3. Shipping vendor material. Never.

Vendor libraries, firmware, instruction help text, or schema files taken from an
installation do not go in the repository or the bundle, whatever the format.

## Decision

**Read documented exports only. The customer exports from their own licensed
seat; LADX reads what they produce.**

No binary project file is parsed. `.ACD` and `.ap18` are recognised by their
extension only so the tool can say what to do instead, which is a two line
instruction in Studio 5000 or TIA Portal, rather than failing with "unsupported
file".

## What that makes reachable

| Vendor / platform | Format in | Open? | Route |
|---|---|---|---|
| Rockwell Studio 5000 | `.L5X` | Documented XML, XSD ships with the product | Export from Studio 5000 |
| Rockwell, older | `.L5K` | Documented ASCII | Export from Studio 5000 |
| CODESYS 3.5+ | PLCopen TC6 XML | Open standard | Export POU |
| Beckhoff TwinCAT 3 | PLCopen TC6 XML | Open standard | Export POU |
| ABB, Schneider, B&R, WAGO, Festo | PLCopen TC6 XML | Open standard | Export POU, mostly CODESYS derived |
| Siemens TIA Portal | `.scl`, `.awl` source | Plain text, documented dialect | Export source |
| Siemens TIA Portal | SimaticML XML | Documented, but produced only by Openness | Customer exports via Openness on their own seat |
| Mitsubishi GX Works3 | CSV (tags) | Documented | Tags only. No documented program export found |
| Omron Sysmac / CX-Programmer | none found | — | No documented program export found |

Mitsubishi and Omron are the honest gap. Neither appears to publish a program
level export a third party can read, so for those two the answer is "we cannot,
and here is why" rather than a worse answer dressed up.

## What conversion can and cannot be

Full automatic vendor to vendor conversion is not a real thing, and selling it
as one is how conversion tools earn their reputation. Published figures put
automated conversion at roughly 50 to 70 per cent on simple logic with 30 to 50
per cent needing rework, and Rockwell sells Siemens to Allen-Bradley conversion
as an engineering service rather than as a product.

The reasons are structural, not effort:

- **Timer and counter semantics.** Siemens `S_ODT`, `S_PEXT` and the rest do not
  map one to one onto `TON`, `TOF`, `RTO`. Time bases and retentive behaviour
  differ.
- **Addressing and memory models.** `%MW`, `%DB`, `N7:0`, tag based Logix. A
  direct address in one system is a name in another.
- **Vendor function blocks.** Anything outside IEC 61131-3 has no counterpart,
  including most motion, communication and drive blocks.
- **Task and scan configuration.** Periodic, event and continuous tasks are
  configured differently and change behaviour.
- **Vendor `addData` extensions in PLCopen XML.** Documented as needing to be
  preserved or the import fails silently, which is the worst kind of failure.
- **Safety code.** Never converted automatically. It is certified against a
  specific platform, and a converted safety routine is an uncertified one.

So the product is **accelerated migration with a review list**, not conversion.
Convert already has the right shape for this: it emits notes at three
severities, and `manual` means a human has to do that part. The importer must
use that honestly, and be more willing to emit `manual` than to guess.

## Direction: into LADX first

Vendor to vendor without LADX in the middle is a worse first step even though it
sounds better. Every conversion needs an intermediate representation, LADX's
program model already is one, and it is the thing the simulator can run. A
program imported into LADX can be *proven* before it is written out, which is
the only part of this that makes the output trustworthy.

So: **L5X or PLCopen in, LADX program model, existing targets out.** Vendor to
vendor is then the same path with the middle hidden, and can be presented that
way once the ends are solid.

## Consequences

- Two importers to build and keep working: L5X and PLCopen TC6. Both are
  schema'd, so both can be tested against fixtures rather than against a vendor
  installation.
- Fixtures cannot be lifted from a vendor's sample projects. They have to be
  written by hand or exported from a seat we are entitled to use, and the
  provenance of each one recorded.
- An import that partly fails must say which parts, in the notes, and produce
  what it could. Refusing the whole file because one rung used an unknown
  instruction is the behaviour that makes people give up on a converter.
- A legal opinion before release, specifically on: reading customer supplied
  L5X and SimaticML, naming the vendors in marketing copy, and whether
  recognising a `.ACD` by extension in order to refuse it raises anything.
- Trade mark use. "Rockwell", "Siemens", "Allen-Bradley" appear as nominative
  references to describe compatibility, never in a way that suggests
  endorsement.
