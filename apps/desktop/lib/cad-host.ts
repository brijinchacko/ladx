/**
 * Where the desktop keeps drawings, and how it generates them.
 *
 * SQLite through Tauri, and a local Ollama, so a panel drawing never leaves
 * the machine any more than the ladder program it belongs with does. The web
 * has its own, talking to API routes, and neither knows about the other's.
 */

import { api } from "@/lib/api";
import { settingsLoad } from "@/lib/invoke";
import type { CadStore, GenerateDrawing, GeneratedEntity } from "@ladx/cad";
import { emptyDrawing } from "@ladx/cad";

export const cadStoreLocally: CadStore = {
  async create({ name, projectId, data }) {
    const row = await api.createCad(projectId, name, JSON.stringify(data ?? emptyDrawing()));
    return { id: row.id };
  },
  async save({ id, name, data }) {
    return api.saveCad(id, name, JSON.stringify(data));
  },
  async rename(id, name) {
    await api.renameCad(id, name);
  },
  async remove(id) {
    await api.deleteCad(id);
  },
  async setProject(id, projectId) {
    await api.setCadProject(id, projectId);
  },
};

/**
 * Drawing from a description, on a local model.
 *
 * The reply is geometry rather than prose, so the same problem the ladder
 * generator has applies harder: small models wrap JSON in explanation. The
 * object is found in the reply rather than the reply being rejected.
 */
export const generateDrawingLocally: GenerateDrawing = async ({
  prompt,
  layers,
  context,
  model,
  signal,
}) => {
  const chosen =
    model ?? (await settingsLoad().catch(() => ({ defaultModel: null }))).defaultModel ?? undefined;

  const system = [
    "You place electrical symbols and geometry on a CAD sheet.",
    "",
    "Reply with one JSON object and nothing else:",
    '{ "entities": [...], "summary": "what you drew and what you assumed" }',
    "",
    "An entity is either a symbol reference or a primitive:",
    '  { "type": "symbol", "symbol": "<library name>", "at": {"x":0,"y":0}, "layer": "<name>" }',
    '  { "type": "line" | "rect" | "circle" | "text", ... , "layer": "<name>" }',
    "",
    `Layers available: ${layers.join(", ") || "0"}.`,
    "",
    "Millimetres, and the sheet's origin is bottom left. Drawings are read at",
    "A3, so keep symbols on a 5 mm grid and leave room between them for wire",
    "numbers: a schematic nobody can annotate is a schematic nobody can use.",
    "",
    "Prefer a symbol reference to drawing one yourself. The library's geometry",
    "is what the rest of the set uses, and a hand drawn contact that is almost",
    "the right shape is worse than none.",
  ].join("\n");

  const result = await api.aiComplete({
    system,
    prompt: `${context}\n\n${prompt}`,
    model: chosen,
    maxTokens: 3000,
  });

  if (signal.aborted) throw new DOMException("Stopped", "AbortError");

  const raw = firstJsonObject(result.text);
  if (!raw || typeof raw !== "object") {
    throw new Error(
      "The model did not return anything the sheet could take. A larger model usually fixes this.",
    );
  }
  const body = raw as { entities?: unknown; summary?: unknown };
  if (!Array.isArray(body.entities)) {
    throw new Error("The model returned no geometry.");
  }

  return {
    entities: body.entities as GeneratedEntity[],
    summary: typeof body.summary === "string" ? body.summary : undefined,
    model: result.model,
  };
};

/**
 * The first JSON object in a reply.
 *
 * Local models are markedly worse at "reply with JSON and nothing else" than
 * hosted ones, and a fenced block or a sentence of preamble is the norm rather
 * than the exception.
 */
function firstJsonObject(text: string): unknown {
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}
