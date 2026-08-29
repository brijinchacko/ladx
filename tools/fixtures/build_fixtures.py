#!/usr/bin/env python3
"""
Authoring aid for the synthetic fixture projects.

The committed artefact is the JSON under tests/fixtures/projects. This script
exists so that eight projects can be written without eight thousand lines of
hand-typed braces, and so a reviewer can read what each fixture is *for* next
to the logic rather than inferring it from the tree.

Re-running it overwrites the fixtures. That is intended while the set is being
built; once golden output exists, changing a fixture is a deliberate act that
shows up as a golden diff.
"""

import json
import os
import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT = ROOT / "tests" / "fixtures" / "projects"

# ── builders ────────────────────────────────────────────────────────────

_n = [0]


def _id(prefix):
    _n[0] += 1
    return f"{prefix}{_n[0]}"


def ins(op, *operands, vendor=None):
    ops = []
    for o in operands:
        if isinstance(o, str):
            ops.append({"kind": "tag", "name": o})
        elif isinstance(o, (int, float)):
            ops.append({"kind": "number", "value": float(o)})
        else:
            ops.append(o)
    d = {"id": _id("i"), "op": op, "operands": ops, "vendor": vendor}
    return d


def el(instruction):
    return {"kind": "element", "instruction": instruction}


def series(*children):
    return {"kind": "series", "children": list(children)}


def parallel(*children):
    return {"kind": "parallel", "children": list(children)}


def rung(logic, outputs, comment=None):
    return {"id": _id("r"), "comment": comment, "logic": logic, "outputs": outputs}


def tag(name, dt="bool", address=None, comment=None, direction=None, device=None,
        initial=None):
    if dt in ("bool", "int", "dint", "real", "string", "timer", "counter"):
        data_type = {"kind": dt}
    else:
        data_type = dt
    field = None
    if direction:
        field = {"direction": direction, "kind": device}
    return {
        "name": name,
        "data_type": data_type,
        "address": address,
        "initial_value": initial,
        "comment": comment,
        "field": field,
    }


def pou(name, rungs, comment=None, local_tags=None):
    return {
        "name": name,
        "kind": "Program",
        "body": {"language": "ladder", "rungs": rungs},
        "local_tags": local_tags or [],
        "comment": comment,
    }


def st_pou(name, source, comment=None):
    return {
        "name": name,
        "kind": "Program",
        "body": {"language": "structuredText", "source": source},
        "local_tags": [],
        "comment": comment,
    }


def project(name, pous, tags, entry="Main", scan_ms=100, vendor=None, data_types=None):
    return {
        "ir_version": 1,
        "name": name,
        "source_vendor": vendor,
        "pous": pous,
        "tags": tags,
        "data_types": data_types or [],
        "entry_point": entry,
        "scan_ms": scan_ms,
    }


def write(slug, doc, readme):
    d = OUT / slug
    d.mkdir(parents=True, exist_ok=True)
    (d / "project.ir.json").write_text(json.dumps(doc, indent=2) + "\n")
    (d / "README.md").write_text(readme)
    print(f"  {slug}")


# ── 01 motor starter ────────────────────────────────────────────────────

def f01():
    tags = [
        tag("Start_PB", address="I0.0", comment="Start pushbutton",
            direction="input", device="pushbuttonNo"),
        tag("Stop_PB", address="I0.1", comment="Stop pushbutton, wired NC",
            direction="input", device="pushbuttonNc"),
        tag("Overload_OK", address="I0.2", comment="Motor overload contact, closed when healthy",
            direction="input", device="sensor"),
        tag("Motor", address="Q0.0", comment="Motor contactor",
            direction="output", device="motor"),
    ]
    # (Start OR Motor) AND Stop AND Overload -> Motor
    r = rung(
        series(
            parallel(el(ins("contact", "Start_PB")), el(ins("contact", "Motor"))),
            el(ins("contact", "Stop_PB")),
            el(ins("contact", "Overload_OK")),
        ),
        [ins("coil", "Motor")],
        comment="Motor seal-in. Start latches through the coil's own contact.",
    )
    write("01-motor-starter",
          project("Motor starter", [pou("Main", [r])], tags),
          """# 01, motor starter

The seal-in, which is the first circuit anybody learns and the smallest one
that is not trivial.

Exercises:

- a parallel branch inside a series chain, the shape a flat model cannot hold
- a coil feeding back into its own condition side
- an NC-wired stop examined with a normally-open contact, which is correct and
  looks wrong to anyone reading the tag name alone. `Stop_PB` is
  `pushbuttonNc`, so the signal is 1 while the button is not pressed. A
  converter that "helpfully" negates it produces a machine that cannot be
  stopped.
""")


# ── 02 reversing motor ──────────────────────────────────────────────────

def f02():
    tags = [
        tag("Fwd_PB", address="I0.0", direction="input", device="pushbuttonNo"),
        tag("Rev_PB", address="I0.1", direction="input", device="pushbuttonNo"),
        tag("Stop_PB", address="I0.2", comment="Wired NC", direction="input", device="pushbuttonNc"),
        tag("Fwd", address="Q0.0", comment="Forward contactor", direction="output", device="motor"),
        tag("Rev", address="Q0.1", comment="Reverse contactor", direction="output", device="motor"),
    ]
    fwd = rung(
        series(
            parallel(el(ins("contact", "Fwd_PB")), el(ins("contact", "Fwd"))),
            el(ins("contact", "Stop_PB")),
            el(ins("contactNegated", "Rev")),
        ),
        [ins("coil", "Fwd")],
        comment="Forward, interlocked against reverse.",
    )
    rev = rung(
        series(
            parallel(el(ins("contact", "Rev_PB")), el(ins("contact", "Rev"))),
            el(ins("contact", "Stop_PB")),
            el(ins("contactNegated", "Fwd")),
        ),
        [ins("coil", "Rev")],
        comment="Reverse, interlocked against forward.",
    )
    write("02-reversing-motor",
          project("Reversing motor", [pou("Main", [fwd, rev])], tags),
          """# 02, reversing motor

Two seal-ins that exclude each other.

Exercises:

- a mutual interlock, each rung holding a negated contact of the other's output
- the first fixture where dropping one contact is a short circuit across a
  reversing contactor rather than a cosmetic difference, so it is the one worth
  checking a conversion against
""")


# ── 03 conveyor with jam detection ──────────────────────────────────────

def f03():
    tags = [
        tag("Start_PB", address="I0.0", direction="input", device="pushbuttonNo"),
        tag("Stop_PB", address="I0.1", comment="Wired NC", direction="input", device="pushbuttonNc"),
        tag("EStop_OK", address="I0.2", comment="E-stop string, closed when healthy",
            direction="input", device="pushbuttonNc"),
        tag("PE_Discharge", address="I0.3", comment="Photocell at the discharge end",
            direction="input", device="sensor"),
        tag("Conveyor", address="Q0.0", direction="output", device="motor"),
        tag("Jam_Alarm", address="Q0.1", direction="output", device="lamp"),
        tag("Jam_Timer", dt="timer", comment="Product present too long"),
    ]
    run = rung(
        series(
            parallel(el(ins("contact", "Start_PB")), el(ins("contact", "Conveyor"))),
            el(ins("contact", "Stop_PB")),
            el(ins("contact", "EStop_OK")),
            el(ins("contactNegated", "Jam_Alarm")),
        ),
        [ins("coil", "Conveyor")],
        comment="Run, dropped by a jam.",
    )
    jam = rung(
        series(el(ins("contact", "PE_Discharge")), el(ins("contact", "Conveyor"))),
        [ins("timerOn", "Jam_Timer", 5000)],
        comment="Product blocking the discharge photocell while running.",
    )
    alarm = rung(
        series(el(ins("contact", "Jam_Timer.DN"))),
        [ins("setCoil", "Jam_Alarm")],
        comment="Latched, so it needs a deliberate reset.",
    )
    write("03-conveyor",
          project("Conveyor with jam detection", [pou("Main", [run, jam, alarm])], tags),
          """# 03, conveyor with jam detection

Exercises:

- a timer with a preset in milliseconds, which is where vendors disagree most
  and where a conversion is most likely to be quietly wrong
- a timer done bit read as a contact on a later rung
- a latched alarm, `setCoil` with no matching `resetCoil` in the fixture, which
  is deliberate: a health check should be able to notice that
""")


# ── 04 tank filling ─────────────────────────────────────────────────────

def f04():
    tags = [
        tag("Auto_Sel", address="I0.0", comment="Auto/manual selector",
            direction="input", device="selector"),
        tag("LSL_Tank", address="I0.1", comment="Low level float",
            direction="input", device="sensor"),
        tag("LSH_Tank", address="I0.2", comment="High level float",
            direction="input", device="sensor"),
        tag("EStop_OK", address="I0.3", direction="input", device="pushbuttonNc"),
        tag("Fill_Valve", address="Q0.0", direction="output", device="motor"),
        tag("Filling", comment="Internal state"),
    ]
    start = rung(
        series(
            el(ins("contact", "Auto_Sel")),
            el(ins("contact", "EStop_OK")),
            el(ins("contact", "LSL_Tank")),
        ),
        [ins("setCoil", "Filling")],
        comment="Low level in auto starts a fill.",
    )
    stop = rung(
        parallel(
            el(ins("contact", "LSH_Tank")),
            el(ins("contactNegated", "EStop_OK")),
            el(ins("contactNegated", "Auto_Sel")),
        ),
        [ins("resetCoil", "Filling")],
        comment="High level, E-stop or leaving auto all stop it.",
    )
    valve = rung(series(el(ins("contact", "Filling"))), [ins("coil", "Fill_Valve")])
    write("04-tank-filling",
          project("Tank filling", [pou("Main", [start, stop, valve])], tags),
          """# 04, tank filling

Set/reset state rather than a seal-in, which is the other way this is written
and the one that converts least predictably.

Exercises:

- `setCoil` and `resetCoil` as a matched pair, so a reviewer can tell this apart
  from fixture 03 where the pair is deliberately incomplete
- a top-level parallel as the whole condition side, no series wrapper
- a maintained selector, where fixture 01 has momentary buttons
""")


# ── 05 duty / standby pumps ─────────────────────────────────────────────

def f05():
    tags = [
        tag("Run_Req", address="I0.0", direction="input", device="selector"),
        tag("P1_Fault", address="I0.1", direction="input", device="sensor"),
        tag("P2_Fault", address="I0.2", direction="input", device="sensor"),
        tag("Duty_Is_P2", comment="Alternation flag, toggled on each start"),
        tag("Pump_1", address="Q0.0", direction="output", device="motor"),
        tag("Pump_2", address="Q0.1", direction="output", device="motor"),
    ]
    p1 = rung(
        series(
            el(ins("contact", "Run_Req")),
            el(ins("contactNegated", "P1_Fault")),
            parallel(
                el(ins("contactNegated", "Duty_Is_P2")),
                el(ins("contact", "P2_Fault")),
            ),
        ),
        [ins("coil", "Pump_1")],
        comment="P1 runs when it is duty, or when P2 has failed.",
    )
    p2 = rung(
        series(
            el(ins("contact", "Run_Req")),
            el(ins("contactNegated", "P2_Fault")),
            parallel(
                el(ins("contact", "Duty_Is_P2")),
                el(ins("contact", "P1_Fault")),
            ),
        ),
        [ins("coil", "Pump_2")],
        comment="P2 runs when it is duty, or when P1 has failed.",
    )
    toggle = rung(
        series(el(ins("risingEdge", "Run_Req"))),
        [ins("coil", "Duty_Is_P2")],
        comment="Alternate on each demand.",
    )
    write("05-duty-standby-pumps",
          project("Duty standby pumps", [pou("Main", [p1, p2, toggle])], tags),
          """# 05, duty/standby pumps

Exercises:

- a rising edge instruction, which is one scan wide and therefore the thing a
  conversion with different scan semantics breaks first
- two rungs whose conditions are near mirror images, so a diff or a code review
  has something realistic to tell apart
- a nested parallel inside a series, at depth
""")


# ── 06 PID loop, with an instruction the IR does not model ──────────────

def f06():
    tags = [
        tag("PV_Temp", dt="real", address="IW64", comment="Process temperature",
            direction="input", device="analogValue"),
        tag("SP_Temp", dt="real", comment="Setpoint", initial={"kind": "number", "value": 75.0}),
        tag("CV_Heater", dt="real", address="QW64", comment="Heater output",
            direction="output", device="analogValue"),
        tag("Loop_Enable", address="I0.0", direction="input", device="selector"),
        tag("Temp_High", address="Q0.2", direction="output", device="lamp"),
    ]
    pid = rung(
        series(el(ins("contact", "Loop_Enable"))),
        [ins("unsupported", "PV_Temp", "SP_Temp", "CV_Heater", vendor={
            "original_mnemonic": "PID",
            "attributes": [
                ["Kp", "2.5"],
                ["Ki", "0.4"],
                ["Kd", "0.0"],
                ["UpdateTime", "0.1"],
                ["ControlMode", "Reverse"],
            ],
        })],
        comment="Temperature loop. LADX does not model PID natively.",
    )
    high = rung(
        series(el(ins("greater", "PV_Temp", 80.0))),
        [ins("coil", "Temp_High")],
        comment="High temperature indication at 80 degrees.",
    )
    write("06-pid-loop",
          project("PID temperature loop", [pou("Main", [pid, high])], tags,
                  vendor="Rockwell"),
          """# 06, PID loop

The preservation fixture, and the most important one in the set.

`PID` is not in the IR's instruction list. It imports as `unsupported` with the
mnemonic and all five tuning parameters kept verbatim in `vendor`. That is the
contract the whole conversion story rests on: LADX must be able to carry a
project through import and export without silently dropping the part it cannot
read.

A conversion of this fixture must report the PID as UNSUPPORTED or PRESERVED
and must not lose `Kp`, `Ki`, `Kd`, `UpdateTime` or `ControlMode`. If a golden
diff ever shows those gone, the export is destroying customer projects.

Also exercises:

- REAL tags and an analog comparison against a float literal
- a tag with an initial value
- `source_vendor` set, which is what an exporter reads to pick a dialect
""")


# ── 07 alarm handling ───────────────────────────────────────────────────

def f07():
    tags = [
        tag("EStop_OK", address="I0.0", direction="input", device="pushbuttonNc"),
        tag("Guard_Closed", address="I0.1", direction="input", device="sensor"),
        tag("Motor_Fault", address="I0.2", direction="input", device="sensor"),
        tag("Reset_PB", address="I0.3", direction="input", device="pushbuttonNo"),
        tag("Alm_EStop", comment="E-stop pressed"),
        tag("Alm_Guard", comment="Guard open"),
        tag("Alm_Motor", comment="Motor fault"),
        tag("Any_Alarm", address="Q0.0", direction="output", device="lamp"),
        tag("Alarm_Horn", address="Q0.1", direction="output", device="lamp"),
        tag("Horn_Timer", dt="timer"),
    ]
    rungs = []
    for src, alm, neg in (
        ("EStop_OK", "Alm_EStop", True),
        ("Guard_Closed", "Alm_Guard", True),
        ("Motor_Fault", "Alm_Motor", False),
    ):
        op = "contactNegated" if neg else "contact"
        rungs.append(rung(series(el(ins(op, src))), [ins("setCoil", alm)],
                          comment=f"Latch {alm}."))
    rungs.append(rung(
        series(el(ins("contact", "Reset_PB"))),
        [ins("resetCoil", "Alm_EStop"), ins("resetCoil", "Alm_Guard"),
         ins("resetCoil", "Alm_Motor")],
        comment="One reset clears all three.",
    ))
    rungs.append(rung(
        parallel(el(ins("contact", "Alm_EStop")), el(ins("contact", "Alm_Guard")),
                 el(ins("contact", "Alm_Motor"))),
        [ins("coil", "Any_Alarm")],
        comment="Summary.",
    ))
    rungs.append(rung(
        series(el(ins("contact", "Any_Alarm")), el(ins("contactNegated", "Horn_Timer.DN"))),
        [ins("timerOn", "Horn_Timer", 30000), ins("coil", "Alarm_Horn")],
        comment="Horn for 30 seconds, then silences itself.",
    ))
    write("07-alarm-handling",
          project("Alarm handling", [pou("Main", rungs)], tags),
          """# 07, alarm handling

Exercises:

- three latched alarms cleared by one reset rung, so an output rung with
  several instructions on it is covered
- a summary alarm built from a wide top-level parallel
- a self-silencing horn: a timer whose own done bit is in its condition, which
  is a small feedback loop and a good test of evaluation order
- the raw material for alarm discovery later, since these are exactly the
  latch-on-condition shapes that pass should find
""")


# ── 08 multi-step sequence ──────────────────────────────────────────────

def f08():
    tags = [
        tag("Start_PB", address="I0.0", direction="input", device="pushbuttonNo"),
        tag("Auto_Sel", address="I0.1", direction="input", device="selector"),
        tag("EStop_OK", address="I0.2", direction="input", device="pushbuttonNc"),
        tag("Part_Present", address="I0.3", direction="input", device="sensor"),
        tag("Clamp_Closed", address="I0.4", direction="input", device="sensor"),
        tag("Drill_Home", address="I0.5", direction="input", device="sensor"),
        tag("Clamp", address="Q0.0", direction="output", device="motor"),
        tag("Drill", address="Q0.1", direction="output", device="motor"),
        tag("Step", dt="int", comment="0 idle, 10 clamp, 20 drill, 30 retract"),
        tag("Dwell", dt="timer"),
    ]
    main = pou("Main", [
        rung(series(el(ins("contact", "Auto_Sel")), el(ins("contact", "EStop_OK"))),
             [ins("call", "Sequence")],
             comment="The sequence only runs in auto with safety healthy."),
        rung(series(el(ins("contactNegated", "EStop_OK"))),
             [ins("move", 0, "Step")],
             comment="E-stop returns the sequence to idle."),
    ])
    seq = pou("Sequence", [
        rung(series(el(ins("equal", "Step", 0)), el(ins("contact", "Start_PB")),
                    el(ins("contact", "Part_Present"))),
             [ins("move", 10, "Step")],
             comment="Idle to clamp."),
        rung(series(el(ins("equal", "Step", 10))),
             [ins("coil", "Clamp")]),
        rung(series(el(ins("equal", "Step", 10)), el(ins("contact", "Clamp_Closed"))),
             [ins("move", 20, "Step")],
             comment="Clamped, start drilling."),
        rung(series(el(ins("equal", "Step", 20))),
             [ins("coil", "Drill"), ins("timerOn", "Dwell", 3000)]),
        rung(series(el(ins("equal", "Step", 20)), el(ins("contact", "Dwell.DN"))),
             [ins("move", 30, "Step")],
             comment="Dwell complete, retract."),
        rung(series(el(ins("equal", "Step", 30)), el(ins("contact", "Drill_Home"))),
             [ins("move", 0, "Step")],
             comment="Home, back to idle."),
    ], comment="Step sequence, called from Main.")
    write("08-multi-step-sequence",
          project("Drill station sequence", [main, seq], tags),
          """# 08, multi-step sequence

The only fixture with more than one POU, and the one sequence extraction and
the dependency graph will be built against.

Exercises:

- a `call` between POUs, so `entry_point` means something and a call graph has
  an edge to find
- an integer step register driven by `move` with literal sources, the most
  common sequence idiom on both platforms
- `equal` comparisons on the condition side, where fixture 06 uses one as well
  but against a float
- a transition guarded by a timer done bit
- a reset path that jumps the sequence straight to idle from anywhere, which is
  what "which faults reset the sequence?" has to be able to answer
""")


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    print("writing fixtures:")
    for f in (f01, f02, f03, f04, f05, f06, f07, f08):
        # Numbering restarts per fixture, so ids are stable and local. Numbered
        # once across the whole set, inserting a fixture would renumber every
        # one after it and churn every golden file, which is exactly the signal
        # the goldens exist to give.
        _n[0] = 0
        f()
    print(f"\n{len(list(OUT.iterdir()))} fixture projects in {OUT.relative_to(ROOT)}")
