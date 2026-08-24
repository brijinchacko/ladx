// Builds a system prompt that grounds the chat in a specific PLC project.
// The manifest is intentionally compact (names, not source) so it fits in
// every turn. Truncation is applied past 200 routines / 500 tags to keep
// the prompt under ~5 KB even on huge projects.

import type { Client, CompanyProfile, Project } from "@/lib/db/schema";
import { getPhase } from "@/lib/platform/lifecycle";

const MAX_ROUTINES = 200;
const MAX_TAGS = 500;
const MAX_UDTS = 100;
const MAX_AOIS = 100;

/**
 * Everything the assistant should know about the engagement.
 *
 * The manifest below describes the PLC file. This describes the job: who it is
 * for, where it is in the lifecycle, what has been written and what has not.
 * Without it the assistant could discuss a routine but not answer "what is left
 * before handover", which is the question somebody sitting in a project
 * workspace is most likely to ask.
 */
export interface ProjectContext {
  client: Client | null;
  company: CompanyProfile | null;
  /** Titles of documents filed against this project. */
  documents: { title: string; kind: string; templateSlug: string | null }[];
  drawings: string[];
}

export function buildProjectSystemPrompt(project: Project, context?: ProjectContext): string {
  const m = project.manifest ?? {
    routines: [],
    tags: [],
    udts: [],
    aois: [],
  };

  const routines = m.routines
    .slice(0, MAX_ROUTINES)
    .map((r) => `${r.name} (${r.language})`)
    .join(", ");
  const routineNote =
    m.routines.length > MAX_ROUTINES
      ? ` (showing first ${MAX_ROUTINES} of ${m.routines.length})`
      : "";

  const tags = m.tags
    .slice(0, MAX_TAGS)
    .map((t) => (t.data_type ? `${t.name}: ${t.data_type}` : t.name))
    .join(", ");
  const tagNote =
    m.tags.length > MAX_TAGS ? ` (showing first ${MAX_TAGS} of ${m.tags.length})` : "";

  const udts = m.udts.slice(0, MAX_UDTS).join(", ");
  const udtNote =
    m.udts.length > MAX_UDTS ? ` (showing first ${MAX_UDTS} of ${m.udts.length})` : "";

  const aois = m.aois.slice(0, MAX_AOIS).join(", ");
  const aoiNote =
    m.aois.length > MAX_AOIS ? ` (showing first ${MAX_AOIS} of ${m.aois.length})` : "";

  const phase = getPhase(project.phase);
  const deliverables = phase.deliverables;
  const started = new Set(
    (context?.documents ?? []).map((d) => d.templateSlug).filter((s): s is string => Boolean(s)),
  );
  const outstanding = deliverables.filter((d) => !started.has(d));

  const engagement = context
    ? [
        "",
        "The engagement:",
        `- Client: ${context.client?.name ?? "not assigned"}`,
        ...(context.client?.contactName ? [`- Client contact: ${context.client.contactName}`] : []),
        ...(context.company?.name ? [`- Delivered by: ${context.company.name}`] : []),
        ...(project.code ? [`- Project number: ${project.code}`] : []),
        ...(project.site ? [`- Site: ${project.site}`] : []),
        ...(project.description ? [`- Description: ${project.description}`] : []),
        `- Current phase: ${phase.step ? `${phase.step}. ` : ""}${phase.name}. ${phase.purpose}`,
        `- Deliverables for this phase: ${deliverables.join(", ") || "none"}`,
        `- Not yet started: ${outstanding.join(", ") || "none, this phase is complete"}`,
        `- Documents on file: ${
          context.documents.length
            ? context.documents
                .map((d) => d.title)
                .slice(0, 40)
                .join(", ")
            : "none"
        }`,
        `- CAD drawings: ${context.drawings.slice(0, 20).join(", ") || "none"}`,
        "",
        "Answer questions about progress, what is outstanding and what a phase requires from the engagement facts above rather than from general knowledge. If something is not listed, say it is not recorded rather than guessing.",
      ]
    : [];

  return [
    `You are ladX, an expert PLC engineering assistant. The user is working on a project named "${project.name}"${project.vendor ? ` targeting ${project.vendor}` : ""}.`,
    ...engagement,
    "",
    "Project manifest (names only, full source is not yet available; ask the user to paste a routine if you need its body):",
    `- Routines${routineNote}: ${routines || "(none)"}`,
    `- Tags${tagNote}: ${tags || "(none)"}`,
    `- UDTs${udtNote}: ${udts || "(none)"}`,
    `- AOIs${aoiNote}: ${aois || "(none)"}`,
    "",
    "When the user asks about specific routines, tags, or UDTs, refer to them by exact name. If a name they mention isn't in the manifest, say so, do not hallucinate.",
    "When generating code, target IEC 61131-3 Structured Text by default; use ladder XML only if asked. Always note which vendor IDE the output is for.",
    "Be terse and engineer-to-engineer. Skip apologies and disclaimers.",
  ].join("\n");
}
