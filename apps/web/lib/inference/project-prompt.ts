// Builds a system prompt that grounds the chat in a specific PLC project.
// The manifest is intentionally compact (names, not source) so it fits in
// every turn. Truncation is applied past 200 routines / 500 tags to keep
// the prompt under ~5 KB even on huge projects.

import type { Project } from "@/lib/db/schema";

const MAX_ROUTINES = 200;
const MAX_TAGS = 500;
const MAX_UDTS = 100;
const MAX_AOIS = 100;

export function buildProjectSystemPrompt(project: Project): string {
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

  return [
    `You are ladX, an expert PLC engineering assistant. The user is working on a project named "${project.name}" targeting ${project.vendor}.`,
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
