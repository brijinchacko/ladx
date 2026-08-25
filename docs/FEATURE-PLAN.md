# What to build next

Written 25 August 2026, after going through every tool and using it rather
than reading it.

The audit found the tools are real. Ladder runs a scan engine, Convert emits
IEC 61131-3 that compiles, CAD holds eleven drawing templates, the HMI drives
a running program, Planner draws a Gantt chart you can drag. What follows is
not a list of gaps; it is a list of the next thing each tool needs to be
chosen over the incumbent.

Ordered by what a paying integrator would notice, not by what is interesting
to build.

---

## The three that would matter most

### 1. Import a real vendor project

**The problem.** Every tool here starts from a blank page. Nobody's work is
in it. An integrator with two hundred existing programs has to retype one to
try anything, which is a cost paid before any benefit arrives.

**What to build.** Read an L5X, an S7 project archive and a CODESYS export
into the internal representation that Convert already writes out of. The hub
figure on the products page claims this shape already; it currently only goes
one way.

**Why it is first.** It converts the whole product from "a thing to try" to
"a thing that already contains my work". Every other feature is worth more
afterwards. It is also the single largest piece of work on this list, which is
why nothing else should be started that depends on it.

**Honest difficulty.** L5X is XML and tractable. Siemens is a compressed
project with a proprietary layout and is genuinely hard. Start with L5X, ship
it, and decide on Siemens with real usage data rather than a guess.

### 2. Version control that an engineer would use

**The problem.** `Line3_final_v2_JB_REV_C.ACD` is how this industry does
version control, and everybody knows it is not version control. The existing
article on the subject says so and offers nothing.

**What to build.** Every save is a revision. A diff between two revisions
rendered as ladder, showing changed rungs highlighted rather than changed
XML. A named baseline at FAT, at SAT, at handover. A change log generated
from the revisions rather than typed.

**Why.** Nobody else does ladder-aware diffing well. Git diffs of PLC exports
are unreadable, which is why the industry does not use git. This is a genuine
capability rather than a checkbox, it is achievable because the internal
representation already exists, and it feeds the ALCOA+ story directly.

### 3. Export the HMI to something that runs on a panel

**The problem.** The HMI builder designs, proves and documents a screen, and
then the screen has to be rebuilt in the vendor's tool to reach the glass.
That is a real limitation and it is stated plainly on the product page, which
does not stop it being the first question a buyer asks.

**What to build.** Export to at least one target that runs. The realistic
candidates are a WinCC Comfort project, an Ignition Perspective view, or a
plain browser runtime served from a small box. The last is the least
constrained and the most work.

**Why.** It closes the loop. Without it the HMI builder is a design and
documentation tool competing against tools that also deploy.

---

## Per tool, the next thing

### Ladder

- **Cross reference that works like the vendor's.** Click a tag, see every
  rung that reads it and every rung that writes it, with the double-coil case
  called out. Currently the validator finds it; the editor cannot show it.
- **Routine level structure in the UI.** The engine supports routines and JSR.
  The tree does not make it obvious, so most programs end up in Main.
- **Online edit semantics.** Not the feature, the honesty: say in the UI that
  this is an offline editor, because somebody will assume otherwise.

### Monitor

- **Record and replay.** Capture a run, save it, replay it later at any speed.
  A FAT record that can be replayed is a different artefact from a PDF of a
  test sheet, and it is nearly free given the scan engine already exists.
- **Assertions.** "When Start is pressed, Motor must be on within 200 ms."
  A list of those, run against the scan engine, is an automated FAT.

### Convert

- **Round trip.** Import is item 1 above. Once it exists, Convert becomes a
  migration tool rather than an export tool, which is a much larger claim.
- **A conversion report that survives review.** It already reports what does
  not survive. Making that report a document a client can sign is a small step
  with a large effect on whether it gets used commercially.

### CAD

- **DXF import.** Export exists. Import means a panel builder can start from
  the drawing they have.
- **Generate the I/O drawings from the tag table.** The tags exist, the
  templates exist, and the connection between them is drawn by hand. This is
  the strongest cross-tool feature available and it is not large.
- **A revision cloud and a revision table.** Every drawing office needs it and
  nobody enjoys maintaining it manually.

### HMI

- **Multi-select.** Known gap. Selecting and moving several objects is table
  stakes for a drawing tool and its absence is felt within a minute.
- **Templates and instances.** One motor faceplate, forty instances, one edit.
  The same argument as an AOI, in graphics.
- **Scripting on events beyond press and release.** On screen open exists; on
  alarm, on timer and on value change do not.
- **Export the alarm database.** The bulk builder can generate two hundred
  alarms. Getting them out as a rationalisation spreadsheet is what makes them
  reviewable by somebody who is not sitting at the tool.

### Planner

- **Resource levelling, or an honest capacity view.** The product page says it
  does neither, which is correct. A simple view of who is committed to what in
  a given week would answer the question small integrators actually have.
- **Baseline against actual.** A saved baseline and the current plan on the
  same chart is how a slip becomes visible before it is a surprise.

### Documents

- **Regeneration with change tracking.** The templates fill from the project.
  When the project changes, the document should offer to update and show what
  would change, rather than being silently stale or silently overwritten.
- **Export to DOCX.** Markdown and PDF are not what a client's quality
  department will accept for markup.

### Knowledge

- **Ingest more than text.** Manuals are PDFs with tables and diagrams. Text
  extraction loses the tables, which is where the parameter values are.
- **Cite to a page and offer the page.** Citations exist; showing the actual
  page image beside the answer is what makes somebody trust it.

### Projects

- **Templates.** A project type that seeds the scope, the documents and the
  plan. Most integrators do the same shape of job repeatedly.
- **A client portal, read only.** One share link showing a client the plan,
  the documents and the current phase. Small, and it is the thing that gets
  the tool in front of the person who pays.

---

## Platform, not tools

### Audit and compliance

The audit log is now written to. The next step is making it worth something
to a buyer: an export, a retention policy, and a page in the product that
explains what is recorded and what deliberately is not.

### Email

`RESEND_API_KEY` is unset on production. No welcome email has ever been sent,
no password reset can complete, and the magic link sign-in cannot work. This
is a live defect, not a feature, and it is at the top of this section because
it is cheap and currently broken.

### The desktop

Ladder, Monitor, Convert and HMI are there. CAD, Documents, Knowledge,
Clients, Projects and Planner are not. The gap is worth closing in that order:
CAD is compute-local and belongs offline; Knowledge needs a local embedding
model and is the hardest.

### Licensing

Keys are issued, hashed, claimed per machine and revocable. What is missing is
the thing around them: an installer that is signed, a way for somebody to buy
one without an email exchange, and a renewal path. None of that is technical.

---

## What not to build

Worth writing down, because these come up and each is a trap.

- **A cloud runtime that talks to plant equipment.** The desktop's whole
  premise is that it does not. Adding it to the web product would undermine
  the one claim that distinguishes both.
- **More AI surface for its own sake.** Ladder, HMI and CAD generation each
  earn their place because a validator sits behind them. A feature that
  generates something nothing can check is a liability.
- **A vendor connector without an ADR.** Already the rule, and it is the right
  one: every connector is a licensing and version commitment for years.
- **Realtime collaborative editing.** Frequently requested in the abstract,
  rarely used in a trade where one person owns a program at a time. Revision
  history solves the real problem.
