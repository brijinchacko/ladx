import type { Credentials, ModelInfo, Provider } from "./types";

/**
 * Choosing a model when the user has not.
 *
 * Making somebody pick a model from a list of four hundred before they can ask
 * their first question is a bad first five minutes, and on OpenRouter the free
 * line-up rotates often enough that any hardcoded choice goes stale. So the
 * server picks: the strongest free model the key can actually reach, chosen
 * live, and the answer says plainly that a paid model will do better.
 *
 * Two rules matter more than the ranking.
 *
 * Reasoning-only models are excluded. Several of the free models emit their
 * working into a `reasoning` field and can spend the entire token budget there
 * without ever producing an answer. Picking one of those automatically would
 * make the product look broken to somebody who has done nothing wrong.
 *
 * The pick is a preference order over families, not a score. Free tiers come
 * and go, so the list is a set of names to look for and the first one present
 * wins; if none of them are there, the free model with the largest context
 * window is used instead.
 */

/**
 * Free model families worth defaulting to, best first.
 *
 * Chosen for instruction-following on technical text rather than for benchmark
 * scores. Matched as substrings, so a version bump on the provider's side does
 * not need a change here.
 */
const PREFERRED_FREE = [
  "llama-3.3-70b",
  "llama-3.1-70b",
  "qwen-2.5-72b",
  "qwen2.5-72b",
  "mistral-nemo",
  "gemma-2-27b",
  "llama-3.1-8b",
];

/**
 * Families that reason into a separate channel and frequently never answer
 * inside a normal token budget. Excluded from automatic selection; a user who
 * deliberately picks one still gets it.
 */
const REASONING_ONLY = ["deepseek-r1", "-r1", "qwq", "thinking", "reasoner", "o1-", "o3-"];

function isReasoningOnly(id: string): boolean {
  const lower = id.toLowerCase();
  return REASONING_ONLY.some((marker) => lower.includes(marker));
}

export interface AutoPick {
  model: string;
  label: string;
  /** True when this was chosen for the user rather than by them. */
  automatic: true;
  /** Shown once, so the user knows a better option exists. */
  notice: string;
}

/**
 * Pick a free model for a provider that has one.
 *
 * Returns null when the provider exposes no usable free model, which is the
 * case for every provider except OpenRouter. The caller then falls back to
 * asking the user to choose, which is the honest outcome: we cannot spend their
 * money on a paid model without being told to.
 */
export async function pickFreeModel(
  provider: Provider,
  creds: Credentials,
): Promise<AutoPick | null> {
  let models: ModelInfo[];
  try {
    models = await provider.listModels(creds);
  } catch {
    // A listing failure is not worth failing the chat over; the caller will ask
    // the user to choose a model instead.
    return null;
  }

  const free = models.filter((m) => m.free && !isReasoningOnly(m.id));
  if (free.length === 0) return null;

  const preferred = PREFERRED_FREE.map((name) =>
    free.find((m) => m.id.toLowerCase().includes(name)),
  ).find((m): m is ModelInfo => m !== undefined);

  const chosen =
    preferred ??
    free.reduce((best, m) => ((m.contextTokens ?? 0) > (best.contextTokens ?? 0) ? m : best));

  return {
    model: chosen.id,
    label: chosen.label,
    automatic: true,
    notice:
      "Running on a free model, so answers may be slower and less precise. Connect a paid model in Settings for noticeably better results.",
  };
}
