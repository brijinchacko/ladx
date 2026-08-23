import { type DocTemplate, docHeader } from "./types";

/**
 * Safety and handover.
 *
 * The safety documents are the ones a project is legally obliged to produce and
 * the ones most often written after the fact. The handover documents are what
 * the site actually keeps, and their quality decides whether the next engineer
 * can work on this system or has to reverse engineer it.
 */

export const RISK_ASSESSMENT: DocTemplate = {
  slug: "machinery-risk-assessment",
  title: "Machinery Risk Assessment and Safety Requirements",
  abbr: "RA",
  category: "Safety",
  summary:
    "Hazard by hazard: what could hurt someone, how likely, and what performance level the protection needs.",
  purpose:
    "The risk assessment is what decides the required performance level of every safety function, and therefore what the safety circuit has to be. Doing it after the panel is built means discovering that a single channel interlock was never going to be acceptable.",
  whenYouNeedIt:
    "Legally required for machinery in the UK, EU and most other jurisdictions. Do it before the design is fixed, because its output is a design input.",
  standards: [
    "ISO 12100 for risk assessment methodology",
    "ISO 13849-1 for performance level",
    "IEC 62061 for SIL",
    "ISO 13855 for safety distances",
  ],
  writtenBy: "Competent person, with the design team",
  approvedBy: "Client safety authority",
  outline: [
    "Machine description and limits",
    "Hazard identification",
    "Risk estimation before protection",
    "Required performance level",
    "Protective measures",
    "Residual risk",
    "Validation record",
  ],
  related: ["cause-and-effect-matrix", "sat-site-acceptance-test"],
  files: [
    {
      name: "Risk-Assessment.md",
      kind: "markdown",
      body: `${docHeader("Machinery Risk Assessment", "RA")}
## 1. Machine limits

Per ISO 12100, the assessment starts by stating the limits. A hazard outside the stated limits
is not assessed, so the limits must be honest about how the machine will really be used.

| Limit | Definition |
|---|---|
| Use limits | [Intended use, and reasonably foreseeable misuse] |
| Space limits | [Range of movement, space required for operation and maintenance] |
| Time limits | [Life, maintenance intervals, component replacement] |
| Other limits | [Materials processed, environment, cleanliness, skill level of operators] |

**Foreseeable misuse.** [State it explicitly. "Operator reaches into the infeed to clear a jam
without stopping the machine" is foreseeable, and assessing only correct use is the most common
way a risk assessment fails to protect anyone.]

---

## 2. Lifecycle phases assessed

| Phase | Assessed | Notes |
|---|---|---|
| Transport and installation | | |
| Commissioning | | |
| Normal operation | | |
| Setting and changeover | | |
| Cleaning | | |
| Fault finding | | |
| Maintenance | | |
| Decommissioning | | |

> Most machinery injuries happen outside normal operation. If only the operation row is
> assessed, the assessment is missing the dangerous part.

---

## 3. Hazard identification and risk estimation

Risk is estimated per ISO 13849-1 Annex A using S, F and P:

| Parameter | Value | Meaning |
|---|---|---|
| S, severity | S1 | Slight, normally reversible injury |
| | S2 | Serious, normally irreversible injury or death |
| F, frequency | F1 | Seldom to less often, or short exposure |
| | F2 | Frequent to continuous, or long exposure |
| P, possibility of avoidance | P1 | Possible under specific conditions |
| | P2 | Scarcely possible |

| # | Phase | Hazard | Hazardous event | Who | S | F | P | Required PL |
|---|---|---|---|---|---|---|---|---|
| H-001 | Operation | Crushing, inlet valve actuator | Body part in closing path | Operator | S2 | F1 | P2 | PL d |
| H-002 | Cleaning | Entanglement, rotating shaft | Contact during cleaning | Cleaner | S2 | F2 | P2 | PL e |
| H-003 | Fault finding | Electrical, live working | Contact with 400 V | Electrician | S2 | F1 | P2 | PL d |
| H-004 | Operation | Hot surface, reactor | Contact | Operator | S1 | F2 | P1 | PL b |
| H-005 | | | | | | | | |

**Determining PL from S, F and P.** Follow the risk graph in ISO 13849-1 Annex A. Where the
result sits on a boundary, record the reasoning rather than just the answer.

---

## 4. Protective measures

Applied in the order required by ISO 12100: eliminate by design first, then safeguard, then
inform. A guard is not an acceptable answer to a hazard that could have been designed out.

| Hazard | Measure | Type | Achieved PL | Verified |
|---|---|---|---|---|
| H-001 | [Reduce actuator force below injury threshold] | Inherently safe design | n/a | |
| H-001 | [Fixed guard over closing path] | Safeguarding | n/a | |
| H-002 | [Interlocked guard with guard locking] | Safeguarding | PL e | |
| H-003 | [Isolation procedure, lockable isolator] | Information and procedure | n/a | |
| H-004 | [Insulation, and warning label] | Safeguarding and information | n/a | |

---

## 5. Safety functions

Each safety function that the control system implements, with its required and achieved
performance level.

| SF ref | Safety function | Hazard | Required PL | Architecture | Category | DC | MTTFd | Achieved PL | Response time |
|---|---|---|---|---|---|---|---|---|---|
| SF-001 | Emergency stop, all motion | All | PL d | Dual channel | Cat 3 | High | [years] | | [ms] |
| SF-002 | Guard interlock, stop on open | H-002 | PL e | Dual channel with monitoring | Cat 4 | High | | | |
| SF-003 | Prevent start with guard open | H-002 | PL e | | Cat 4 | | | | |

**Calculation.** Record the calculation method and tool used, with version. Attach the report.

---

## 6. Safety distances

Where a guard or a device relies on distance, per ISO 13855.

| Ref | Device | Approach | Stopping time T (ms) | Speed K (mm/s) | Intrusion C (mm) | Minimum distance S (mm) | Actual (mm) | Pass |
|---|---|---|---|---|---|---|---|---|
| SD-001 | [Light curtain] | Perpendicular | | 2000 | | | | |

Stopping time is measured on the real machine at SAT, not taken from a catalogue.

---

## 7. Residual risk

Risk that remains after all protective measures. This is what goes into the instruction manual
and onto the machine.

| Ref | Residual risk | Communicated by | Location |
|---|---|---|---|
| RR-001 | [Description] | [Label, manual section, training] | [Where] |

---

## 8. Validation

| # | Safety function | Validation method | Result | Validated by | Date |
|---|---|---|---|---|---|
| | SF-001 | Test and analysis | | | |

| Role | Name | Signature | Date |
|---|---|---|---|
| Assessor (competent person) | | | |
| Design authority | | | |
| Client safety authority | | | |
`,
    },
  ],
};

export const SOFTWARE_DESIGN: DocTemplate = {
  slug: "software-design-specification",
  title: "Software Design Specification",
  abbr: "SDS",
  category: "Design",
  summary:
    "How the program is actually built: structure, naming, standard blocks, and the rules everyone follows.",
  purpose:
    "The SDS is what makes a program maintainable by someone who did not write it. It records the naming convention, the block library, the memory map and the coding rules, so that the fifth engineer to touch this system writes code that looks like the first engineer's.",
  whenYouNeedIt:
    "Any program that will outlive its author, which is all of them. Essential where more than one programmer works on the same system.",
  standards: ["IEC 61131-3", "PLCopen coding guidelines"],
  writtenBy: "Lead control systems engineer",
  approvedBy: "Client engineering",
  outline: [
    "Program organisation",
    "Naming conventions",
    "Standard function blocks",
    "Memory and addressing",
    "State machine pattern",
    "Coding rules",
    "Version control and change record",
  ],
  related: ["fds-functional-design-specification", "handover-pack"],
  files: [
    {
      name: "Software-Design-Specification.md",
      kind: "markdown",
      body: `${docHeader("Software Design Specification", "SDS")}
## 1. Program organisation

| POU | Type | Language | Called from | Interval | Purpose |
|---|---|---|---|---|---|
| Main | Program | LD | Cyclic task | 10 ms | Coordination and calls |
| Safety | Program | LD | Safety task | 10 ms | Safety logic only |
| Sequence | Function block | SFC | Main | | Step sequencing |
| Alarms | Function block | ST | Main | | Alarm evaluation |
| Analog | Function block | ST | Main | 100 ms | Scaling and filtering |
| Comms | Function block | ST | Main | 100 ms | External interfaces |

**Task allocation.** [State why each POU is where it is. Anything that must react to a fast
event goes in the fast task; anything that does not, does not, because scan time is a budget.]

---

## 2. Naming conventions

The convention matters less than the consistency. Pick one, write it here, and hold to it.

| Object | Pattern | Example | Notes |
|---|---|---|---|
| Digital input | \`XX_nnn_FUNC\` | \`XV_101_ZSO\` | Device, number, function |
| Digital output | \`XX_nnn_CMD\` | \`MTR_101_RUN\` | |
| Analog input | \`XT_nnn\` | \`FT_101\` | ISA-5.1 letters |
| Internal flag | \`b\` prefix | \`bSequenceRunning\` | |
| Timer | \`t\` prefix | \`tValveTimeout\` | |
| Counter | \`c\` prefix | \`cCyclesComplete\` | |
| Constant | Upper snake | \`MAX_TEMP\` | |
| Function block instance | \`fb\` prefix | \`fbFeedPump\` | |
| Step number | \`STEP_\` | \`STEP_FILL\` | Named, never a bare integer |

**Forbidden.** Single letter names, names that differ only by case, names that encode the
address (\`I0_0\`), and any name that requires the comment to be readable.

---

## 3. Standard function blocks

The library used on this project. Each block is tested once and reused, rather than the logic
being retyped per device.

| Block | Purpose | Inputs | Outputs | Notes |
|---|---|---|---|---|
| \`FB_Motor\` | Motor start, stop, fault, run hours | Cmd, Fbk, Interlock, Reset | Run, Fault, Hours | Feedback timeout configurable |
| \`FB_Valve\` | Two position valve with limits | Cmd, ZSO, ZSC, Interlock | Sol, Fault, Position | Travel timeout per instance |
| \`FB_AnalogIn\` | Scale, filter, range check, alarm | Raw, RangeLo, RangeHi | Value, Fault, AlmL, AlmH | Detects out of range both ends |
| \`FB_Alarm\` | Alarm with delay, deadband, ack | Trigger, Ack | Active, Unack, Latched | |
| \`FB_Sequence\` | Step engine with timeout | Enable, StepDone | Step, Timeout | |

**Rule.** A block is either general or it is not used. A "general" block with an \`if
device = 3\` inside it is two blocks pretending to be one.

---

## 4. Memory and addressing

| Area | Range | Use | Retentive |
|---|---|---|---|
| Inputs | | Physical inputs | No |
| Outputs | | Physical outputs | No |
| Markers | | Internal flags | Partly |
| Retentive | | Counters, run hours, recipe | Yes |
| Data blocks | | Structured data | Per block |

**Retentive data.** [List exactly what survives a power cycle and why. Anything retentive needs
a defined behaviour on first run after a memory clear.]

---

## 5. State machine pattern

Every sequence uses the same shape, so that any engineer reading any sequence recognises it.

\`\`\`
STEP:
  entry action, executed once
  running action, executed every scan while in step
  transition condition -> next step
  timeout -> alarm and hold
\`\`\`

**Rules.**

- A step is only left through a defined transition or a timeout. There is no other exit.
- Every step has a timeout. A step without one can hang forever, and the operator's report will
  be "it just stopped".
- Step numbers are named constants, never bare integers.
- The current step number is exposed to the HMI. Diagnosing a stuck sequence without it means
  going online with the programming software.

---

## 6. Coding rules

| # | Rule | Reason |
|---|---|---|
| 1 | One coil per tag, in one place | Two coils on one tag means the last rung wins and the first is invisible |
| 2 | No duplicated logic, use a block | Two copies drift apart |
| 3 | No jumps backwards | Unreadable and can create loops |
| 4 | Every rung commented with intent, not restatement | "Start latches" not "XIC Start OTE Run" |
| 5 | No online edits without a change record | Undocumented online edits are how a program stops matching its printout |
| 6 | Safety logic in the safety task only | Mixing them defeats the safety certification |
| 7 | No forces left in the delivered program | A force is a temporary tool, not a fix |
| 8 | Timers use named presets, not literals | A literal 5000 explains nothing |
| 9 | Analog values checked for range before use | An out of range value used in a calculation propagates silently |
| 10 | First scan initialisation is explicit | Relying on default zero is relying on the vendor |

---

## 7. Version control and change record

| Version | Date | Author | Change | Reason | Tested | Approved |
|---|---|---|---|---|---|---|
| 1.0 | {{DATE}} | {{AUTHOR}} | First issue | | | |

**Backup.** Source and compiled program archived at [location] after every change. Checksum
recorded in the handover pack.
`,
    },
  ],
};

export const HANDOVER: DocTemplate = {
  slug: "handover-pack",
  title: "Handover and As-Built Pack",
  abbr: "HO",
  category: "Handover",
  summary:
    "The index of everything the site receives, and the record that they actually received it.",
  purpose:
    "The handover pack is the permanent record. Years after the project team has moved on, this is what the site has. Its completeness decides whether the next modification takes an afternoon or a fortnight of reverse engineering.",
  whenYouNeedIt:
    "Every project, at completion. Build it as you go rather than at the end, because assembling it retrospectively is when you discover the as-builts were never marked up.",
  writtenBy: "Project engineer",
  approvedBy: "Client, on acceptance",
  outline: [
    "Document register",
    "Software and firmware record",
    "Backup and restore procedure",
    "Spare parts",
    "Maintenance schedule",
    "Support and escalation",
    "Receipt",
  ],
  related: ["sat-site-acceptance-test", "om-manual"],
  files: [
    {
      name: "Handover-Pack.md",
      kind: "markdown",
      body: `${docHeader("Handover and As-Built Pack", "HO")}
## 1. Document register

Every document handed over, at the revision handed over. "Latest" is not a revision.

| # | Document | Number | Rev | Format | Location | Received |
|---|---|---|---|---|---|---|
| 1 | User Requirement Specification | | | PDF | | |
| 2 | Functional Design Specification | | | PDF | | |
| 3 | Software Design Specification | | | PDF | | |
| 4 | Control narrative | | | PDF | | |
| 5 | I/O list, as-built | | | XLSX | | |
| 6 | Cause and effect matrix | | | XLSX | | |
| 7 | RATS | | | XLSX | | |
| 8 | Alarm list, rationalised | | | XLSX | | |
| 9 | Panel schematics, as-built | | | PDF + DWG | | |
| 10 | Panel general arrangement | | | PDF + DWG | | |
| 11 | Cable schedule, as-built | | | XLSX | | |
| 12 | Loop drawings | | | PDF | | |
| 13 | Bill of materials | | | XLSX | | |
| 14 | Risk assessment | | | PDF | | |
| 15 | Safety calculations | | | PDF | | |
| 16 | FAT protocol and results | | | PDF | | |
| 17 | SAT protocol and results | | | PDF | | |
| 18 | Commissioning checklist, completed | | | PDF | | |
| 19 | Calibration certificates | | | PDF | | |
| 20 | O&M manual | | | PDF | | |
| 21 | Training records | | | PDF | | |
| 22 | Declaration of conformity | | | PDF | | |
| 23 | Equipment manuals, all devices | | | PDF | | |

**As-built means as-built.** If a wire was moved during commissioning and the drawing was not
updated, the pack is wrong and the next person will trust it.

---

## 2. Software and firmware record

| Item | Product | Version | Checksum | Licence key held by | Media |
|---|---|---|---|---|---|
| PLC program | | | | | |
| Safety program | | | | | |
| HMI application | | | | | |
| CPU firmware | | | | | |
| Remote I/O firmware | | | | | |
| Drive parameters | | | | | |
| Managed switch config | | | | | |
| Programming software | | | | | |

**Licences.** State who holds them and whether the site can open the program without buying
software. A program the site cannot open is a program the site does not own.

---

## 3. Backup and restore

### 3.1 What is backed up
| Item | Location | Frequency | Responsible |
|---|---|---|---|
| PLC program | | On change | |
| HMI application | | On change | |
| Recipes and parameters | | Weekly | |
| Historical data | | Daily | |

### 3.2 Restore procedure
[Numbered steps to restore a failed controller from backup, including how to verify the restore
worked. Write it so that someone who has never done it can follow it at 2 am.]

1. [Step]
2. [Step]

**Restore has been tested.** Date: __________ By: __________

> An untested backup is a hope. Test the restore before handover and record it here.

---

## 4. Spare parts

| Item | Manufacturer | Part number | Qty supplied | Qty recommended | Location | Lead time |
|---|---|---|---|---|---|---|
| | | | | | | |

**Critical spares.** [Items with a lead time long enough to matter. These are the ones worth
holding, and the ones the site will not think about until one fails.]

---

## 5. Maintenance schedule

| Task | Interval | Duration | Skill | Procedure ref |
|---|---|---|---|---|
| Panel inspection, thermal check | 6 months | 1 h | Electrician | |
| Filter fan replacement | 12 months | 30 min | Technician | |
| Instrument calibration | 12 months | | Instrument tech | |
| Safety function proof test | 12 months | | Competent person | |
| Backup verification | 6 months | 1 h | Engineer | |
| UPS battery test | 12 months | | Electrician | |

**Safety proof testing.** The interval comes from the safety calculation, not from convenience.
Record it and hold to it, because the achieved PL assumes it.

---

## 6. Support and escalation

| Level | Contact | Hours | Response | Covers |
|---|---|---|---|---|
| 1 | Site maintenance | | | First line |
| 2 | {{COMPANY}} support | | | Program and configuration |
| 3 | Vendor | | | Hardware failure |

| Detail | Value |
|---|---|
| Support contract reference | |
| Warranty expiry | |
| Remote access method | |
| Remote access approval process | |

---

## 7. Receipt

The items listed in section 1 have been received by {{CLIENT}}.

| Role | Name | Signature | Date |
|---|---|---|---|
| Issued by | | | |
| Received by | | | |
`,
    },
  ],
};

export const OM_MANUAL: DocTemplate = {
  slug: "om-manual",
  title: "Operation and Maintenance Manual",
  abbr: "O&M",
  category: "Handover",
  summary: "How to run it, how to fix it, written for the people who will do both at 3 am.",
  purpose:
    "The O&M manual is the only project document read by people who were not on the project. That changes how it must be written: no assumed context, no internal abbreviations, and fault finding organised by symptom rather than by subsystem, because a symptom is what the reader has.",
  whenYouNeedIt: "Every delivered system.",
  standards: ["IEC 60204-1 clause 17 for information requirements"],
  writtenBy: "Project engineer",
  approvedBy: "Client operations",
  outline: [
    "Safety information",
    "System description",
    "Operating instructions",
    "Alarm response guide",
    "Fault finding by symptom",
    "Routine maintenance",
    "Parts and consumables",
  ],
  related: ["handover-pack", "alarm-rationalisation"],
  files: [
    {
      name: "OM-Manual.md",
      kind: "markdown",
      body: `${docHeader("Operation and Maintenance Manual", "O&M")}
## 1. Safety information

**Read this section before operating or working on the system.**

### 1.1 Residual risks
| Risk | Where | Precaution |
|---|---|---|
| | | |

### 1.2 Isolation
[How to isolate the system safely, including every energy source: electrical, pneumatic,
hydraulic, gravity and stored energy. List them all. The one that is forgotten is the one that
causes the injury.]

| Energy source | Isolation point | Method | Verification |
|---|---|---|---|
| Electrical, 400 V | [Isolator ref] | Lock off | Prove dead |
| Control, 24 V | | | |
| Compressed air | | | Vent and verify zero |
| Stored, [e.g. raised load] | | | |

### 1.3 Personal protective equipment
[What is required, and where.]

---

## 2. System description

[Plain language. What the system does, what the main parts are, and how they relate. A diagram
belongs here. Assume the reader has never seen the machine.]

---

## 3. Operating instructions

### 3.1 Before starting
| # | Check |
|---|---|
| 1 | [Check] |

### 3.2 Starting
1. [Step, with what to expect on the screen]

### 3.3 Normal running
[What the operator watches. What normal looks like, with numbers.]

### 3.4 Stopping
1. [Step]

### 3.5 Emergency stop and recovery
1. [What to do]
2. [How to make safe]
3. [How to reset, and what must be true first]

---

## 4. Alarm response guide

Ordered by the alarm message the operator sees, because that is what they are holding.

| Alarm message | What it means | What to do | If it persists |
|---|---|---|---|
| Feed tank level high high | Level above 95%, feed stopped automatically | Check the outfeed route is clear, then reset | Call maintenance, do not bypass |
| Valve failed to open | No open confirmation within 10 seconds | Check air supply pressure and the limit switch | Call maintenance |

---

## 5. Fault finding

By symptom. The reader knows what they can see, not which subsystem is at fault.

### 5.1 The machine will not start

| Check | How | If not right |
|---|---|---|
| Is an E-stop pressed? | Check all stations, look for the latched button | Release, twist to reset, then press Reset |
| Are all guards closed? | Check the guard status screen | Close and latch the guard shown |
| Is the mode correct? | Check mode indicator | Select Auto |
| Is there a standing alarm? | Check alarm list | Clear the cause, then acknowledge |
| Is control power on? | Check 24 V indicator in panel | Check MCB, check power supply |

### 5.2 The sequence stops part way through

| Check | How | If not right |
|---|---|---|
| Which step is it on? | Sequence screen shows the step number | Compare with the FDS sequence table |
| Is there a step timeout alarm? | Alarm list | The alarm names the step that failed |
| Is the transition condition met? | Check the device the step waits for | Investigate that device |

### 5.3 A value on screen looks wrong

| Check | How | If not right |
|---|---|---|
| Is the reading at the extreme? | Look for 0 or full scale | Suspect a broken wire or a shorted loop |
| Does the local gauge agree? | Compare | If not, suspect the transmitter or its calibration |
| Was it right yesterday? | Check the trend | A step change points at a hardware event |

---

## 6. Routine maintenance

| Task | Interval | Procedure | Skill |
|---|---|---|---|
| | | | |

---

## 7. Parts and consumables

| Part | Number | Used in | Typical life |
|---|---|---|---|
| | | | |
`,
    },
  ],
};

export const CHANGE_CONTROL: DocTemplate = {
  slug: "change-control-record",
  title: "Change Control Record",
  abbr: "MOC",
  category: "Handover",
  summary: "A single form for any change after handover: what, why, what it affects, who agreed.",
  purpose:
    "After handover, every change is a risk to a system that currently works. This record forces the questions that get skipped under pressure: what else does this touch, what testing proves it, and how do we get back if it goes wrong.",
  whenYouNeedIt:
    "Every change to a system in service, including one that seems trivial. The trivial ones are the ones done without testing.",
  standards: ["GAMP 5 for regulated systems", "IEC 61511 clause 17 for SIS modifications"],
  writtenBy: "Requester and implementer",
  approvedBy: "System owner, and safety authority where safety related",
  outline: [
    "Change description and justification",
    "Impact assessment",
    "Risk and safety review",
    "Test plan",
    "Rollback plan",
    "Approval",
    "Implementation and verification record",
  ],
  related: ["software-design-specification", "handover-pack"],
  files: [
    {
      name: "Change-Control-Record.md",
      kind: "markdown",
      body: `${docHeader("Change Control Record", "MOC")}
| Field | Value |
|---|---|
| Change reference | |
| Raised by | |
| Date raised | |
| System affected | {{PROJECT_NAME}} |
| Urgency | Routine / Urgent / Emergency |

---

## 1. Description of change

**What is changing.**
[Describe precisely. "Improve the sequence" is not a description.]

**Why.**
[The problem being solved. If the answer is "somebody asked", find out why they asked.]

**What happens if we do nothing.**
[Sometimes the honest answer is "nothing", and that is a valid outcome for this form.]

---

## 2. Impact assessment

Tick everything the change touches. Anything ticked needs its document updated and its tests
repeated.

| Area | Affected | Document to update | Updated |
|---|---|---|---|
| PLC program | | SDS, program backup | |
| Safety program | | Risk assessment, safety calc | |
| HMI application | | FDS section 8 | |
| I/O allocation | | I/O list, schematics | |
| Field wiring | | Cable schedule, loop drawings | |
| Alarms | | Alarm list, rationalisation | |
| Interlocks | | Cause and effect matrix | |
| Recipes or parameters | | FDS section 9 | |
| Network or interfaces | | FDS section 10 | |
| Operating procedure | | O&M manual | |
| Training | | Training records | |

---

## 3. Safety review

| Question | Answer |
|---|---|
| Does the change affect a safety function? | Yes / No |
| Does it affect an interlock or a trip? | Yes / No |
| Does it change the risk assessment? | Yes / No |
| Does it affect the achieved performance level? | Yes / No |
| Is a new hazard introduced? | Yes / No |

**If any answer is Yes**, the change requires review by a competent person and revalidation of
the affected safety function. It does not proceed on an operator's request alone.

| Safety review by | Signature | Date |
|---|---|---|
| | | |

---

## 4. Test plan

| # | Test | Expected result | Actual | Pass | Tester |
|---|---|---|---|---|---|
| 1 | [Test the change itself] | | | | |
| 2 | [Test what the change might have broken] | | | | |
| 3 | [Regression: the interlocks still work] | | | | |

Test 2 and 3 are the ones that matter. Testing only the change proves only that the change
does something, not that everything else still does.

---

## 5. Rollback plan

| Item | Detail |
|---|---|
| Backup taken before change | Yes / No, location: |
| Backup verified | Yes / No |
| Rollback procedure | [Numbered steps] |
| Time to roll back | [minutes] |
| Point of no return | [If any, state it clearly] |

---

## 6. Approval

| Role | Name | Signature | Date |
|---|---|---|---|
| Requester | | | |
| Technical review | | | |
| Safety authority (if applicable) | | | |
| System owner | | | |

---

## 7. Implementation record

| Field | Value |
|---|---|
| Implemented by | |
| Date and time started | |
| Date and time completed | |
| Program version before | |
| Program version after | |
| Checksum after | |
| Tests completed | |
| Documents updated | |
| Backup taken after change | |

## 8. Closure

| Role | Name | Signature | Date |
|---|---|---|---|
| Verified by | | | |
| Closed by | | | |
`,
    },
  ],
};
