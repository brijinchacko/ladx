// GET  /api/providers — what this user has connected (never a secret)
// POST /api/providers — connect or replace a key, verifying it first
// DELETE /api/providers?kind=… — disconnect

import { getApiUser } from "@/lib/auth/server";
import {
  deleteProviderKey,
  listProviders,
  saveProviderKey,
  setDefaultModel,
} from "@/lib/db/provider-keys";
import { ProviderError, getProvider } from "@/lib/providers";
import { z } from "zod";

const kindSchema = z.enum(["openrouter", "anthropic", "openai", "custom"]);

export async function GET() {
  const auth = await getApiUser();
  if ("error" in auth) return auth.error;
  const user = auth.user;
  return Response.json({ providers: await listProviders(user.id) });
}

const connectSchema = z.object({
  kind: kindSchema,
  apiKey: z.string().min(1).max(512),
  baseUrl: z.string().url().optional(),
  defaultModel: z.string().max(200).optional(),
});

export async function POST(req: Request) {
  const auth = await getApiUser();
  if ("error" in auth) return auth.error;
  const user = auth.user;

  let body: z.infer<typeof connectSchema>;
  try {
    body = connectSchema.parse(await req.json());
  } catch {
    return Response.json({ error: "invalid request" }, { status: 400 });
  }

  const provider = getProvider(body.kind);

  // Shape first: a typo'd key should fail in milliseconds, not after a round
  // trip that also tells the provider about it.
  const shapeError = provider.validateKeyFormat(body.apiKey);
  if (shapeError) return Response.json({ error: shapeError }, { status: 400 });

  if (body.kind === "custom" && !body.baseUrl) {
    return Response.json(
      { error: "A base URL is required for a custom provider." },
      { status: 400 },
    );
  }

  // Then prove the key actually authenticates. This must be verify() and not
  // listModels(): OpenRouter serves its catalogue publicly, so listing succeeds
  // for any string and would have stored a dead key with a green tick beside it.
  const creds = { apiKey: body.apiKey, baseUrl: body.baseUrl };
  let models: Awaited<ReturnType<typeof provider.listModels>>;
  try {
    await provider.verify(creds);
    models = await provider.listModels(creds);
  } catch (err) {
    if (err instanceof ProviderError) {
      return Response.json({ error: err.userMessage, kind: err.kind }, { status: 400 });
    }
    return Response.json({ error: "Could not verify that key." }, { status: 400 });
  }

  if (!models.length) {
    return Response.json(
      { error: "The key worked, but no models are available on it." },
      { status: 400 },
    );
  }

  // Default to a free model when there is one, so a new user can send a message
  // without first understanding a model list.
  const fallback = models.find((m) => m.free) ?? models[0];
  await saveProviderKey({
    userId: user.id,
    kind: body.kind,
    apiKey: body.apiKey,
    baseUrl: body.baseUrl ?? null,
    defaultModel: body.defaultModel ?? fallback?.id ?? null,
    verified: true,
  });

  return Response.json({ ok: true, models });
}

const modelSchema = z.object({ kind: kindSchema, model: z.string().min(1).max(200) });

export async function PATCH(req: Request) {
  const auth = await getApiUser();
  if ("error" in auth) return auth.error;
  const user = auth.user;

  let body: z.infer<typeof modelSchema>;
  try {
    body = modelSchema.parse(await req.json());
  } catch {
    return Response.json({ error: "invalid request" }, { status: 400 });
  }

  await setDefaultModel(user.id, body.kind, body.model);
  return Response.json({ ok: true });
}

export async function DELETE(req: Request) {
  const auth = await getApiUser();
  if ("error" in auth) return auth.error;
  const user = auth.user;

  const parsed = kindSchema.safeParse(new URL(req.url).searchParams.get("kind"));
  if (!parsed.success) return Response.json({ error: "unknown provider" }, { status: 400 });

  await deleteProviderKey(user.id, parsed.data);
  return Response.json({ ok: true });
}
