// GET /api/providers/models?kind=… — models this user's key can reach.
//
// Live from the provider rather than a hardcoded list, because free model
// line-ups rotate without notice and a stale list offers people models that
// return 404.

import { getApiUser } from "@/lib/auth/server";
import { credentialsFor } from "@/lib/db/provider-keys";
import { ProviderError, getProvider } from "@/lib/providers";
import { z } from "zod";

const kindSchema = z.enum(["openrouter", "anthropic", "openai", "custom"]);

export async function GET(req: Request) {
  const auth = await getApiUser();
  if ("error" in auth) return auth.error;
  const user = auth.user;

  const parsed = kindSchema.safeParse(new URL(req.url).searchParams.get("kind"));
  if (!parsed.success) return Response.json({ error: "unknown provider" }, { status: 400 });

  const creds = await credentialsFor(user.id, parsed.data);
  if (!creds) return Response.json({ error: "not connected" }, { status: 404 });

  try {
    const models = await getProvider(parsed.data).listModels(creds);
    return Response.json({ models, defaultModel: creds.defaultModel });
  } catch (err) {
    if (err instanceof ProviderError) {
      return Response.json({ error: err.userMessage, kind: err.kind }, { status: 502 });
    }
    return Response.json({ error: "Could not list models." }, { status: 502 });
  }
}
