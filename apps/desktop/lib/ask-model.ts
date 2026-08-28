/**
 * How the desktop's tools reach a model.
 *
 * Through a Tauri command to Ollama on loopback, never over HTTP. The shared
 * components used to POST to a web API route, which meant this app rendered a
 * working looking assistant that failed on every question against a route that
 * does not exist in a static export. A visible feature that cannot work is
 * worse than an absent one: somebody tries it, gets an error with no cause,
 * and stops trusting the rest of the tool.
 *
 * The prompts come from @ladx/ui rather than being written again here. The web
 * asks the same two questions of the same two tools, and a second hand written
 * copy of those instructions is a second assistant nobody has reviewed.
 */

import { api } from "@/lib/api";
import { ollamaModels, settingsLoad } from "@/lib/invoke";
import {
  ASSIST_TOOLS,
  type AskModel,
  type ModelList,
  assistUserPrompt,
  isAssistTool,
} from "@ladx/ui";

export const askModelLocally: AskModel = async ({ tool, context, question, model, signal }) => {
  if (!isAssistTool(tool)) {
    throw new Error(`There is no prompt for ${tool}.`);
  }

  // The model chosen in the composer, then the one settings remember, then
  // whatever Ollama suggests. That order because an explicit choice made just
  // now has to beat a default set once and forgotten.
  const chosen =
    model ?? (await settingsLoad().catch(() => ({ defaultModel: null }))).defaultModel ?? undefined;

  const result = await api.aiComplete({
    system: ASSIST_TOOLS[tool].system,
    prompt: assistUserPrompt(tool, context, question),
    model: chosen,
  });

  /*
   * Stop, honoured after the fact.
   *
   * The Tauri command is not cancellable, so pressing Stop cannot call the
   * generation off. What it can do is refuse to show an answer nobody is
   * waiting for any more, because putting a reply under a question the person
   * abandoned is worse than dropping it.
   */
  if (signal.aborted) throw new DOMException("Stopped", "AbortError");

  return { answer: result.text, model: result.model };
};

/**
 * What this machine can actually run.
 *
 * Read from Ollama rather than fetched from a URL. Sizes are shown as well as
 * names because on a laptop the question is not which model is cleverest, it
 * is which one fits in the memory this machine has.
 */
export async function localModels(): Promise<ModelList> {
  const { models, suggested } = await ollamaModels();
  return {
    source: models.length ? "Ollama, on this machine" : "none",
    autoNote: suggested
      ? `Auto uses ${suggested}.`
      : "No model installed. Run ollama pull, then reopen this.",
    models: models.map((m) => ({
      id: m.name,
      label: m.name,
      hint: m.sizeBytes ? `${(m.sizeBytes / 1024 ** 3).toFixed(1)} GB` : undefined,
    })),
  };
}
