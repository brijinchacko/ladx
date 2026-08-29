//! Translation between the PLCopen TC6 ladder *graph* and the LADX ladder *tree*.
//!
//! TC6 stores a rung the way a wiring diagram works: every element is a sibling
//! carrying a unique `localId`, and connectivity lives in `connectionPointIn`
//! entries pointing back at the `localId` of whatever feeds them. A rung is
//! therefore a DAG from `leftPowerRail` to each coil, and its meaning only
//! appears once you walk it.
//!
//! That is a good wire format and a bad working format. You cannot look at a
//! flat element list and see a seal-in; you cannot diff two of them usefully;
//! you cannot edit one without hand-maintaining integer references. So LADX
//! keeps the series/parallel tree the graph *means* and converts at the edges.
//!
//! # The subset, stated plainly
//!
//! Real ladder is a **series-parallel** network: it is built by putting things
//! in a row or side by side, and every editor enforces that. This module
//! handles exactly that class and rejects anything else with
//! [`GraphError::NotSeriesParallel`] rather than guessing.
//!
//! The graph that does *not* decompose is the bridged rung, where a wire
//! crosses between two parallel branches, forming a lattice. It is legal in
//! some tools, it has no series/parallel expression, and silently mangling one
//! into the wrong logic is far worse than refusing it. When we meet one, the
//! importer reports it and preserves the original; it does not pretend.

use crate::{Instruction, Logic};
use std::collections::{BTreeMap, BTreeSet};

/// The reserved `localId` of the left power rail, the source every path starts
/// from. TC6 gives the rail an element like any other; 0 is the conventional id
/// and the one LADX emits.
pub const LEFT_POWER_RAIL: u32 = 0;

#[derive(Debug, thiserror::Error, PartialEq)]
pub enum GraphError {
    #[error("element {0} refers to unknown localId {1}")]
    DanglingReference(u32, u32),
    #[error("the rung's connections form a cycle at localId {0}")]
    Cycle(u32),
    #[error(
        "this rung is not series-parallel (a branch crosses between legs near localId {0}); \
         it has no series/parallel form, so it is preserved rather than converted"
    )]
    NotSeriesParallel(u32),
    #[error("no element feeds the output; the rung has no path from the power rail")]
    NoPathToOutput,
}

/// One element as TC6 stores it: an id, what it does, and what feeds it.
#[derive(Debug, Clone, PartialEq)]
pub struct GraphElement {
    pub local_id: u32,
    /// `None` marks the left power rail, which carries no instruction.
    pub instruction: Option<Instruction>,
    /// `localId`s feeding this element's `connectionPointIn`. More than one is
    /// a parallel junction.
    pub inputs: Vec<u32>,
}

/* ─────────────────────────── tree → graph ──────────────────────────── */

/// Flatten a condition tree into TC6 elements.
///
/// Emits the power rail as id 0 and numbers elements from 1 in evaluation
/// order, so output is deterministic and diffable, the same tree always
/// produces the same ids.
pub fn tree_to_graph(logic: &Logic) -> Vec<GraphElement> {
    let mut out = vec![GraphElement {
        local_id: LEFT_POWER_RAIL,
        instruction: None,
        inputs: Vec::new(),
    }];
    let mut next_id = 1u32;
    emit(logic, &[LEFT_POWER_RAIL], &mut out, &mut next_id);
    out
}

/// Emit `logic`, fed by `inputs`; returns the ids that its output side exposes.
fn emit(
    logic: &Logic,
    inputs: &[u32],
    out: &mut Vec<GraphElement>,
    next_id: &mut u32,
) -> Vec<u32> {
    match logic {
        Logic::Element { instruction } => {
            let id = *next_id;
            *next_id += 1;
            out.push(GraphElement {
                local_id: id,
                instruction: Some(instruction.clone()),
                inputs: inputs.to_vec(),
            });
            vec![id]
        }
        Logic::Series { children } => {
            // Each child is fed by whatever the previous one exposed. An empty
            // series passes its input straight through, which is what an empty
            // rung does: it conducts.
            let mut carry = inputs.to_vec();
            for child in children {
                carry = emit(child, &carry, out, next_id);
            }
            carry
        }
        Logic::Parallel { children } => {
            // Every leg is fed by the same inputs; the junction downstream sees
            // all their outputs at once. An empty parallel has no legs and so
            // conducts nothing, deliberately different from an empty series.
            let mut ends = Vec::new();
            for child in children {
                ends.extend(emit(child, inputs, out, next_id));
            }
            ends
        }
    }
}

/* ─────────────────────────── graph → tree ──────────────────────────── */

/// The open ends of a graph, i.e. what feeds the output element.
///
/// An element nothing else consumes is a loose end, and every loose end runs
/// into the coil. Any exporter writing TC6 needs this to fill the output's
/// `connectionPointIn`, and every caller of [`graph_to_tree`] needs it to ask
/// the question at all, so it belongs here rather than being re-derived.
pub fn ends_of(elements: &[GraphElement]) -> Vec<u32> {
    let consumed: BTreeSet<u32> = elements.iter().flat_map(|e| e.inputs.iter().copied()).collect();
    elements
        .iter()
        .map(|e| e.local_id)
        .filter(|id| !consumed.contains(id))
        .collect()
}


/// Rebuild the condition tree from TC6 elements.
///
/// `output_inputs` is what feeds the coil, i.e. the `connectionPointIn` of the
/// output element, which is where the condition side ends.
pub fn graph_to_tree(
    elements: &[GraphElement],
    output_inputs: &[u32],
) -> Result<Logic, GraphError> {
    if output_inputs.is_empty() {
        return Err(GraphError::NoPathToOutput);
    }

    let by_id: BTreeMap<u32, &GraphElement> =
        elements.iter().map(|e| (e.local_id, e)).collect();

    for e in elements {
        for &input in &e.inputs {
            if !by_id.contains_key(&input) {
                return Err(GraphError::DanglingReference(e.local_id, input));
            }
        }
    }

    let mut builder = Builder { by_id, visiting: BTreeSet::new() };
    let logic = builder.build(output_inputs, LEFT_POWER_RAIL)?;
    Ok(normalise(logic))
}

struct Builder<'a> {
    by_id: BTreeMap<u32, &'a GraphElement>,
    visiting: BTreeSet<u32>,
}

impl Builder<'_> {
    /// Build the logic that spans from `stop` up to `heads`, walking backwards.
    ///
    /// Backwards because a rung has one output and possibly many parallel legs
    /// feeding it: starting at the end means starting where the structure is
    /// unambiguous, and each step either finds a single predecessor (series) or
    /// a junction (parallel).
    fn build(&mut self, heads: &[u32], stop: u32) -> Result<Logic, GraphError> {
        // Reached the rail: nothing left to express.
        if heads.len() == 1 && heads[0] == stop {
            return Ok(Logic::empty());
        }

        if heads.len() == 1 {
            let id = heads[0];
            let el = *self
                .by_id
                .get(&id)
                .ok_or(GraphError::DanglingReference(id, id))?;

            if !self.visiting.insert(id) {
                return Err(GraphError::Cycle(id));
            }

            let instruction = el
                .instruction
                .clone()
                .ok_or(GraphError::NotSeriesParallel(id))?;
            let before = self.build(&el.inputs, stop)?;

            self.visiting.remove(&id);

            return Ok(Logic::Series {
                children: vec![before, Logic::Element { instruction }],
            });
        }

        // A junction. It begins at the deepest node every leg passes through.
        let join = self.common_ancestor(heads, stop)?;

        // Heads are not necessarily one-per-leg. A leg can fan out again before
        // reaching the junction, `A then (X or Y)` arrives here as three heads
        // (X, Y and whatever else), of which X and Y belong to the *same* leg.
        // Splitting purely on the shared join would emit `(A X) or (A Y) or B`:
        // logically equivalent, structurally wrong, and it duplicates A.
        //
        // So group the heads by which of the junction's immediate successors
        // they descend from. Heads entering through the same successor are one
        // leg, and that leg is decomposed by the same routine one level down,
        // where it finds its own deeper junction.
        let groups = self.group_by_entry(heads, join)?;

        let mut legs = Vec::with_capacity(groups.len());
        for group in groups {
            legs.push(self.build(&group, join)?);
        }

        let before = self.build(&[join], stop)?;
        Ok(Logic::Series {
            children: vec![before, Logic::Parallel { children: legs }],
        })
    }

    /// Partition `heads` by which immediate successor of `join` they descend
    /// from. Each partition is one leg of the parallel block.
    fn group_by_entry(
        &self,
        heads: &[u32],
        join: u32,
    ) -> Result<Vec<Vec<u32>>, GraphError> {
        // Successors of `join` that actually lead to one of these heads.
        let reachable: BTreeSet<u32> =
            heads.iter().flat_map(|&h| self.ancestors(h, join)).collect();
        let entries: Vec<u32> = self
            .by_id
            .values()
            .filter(|e| e.inputs.contains(&join) && reachable.contains(&e.local_id))
            .map(|e| e.local_id)
            .collect();

        // Preserve the order the heads arrived in, so legs come out stable.
        let mut groups: Vec<(u32, Vec<u32>)> = Vec::new();
        for &head in heads {
            let anc = self.ancestors(head, join);
            let mut owning = entries.iter().copied().filter(|e| anc.contains(e));
            let entry = owning.next().ok_or(GraphError::NotSeriesParallel(head))?;
            // Reachable through two different legs: the branches cross, which
            // is the bridged rung this module deliberately refuses.
            if owning.next().is_some() {
                return Err(GraphError::NotSeriesParallel(head));
            }
            match groups.iter_mut().find(|(e, _)| *e == entry) {
                Some((_, members)) => members.push(head),
                None => groups.push((entry, vec![head])),
            }
        }

        Ok(groups.into_iter().map(|(_, members)| members).collect())
    }

    /// The nearest node that every one of `heads` descends from.
    ///
    /// For a series-parallel rung this is where the legs of a parallel block
    /// split. If the only shared ancestor is the rail, the block starts there.
    fn common_ancestor(&self, heads: &[u32], stop: u32) -> Result<u32, GraphError> {
        let mut shared: Option<BTreeSet<u32>> = None;
        for &head in heads {
            let anc = self.ancestors(head, stop);
            shared = Some(match shared {
                None => anc,
                Some(acc) => acc.intersection(&anc).copied().collect(),
            });
        }

        let shared = shared.unwrap_or_default();
        if shared.is_empty() {
            return Err(GraphError::NotSeriesParallel(heads[0]));
        }

        // Deepest shared ancestor = the one no other shared ancestor descends
        // from... equivalently, the largest id, since ids increase downstream in
        // anything we emit. Rather than rely on that, pick the candidate whose
        // own ancestor set is the largest: the deeper a node, the more it has
        // behind it.
        let deepest = shared
            .iter()
            .copied()
            .max_by_key(|&id| self.ancestors(id, stop).len())
            .ok_or(GraphError::NotSeriesParallel(heads[0]))?;

        Ok(deepest)
    }

    /// Everything upstream of `from`, inclusive, stopping at `stop`.
    fn ancestors(&self, from: u32, stop: u32) -> BTreeSet<u32> {
        let mut seen = BTreeSet::new();
        let mut stack = vec![from];
        while let Some(id) = stack.pop() {
            if !seen.insert(id) || id == stop {
                continue;
            }
            if let Some(el) = self.by_id.get(&id) {
                stack.extend(el.inputs.iter().copied());
            }
        }
        seen.insert(stop);
        seen
    }
}

/* ───────────────────────────── normalise ───────────────────────────── */

/// Collapse the scaffolding the backward walk leaves behind.
///
/// Building right-to-left produces correct but noisy trees, `Series[Series[],
/// Element]` where `Element` would do. Flattening matters beyond tidiness: the
/// round-trip test compares trees for equality, so a tree that survives a trip
/// through the graph has to come back in the same shape it left in.
pub fn normalise(logic: Logic) -> Logic {
    match logic {
        Logic::Element { .. } => logic,

        Logic::Series { children } => {
            let mut flat = Vec::new();
            for child in children {
                match normalise(child) {
                    // An empty series inside a series contributes nothing.
                    Logic::Series { children } if children.is_empty() => {}
                    // Nested series flatten: (a (b c) d) -> (a b c d).
                    Logic::Series { children } => flat.extend(children),
                    other => flat.push(other),
                }
            }
            if flat.len() == 1 {
                flat.pop().expect("length checked")
            } else {
                Logic::Series { children: flat }
            }
        }

        Logic::Parallel { children } => {
            let flat: Vec<Logic> = children.into_iter().map(normalise).collect();
            // A parallel with one leg is not a parallel.
            if flat.len() == 1 {
                flat.into_iter().next().expect("length checked")
            } else {
                Logic::Parallel { children: flat }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{OpCode, Operand};

    fn contact(id: &str, tag: &str) -> Logic {
        Logic::Element {
            instruction: Instruction {
                id: id.to_string(),
                op: OpCode::Contact,
                operands: vec![Operand::Tag { name: tag.to_string() }],
                vendor: None,
            },
        }
    }

    fn round_trip(logic: Logic) -> Logic {
        let graph = tree_to_graph(&logic);
        let ends = ends_of(&graph);
        graph_to_tree(&graph, &ends).expect("should decompose")
    }

    #[test]
    fn single_contact_round_trips() {
        let logic = normalise(Logic::Series { children: vec![contact("a", "Start")] });
        assert_eq!(round_trip(logic.clone()), logic);
    }

    #[test]
    fn series_chain_round_trips() {
        let logic = Logic::Series {
            children: vec![contact("a", "Start"), contact("b", "Guard"), contact("c", "Ready")],
        };
        assert_eq!(round_trip(logic.clone()), logic);
    }

    #[test]
    fn seal_in_round_trips() {
        // The motor latch: (Start OR Motor) AND NotStop. If anything survives a
        // round trip, this must, it is the first circuit anybody learns.
        let logic = Logic::Series {
            children: vec![
                Logic::Parallel {
                    children: vec![contact("a", "Start"), contact("b", "Motor")],
                },
                contact("c", "NotStop"),
            ],
        };
        assert_eq!(round_trip(logic.clone()), logic);
    }

    #[test]
    fn parallel_of_series_round_trips() {
        let logic = Logic::Series {
            children: vec![
                contact("pre", "Enable"),
                Logic::Parallel {
                    children: vec![
                        Logic::Series {
                            children: vec![contact("a1", "A1"), contact("a2", "A2")],
                        },
                        contact("b", "B"),
                    ],
                },
                contact("post", "Final"),
            ],
        };
        assert_eq!(round_trip(logic.clone()), logic);
    }

    #[test]
    fn three_way_parallel_round_trips() {
        let logic = Logic::Series {
            children: vec![Logic::Parallel {
                children: vec![contact("a", "A"), contact("b", "B"), contact("c", "C")],
            }],
        };
        assert_eq!(round_trip(logic.clone()), normalise(logic));
    }

    #[test]
    fn nested_parallel_round_trips() {
        let logic = Logic::Series {
            children: vec![Logic::Parallel {
                children: vec![
                    Logic::Series {
                        children: vec![
                            contact("a", "A"),
                            Logic::Parallel {
                                children: vec![contact("x", "X"), contact("y", "Y")],
                            },
                        ],
                    },
                    contact("b", "B"),
                ],
            }],
        };
        assert_eq!(round_trip(logic.clone()), normalise(logic));
    }

    #[test]
    fn empty_rung_conducts() {
        let graph = tree_to_graph(&Logic::empty());
        assert_eq!(graph.len(), 1, "only the power rail");
        assert_eq!(
            graph_to_tree(&graph, &[LEFT_POWER_RAIL]).unwrap(),
            Logic::empty()
        );
    }

    #[test]
    fn dangling_reference_is_reported() {
        let graph = vec![
            GraphElement { local_id: 0, instruction: None, inputs: vec![] },
            GraphElement {
                local_id: 1,
                instruction: Some(Instruction {
                    id: "a".into(),
                    op: OpCode::Contact,
                    operands: vec![],
                    vendor: None,
                }),
                inputs: vec![99], // nothing has id 99
            },
        ];
        assert_eq!(
            graph_to_tree(&graph, &[1]),
            Err(GraphError::DanglingReference(1, 99))
        );
    }

    #[test]
    fn no_path_to_output_is_reported() {
        let graph = tree_to_graph(&Logic::empty());
        assert_eq!(graph_to_tree(&graph, &[]), Err(GraphError::NoPathToOutput));
    }

    #[test]
    fn bridged_rung_is_refused_not_mangled() {
        // The lattice that has no series/parallel form:
        //
        //   rail ─┬─ A ─┬─ C ─┐
        //         │     ×     ├─ coil
        //         └─ B ─┴─ D ─┘
        //
        // C and D each take power from BOTH A and B, so the legs cross. There
        // is no way to write this as series and parallel, and quietly emitting
        // (A or B) and (C or D) would be a different circuit, it would let
        // A feed D, which the real rung may not permit. Refusing is the only
        // honest answer.
        let el = |id: u32, name: &str, inputs: Vec<u32>| GraphElement {
            local_id: id,
            instruction: Some(Instruction {
                id: name.to_string(),
                op: OpCode::Contact,
                operands: vec![Operand::Tag { name: name.to_string() }],
                vendor: None,
            }),
            inputs,
        };

        let graph = vec![
            GraphElement { local_id: 0, instruction: None, inputs: vec![] },
            el(1, "A", vec![0]),
            el(2, "B", vec![0]),
            el(3, "C", vec![1, 2]),
            el(4, "D", vec![1, 2]),
        ];

        let result = graph_to_tree(&graph, &[3, 4]);
        assert!(
            matches!(result, Err(GraphError::NotSeriesParallel(_))),
            "expected a refusal, got {result:?}"
        );
    }

    #[test]
    fn cycle_is_reported() {
        let el = |id: u32, inputs: Vec<u32>| GraphElement {
            local_id: id,
            instruction: Some(Instruction {
                id: format!("e{id}"),
                op: OpCode::Contact,
                operands: vec![],
                vendor: None,
            }),
            inputs,
        };
        // 1 feeds 2 feeds 1, malformed input, must not hang.
        let graph = vec![
            GraphElement { local_id: 0, instruction: None, inputs: vec![] },
            el(1, vec![2]),
            el(2, vec![1]),
        ];
        assert!(matches!(
            graph_to_tree(&graph, &[2]),
            Err(GraphError::Cycle(_)) | Err(GraphError::NotSeriesParallel(_))
        ));
    }

    #[test]
    fn ids_are_deterministic() {
        // Same tree, same ids, otherwise exported XML churns on every save and
        // diffs become useless.
        let logic = Logic::Series {
            children: vec![
                Logic::Parallel { children: vec![contact("a", "A"), contact("b", "B")] },
                contact("c", "C"),
            ],
        };
        assert_eq!(tree_to_graph(&logic), tree_to_graph(&logic));
    }
}
