import { type DocTemplate, docHeader } from "./types";

/**
 * The registers.
 *
 * Lists rather than prose: the I/O, the parts, the cables, the trips. These are
 * the documents that get opened most often on a live job and edited most often
 * after handover, which is why each ships as CSV rather than as a table buried
 * in a text document.
 */

export const IO_LIST: DocTemplate = {
  slug: "io-list",
  title: "I/O List",
  abbr: "I/O",
  category: "Registers",
  summary:
    "Every signal in and out of the controller, with address, type, range and where it terminates.",
  purpose:
    "The I/O list is the spine of the project. Panel build takes terminal numbers from it, the programmer takes addresses from it, the commissioning engineer ticks it off signal by signal, and the site keeps it forever. It is also the document that decides your I/O card count, so it drives cost.",
  whenYouNeedIt:
    "Always, from day one. Start it before the hardware is chosen, because the count and the mix of signal types is what tells you which hardware to choose.",
  standards: ["ISA-5.1 for instrument tag identification", "IEC 81346 for reference designation"],
  writtenBy: "Control systems engineer",
  approvedBy: "Client engineering",
  outline: [
    "Signal identity and description",
    "Signal type and electrical characteristics",
    "Controller address",
    "Panel and field termination",
    "Engineering range and alarm limits",
    "Fail-safe state",
    "Commissioning sign-off columns",
  ],
  related: ["cable-schedule", "rats-range-alarm-trip-schedule", "sat-site-acceptance-test"],
  files: [
    {
      name: "IO-List.csv",
      kind: "csv",
      note: "The list itself. Open in Excel, Sheets or LibreOffice.",
      body: `Tag,Description,Signal Type,I/O Type,Rack,Slot,Channel,Address,Panel,Terminal,Cable,Core,Field Device,Manufacturer,Model,Range Low,Range High,Units,Fail Safe State,Normally,Alarm Low,Alarm High,Trip,Interlock Ref,Loop Drawing,Tested FAT,Tested SAT,Comment
XV-101-ZSO,Inlet valve open limit,24VDC Sourcing,DI,1,2,0,%I0.0,CP-01,X1:01,C-101,1,Proximity switch,,,,,,,NO,,,,INT-001,LD-101,,,
XV-101-ZSC,Inlet valve closed limit,24VDC Sourcing,DI,1,2,1,%I0.1,CP-01,X1:02,C-101,2,Proximity switch,,,,,,,NC,,,,INT-001,LD-101,,,
PB-START,Start pushbutton,24VDC Sourcing,DI,1,2,2,%I0.2,CP-01,X1:03,C-102,1,Pushbutton green,,,,,,,NO,,,,,LD-102,,,
PB-STOP,Stop pushbutton,24VDC Sourcing,DI,1,2,3,%I0.3,CP-01,X1:04,C-102,2,Pushbutton red,,,,,,,Energised,NC,,,,,LD-102,,,
ESTOP-01,Emergency stop station 1,24VDC Dual channel,DI Safety,1,3,0,%I2.0,CP-01,X2:01,C-103,1-2,E-stop mushroom,,,,,,,De-energised,NC,,,Yes,SF-001,LD-103,,,
GS-101,Guard door switch,24VDC Dual channel,DI Safety,1,3,2,%I2.2,CP-01,X2:03,C-104,1-2,Interlock switch,,,,,,,De-energised,NC,,,Yes,SF-002,LD-104,,,
FT-101,Feed flow transmitter,4-20mA 2-wire,AI,1,4,0,%IW64,CP-01,X3:01,C-201,1-2,Flow transmitter,,,0,50,m3/h,Hold last,,5,45,,,LD-201,,,
LT-101,Feed tank level,4-20mA 2-wire,AI,1,4,1,%IW66,CP-01,X3:03,C-202,1-2,Level transmitter,,,0,100,%,Hold last,,10,90,95,INT-002,LD-202,,,
TT-101,Reactor temperature,RTD Pt100 3-wire,AI,1,5,0,%IW80,CP-01,X4:01,C-203,1-3,RTD,,,0,200,degC,Upscale,,,150,180,INT-003,LD-203,,,
MTR-101-RUN,Feed pump run command,24VDC Sourcing,DO,1,6,0,%Q0.0,CP-01,X5:01,C-301,1,Contactor coil,,,,,,,De-energised,,,,,,LD-301,,,
MTR-101-FBK,Feed pump running feedback,24VDC Sourcing,DI,1,2,4,%I0.4,CP-01,X1:05,C-301,2,Auxiliary contact,,,,,,,NO,,,,,LD-301,,,
XV-101-SOL,Inlet valve solenoid,24VDC Sourcing,DO,1,6,1,%Q0.1,CP-01,X5:02,C-302,1,Solenoid valve,,,,,,,De-energised,,,,,,LD-302,,,
LMP-FAULT,Fault beacon,24VDC Sourcing,DO,1,6,2,%Q0.2,CP-01,X5:03,C-303,1,Beacon red,,,,,,,De-energised,,,,,,LD-303,,,
FCV-101,Feed control valve,4-20mA,AO,1,7,0,%QW96,CP-01,X6:01,C-401,1-2,Control valve positioner,,,0,100,%,Fail closed,,,,,,LD-401,,,
`,
    },
    {
      name: "IO-List-README.md",
      kind: "markdown",
      note: "What each column is for, and the conventions worth holding to.",
      body: `${docHeader("I/O List, conventions and column guide", "I/O")}
## How to use this list

The CSV is the deliverable. This note explains the columns and the conventions, so that the
list stays consistent when several people edit it.

## Column guide

| Column | What goes in it | Why it matters |
|---|---|---|
| Tag | Unique identifier, per ISA-5.1 | The primary key. Never reuse a tag, even after a device is removed. |
| Description | Plain language, 40 characters or fewer | This becomes the HMI text and the alarm text. Write it for an operator at 3 am. |
| Signal Type | Electrical nature, e.g. 24VDC Sourcing, 4-20mA 2-wire, RTD Pt100 3-wire | Decides the card, and decides whether a barrier is needed. |
| I/O Type | DI, DO, AI, AO, and the Safety variants | Drives the card count. |
| Rack / Slot / Channel | Physical location | The path from a tag to a screw terminal. |
| Address | Controller address | Vendor specific. Keep the vendor's own syntax. |
| Panel / Terminal | Where it lands in the panel | The panel builder works from this. |
| Cable / Core | Field cable and core number | Must agree with the cable schedule. |
| Range Low / High / Units | Engineering range for analog | Must agree with the transmitter configuration, not with what somebody hoped. |
| Fail Safe State | What the signal does on failure | The column most often left blank and most often needed. |
| Normally | NO or NC for discrete field devices | Determines whether a broken wire reads as safe or as normal. |
| Alarm Low / High / Trip | Limits | Feeds the RATS and the alarm list. |
| Interlock Ref | Cross reference to the FDS | Ties this signal to the logic that uses it. |
| Loop Drawing | Drawing number | Where to look when it does not work. |
| Tested FAT / SAT | Sign-off | Initial and date. This is the evidence. |

## Conventions worth holding to

**Fail safe direction.** Stop circuits and safety devices are normally closed, so that a broken
wire or a lost supply produces the safe state. If a column says NO for an E-stop, that is a
finding, not a preference.

**Spare capacity.** Carry at least 20 percent spare channels of each type at handover, and list
the spares explicitly with a Spare tag rather than leaving gaps. Gaps get filled by accident.

**Analog fail state.** "Hold last" is a decision, not a default. A held value on a failed flow
transmitter will keep a sequence running that should have stopped. Decide per signal.

**Do not renumber.** Once the panel is wired, a tag change is a change to the panel, the
drawings, the program and the HMI. Add, do not renumber.
`,
    },
  ],
};

export const BOM: DocTemplate = {
  slug: "bom-bill-of-materials",
  title: "Bill of Materials",
  abbr: "BOM",
  category: "Registers",
  summary: "Every part in the panel and in the field, with manufacturer, part number and quantity.",
  purpose:
    "The BOM is what gets ordered, what gets checked in at goods inward, and what gets verified line by line at the start of the FAT. It is also what the site uses in five years to find the replacement for a failed part, which is why obsolete part numbers need recording rather than quietly overwriting.",
  whenYouNeedIt:
    "Every panel build. Also worth keeping for a software-only change, where the BOM is the licence list.",
  writtenBy: "Design engineer",
  approvedBy: "Project manager, and procurement",
  outline: [
    "Panel components",
    "Field devices",
    "Cables and glands",
    "Software and licences",
    "Spares",
    "Long lead items",
  ],
  related: ["io-list", "fat-factory-acceptance-test"],
  files: [
    {
      name: "BOM.csv",
      kind: "csv",
      body: `Item,Category,Description,Manufacturer,Part Number,Qty,Unit,Unit Price,Total,Supplier,Lead Time Weeks,Location,Tag Ref,Datasheet,Alternative,Obsolete,Notes
1,Enclosure,Wall mount enclosure 800x600x250 IP66,,,1,ea,,,,,CP-01,,,,
2,Enclosure,Mounting plate 800x600,,,1,ea,,,,,CP-01,,,,
3,Enclosure,Gland plate,,,1,ea,,,,,CP-01,,,,
4,Power,Main isolator 3 pole 63A door interlocked,,,1,ea,,,,,CP-01,Q1,,,
5,Power,Power supply 24VDC 10A,,,1,ea,,,,,CP-01,PSU1,,,
6,Power,MCB 2 pole C6,,,4,ea,,,,,CP-01,,,,
7,Power,Surge protection device Type 2,,,1,ea,,,,,CP-01,,,,
8,Controller,PLC CPU,,,1,ea,,,,,CP-01,PLC1,,,
9,Controller,Digital input module 16 channel 24VDC,,,2,ea,,,,,CP-01,,,,
10,Controller,Digital output module 16 channel 24VDC 0.5A,,,2,ea,,,,,CP-01,,,,
11,Controller,Analog input module 8 channel 4-20mA,,,1,ea,,,,,CP-01,,,,
12,Controller,Analog output module 4 channel 4-20mA,,,1,ea,,,,,CP-01,,,,
13,Safety,Safety relay dual channel,,,1,ea,,,,,CP-01,KS1,,,
14,Safety,Emergency stop station,,,2,ea,,,,,Field,ESTOP-01,,,
15,Safety,Guard interlock switch coded,,,2,ea,,,,,Field,GS-101,,,
16,HMI,Operator panel 10 inch,,,1,ea,,,,,CP-01,HMI1,,,
17,Network,Managed switch 8 port,,,1,ea,,,,,CP-01,SW1,,,
18,Network,Patch lead Cat6 SF/UTP 2m,,,6,ea,,,,,CP-01,,,,
19,Field,Flow transmitter DN50 4-20mA HART,,,1,ea,,,,,Field,FT-101,,,
20,Field,Level transmitter 0-100% 4-20mA,,,1,ea,,,,,Field,LT-101,,,
21,Field,RTD Pt100 3 wire with pocket,,,1,ea,,,,,Field,TT-101,,,
22,Field,Control valve DN50 with positioner,,,1,ea,,,,,Field,FCV-101,,,
23,Cable,Instrument cable 1 pair 0.5mm2 SY,,,100,m,,,,,Field,,,,
24,Cable,Control cable 4 core 1.0mm2 SY,,,150,m,,,,,Field,,,,
25,Cable,Gland M20 brass,,,20,ea,,,,,Field,,,,
26,Software,PLC programming licence,,,1,ea,,,,,,,,,Perpetual or subscription
27,Software,HMI runtime licence,,,1,ea,,,,,HMI1,,,,
28,Spares,Digital input module,,,1,ea,,,,,Spares,,,,Recommended spare
29,Spares,Power supply 24VDC 10A,,,1,ea,,,,,Spares,,,,Recommended spare
30,Spares,Fuse assortment,,,1,set,,,,,Spares,,,,
`,
    },
  ],
};

export const CABLE_SCHEDULE: DocTemplate = {
  slug: "cable-schedule",
  title: "Cable Schedule",
  abbr: "CS",
  category: "Registers",
  summary: "Every cable, from which gland to which terminal, with type, cores, length and route.",
  purpose:
    "The cable schedule is what the installation contractor works from and what the commissioning engineer uses when a signal is missing. It pairs with the I/O list: the I/O list says which signal, the cable schedule says which physical wire carries it.",
  whenYouNeedIt:
    "Any installation with field wiring. On a self-contained machine with a wiring loom it can be folded into the panel drawings.",
  standards: ["IEC 60204-1 for wiring practice and colour", "IEC 81346 for designation"],
  writtenBy: "Electrical design engineer",
  approvedBy: "Client engineering",
  outline: [
    "Cable identity and type",
    "From and to, with terminal detail",
    "Cores and usage",
    "Route and length",
    "Segregation category",
    "Test results",
  ],
  related: ["io-list"],
  files: [
    {
      name: "Cable-Schedule.csv",
      kind: "csv",
      body: `Cable Ref,Type,Cores,CSA mm2,Screen,From,From Terminal,From Gland,To,To Terminal,To Gland,Length m,Route,Segregation,Function,Voltage,Continuity Test,Insulation Test,Tested By,Date,Notes
C-101,SY,4,1.0,Braid,CP-01,X1:01-04,M20,XV-101,1-4,M16,25,Tray A,Control,24VDC,,,,,
C-102,SY,4,1.0,Braid,CP-01,X1:03-06,M20,Local station LS-01,1-4,M16,12,Tray A,Control,24VDC,,,,,
C-103,SY,4,1.0,Braid,CP-01,X2:01-04,M20,ESTOP-01,1-4,M16,18,Tray A,Safety,24VDC,,,,,
C-104,SY,4,1.0,Braid,CP-01,X2:03-06,M20,GS-101,1-4,M16,22,Tray A,Safety,24VDC,,,,,
C-201,Instrument,1 pair,0.5,Foil + drain,CP-01,X3:01-02,M16,FT-101,+/-,M20,30,Tray B,Instrument,4-20mA,,,,,Screen earthed at panel only
C-202,Instrument,1 pair,0.5,Foil + drain,CP-01,X3:03-04,M16,LT-101,+/-,M20,28,Tray B,Instrument,4-20mA,,,,,Screen earthed at panel only
C-203,Instrument,1 triple,0.5,Foil + drain,CP-01,X4:01-03,M16,TT-101,1-3,M20,35,Tray B,Instrument,RTD,,,,,Three wire RTD
C-301,SY,4,1.5,Braid,CP-01,X5:01-04,M20,MCC starter,,M20,45,Tray C,Control,24VDC,,,,,
C-302,SY,3,1.0,Braid,CP-01,X5:02-04,M20,XV-101-SOL,1-3,M16,25,Tray A,Control,24VDC,,,,,
C-303,SY,3,1.0,Braid,CP-01,X5:03-05,M20,LMP-FAULT,1-3,M16,15,Tray A,Control,24VDC,,,,,
C-401,Instrument,1 pair,0.5,Foil + drain,CP-01,X6:01-02,M16,FCV-101,+/-,M20,32,Tray B,Instrument,4-20mA,,,,,
C-501,SF/UTP Cat6,4 pair,,Foil,CP-01,SW1 P1,M20,Remote panel CP-02,SW2 P1,M20,60,Tray D,Data,Ethernet,,,,,
P-001,SWA,4,16,Armour,MCC,,M32,CP-01 Q1,L1 L2 L3 N,M32,55,Tray E,Power,400VAC,,,,,
E-001,Earth,1,16,,Earth bar,,M20,CP-01 PE,PE,M20,55,Tray E,Earth,,,,,,
`,
    },
  ],
};

export const CAUSE_EFFECT: DocTemplate = {
  slug: "cause-and-effect-matrix",
  title: "Cause and Effect Matrix",
  abbr: "C&E",
  category: "Registers",
  summary: "A grid of every trip condition against every action it causes, with nothing implied.",
  purpose:
    "The cause and effect matrix is the most testable document on the project. Each row is a condition, each column is an action, and each mark is one test at FAT. Written properly it removes all ambiguity about what stops what, which is precisely the ambiguity that hurts during commissioning.",
  whenYouNeedIt:
    "Anything with interlocks or trips, which is nearly everything. Mandatory on process plant and on any system with a safety instrumented function.",
  standards: ["IEC 61511 for safety instrumented systems", "ISA-84"],
  writtenBy: "Process and control engineer together",
  approvedBy: "Client engineering, and safety authority where applicable",
  outline: [
    "Cause list with trip settings",
    "Effect list with actions",
    "The matrix",
    "Reset requirements",
    "Bypass and override rules",
  ],
  related: ["fds-functional-design-specification", "rats-range-alarm-trip-schedule"],
  files: [
    {
      name: "Cause-and-Effect.csv",
      kind: "csv",
      note: "X marks an action caused. Each X is one FAT test.",
      body: `Cause Ref,Cause Description,Tag,Trip Setting,Units,Delay s,MTR-101 Stop,XV-101 Close,FCV-101 Close,Beacon On,Horn On,Sequence Hold,Master Trip,Reset Type,Test Ref
C-001,Emergency stop pressed,ESTOP-01,,,0,X,X,X,X,X,X,X,Manual,FAT-SF-001
C-002,Guard door opened,GS-101,,,0,X,X,,X,,X,,Manual,FAT-SF-002
C-003,Feed tank level high high,LT-101,95,%,2,X,X,,X,X,X,,Manual,FAT-IL-001
C-004,Feed tank level low low,LT-101,5,%,5,X,,,X,,X,,Auto,FAT-IL-002
C-005,Reactor temperature high high,TT-101,180,degC,0,X,X,X,X,X,X,X,Manual,FAT-IL-003
C-006,Feed flow low,FT-101,5,m3/h,10,,,,X,,X,,Auto,FAT-IL-004
C-007,Feed pump fault,MTR-101,,,0,X,,,X,,X,,Manual,FAT-IL-005
C-008,Valve failed to open,XV-101,,,10,X,,,X,,X,,Manual,FAT-IL-006
C-009,Remote I/O comms loss,,,,3,X,X,X,X,X,X,,Manual,FAT-IL-007
C-010,Control power failure,,,,0,X,X,X,,,X,X,Manual,FAT-IL-008
`,
    },
    {
      name: "Cause-and-Effect-Notes.md",
      kind: "markdown",
      body: `${docHeader("Cause and Effect Matrix, notes and rules", "C&E")}
## How to read the matrix

Each row is a cause. Each column after the delay is an effect. An X means that cause produces
that effect. A blank means it does not, and a blank is a statement, not an omission.

## Rules that apply to the whole matrix

**Fail safe.** Every effect listed is the de-energised state unless the row says otherwise. A
loss of control power produces every effect in the C-010 row, and that row is not optional.

**Delays.** A delay is a deliberate filter against a noisy signal or a transient. A zero delay
on a safety cause is correct and must not be "tuned out" during commissioning because it is
nuisance tripping. Nuisance tripping on a safety input is a fault to be found, not a delay to
be added.

**Reset type.** Auto means the effect clears when the cause clears. Manual means an operator
must act. Every safety related cause is manual reset, per ISO 13849-1: a machine that restarts
by itself when a guard is closed is a machine that restarts with someone inside it.

**Master trip.** Where a cause is marked for master trip, all other effects are implied. It is
still listed explicitly, because implied behaviour is untestable behaviour.

## Bypass and override

| Ref | What may be bypassed | Who may authorise | Conditions | Recorded |
|---|---|---|---|---|
| BP-001 | [Signal] | [Role, level 3] | [e.g. maintenance mode only, key switch] | Yes, audit trail |

No safety instrumented function may be bypassed from the operator interface. If a bypass is
required for maintenance, it is key switched, it is alarmed while active, and it is logged.

## Testing

Each X is one test. The test proves the effect happens, and it also proves the blanks: while
testing C-006, confirm the pump does *not* stop. Testing only the marks proves half the matrix.

| Test ref | Cause | Method | Expected | Result | Tester | Date |
|---|---|---|---|---|---|---|
| FAT-IL-001 | C-003 | [Simulate LT-101 above 95%] | [Effects per row] | | | |
`,
    },
  ],
};

export const RATS: DocTemplate = {
  slug: "rats-range-alarm-trip-schedule",
  title: "Range, Alarm and Trip Schedule",
  abbr: "RATS",
  category: "Registers",
  summary: "Every instrument's range and every limit set against it, on one page.",
  purpose:
    "The RATS is the single place where the calibrated range, the alarm limits and the trip settings live together. Keeping them together is the point: an alarm set outside the transmitter range never annunciates, and that error is invisible unless the two numbers sit side by side.",
  whenYouNeedIt:
    "Any system with analog measurement. It is also the document a regulator or an insurer asks for when reviewing protective functions.",
  standards: ["ISA-18.2 for alarm management", "IEC 61511 for trip settings"],
  writtenBy: "Control systems engineer",
  approvedBy: "Process owner",
  outline: [
    "Instrument identity and calibrated range",
    "Alarm limits with priority",
    "Trip settings and action",
    "Deadband and delay",
    "Calibration record",
  ],
  related: ["io-list", "cause-and-effect-matrix", "alarm-rationalisation"],
  files: [
    {
      name: "RATS.csv",
      kind: "csv",
      body: `Tag,Service,Instrument Type,Signal,Cal Range Low,Cal Range High,Units,Normal Operating Low,Normal Operating High,LL Trip,L Alarm,H Alarm,HH Trip,Deadband,Delay s,LL Priority,L Priority,H Priority,HH Priority,Trip Action,Cause Ref,Calibrated By,Cal Date,Cal Due,Cert No
FT-101,Feed flow,Magnetic flow meter,4-20mA,0,50,m3/h,15,35,,5,45,,1,10,,Medium,Medium,,Sequence hold,C-006,,,,
LT-101,Feed tank level,Radar level,4-20mA,0,100,%,20,80,5,10,90,95,2,2,High,Medium,Medium,High,Pump stop and valve close,C-003 C-004,,,,
TT-101,Reactor temperature,RTD Pt100,RTD,0,200,degC,120,160,,100,150,180,2,0,,Low,Medium,High,Master trip,C-005,,,,
PT-101,Reactor pressure,Pressure transmitter,4-20mA,0,10,barg,2,6,,1,7,8,0.2,1,,Medium,High,High,Master trip,,,,,
AT-101,Product concentration,Analyser,4-20mA,0,100,%,45,55,,40,60,,0.5,30,,Low,Low,,Alarm only,,,,,
`,
    },
  ],
};

export const ALARM_LIST: DocTemplate = {
  slug: "alarm-rationalisation",
  title: "Alarm List and Rationalisation Record",
  abbr: "ALM",
  category: "Registers",
  summary: "Every alarm, why it exists, what the operator should do about it, and how quickly.",
  purpose:
    "ISA-18.2 asks a hard question of every alarm: what action does the operator take, and what happens if they do not take it in time? An alarm with no answer is not an alarm. Working through this document is what prevents the alarm flood that makes a control room ignore the horn.",
  whenYouNeedIt:
    "Any system with an operator interface. On a small machine the list is short, but the discipline still applies.",
  standards: ["ISA-18.2 / IEC 62682"],
  writtenBy: "Control engineer with the operations team",
  approvedBy: "Operations manager",
  outline: [
    "Alarm identity and trigger",
    "Priority with justification",
    "Consequence of inaction",
    "Time to respond",
    "Corrective action",
    "Rationalisation sign-off",
  ],
  related: ["rats-range-alarm-trip-schedule", "fds-functional-design-specification"],
  files: [
    {
      name: "Alarm-List.csv",
      kind: "csv",
      body: `Alarm Tag,Message Text,Source Tag,Trigger Condition,Priority,Consequence of Inaction,Time to Respond,Operator Action,Class,Deadband,On Delay s,Off Delay s,Auto Ack,Suppressed When,Rationalised By,Date
AL-001,Emergency stop activated,ESTOP-01,Signal de-energised,High,Plant remains stopped,Immediate,Identify station and make safe before reset,Safety,,0,0,No,,,
AL-002,Guard door open,GS-101,Signal de-energised,High,Machine cannot run,Immediate,Close and latch guard then reset,Safety,,0,0,No,Maintenance mode,,
AL-003,Feed tank level high high,LT-101,> 95%,High,Overflow and spill,1 minute,Check outfeed route and clear blockage,Process,2%,2,5,No,,,
AL-004,Feed tank level low low,LT-101,< 5%,High,Pump runs dry and is damaged,1 minute,Stop pump and restore feed,Equipment,2%,5,5,No,Pump stopped,,
AL-005,Reactor temperature high,TT-101,> 150 degC,Medium,Off specification product,10 minutes,Reduce feed rate and check cooling,Quality,2 degC,0,5,No,,,
AL-006,Reactor temperature high high,TT-101,> 180 degC,High,Runaway reaction,Immediate,Confirm master trip and investigate,Safety,2 degC,0,0,No,,,
AL-007,Feed flow low,FT-101,< 5 m3/h,Medium,Sequence stalls,5 minutes,Check strainer and valve position,Process,1 m3/h,10,10,No,Pump stopped,,
AL-008,Feed pump fault,MTR-101,Starter aux open with run command,Medium,Loss of feed,5 minutes,Check overload and reset at MCC,Equipment,,3,0,No,,,
AL-009,Valve failed to open,XV-101,No open limit 10 s after command,Medium,Sequence holds,5 minutes,Check air supply and limit switch,Equipment,,10,0,No,,,
AL-010,Remote I/O communication loss,,Watchdog expired,High,Loss of control and indication,Immediate,Check network and panel power,System,,3,0,No,,,
AL-011,Control power failure,,24VDC below threshold,High,Total loss of control,Immediate,Restore supply then restart per procedure,System,,0,0,No,,,
`,
    },
    {
      name: "Alarm-Rationalisation.md",
      kind: "markdown",
      body: `${docHeader("Alarm Rationalisation Record", "ALM")}
## Why this document exists

An alarm exists to tell an operator to do something they would not otherwise do, in time for it
to matter. ISA-18.2 makes that testable with three questions, and every alarm on the list must
answer all three:

1. What is the **consequence** if the operator does nothing?
2. How long do they have to **respond** before that consequence occurs?
3. What **action** do they take?

If a proposed alarm has no answer to question 3, it is an indication and belongs on a status
display. If it has no answer to question 1, delete it.

## Priority assignment

Priority follows from consequence severity and from the time available, not from how important
the equipment feels.

| Priority | Consequence | Time to respond | Target share of alarms |
|---|---|---|---|
| High | Injury, environmental release, major loss | Under 3 minutes | 5% |
| Medium | Product loss, equipment damage | 3 to 30 minutes | 15% |
| Low | Efficiency, minor quality | Over 30 minutes | 80% |

## Performance targets

From ISA-18.2, per operator console:

| Metric | Target | Maximum acceptable |
|---|---|---|
| Average alarms per hour | 6 | 12 |
| Peak alarms in 10 minutes | 5 | 10 |
| Time in flood condition | 0% | 1% |
| Standing alarms | 0 | 5 |

Measure these during the SAT and again after 30 days of operation. An alarm system that meets
them on day one and not on day thirty has a chattering alarm somewhere, and the deadband or the
delay is wrong.

## Rationalisation session record

| Date | Attendees | Alarms reviewed | Added | Removed | Re-prioritised |
|---|---|---|---|---|---|
| | | | | | |

## Chattering and stale alarms

| Alarm | Occurrences per hour | Cause | Action | Closed |
|---|---|---|---|---|
| | | | [Deadband, delay, or fix the instrument] | |
`,
    },
  ],
};
