import { PHASES } from "@/lib/platform/lifecycle";

/**
 * What a project is actually being paid to produce.
 *
 * The lifecycle describes a complete turnkey job: seventeen deliverables from
 * a user requirement spec to a change control record. Most work is not that.
 * Somebody brought in to write the logic for a machine another house designed
 * owes a software spec and a test protocol, and handing them a plan containing
 * a bill of materials and an O&M manual is not thorough, it is noise they have
 * to delete seventeen times.
 *
 * So a project carries the set of deliverables it owes. Null means all of
 * them, which is what every project created before this existed gets, so
 * nothing changes underneath anybody.
 *
 * The presets are starting points, not categories. Everything is editable
 * afterwards, and widening the scope adds the missing deliverables without
 * disturbing work already under way.
 */

export const ALL_SLUGS: string[] = PHASES.flatMap((p) => p.deliverables);

export interface ScopePreset {
  id: string;
  name: string;
  /** Who picks this, in the words they would use. */
  blurb: string;
  slugs: string[];
}

const SOFTWARE = ["software-design-specification", "alarm-rationalisation"];
const PROVE_IT = ["fat-factory-acceptance-test"];
const ON_SITE = ["commissioning-checklist", "sat-site-acceptance-test"];

export const SCOPE_PRESETS: ScopePreset[] = [
  {
    id: "programming",
    name: "Programming only",
    blurb:
      "Someone else owns the design and the paperwork. You write the logic and prove it works.",
    slugs: [...SOFTWARE, ...PROVE_IT],
  },
  {
    id: "programming-commissioning",
    name: "Programming and commissioning",
    blurb: "You write it, test it on the bench, and put it into service on site.",
    slugs: [...SOFTWARE, ...PROVE_IT, ...ON_SITE],
  },
  {
    id: "design-build",
    name: "Design and build",
    blurb:
      "The engineering package: functional design, the registers, the panel, and the tests. The client wrote their own requirement.",
    slugs: [
      "fds-functional-design-specification",
      "control-narrative",
      ...SOFTWARE,
      "io-list",
      "bom-bill-of-materials",
      "cable-schedule",
      "cause-and-effect-matrix",
      "rats-range-alarm-trip-schedule",
      ...PROVE_IT,
      ...ON_SITE,
    ],
  },
  {
    id: "full",
    name: "Full lifecycle",
    blurb:
      "Turnkey, from the user requirement to the handover pack and change control. Everything the lifecycle defines.",
    slugs: ALL_SLUGS,
  },
];

export function getPreset(id: string): ScopePreset | undefined {
  return SCOPE_PRESETS.find((p) => p.id === id);
}

/**
 * The deliverables a project owes.
 *
 * Null is "everything", which is both the sensible default and what existing
 * projects have. An empty array is a real answer, not a missing one: a project
 * can legitimately owe no documents at all, and it must not silently become a
 * full lifecycle because somebody unticked the last box.
 */
export function deliverablesFor(scope: string[] | null | undefined): string[] {
  if (scope === null || scope === undefined) return ALL_SLUGS;
  // Unknown slugs are dropped rather than carried: a deliverable can be
  // retired from the lifecycle, and a stored scope naming it must not put a
  // task in the plan that no template can satisfy.
  const known = new Set(ALL_SLUGS);
  return scope.filter((s) => known.has(s));
}

/** Whether a project owes this deliverable. */
export function owes(scope: string[] | null | undefined, slug: string): boolean {
  return deliverablesFor(scope).includes(slug);
}

/**
 * Which preset a scope matches, if any.
 *
 * Compared as sets, because the order a scope was ticked in carries no
 * meaning. Anything that matches nothing is "custom", which is a legitimate
 * state rather than a failure to choose one.
 */
export function presetFor(scope: string[] | null | undefined): ScopePreset | null {
  const have = new Set(deliverablesFor(scope));
  for (const p of SCOPE_PRESETS) {
    if (p.slugs.length !== have.size) continue;
    if (p.slugs.every((s) => have.has(s))) return p;
  }
  return null;
}

/** The phases a scope actually touches, so an empty phase is not shown as work. */
export function phasesFor(scope: string[] | null | undefined): string[] {
  const have = new Set(deliverablesFor(scope));
  return PHASES.filter(
    (p) => p.deliverables.length === 0 || p.deliverables.some((d) => have.has(d)),
  ).map((p) => p.id);
}
