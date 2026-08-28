import { type DocTemplate, docHeader } from "./types";

/**
 * The test documents.
 *
 * FAT proves the system works on the bench with simulated I/O. SAT proves it
 * works on the plant with real equipment. They are not the same test and one
 * does not substitute for the other, which is a point worth making in writing
 * because the temptation to skip the FAT when the programme slips is constant.
 */

export const FAT: DocTemplate = {
  slug: "fat-factory-acceptance-test",
  title: "Factory Acceptance Test Protocol",
  abbr: "FAT",
  category: "Testing",
  summary:
    "The test run at the integrator's works, on simulated I/O, before anything ships to site.",
  purpose:
    "The FAT is the last point at which a fault costs hours rather than days. Everything is on the bench, the programmer is in the building, and a spare part is a drawer away. The protocol is written from the FDS, so that passing the FAT means the system does what the FDS says, and any gap between them is found here rather than on site.",
  whenYouNeedIt:
    "Every panel that leaves your works. The cost of a witnessed FAT is always less than the cost of finding the same fault during a site shutdown.",
  standards: ["IEC 62381 for automation system acceptance testing"],
  writtenBy: "Control systems engineer",
  approvedBy: "Client witness, and project manager",
  outline: [
    "Scope and references",
    "Entry criteria",
    "Test environment and simulation",
    "Documentation verification",
    "Visual and mechanical inspection",
    "Power up and electrical tests",
    "I/O verification, point by point",
    "Functional tests",
    "Interlock and safety tests",
    "Alarm tests",
    "Communications tests",
    "Failure mode tests",
    "Punch list",
    "Acceptance and sign-off",
  ],
  related: ["fds-functional-design-specification", "sat-site-acceptance-test", "io-list"],
  files: [
    {
      name: "FAT-Protocol.md",
      kind: "markdown",
      body: `${docHeader("Factory Acceptance Test Protocol", "FAT")}
## 1. Scope and references

### 1.1 Scope
This protocol covers acceptance testing of the control system for {{PROJECT_NAME}} at the works
of {{COMPANY}}, prior to despatch to site. Testing is performed on simulated field I/O.

**Not covered by this test.** Field device performance, actual process behaviour, and anything
that depends on real plant. Those belong to the SAT, and no result here should be read as
covering them.

### 1.2 References

| Ref | Document | Number | Rev |
|---|---|---|---|
| R1 | Functional Design Specification | | |
| R2 | I/O List | | |
| R3 | Cause and Effect Matrix | | |
| R4 | Bill of Materials | | |
| R5 | Panel general arrangement and schematics | | |

### 1.3 Attendees

| Name | Company | Role | Present for |
|---|---|---|---|
| | {{COMPANY}} | Test engineer | All |
| | {{CLIENT}} | Witness | |
| | | | |

---

## 2. Entry criteria

The FAT does not begin until every item below is true. Starting a FAT that is not ready wastes
the witness's time and produces a punch list that is really a build list.

| # | Criterion | Met | Initial |
|---|---|---|---|
| 1 | Panel build complete and inspected | | |
| 2 | Program written, compiled, and version recorded | | |
| 3 | HMI application complete, version recorded | | |
| 4 | Internal pre-FAT completed and faults cleared | | |
| 5 | Simulation rig available and proven | | |
| 6 | All reference documents at current revision and available | | |
| 7 | Test protocol issued to client at least 5 working days beforehand | | |
| 8 | Calibration certificates for test equipment in date | | |

**Pre-FAT.** Run the entire protocol yourself first. The witnessed FAT is a demonstration, not
a debugging session.

---

## 3. Test environment

### 3.1 Simulation method

| I/O type | Simulation method |
|---|---|
| Digital input | Switch box on terminals, one switch per point |
| Digital output | Indicator lamp or LED on terminals |
| Analog input | Signal generator, 4-20 mA, calibrated |
| Analog output | Loop calibrator in read mode |
| Safety input | Dual channel switch box, with fault injection capability |
| Network devices | Simulator or actual device where available |

### 3.2 Test equipment

| Equipment | Serial | Cal due | Used for |
|---|---|---|---|
| Loop calibrator | | | Analog I/O |
| Multimeter | | | Electrical checks |
| Insulation tester | | | Insulation resistance |

### 3.3 Software versions under test

| Item | Version | Checksum | Recorded by |
|---|---|---|---|
| PLC program | | | |
| HMI application | | | |
| Safety program | | | |

> Record the checksum, not just the version number. Two builds can share a version.

---

## 4. Documentation verification

| # | Check | Result | Initial |
|---|---|---|---|
| 4.1 | Schematics match the as-built panel | Pass / Fail | |
| 4.2 | BOM matches installed components, item by item | Pass / Fail | |
| 4.3 | Equipment manuals present | Pass / Fail | |
| 4.4 | Calibration certificates present and in date | Pass / Fail | |
| 4.5 | Software version documentation complete | Pass / Fail | |
| 4.6 | Spare parts list supplied | Pass / Fail | |
| 4.7 | CE / UKCA declaration prepared | Pass / Fail | |

---

## 5. Visual and mechanical inspection

| # | Check | Result | Initial |
|---|---|---|---|
| 5.1 | Enclosure undamaged, correct IP rating, seals intact | | |
| 5.2 | All components mounted securely | | |
| 5.3 | Wiring neat, ferruled, and identified per drawings | | |
| 5.4 | Terminal numbering matches schematics | | |
| 5.5 | Earth continuity, all metallic parts bonded | | |
| 5.6 | Segregation of power, control, instrument and data | | |
| 5.7 | Labels present, legible, and correct | | |
| 5.8 | Warning labels and arc flash label fitted | | |
| 5.9 | Door interlock on isolator operates | | |
| 5.10 | Gland plate drilled correctly, spare glands blanked | | |
| 5.11 | No swarf or debris in enclosure | | |

---

## 6. Power up and electrical tests

**Safety.** These tests involve live working. Follow the site electrical safety rules and
ensure a second competent person is present.

| # | Test | Expected | Measured | Result | Initial |
|---|---|---|---|---|---|
| 6.1 | Insulation resistance, power circuits, 500 V | > 1 MOhm | | | |
| 6.2 | Earth continuity, < 0.1 Ohm to earth bar | Pass | | | |
| 6.3 | Phase rotation | [L1 L2 L3] | | | |
| 6.4 | Supply voltage at isolator | [400 V ± 10%] | | | |
| 6.5 | 24 VDC supply voltage on load | 24 V ± 5% | | | |
| 6.6 | 24 VDC ripple | < 100 mV | | | |
| 6.7 | Protective device ratings match schematic | Pass | | | |
| 6.8 | Panel current draw | [expected A] | | | |

---

## 7. I/O verification

Every point on the I/O list is tested individually. This is the tedious part and it is the part
that saves the most time later: a crossed pair found here costs five minutes.

**Method, digital input.** Operate the switch. Confirm the correct tag changes state in the
controller, and that no other tag changes.

**Method, digital output.** Force the output from the controller. Confirm the correct lamp
lights and the terminal reads 24 V, and that no other output changes.

**Method, analog input.** Inject 4, 8, 12, 16 and 20 mA. Confirm engineering values match the
I/O list scaling at each point, within tolerance.

**Method, analog output.** Command 0, 25, 50, 75 and 100 percent. Confirm the loop calibrator
reads 4, 8, 12, 16 and 20 mA within tolerance.

| Tag | Address | Type | Injected | Expected | Observed | Pass | Initial |
|---|---|---|---|---|---|---|---|
| XV-101-ZSO | %I0.0 | DI | Closed | TRUE | | | |
| FT-101 | %IW64 | AI | 12 mA | 25.0 m3/h | | | |
| MTR-101-RUN | %Q0.0 | DO | Force ON | 24 V at X5:01 | | | |
| FCV-101 | %QW96 | AO | 50% | 12 mA | | | |

> Copy one row per point from the I/O list. A partial I/O check is not an I/O check.

### 7.1 Cross-talk check
| # | Test | Result |
|---|---|---|
| 7.1.1 | With each output forced individually, confirm no other output energises | |

---

## 8. Functional tests

Written directly from the FDS. Each test quotes the FDS section it proves, and the URS
requirement behind it.

| Test ref | FDS ref | URS ref | Description | Method | Expected result | Actual | Pass | Initial |
|---|---|---|---|---|---|---|---|---|
| FAT-FN-001 | 3 | URS-FN-001 | Mode selection | Select each mode at HMI | Mode changes and is indicated | | | |
| FAT-FN-002 | 4.1 | URS-FN-010 | Start sequence | Satisfy permissives, press Start | Steps execute in order per FDS 4.1 | | | |
| FAT-FN-003 | 4.1 | | Step timeout | Withhold step 2 transition | Alarm raised after timeout, sequence holds | | | |
| FAT-FN-004 | 4.3 | URS-FN-011 | Controlled stop | Press Stop mid cycle | Cycle completes then stops | | | |
| FAT-FN-005 | 4.5 | URS-FN-012 | Restart after power loss | Remove and restore supply | No automatic restart, manual reset required | | | |
| FAT-FN-006 | 7 | | Analog scaling | Inject range points | Values match RATS | | | |
| FAT-FN-007 | 8.3 | | Security levels | Attempt actions at each level | Only permitted actions available | | | |

---

## 9. Interlock and safety tests

Every row of the cause and effect matrix. Test the marks *and* confirm the blanks.

| Test ref | Cause ref | Cause simulated | Expected effects | Effects NOT expected | Actual | Pass | Initial |
|---|---|---|---|---|---|---|---|
| FAT-SF-001 | C-001 | E-stop station 1 pressed | All per C-001 row | | | | |
| FAT-SF-002 | C-002 | Guard door opened | Per C-002 row | FCV-101 does not close | | | |
| FAT-IL-001 | C-003 | LT-101 above 95% | Per C-003 row | | | | |

### 9.1 Safety function specific tests

| # | Test | Expected | Actual | Pass |
|---|---|---|---|---|
| 9.1.1 | Single channel fault, E-stop channel A | Safety function trips, fault annunciated | | |
| 9.1.2 | Single channel fault, E-stop channel B | Safety function trips, fault annunciated | | |
| 9.1.3 | Channel discrepancy time exceeded | Fault detected and latched | | |
| 9.1.4 | Reset with E-stop still pressed | Reset refused | | |
| 9.1.5 | Reset button held closed (welded contact) | Reset refused, requires falling edge | | |
| 9.1.6 | Safety response time | Within [ms] per calculation | | |

> Test 9.1.5 catches the most common reset circuit mistake. A reset that acts on level rather
> than edge will re-enable the machine the instant the guard closes if the button has stuck.

---

## 10. Alarm tests

| Test ref | Alarm | Trigger | Expected message | Priority correct | Ack works | Clears correctly | Pass |
|---|---|---|---|---|---|---|---|
| FAT-AL-001 | AL-003 | LT-101 above 95% | Per alarm list | | | | |

### 10.1 Alarm system behaviour
| # | Test | Expected | Pass |
|---|---|---|---|
| 10.1.1 | Alarm timestamp accuracy | Within 1 s of event | |
| 10.1.2 | Alarm ordering under simultaneous events | Chronological | |
| 10.1.3 | Acknowledgement records user and time | Recorded | |
| 10.1.4 | Alarm history survives power cycle | Retained | |

---

## 11. Communications tests

| # | Test | Expected | Actual | Pass |
|---|---|---|---|---|
| 11.1 | Link established to [peer] | Connected | | |
| 11.2 | Data exchange, all mapped points | Values match | | |
| 11.3 | Watchdog on link loss | Timeout detected within [s], defined action | | |
| 11.4 | Recovery on link restore | Automatic, no stale data | | |
| 11.5 | Network load under normal operation | < [%] | | |
| 11.6 | Unauthorised access attempt | Refused and logged | | |

---

## 12. Failure mode tests

| # | Failure injected | Expected response | Actual | Pass |
|---|---|---|---|---|
| 12.1 | Analog input open circuit | Below 3.6 mA detected, alarm, defined fail action | | |
| 12.2 | Analog input short circuit | Above 21 mA detected, alarm | | |
| 12.3 | Remote I/O disconnected | Comms alarm, outputs to defined state | | |
| 12.4 | 24 V supply removed | Outputs de-energise, orderly behaviour | | |
| 12.5 | CPU stopped | Outputs de-energise | | |
| 12.6 | HMI disconnected | Control continues, alarm raised | | |

---

## 13. Punch list

Items found during test. Category A must be closed before despatch. Category B may be closed
on site by agreement. Nothing ships with an open Category A.

| # | Category | Description | Raised by | Owner | Target date | Closed | Verified by |
|---|---|---|---|---|---|---|---|
| 1 | A / B | | | | | | |
| 2 | | | | | | | |

**Category A.** Prevents the system performing a specified function, or is a safety issue.
**Category B.** Cosmetic, documentation, or does not prevent the system being used.

---

## 14. Acceptance

### 14.1 Result summary

| Section | Tests | Passed | Failed | Not tested |
|---|---|---|---|---|
| 4 Documentation | | | | |
| 5 Visual | | | | |
| 6 Electrical | | | | |
| 7 I/O | | | | |
| 8 Functional | | | | |
| 9 Safety | | | | |
| 10 Alarms | | | | |
| 11 Communications | | | | |
| 12 Failure modes | | | | |

### 14.2 Recommendation

- [ ] **Accepted.** System may be despatched.
- [ ] **Accepted with punch list.** Category B items only, agreed for site closure.
- [ ] **Not accepted.** Retest required. Reason: ______________________________

### 14.3 Signatures

| Role | Name | Company | Signature | Date |
|---|---|---|---|---|
| Test engineer | | {{COMPANY}} | | |
| Quality | | {{COMPANY}} | | |
| Witness | | {{CLIENT}} | | |
| Project manager | | {{CLIENT}} | | |
`,
    },
  ],
};

export const SAT: DocTemplate = {
  slug: "sat-site-acceptance-test",
  title: "Site Acceptance Test Protocol",
  abbr: "SAT",
  category: "Testing",
  summary:
    "The test run on site, on real equipment, that proves the system works where it has to work.",
  purpose:
    "The SAT proves what the FAT could not: that the field devices are wired to the right terminals, that the loops read correctly end to end, and that the process behaves as the control narrative says it will. It is also the point at which the client formally takes the system on.",
  whenYouNeedIt:
    "Every installation. Where a FAT was witnessed, the SAT can reference it and avoid repeating bench tests, but the loop checks and the process tests cannot be skipped.",
  standards: ["IEC 62381"],
  writtenBy: "Commissioning engineer",
  approvedBy: "Client, formal handover",
  outline: [
    "Scope and reference to FAT",
    "Entry criteria and site readiness",
    "Installation inspection",
    "Loop checks, end to end",
    "Field device calibration",
    "Functional tests on real plant",
    "Safety validation",
    "Performance and capacity tests",
    "Training record",
    "Punch list",
    "Handover and acceptance",
  ],
  related: ["fat-factory-acceptance-test", "io-list", "handover-pack"],
  files: [
    {
      name: "SAT-Protocol.md",
      kind: "markdown",
      body: `${docHeader("Site Acceptance Test Protocol", "SAT")}
## 1. Scope

Acceptance testing of the control system for {{PROJECT_NAME}} installed at {{CLIENT}}, on real
plant with real field devices.

### 1.1 Relationship to the FAT
Tests passed and witnessed at FAT are not repeated in full. What must be repeated is anything
that depends on the physical installation: every loop check, every safety function, and every
test whose FAT result relied on simulation.

| FAT reference | Date | Result | Punch items outstanding |
|---|---|---|---|
| | | | |

---

## 2. Entry criteria

| # | Criterion | Met | Initial |
|---|---|---|---|
| 1 | Installation complete, cables landed and glanded | | |
| 2 | Cable tests complete, results available | | |
| 3 | Field devices installed and accessible | | |
| 4 | Power available and stable | | |
| 5 | Compressed air and utilities available | | |
| 6 | Mechanical completion signed off | | |
| 7 | FAT punch list Category A items closed | | |
| 8 | Permit to work arrangements in place | | |
| 9 | Plant available for testing, and isolated where required | | |
| 10 | Operations staff available for training | | |

---

## 3. Installation inspection

| # | Check | Result | Initial |
|---|---|---|---|
| 3.1 | Panel installed level, secure, accessible | | |
| 3.2 | Cable entries correct, glands tight, IP maintained | | |
| 3.3 | Earthing installed per drawing, continuity verified | | |
| 3.4 | Screens earthed at one end only, per cable schedule | | |
| 3.5 | Segregation maintained in tray and trunking | | |
| 3.6 | Field devices installed per manufacturer instructions | | |
| 3.7 | Instrument installation correct: impulse lines, orientation, isolation | | |
| 3.8 | Labels fitted at both ends of every cable | | |
| 3.9 | Panel free from site debris | | |

---

## 4. Loop checks

The core of the SAT. Every signal is proved from the field device to the operator screen. A
loop check that stops at the panel terminal is a terminal check.

**Method, discrete.** Operate the device in the field. Confirm the state changes at the
controller and on the HMI, with correct description.

**Method, analog.** Apply a known input at the device, or use the device's own simulation.
Confirm the value at the controller and on the HMI at 0, 50 and 100 percent.

| Tag | Description | Field operated | Controller reads | HMI shows | Correct description | Pass | Tester | Date |
|---|---|---|---|---|---|---|---|---|
| XV-101-ZSO | Inlet valve open limit | | | | | | | |
| FT-101 | Feed flow | | | | | | | |
| MTR-101-RUN | Feed pump run | | | | | | | |
| FCV-101 | Feed control valve | | | | | | | |

### 4.1 Valve and actuator strokes
| Tag | Command | Observed travel | Time to stroke | Limit switches | Fail position verified | Pass |
|---|---|---|---|---|---|---|
| FCV-101 | 0, 50, 100% | | | | Air removed, valve closes | |
| XV-101 | Open / close | | | | | |

---

## 5. Field device calibration

| Tag | Type | As found | As left | Tolerance | Cert no | Calibrated by | Date |
|---|---|---|---|---|---|---|---|
| FT-101 | Flow | | | ± [%] | | | |
| LT-101 | Level | | | | | | |
| TT-101 | Temperature | | | | | | |

Record as found values before adjusting. An instrument that was out of tolerance on arrival is
information the site needs.

---

## 6. Functional tests on plant

| Test ref | FDS ref | Description | Expected | Actual | Pass | Initial |
|---|---|---|---|---|---|---|
| SAT-FN-001 | 3 | Mode selection on plant | | | | |
| SAT-FN-002 | 4.1 | Full start sequence with real equipment | | | | |
| SAT-FN-003 | 4.2 | Steady state running for [duration] | | | | |
| SAT-FN-004 | 4.3 | Controlled stop | | | | |
| SAT-FN-005 | 4.4 | Emergency stop, real | | | | |
| SAT-FN-006 | 4.5 | Restart after power interruption | | | | |
| SAT-FN-007 | 9 | Recipe download and execution | | | | |

---

## 7. Safety validation

Every safety function is validated on the installed system. This is not a repeat of the FAT: it
proves the real device, the real wiring and the real stopping performance.

| # | Safety function | Test | Expected | Actual | Pass | Witness |
|---|---|---|---|---|---|---|
| 7.1 | E-stop station 1 | Press | Category [0/1] stop, all motion ceases | | | |
| 7.2 | E-stop station 2 | Press | As above | | | |
| 7.3 | Guard interlock | Open during motion | Motion stops within [ms] | | | |
| 7.4 | Guard interlock | Attempt start with guard open | Start refused | | | |
| 7.5 | Reset | Reset with hazard present | Reset refused | | | |
| 7.6 | Stopping time measurement | Measure with instrument | Within calculated safety distance | | | |
| 7.7 | Muting / bypass (if fitted) | Verify conditions and annunciation | Per design | | | |

**Stopping time.** Measure it, do not assume it. The safety distance calculation to ISO 13855
depends on the real stopping time of the real machine with its real load.

---

## 8. Performance and capacity

| # | Measure | Target | Achieved | Pass |
|---|---|---|---|---|
| 8.1 | Throughput | [units/h] | | |
| 8.2 | Cycle time | [s] | | |
| 8.3 | Controller scan time | < [ms] | | |
| 8.4 | Controller memory used | < [%] | | |
| 8.5 | Spare I/O available | > 20% | | |
| 8.6 | Network utilisation | < [%] | | |
| 8.7 | Alarm rate, average per hour | < 6 | | |
| 8.8 | HMI screen call up time | < [s] | | |

---

## 9. Training

| Course | Attendees | Duration | Delivered by | Date | Materials issued |
|---|---|---|---|---|---|
| Operation | | | | | |
| Alarm response | | | | | |
| Maintenance and fault finding | | | | | |
| Engineering, program access | | | | | |

| Name | Role | Signature | Date |
|---|---|---|---|
| | | | |

---

## 10. Punch list

| # | Category | Description | Raised by | Owner | Target | Closed | Verified |
|---|---|---|---|---|---|---|---|
| 1 | A / B | | | | | | |

---

## 11. Handover and acceptance

### 11.1 Deliverables received

| # | Item | Received | Initial |
|---|---|---|---|
| 1 | As-built schematics | | |
| 2 | Final I/O list | | |
| 3 | Program source and backup | | |
| 4 | HMI application backup | | |
| 5 | Software version record | | |
| 6 | O&M manual | | |
| 7 | Spare parts | | |
| 8 | Calibration certificates | | |
| 9 | Declaration of conformity | | |
| 10 | Training records | | |

### 11.2 Acceptance

- [ ] **Accepted.** System taken over by {{CLIENT}} on the date below.
- [ ] **Accepted with punch list.** Items listed in section 10, owners and dates agreed.
- [ ] **Not accepted.** Reason: ______________________________

### 11.3 Signatures

| Role | Name | Company | Signature | Date |
|---|---|---|---|---|
| Commissioning engineer | | {{COMPANY}} | | |
| Project manager | | {{COMPANY}} | | |
| Client engineering | | {{CLIENT}} | | |
| Client operations | | {{CLIENT}} | | |

### 11.4 Warranty
Warranty period begins on the acceptance date above and runs for [period]. Scope and exclusions
per contract clause [ref].
`,
    },
  ],
};

export const COMMISSIONING = {
  slug: "commissioning-checklist",
  title: "Commissioning Checklist",
  abbr: "COMM",
  category: "Testing",
  summary: "The pre-power and first-energisation checks, in the order they have to happen.",
  purpose:
    "Commissioning is where an error becomes expensive and occasionally dangerous. This checklist sequences the work so that nothing is energised before it has been proved safe to energise, and so that the first time a motor turns, somebody has already confirmed which way it should turn.",
  whenYouNeedIt:
    "Every installation, before the SAT. On a small job it is a single page, and it is still worth having on paper with initials against each line.",
  standards: ["IEC 60204-1", "Site electrical safety rules"],
  writtenBy: "Commissioning engineer",
  approvedBy: "Site electrical authority",
  outline: [
    "Pre-power checks, dead",
    "Insulation and continuity",
    "First energisation",
    "Control voltage checks",
    "I/O proving",
    "Motor direction and rotation",
    "Sequence dry run",
    "Wet commissioning",
  ],
  related: ["sat-site-acceptance-test", "io-list"],
  files: [
    {
      name: "Commissioning-Checklist.md",
      kind: "markdown",
      body: `${docHeader("Commissioning Checklist", "COMM")}
> **Do not skip ahead.** Each stage assumes the previous one passed. The order is the safety
> argument, not a suggestion.

## Stage 1. Dead checks, before any power

| # | Check | Result | Initial | Date |
|---|---|---|---|---|
| 1.1 | Isolation confirmed and locked off, permit in place | | | |
| 1.2 | Panel free of debris, tools removed | | | |
| 1.3 | All terminals tight, checked to torque | | | |
| 1.4 | Cable identification present both ends | | | |
| 1.5 | Wiring matches schematics, point to point | | | |
| 1.6 | Earth continuity, every metallic enclosure and door | | | |
| 1.7 | Protective device ratings correct | | | |
| 1.8 | Insulation resistance, power circuits, > 1 MOhm | | | |
| 1.9 | No short circuits, phase to phase and phase to earth | | | |
| 1.10 | Electronic modules removed or isolated before insulation test | | | |

> 1.10 matters. An insulation test at 500 V through an analog input card destroys the card.

## Stage 2. First energisation, control only

| # | Check | Result | Initial |
|---|---|---|---|
| 2.1 | Power circuits still isolated, control circuit only energised | | |
| 2.2 | 24 VDC present and within tolerance, on load | | |
| 2.3 | No unexpected heating, smell or noise | | |
| 2.4 | Controller powers up, no fault LEDs | | |
| 2.5 | Remote I/O online, all nodes present | | |
| 2.6 | HMI powers up and connects | | |
| 2.7 | Time and date set, and synchronised if applicable | | |

## Stage 3. I/O proving, before any motion

| # | Check | Result | Initial |
|---|---|---|---|
| 3.1 | Every digital input proved from the field device | | |
| 3.2 | Every analog input reads plausibly, and at range extremes | | |
| 3.3 | Outputs proved with the load isolated, using the test facility | | |
| 3.4 | Safety inputs proved, both channels | | |

> 3.3. Prove outputs before connecting loads. A crossed output that starts the wrong motor is
> found here for the cost of a moment, or found later for the cost of a repair.

## Stage 4. Power circuits

| # | Check | Result | Initial |
|---|---|---|---|
| 4.1 | Motor circuits energised one at a time | | |
| 4.2 | Overload settings match motor nameplate | | |
| 4.3 | Direction of rotation confirmed, uncoupled where possible | | |
| 4.4 | Drive parameters loaded and recorded | | |
| 4.5 | Motor current on no load within expectation | | |
| 4.6 | Brakes and holding devices operate | | |

## Stage 5. Safety, before production running

| # | Check | Result | Initial | Witness |
|---|---|---|---|---|
| 5.1 | Every E-stop station tested individually | | | |
| 5.2 | Every guard interlock tested individually | | | |
| 5.3 | Start refused with any guard open | | | |
| 5.4 | Reset requires deliberate action and cannot be defeated | | | |
| 5.5 | Stopping time measured | | | |
| 5.6 | Safety distances confirmed against measured stopping time | | | |

## Stage 6. Sequence dry run

| # | Check | Result | Initial |
|---|---|---|---|
| 6.1 | Full sequence run empty, at reduced speed | | |
| 6.2 | Each step transition observed and timed | | |
| 6.3 | Interlocks tested during motion | | |
| 6.4 | Controlled stop and restart | | |
| 6.5 | Sequence run at full speed | | |

## Stage 7. Wet commissioning and product

| # | Check | Result | Initial |
|---|---|---|---|
| 7.1 | Utilities on, leaks checked | | |
| 7.2 | Loops in manual, response confirmed | | |
| 7.3 | Loops tuned, values recorded | | |
| 7.4 | First product run, quality checked | | |
| 7.5 | Throughput measured against target | | |
| 7.6 | 24 hour run completed without intervention | | |

## Sign-off

| Stage | Completed by | Signature | Date | Authority |
|---|---|---|---|---|
| 1 Dead checks | | | | |
| 2 First energisation | | | | |
| 3 I/O proving | | | | |
| 4 Power circuits | | | | |
| 5 Safety | | | | |
| 6 Dry run | | | | |
| 7 Wet commissioning | | | | |
`,
    },
  ],
} satisfies DocTemplate;
