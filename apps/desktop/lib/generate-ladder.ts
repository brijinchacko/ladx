/**
 * How the desktop writes ladder: a local Ollama, through a Tauri command.
 *
 * The prompt, the shape the reply must arrive in, the id minting and the
 * validation all come from @ladx/studio, so this machine writes ladder by
 * exactly the same rules the cloud build does. That matters more here than
 * anywhere else in the app: the prompt carries the two rules where getting it
 * wrong is a safety defect rather than a style choice, and this is the surface
 * running on a laptop in a switchroom with nobody to ask.
 *
 * What is local is only the call and the retry.
 */

import { api } from "@/lib/api";
import { settingsLoad } from "@/lib/invoke";
import {
  type LadderGenerateRequest,
  type LadderGenerated,
  LadderReplyError,
  buildGeneratedLadder,
  ladderContext,
  ladderSystemPrompt,
} from "@ladx/studio";

/**
 * The first JSON object in a reply.
 *
 * Local models are markedly worse than hosted ones at "reply with JSON and
 * nothing else": a fenced block, or a sentence of preamble, is the norm rather
 * than the exception. Finding the object rather than rejecting the reply is
 * the difference between a usable assistant and one that fails most of the
 * time on a small model.
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

export async function generateLadderLocally(req: LadderGenerateRequest): Promise<LadderGenerated> {
  const chosen =
    req.model ??
    (await settingsLoad().catch(() => ({ defaultModel: null }))).defaultModel ??
    undefined;

  const system = ladderSystemPrompt();
  const context = ladderContext(req.current, req.mode);

  /*
   * Two attempts, the second saying what was wrong with the first.
   *
   * The same allowance the cloud build makes, and it earns its keep harder
   * here: a 7B model that wraps its JSON in prose on the first pass usually
   * gets it right when told plainly to return the object only.
   */
  let raw: unknown = null;
  let text = "";
  let model = "";
  let lastError: unknown = null;

  for (let attempt = 0; attempt < 2 && !raw; attempt++) {
    try {
      const result = await api.aiComplete({
        system,
        prompt:
          attempt === 0
            ? `${context}\n\n${req.prompt}`
            : `${context}\n\n${req.prompt}\n\nYour previous reply was not usable JSON:\n${text.slice(0, 1200)}\n\nReply with the object only, starting { and ending }.`,
        model: chosen,
        maxTokens: 4000,
      });
      text = result.text;
      model = result.model;
      raw = firstJsonObject(text);
    } catch (err) {
      lastError = err;
    }
  }

  if (!raw) {
    if (lastError) {
      throw new Error(
        lastError instanceof Error
          ? lastError.message
          : "Could not reach the model. Check Ollama is running.",
      );
    }
    throw new Error(
      "The model did not return anything the editor could read. A larger model usually fixes this.",
    );
  }

  // Aborted after the fact: the command is not cancellable, so Stop can only
  // refuse to load a program nobody is waiting for any more.
  if (req.signal.aborted) throw new DOMException("Stopped", "AbortError");

  try {
    const built = buildGeneratedLadder(raw, req.current);
    return { ...built, model };
  } catch (err) {
    if (err instanceof LadderReplyError) {
      throw new Error(err.message);
    }
    throw err;
  }
}
