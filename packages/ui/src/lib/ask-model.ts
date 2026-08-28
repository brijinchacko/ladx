/**
 * How a tool reaches a model, without knowing where the model is.
 *
 * The assistants that explain rather than generate all ask the same thing:
 * here is what is on screen, here is a question, answer it. Only the transport
 * differs. On the web that is a POST to an API route; on the desktop it is a
 * Tauri command talking to Ollama on loopback, and the desktop must never make
 * an HTTP call at all.
 *
 * This existed as a hardcoded `fetch("/api/assist")` inside two shared
 * components, which meant the desktop shipped an assistant that rendered
 * perfectly and failed on every question, because the route it was posting to
 * does not exist in a static export. A visible feature that cannot work is
 * worse than one that is absent: somebody tries it, gets an error with no
 * cause, and stops trusting the rest of the tool.
 *
 * So the transport is injected and the prop is required. A new surface has to
 * say how it reaches a model, and cannot silently inherit the web's answer.
 */

export interface AskModelRequest {
  /** Which assistant is asking, so the host can pick the right system prompt. */
  tool: string;
  /** Everything the model should reason from: tags, rungs, conversion notes. */
  context: string;
  question: string;
  /** The chosen model, or null for whatever the host thinks best. */
  model: string | null;
  /** Aborts when the person presses Stop. */
  signal: AbortSignal;
}

export interface AskModelReply {
  answer: string;
  /** Which model actually replied, so the screen can say. */
  model?: string | null;
}

export type AskModel = (req: AskModelRequest) => Promise<AskModelReply>;

/**
 * The web's transport: POST to an API route that holds the prompts and keys.
 *
 * Lives here rather than in each page so the two web surfaces cannot drift,
 * and is passed explicitly rather than defaulted, so nothing inherits it by
 * accident.
 */
export function httpAskModel(endpoint = "/api/assist"): AskModel {
  return async ({ tool, context, question, model, signal }) => {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tool, context, question, model }),
      signal,
    });
    const body = (await res.json()) as { answer?: string; model?: string; error?: string };
    if (!res.ok || !body.answer) {
      throw new Error(body.error ?? "Could not reach a model.");
    }
    return { answer: body.answer, model: body.model ?? null };
  };
}

/**
 * Where the list of choosable models comes from.
 *
 * A URL on the web, a function on the desktop, or null on a surface with no
 * provider at all. Previously a URL only, which the desktop dutifully fetched
 * and got a 404 for, leaving its model picker permanently stuck on "Could not
 * read the model list".
 */
export interface ModelChoice {
  id: string;
  label: string;
  hint?: string;
}

export interface ModelList {
  /** Where the list came from, said plainly enough to put on screen. */
  source: string;
  /** What Auto does, in this host's terms. */
  autoNote: string;
  models: ModelChoice[];
}

export type ModelsSource = string | (() => Promise<ModelList>) | null;
