// GET /api/models, what this user can actually pick from in the composer.
//
// One endpoint rather than the caller working it out. Which models are
// reachable depends on whether the user has connected a key and, if not,
// whether the platform's shared free tier is configured, and the composer has
// no business knowing any of that.

import { getApiUser } from "@/lib/auth/server";
import { credentialsFor, preferredProvider } from "@/lib/db/provider-keys";
import { ProviderError, getProvider } from "@/lib/providers";
import { platformKey, rankFreeModels } from "@/lib/providers/free-tier";
import type { ModelInfo } from "@/lib/providers/types";

export interface ModelChoice {
  id: string;
  label: string;
  free: boolean;
  contextTokens?: number;
}

export interface ModelsResponse {
  /** Where these came from, said plainly enough to put on screen. */
  source: "your key" | "free tier" | "none";
  provider: string | null;
  /** What Auto resolves to, described rather than named: it is chosen per request. */
  autoNote: string;
  /** The user's saved default, which Auto honours when there is one. */
  defaultModel: string | null;
  models: ModelChoice[];
}

function toChoice(m: ModelInfo): ModelChoice {
  return {
    id: m.id,
    label: m.label || m.id,
    free: Boolean(m.free),
    ...(m.contextTokens ? { contextTokens: m.contextTokens } : {}),
  };
}

export async function GET() {
  const auth = await getApiUser();
  if ("error" in auth) return auth.error;

  const preferred = await preferredProvider(auth.user.id);

  // The user's own key wins. It is what they are paying for, and its line-up is
  // the one they expect to see.
  if (preferred) {
    const creds = await credentialsFor(auth.user.id, preferred.kind);
    if (creds) {
      try {
        const models = await getProvider(preferred.kind).listModels(creds);
        const body: ModelsResponse = {
          source: "your key",
          provider: preferred.kind,
          autoNote: preferred.defaultModel
            ? `Uses your default, ${preferred.defaultModel}.`
            : "Lets the provider choose.",
          defaultModel: preferred.defaultModel,
          models: models.map(toChoice),
        };
        return Response.json(body);
      } catch (err) {
        // A provider that will not answer must not take the composer down with
        // it: Auto still works, because the server picks at send time.
        const message =
          err instanceof ProviderError ? err.userMessage : "Could not reach that provider.";
        const body: ModelsResponse = {
          source: "your key",
          provider: preferred.kind,
          autoNote: message,
          defaultModel: preferred.defaultModel,
          models: [],
        };
        return Response.json(body);
      }
    }
  }

  // No key of their own: the shared free tier, if it is configured.
  const key = platformKey();
  if (!key) {
    const body: ModelsResponse = {
      source: "none",
      provider: null,
      autoNote: "Connect a provider in Settings to choose a model.",
      defaultModel: null,
      models: [],
    };
    return Response.json(body);
  }

  try {
    const all = await getProvider("openrouter").listModels({ apiKey: key });
    const body: ModelsResponse = {
      source: "free tier",
      provider: "openrouter",
      autoNote:
        "Tries the healthiest free model first and falls through if it is busy. Recommended.",
      defaultModel: null,
      models: rankFreeModels(all).map(toChoice),
    };
    return Response.json(body);
  } catch {
    const body: ModelsResponse = {
      source: "free tier",
      provider: "openrouter",
      autoNote: "Picks a free model when you send.",
      defaultModel: null,
      models: [],
    };
    return Response.json(body);
  }
}
