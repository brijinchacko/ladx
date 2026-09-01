//! A project the size of a real one.
//!
//! The plan asks for a thousand, ten thousand and fifty thousand tags, and the
//! reason is not throughput. It is that every one of these analyses asks about
//! each tag in turn, and a linear lookup inside that loop is quadratic without
//! looking like it. The I/O list took nearly four seconds on fifty thousand
//! tags and the graph it was built on took a fraction of that, which is the
//! signature.
//!
//! The bounds below are deliberately loose. This is not a benchmark and a tight
//! one would fail on a busy machine; it is a guard against the shape of the
//! cost changing, and quadratic will blow through a loose bound long before a
//! slow morning does.

use ladx_ir::{alarms, docs, graph, health, io, IrProject};
use std::time::Instant;

/// A project of a given size: every rung reads two tags and drives a third.
fn synthetic(tags: usize, rungs: usize) -> IrProject {
    let mut p = IrProject::new(format!("Synthetic {tags}"));

    p.tags = (0..tags)
        .map(|i| ladx_ir::Tag {
            name: format!("Tag_{i}"),
            data_type: ladx_ir::DataType::Bool,
            address: Some(format!("I{}.{}", i / 8, i % 8)),
            initial_value: None,
            comment: Some(format!("Signal {i}")),
            field: (i % 5 == 0).then(|| ladx_ir::FieldDevice {
                direction: if i % 3 == 0 {
                    ladx_ir::IoDirection::Output
                } else {
                    ladx_ir::IoDirection::Input
                },
                kind: Some(ladx_ir::DeviceKind::Sensor),
            }),
        })
        .collect();

    let el = |id: &str, op: ladx_ir::OpCode, tag: String| ladx_ir::Instruction {
        id: id.into(),
        op,
        operands: vec![ladx_ir::Operand::Tag { name: tag }],
        vendor: None,
    };

    let body = (0..rungs)
        .map(|r| ladx_ir::Rung {
            id: format!("r{r}"),
            comment: Some(format!("Rung {r}")),
            logic: ladx_ir::Logic::Series {
                children: vec![
                    ladx_ir::Logic::Element {
                        instruction: el(
                            &format!("i{r}a"),
                            ladx_ir::OpCode::Contact,
                            format!("Tag_{}", r % tags),
                        ),
                    },
                    ladx_ir::Logic::Element {
                        instruction: el(
                            &format!("i{r}b"),
                            ladx_ir::OpCode::ContactNegated,
                            format!("Tag_{}", (r * 7) % tags),
                        ),
                    },
                ],
            },
            outputs: vec![el(
                &format!("o{r}"),
                ladx_ir::OpCode::Coil,
                format!("Tag_{}", (r * 13) % tags),
            )],
        })
        .collect();

    p.pous.push(ladx_ir::Pou {
        name: "Main".into(),
        kind: ladx_ir::PouKind::Program,
        body: ladx_ir::PouBody::Ladder { rungs: body },
        local_tags: vec![],
        comment: None,
        container: None,
    });
    p.entry_point = Some("Main".into());
    p
}

/// The bounds, scaled for how the code was compiled.
///
/// An unoptimised build is ten to fifty times slower on this kind of work, and
/// the workspace test run is unoptimised. Writing one number meant a guard that
/// passed under `--release`, which is how I checked it, and failed in the suite,
/// which is how it actually runs. The multiplier is generous because the point
/// is never the clock: quadratic blows through any of these by orders of
/// magnitude, and a slow morning does not.
fn budget(seconds: f64) -> f64 {
    if cfg!(debug_assertions) {
        seconds * 20.0
    } else {
        seconds
    }
}

fn under(seconds: f64, label: &str, f: impl FnOnce()) {
    let limit = budget(seconds);
    let started = Instant::now();
    f();
    let took = started.elapsed().as_secs_f64();
    assert!(took < limit, "{label} took {took:.2}s, which is over the {limit:.1}s guard");
}

#[test]
fn a_thousand_tags_is_immediate() {
    let p = synthetic(1_000, 500);
    under(2.0, "graph", || {
        graph::ProjectGraph::build(&p);
    });
    under(2.0, "io", || {
        io::io_list(&p);
    });
    under(2.0, "alarms", || {
        alarms::alarm_list(&p);
    });
    under(2.0, "health", || {
        health::analyse(&p);
    });
}

#[test]
fn ten_thousand_tags_stays_reasonable() {
    let p = synthetic(10_000, 5_000);
    under(5.0, "io", || {
        io::io_list(&p);
    });
    under(5.0, "alarms", || {
        alarms::alarm_list(&p);
    });
    under(5.0, "narrative", || {
        docs::control_narrative(&p);
    });
}

/// The one that caught it.
///
/// Every analysis here loops over tags and asks the graph about each, and the
/// lookup inside that loop used to walk every use in the project. At this size
/// that was nearly four seconds for the I/O list against a fraction of a second
/// to build the graph it was reading, which is what a quadratic lookup looks
/// like from outside.
#[test]
fn fifty_thousand_tags_does_not_go_quadratic() {
    let p = synthetic(50_000, 25_000);

    let started = Instant::now();
    let g = graph::ProjectGraph::build(&p);
    let build = started.elapsed().as_secs_f64();
    assert!(!g.uses.is_empty());

    under(8.0, "io at 50k", || {
        io::io_list(&p);
    });
    under(8.0, "alarms at 50k", || {
        alarms::alarm_list(&p);
    });

    // The shape check rather than the clock: reading the graph should not cost
    // wildly more than building it. Before the index it was more than ten
    // times, which is the thing that must not come back.
    let started = Instant::now();
    io::io_list(&p);
    let read = started.elapsed().as_secs_f64();
    assert!(
        read < build * 10.0 + 2.0,
        "reading the graph took {read:.2}s against {build:.2}s to build it, which is the \
         quadratic lookup returning"
    );
}
