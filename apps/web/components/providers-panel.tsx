"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Connecting an AI provider.
 *
 * The whole product runs on the user's own key, so this screen is the first
 * thing that has to work. It is built around one assumption: the person in
 * front of it has never used OpenRouter and does not want to read about it.
 * So the free path is the default, the instruction is one sentence, and the
 * key is verified live before it is stored. Nobody should discover that they
 * pasted the wrong thing three screens later when a message fails.
 */

type Kind = "openrouter" | "anthropic" | "openai" | "custom";

interface Connected {
  id: string;
  kind: Kind;
  masked: string;
  baseUrl: string | null;
  defaultModel: string | null;
  verifiedAt: string | null;
}

interface Model {
  id: string;
  label: string;
  free?: boolean;
  contextTokens?: number;
}

const PROVIDERS: { kind: Kind; label: string; hint: string; free?: boolean }[] = [
  {
    kind: "openrouter",
    label: "OpenRouter",
    hint: "Sign up at openrouter.ai/keys with an email. No card. Its free models cost nothing to run.",
    free: true,
  },
  { kind: "anthropic", label: "Anthropic", hint: "A key from console.anthropic.com." },
  { kind: "openai", label: "OpenAI", hint: "A key from platform.openai.com/api-keys." },
  {
    kind: "custom",
    label: "Custom",
    hint: "Anything speaking the OpenAI API: Groq, Together, a gateway, or a local Ollama at http://localhost:11434/v1.",
  },
];

export function ProvidersPanel() {
  const [connected, setConnected] = useState<Connected[]>([]);
  const [loading, setLoading] = useState(true);
  const [openKind, setOpenKind] = useState<Kind | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/providers");
      if (res.ok) {
        const d = (await res.json()) as { providers: Connected[] };
        setConnected(d.providers ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return <p className="py-6 text-sm text-ink-400">Loading…</p>;
  }

  return (
    <div className="space-y-3">
      {PROVIDERS.map((p) => {
        const conn = connected.find((c) => c.kind === p.kind);
        return (
          <ProviderRow
            key={p.kind}
            provider={p}
            connected={conn}
            expanded={openKind === p.kind}
            onToggle={() => setOpenKind(openKind === p.kind ? null : p.kind)}
            onChanged={load}
          />
        );
      })}
    </div>
  );
}

function ProviderRow({
  provider,
  connected,
  expanded,
  onToggle,
  onChanged,
}: {
  provider: (typeof PROVIDERS)[number];
  connected?: Connected;
  expanded: boolean;
  onToggle: () => void;
  onChanged: () => void;
}) {
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState(connected?.baseUrl ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [models, setModels] = useState<Model[]>([]);
  const [model, setModel] = useState(connected?.defaultModel ?? "");

  const loadModels = useCallback(async () => {
    const res = await fetch(`/api/providers/models?kind=${provider.kind}`);
    if (!res.ok) return;
    const d = (await res.json()) as { models: Model[]; defaultModel: string | null };
    setModels(d.models ?? []);
    if (d.defaultModel) setModel(d.defaultModel);
  }, [provider.kind]);

  useEffect(() => {
    if (expanded && connected) loadModels();
  }, [expanded, connected, loadModels]);

  async function connect() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: provider.kind,
          apiKey,
          ...(provider.kind === "custom" ? { baseUrl } : {}),
        }),
      });
      const d = (await res.json()) as { error?: string; models?: Model[] };
      if (!res.ok) {
        setError(d.error ?? "Could not connect that.");
        return;
      }
      setModels(d.models ?? []);
      setApiKey("");
      onChanged();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    try {
      await fetch(`/api/providers?kind=${provider.kind}`, { method: "DELETE" });
      setModels([]);
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function chooseModel(next: string) {
    setModel(next);
    await fetch("/api/providers", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: provider.kind, model: next }),
    });
  }

  const field =
    "w-full rounded-sm border border-ink-200 bg-white px-3 py-2 text-[14px] text-ink-900 placeholder:text-ink-300 focus:border-ink-500 focus:outline-none focus:ring-1 focus:ring-ink-500";

  return (
    <div className="rounded-sm border border-ink-100">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
        aria-expanded={expanded}
      >
        <span className="text-[15px] font-semibold text-ink-900">{provider.label}</span>
        {provider.free && !connected && (
          <span className="rounded-sm border border-teal-300 bg-teal-50 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-teal-700">
            Free tier
          </span>
        )}
        {connected ? (
          <span className="ml-auto flex items-center gap-2 font-mono text-[12px] text-ink-500">
            <span className="h-1.5 w-1.5 rounded-full bg-teal-500" aria-hidden="true" />
            {connected.masked}
          </span>
        ) : (
          <span className="ml-auto text-[13px] text-ink-400">Not connected</span>
        )}
      </button>

      {expanded && (
        <div className="space-y-4 border-t border-ink-100 px-4 py-4">
          <p className="text-[13.5px] leading-relaxed text-ink-500">{provider.hint}</p>

          {provider.kind === "custom" && (
            <div>
              <label
                htmlFor={`url-${provider.kind}`}
                className="mb-1.5 block text-[13px] font-medium text-ink-700"
              >
                Base URL
              </label>
              <input
                id={`url-${provider.kind}`}
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="http://localhost:11434/v1"
                className={field}
              />
            </div>
          )}

          <div>
            <label
              htmlFor={`key-${provider.kind}`}
              className="mb-1.5 block text-[13px] font-medium text-ink-700"
            >
              {connected ? "Replace key" : "API key"}
            </label>
            <div className="flex gap-2">
              <input
                id={`key-${provider.kind}`}
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={connected ? "Paste a new key to replace it" : "Paste your key"}
                className={field}
                autoComplete="off"
              />
              <button
                type="button"
                onClick={connect}
                disabled={busy || !apiKey}
                className="shrink-0 rounded-sm bg-ink-900 px-4 py-2 text-[14px] font-semibold text-white disabled:opacity-40"
              >
                {busy ? "Checking…" : "Connect"}
              </button>
            </div>
            <p className="mt-1.5 text-[12px] text-ink-400">
              Encrypted before it is stored, and never sent anywhere except your provider.
            </p>
          </div>

          {error && (
            <p className="text-[13.5px] text-danger" role="alert">
              {error}
            </p>
          )}

          {connected && models.length > 0 && (
            <div>
              <label
                htmlFor={`model-${provider.kind}`}
                className="mb-1.5 block text-[13px] font-medium text-ink-700"
              >
                Default model
                <span className="ml-2 font-normal text-ink-400">
                  {models.length} available on this key
                </span>
              </label>
              <select
                id={`model-${provider.kind}`}
                value={model}
                onChange={(e) => chooseModel(e.target.value)}
                className={field}
              >
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.free ? "★ free · " : ""}
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {connected && (
            <button
              type="button"
              onClick={disconnect}
              disabled={busy}
              className="text-[13px] text-danger hover:underline"
            >
              Disconnect
            </button>
          )}
        </div>
      )}
    </div>
  );
}
