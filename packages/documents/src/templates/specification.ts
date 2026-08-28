import { type DocTemplate, docHeader } from "./types";

/**
 * The specification documents.
 *
 * These three answer, in order: what does the client want, how will it work,
 * and what exactly are we building. Skipping the middle one is the single most
 * common cause of a FAT where both parties believed something different.
 */

export const URS: DocTemplate = {
  slug: "urs-user-requirement-specification",
  title: "User Requirement Specification",
  abbr: "URS",
  category: "Specification",
  summary:
    "What the client needs the system to do, written before anyone decides how it will be done.",
  purpose:
    "The URS is the client's document. It states the requirement in plant terms, not control terms: throughput, product changeover time, what has to be recorded, which standards apply. It is the thing every later document is traced back to, and it is what an auditor asks for first.",
  whenYouNeedIt:
    "Any project with a client who is not you, and every regulated project without exception. On a small in-house machine build you can fold it into the FDS, but keep the requirement numbers: traceability is the part that earns its keep.",
  standards: ["GAMP 5 (2nd edition)", "IEC 62443 where the system is networked"],
  writtenBy: "Client, or the integrator on the client's behalf",
  approvedBy: "Client process owner and quality",
  outline: [
    "Purpose and scope",
    "System overview and boundaries",
    "Operational requirements",
    "Functional requirements",
    "Data and records",
    "Interfaces",
    "Environment and utilities",
    "Safety and regulatory",
    "Non-functional requirements",
    "Requirement traceability",
    "Glossary",
  ],
  related: ["fds-functional-design-specification", "sat-site-acceptance-test"],
  files: [
    {
      name: "URS.md",
      kind: "markdown",
      body: `${docHeader("User Requirement Specification", "URS")}
## 1. Purpose and scope

### 1.1 Purpose
This document states the requirements that {{CLIENT}} places on {{PROJECT_NAME}}. It describes
*what* the system must do. It deliberately does not describe how, which is the subject of the
Functional Design Specification.

### 1.2 Scope
**In scope**

- [Equipment, area or process covered]
- [Control system boundary]

**Out of scope**

- [Explicitly excluded items. Be generous here. Most disputes at SAT trace back to something
  that was never written down as excluded.]

### 1.3 Definitions
See section 11.

---

## 2. System overview and boundaries

[One or two paragraphs describing the process in plain language, as an operator would explain it.]

### 2.1 Battery limits

| Boundary | Description | Responsibility |
|---|---|---|
| Upstream | [e.g. infeed conveyor handshake] | [Client / Supplier] |
| Downstream | [e.g. palletiser interface] | [Client / Supplier] |
| Electrical | [e.g. 400 V supply to panel isolator] | [Client / Supplier] |
| Network | [e.g. site OT switch, port assignment] | [Client / Supplier] |

---

## 3. Operational requirements

Each requirement carries a unique reference. That reference is quoted in the FDS, in the FAT
and in the SAT, and it is how anyone proves the delivered system matches what was asked for.

| Ref | Requirement | Priority | Acceptance |
|---|---|---|---|
| URS-OP-001 | The system shall [requirement]. | Mandatory | [How this is demonstrated] |
| URS-OP-002 | The system shall [requirement]. | Mandatory | |
| URS-OP-003 | The system should [requirement]. | Desirable | |

**Priority key.** Mandatory: the system is not accepted without it. Desirable: implement if it
does not affect cost or programme. Optional: record for a later phase.

---

## 4. Functional requirements

### 4.1 Operating modes

| Ref | Requirement | Priority |
|---|---|---|
| URS-FN-001 | The system shall provide Manual, Auto and Maintenance modes. | Mandatory |
| URS-FN-002 | Mode changes shall be possible only when [condition]. | Mandatory |

### 4.2 Sequence
| Ref | Requirement | Priority |
|---|---|---|
| URS-FN-010 | On start, the system shall [sequence]. | Mandatory |
| URS-FN-011 | On stop request, the system shall [controlled stop behaviour]. | Mandatory |
| URS-FN-012 | On power restoration, the system shall [restart behaviour]. | Mandatory |

### 4.3 Alarms
| Ref | Requirement | Priority |
|---|---|---|
| URS-FN-020 | Alarms shall be prioritised and presented per ISA-18.2. | Mandatory |
| URS-FN-021 | Alarm acknowledgement shall record user and timestamp. | Mandatory |

---

## 5. Data and records

| Ref | Requirement | Retention | Priority |
|---|---|---|---|
| URS-DR-001 | The system shall record [data] at [frequency]. | [Period] | Mandatory |
| URS-DR-002 | Records shall be attributable, legible, contemporaneous, original and accurate. | | Mandatory |
| URS-DR-003 | The system shall provide an audit trail of parameter changes. | | Mandatory |

> Where records support a regulated activity, ALCOA+ applies: attributable, legible,
> contemporaneous, original, accurate, plus complete, consistent, enduring and available.

---

## 6. Interfaces

| Ref | Interface | Direction | Protocol | Data |
|---|---|---|---|---|
| URS-IF-001 | [MES / ERP / SCADA] | Bidirectional | [OPC UA / Modbus TCP] | [Payload] |
| URS-IF-002 | [Upstream machine] | In | [Hardwired handshake] | [Signals] |

---

## 7. Environment and utilities

| Item | Requirement |
|---|---|
| Ambient temperature | [range] |
| Humidity | [range] |
| Ingress protection | [IP rating, and where] |
| Electrical supply | [voltage, phases, frequency, fault level] |
| Compressed air | [pressure, quality class] |
| Area classification | [safe area / zone, and the governing standard] |

---

## 8. Safety and regulatory

| Ref | Requirement | Standard |
|---|---|---|
| URS-SF-001 | Emergency stop shall meet the required performance level. | ISO 13849-1 |
| URS-SF-002 | Machinery safety functions shall be assessed and documented. | ISO 12100 |
| URS-SF-003 | The safety related parts shall achieve PL [d/e] / SIL [1/2/3]. | ISO 13849-1 / IEC 62061 |
| URS-SF-004 | Electrical equipment of the machine shall comply. | IEC 60204-1 |

---

## 9. Non-functional requirements

| Ref | Requirement | Target |
|---|---|---|
| URS-NF-001 | Availability | [%] |
| URS-NF-002 | Scan time | [ms] |
| URS-NF-003 | Operator response time for [action] | [ms] |
| URS-NF-004 | Spare I/O capacity at handover | [%, typically 20] |
| URS-NF-005 | Spare memory and network capacity | [%] |
| URS-NF-006 | Cyber security level | IEC 62443 SL-[n] |

---

## 10. Requirement traceability

Completed as the project runs. Every mandatory requirement above must appear here with a test
that demonstrates it.

| URS ref | FDS section | Test ref (FAT/SAT) | Verified | Date |
|---|---|---|---|---|
| URS-OP-001 | | | | |
| URS-FN-001 | | | | |

---

## 11. Glossary

| Term | Meaning |
|---|---|
| FAT | Factory Acceptance Test |
| FDS | Functional Design Specification |
| SAT | Site Acceptance Test |
| URS | User Requirement Specification |
`,
    },
  ],
};

export const FDS: DocTemplate = {
  slug: "fds-functional-design-specification",
  title: "Functional Design Specification",
  abbr: "FDS",
  category: "Specification",
  summary:
    "How the system will actually work, in enough detail that someone else could program it.",
  purpose:
    "The FDS is the contract between what was asked for and what gets built. It takes each requirement from the URS and says, concretely, how the control system satisfies it: which modes exist, what each sequence step does, what every alarm means, what happens on power loss. If the FAT is going to be arguable, it is because this document was vague.",
  whenYouNeedIt:
    "Every project. This is the one document worth writing even when nobody has asked for it, because it is what you will read in eighteen months when something needs changing and nobody remembers why the interlock is there.",
  standards: ["IEC 61131-3", "ISA-88 for batch and sequence structure", "ISA-18.2 for alarms"],
  writtenBy: "Control systems engineer",
  approvedBy: "Client engineering, and process owner",
  outline: [
    "Purpose and references",
    "System architecture",
    "Operating modes",
    "Sequence of operation",
    "Interlocks and permissives",
    "Alarms",
    "Analog handling and scaling",
    "Operator interface",
    "Data, recipes and reporting",
    "Communications",
    "Failure behaviour",
    "Software structure",
    "Requirement traceability",
  ],
  related: [
    "urs-user-requirement-specification",
    "control-narrative",
    "cause-and-effect-matrix",
    "fat-factory-acceptance-test",
  ],
  files: [
    {
      name: "FDS.md",
      kind: "markdown",
      body: `${docHeader("Functional Design Specification", "FDS")}
## 1. Purpose and references

### 1.1 Purpose
This document describes how the control system for {{PROJECT_NAME}} satisfies the requirements
of the User Requirement Specification. It is written to be sufficient for a competent control
engineer to implement the system without further clarification, and for the FAT to be written
directly from it.

### 1.2 Reference documents

| Ref | Document | Number | Rev |
|---|---|---|---|
| R1 | User Requirement Specification | | |
| R2 | P&ID / General arrangement | | |
| R3 | I/O list | | |
| R4 | Cause and effect matrix | | |
| R5 | Risk assessment | | |

### 1.3 Standards
IEC 61131-3 for programming languages. ISA-88 for sequence and state model terminology.
ISA-18.2 for alarm management. IEC 60204-1 for electrical equipment of machines.

---

## 2. System architecture

### 2.1 Overview
[Describe the topology: controllers, remote I/O, drives, HMI, network segments.]

### 2.2 Hardware summary

| Item | Manufacturer | Model | Qty | Location |
|---|---|---|---|---|
| PLC CPU | | | | |
| Remote I/O | | | | |
| HMI | | | | |
| Safety controller | | | | |
| Managed switch | | | | |

### 2.3 Networks

| Network | Protocol | Media | Address range | Devices |
|---|---|---|---|---|
| Control | [EtherNet/IP, PROFINET] | | | |
| Safety | [CIP Safety, PROFIsafe] | | | |
| Plant | [OPC UA] | | | |

### 2.4 Software versions

| Item | Software | Version | Notes |
|---|---|---|---|
| PLC program | | | |
| HMI application | | | |
| Firmware, CPU | | | |

> Record exact versions. "Latest" is not a version, and at SAT it is the difference between
> a five minute check and an afternoon.

---

## 3. Operating modes

| Mode | Entry condition | Behaviour | Exit condition |
|---|---|---|---|
| Off | Power applied, no start | Outputs de-energised, no motion | Start selected |
| Manual | Selected at HMI, guards closed | Individual devices operable, interlocks active | Mode change |
| Auto | Selected, ready conditions met | Full sequence runs | Stop, fault, or mode change |
| Maintenance | Key switch, authorised user | [Reduced speed / bypass, define exactly what is bypassed] | Key removed |

**Mode change rules.** [State when a mode change is permitted and what happens to a running
sequence when it occurs. This is where the difference between an orderly stop and a mess lives.]

---

## 4. Sequence of operation

Written as numbered steps with an explicit transition condition. A step with no stated
transition is a step that can hang, and that is what an operator will report as "it stopped
and nothing happened".

### 4.1 Start sequence

| Step | Action | Transition to next step | Timeout | On timeout |
|---|---|---|---|---|
| 1 | [Action] | [Condition] | [s] | [Alarm ref, and behaviour] |
| 2 | | | | |
| 3 | | | | |

### 4.2 Normal running
[Describe steady state behaviour, cycle timing, and how throughput is regulated.]

### 4.3 Controlled stop
| Step | Action | Transition | Timeout |
|---|---|---|---|
| 1 | Complete current cycle | Cycle complete flag | [s] |
| 2 | [Action] | | |

### 4.4 Emergency stop
[Category 0 or 1 per IEC 60204-1. State which, and state exactly what remains energised.]

### 4.5 Recovery and restart
[What the operator must do after a fault or an E-stop. State whether a manual reset is required
before motion is possible, because the safety assessment almost certainly requires one.]

---

## 5. Interlocks and permissives

A **permissive** must be true to start. An **interlock** stops or prevents operation when it
goes false. They are not the same thing and confusing them produces machines that cannot be
restarted after a trip.

| Ref | Type | Condition | Affects | Action | Reset |
|---|---|---|---|---|---|
| INT-001 | Interlock | [Signal false] | [Device] | [Immediate stop] | [Auto / manual] |
| PRM-001 | Permissive | [Condition] | [Sequence] | [Prevents start] | n/a |

---

## 6. Alarms

Per ISA-18.2: every alarm requires a defined operator response. An indication that needs no
response is a status, not an alarm, and putting it in the alarm list is how alarm floods start.

| Tag | Description | Priority | Trip | Delay | Operator action | Auto reset |
|---|---|---|---|---|---|---|
| AL-001 | | High | | [s] | [What the operator does] | No |
| AL-002 | | Medium | | | | |

**Priority definitions.** High: immediate action required to avoid injury, damage or product
loss. Medium: action required this shift. Low: action required, not time critical.

---

## 7. Analog handling and scaling

| Tag | Signal | Raw range | Engineering range | Units | Filter | Fault action |
|---|---|---|---|---|---|---|
| | 4-20 mA | 0-27648 | | | [s] | [Hold / fail safe value] |

**Out of range.** [State the behaviour below 3.6 mA and above 21 mA. A broken wire reads as
zero flow, and if that is not detected the sequence will happily continue.]

---

## 8. Operator interface

### 8.1 Screen hierarchy
[List screens and navigation.]

### 8.2 Common conventions

| Element | Convention |
|---|---|
| Running | [Colour and shape] |
| Stopped | |
| Faulted | |
| Unacknowledged alarm | |

> Colour alone must not carry meaning. Use shape or text as well, for colour vision deficiency
> and for the fact that panel screens fade.

### 8.3 Security levels

| Level | Who | Permitted |
|---|---|---|
| 0 | Anyone | View only |
| 1 | Operator | Start, stop, acknowledge |
| 2 | Supervisor | Setpoint changes within limits |
| 3 | Engineer | Full, including bypasses |

---

## 9. Data, recipes and reporting

### 9.1 Recipe structure
| Parameter | Type | Range | Default | Units | Security level |
|---|---|---|---|---|---|

### 9.2 Records
| Record | Trigger | Fields | Retention | Format |
|---|---|---|---|---|

---

## 10. Communications

| Link | Peer | Protocol | Rate | Data exchanged | Failure behaviour |
|---|---|---|---|---|---|

**Watchdog.** [State the timeout and what happens when it expires. A comms link with no
watchdog will one day deliver a stale value that looks perfectly valid.]

---

## 11. Failure behaviour

| Failure | Detection | System response | Alarm | Recovery |
|---|---|---|---|---|
| Power loss | | Outputs de-energise | | [Manual restart required?] |
| CPU fault | | | | |
| Remote I/O comms loss | | | | |
| Sensor out of range | | | | |
| Drive fault | | | | |

---

## 12. Software structure

### 12.1 Program organisation

| POU | Language | Purpose | Scan |
|---|---|---|---|
| Main | LD | Coordination | Cyclic |
| | | | |

### 12.2 Naming conventions
[State the tag naming rule and stick to it. Include an example of each type.]

### 12.3 Memory map
| Area | Range | Use |
|---|---|---|

---

## 13. Requirement traceability

| URS ref | FDS section | Implemented in | Test ref |
|---|---|---|---|
| URS-OP-001 | | | |
`,
    },
  ],
};

export const CONTROL_NARRATIVE: DocTemplate = {
  slug: "control-narrative",
  title: "Control Narrative",
  abbr: "CN",
  category: "Specification",
  summary:
    "The process described in prose, loop by loop, for the people who will operate and maintain it.",
  purpose:
    "The control narrative explains the process in the language operators use, rather than in control system terms. It sits between the P&ID and the FDS: it says why the plant behaves as it does, which is exactly what an FDS full of tables leaves out.",
  whenYouNeedIt:
    "Process plant, and anything with continuous control loops. On a discrete machine the FDS sequence section usually covers it, and a separate narrative is duplication you will have to keep in step.",
  standards: ["ISA-5.1 for instrument identification", "ISA-88 for procedural terminology"],
  writtenBy: "Process engineer with the control engineer",
  approvedBy: "Process owner",
  outline: [
    "Process overview",
    "Equipment description",
    "Control loops",
    "Normal operation",
    "Start-up and shutdown",
    "Upset conditions",
    "Operator responsibilities",
  ],
  related: ["fds-functional-design-specification", "cause-and-effect-matrix"],
  files: [
    {
      name: "Control-Narrative.md",
      kind: "markdown",
      body: `${docHeader("Control Narrative", "CN")}
## 1. Process overview

[Describe what the plant makes, and how. Write it so a new operator could read this section
alone and understand what they are looking at on the plant floor. Avoid control system
vocabulary here entirely.]

---

## 2. Equipment description

| Tag | Equipment | Function | Rating |
|---|---|---|---|
| [P-101] | [Feed pump] | [Transfers feed from T-101 to R-201] | [m3/h, kW] |
| | | | |

---

## 3. Control loops

One subsection per loop. The measurement, the final element, the strategy, and, importantly,
what the loop is protecting against.

### 3.1 [FIC-101, feed flow control]

| Item | Detail |
|---|---|
| Measurement | [FT-101, magnetic flow meter, 0 to 50 m3/h] |
| Controller | [FIC-101, PID] |
| Final element | [FCV-101, equal percentage, air to open] |
| Normal setpoint | [value and units] |
| Setpoint source | [Operator entry / recipe / cascade from LIC-201] |
| Action | [Direct / reverse, and why] |
| Failure position | [Fail open / closed / last, and the consequence of each] |

**Description.** [Prose: what the loop does, when it is in automatic, what an operator should
expect to see, and what it means when the valve sits at 100 percent.]

**Tuning.** [Initial values, and a note on the dominant time constant.]

---

## 4. Normal operation

[The steady state. What the operator watches, what the normal ranges are, what routine
interventions are expected during a shift.]

---

## 5. Start-up and shutdown

### 5.1 Cold start
[Numbered, in order, including the checks that must pass before each stage.]

### 5.2 Normal shutdown

### 5.3 Emergency shutdown
[What trips, in what order, and what stays running. State explicitly which items remain
energised, because that is the question the maintenance team will ask first.]

---

## 6. Upset conditions

| Condition | Symptom | Cause | System response | Operator action |
|---|---|---|---|---|
| [High level in T-101] | [LAH-101 alarm] | [Outfeed blocked] | [Feed pump stops] | [Investigate outfeed] |

---

## 7. Operator responsibilities

[What the operator is expected to do, and, just as usefully, what they must not do. If there
are actions that require a permit or a second person, say so here.]
`,
    },
  ],
};
