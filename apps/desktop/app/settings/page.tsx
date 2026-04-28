"use client";

import { DesktopShell } from "@/components/desktop-shell";
import {
  type ActivationRecord,
  type OllamaModelsResponse,
  licenceActivate,
  licenceStatus,
  ollamaModels,
  settingsLoad,
  settingsSave,
} from "@/lib/invoke";
import { Button, Input } from "@ladx/ui";
import { type FormEvent, useEffect, useState } from "react";

export default function SettingsPage() {
  const [licence, setLicence] = useState<ActivationRecord | null>(null);
  const [licenceKey, setLicenceKey] = useState("");
  const [activating, setActivating] = useState(false);
  const [activationError, setActivationError] = useState<string | null>(null);

  const [modelsResp, setModelsResp] = useState<OllamaModelsResponse | null>(null);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [savingModel, setSavingModel] = useState(false);
  const [savedNote, setSavedNote] = useState<string | null>(null);

  useEffect(() => {
    licenceStatus()
      .then((r) => setLicence(r))
      .catch(() => {});

    Promise.all([settingsLoad(), ollamaModels()])
      .then(([s, r]) => {
        setModelsResp(r);
        setSelectedModel(s.defaultModel ?? r.suggested ?? r.models[0]?.name ?? "");
      })
      .catch((err) => {
        setModelsError(err instanceof Error ? err.message : "Ollama not reachable");
      });
  }, []);

  async function persistModel(name: string) {
    setSelectedModel(name);
    setSavingModel(true);
    setSavedNote(null);
    try {
      await settingsSave({ defaultModel: name });
      setSavedNote("Saved.");
      setTimeout(() => setSavedNote(null), 1500);
    } catch (err) {
      setSavedNote(`Save failed: ${err instanceof Error ? err.message : "unknown"}`);
    } finally {
      setSavingModel(false);
    }
  }

  async function activate(e: FormEvent) {
    e.preventDefault();
    if (!licenceKey || activating) return;
    setActivating(true);
    setActivationError(null);
    try {
      const record = await licenceActivate(licenceKey);
      setLicence(record);
      setLicenceKey("");
    } catch (err) {
      setActivationError(err instanceof Error ? err.message : "activation failed");
    } finally {
      setActivating(false);
    }
  }

  return (
    <DesktopShell>
      <div className="p-8 max-w-3xl mx-auto space-y-6">
        <header>
          <h1 className="text-3xl font-semibold tracking-tight mb-1">Settings</h1>
          <p className="text-ink-500 text-sm">Licence, model, and storage paths.</p>
        </header>

        <section className="border border-ink-100 rounded-lg p-6 space-y-4">
          <div>
            <h2 className="text-lg font-semibold">Licence</h2>
            {licence ? (
              <p className="text-sm text-ink-500 mt-1">
                Activated · {licence.productTier} · key …{licence.licenceKeyLast4} · expires{" "}
                {formatDate(licence.expiresAt)}
              </p>
            ) : (
              <p className="text-sm text-ink-500 mt-1">
                Not activated. Activation contacts <code>auth.ladx.ai</code> exactly once. After
                that, ladX Studio runs entirely offline.
              </p>
            )}
          </div>
          {!licence && (
            <form onSubmit={activate} className="space-y-3 max-w-md">
              <div>
                <label htmlFor="licenceKey" className="block text-xs font-medium text-ink-700 mb-1">
                  Licence key
                </label>
                <Input
                  id="licenceKey"
                  value={licenceKey}
                  onChange={(e) => setLicenceKey(e.target.value)}
                  placeholder="LADX-XXXX-XXXX-XXXX"
                  required
                />
              </div>
              {activationError && (
                <div className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
                  {activationError}
                </div>
              )}
              <Button type="submit" variant="primary" disabled={activating}>
                {activating ? "Activating…" : "Activate"}
              </Button>
            </form>
          )}
        </section>

        <section className="border border-ink-100 rounded-lg p-6 space-y-4">
          <div>
            <h2 className="text-lg font-semibold">Ollama model</h2>
            <p className="text-sm text-ink-500 mt-1">
              Model used for chat + ladder generation. Larger models are slower but produce better
              PLC code. Recommended: Qwen2.5-Coder 14B or 32B.
            </p>
          </div>
          {modelsError ? (
            <div className="rounded-md border border-warning/30 bg-warning/5 px-4 py-3 text-sm text-warning">
              {modelsError}. Install Ollama from{" "}
              <a
                href="https://ollama.com/download"
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                ollama.com
              </a>{" "}
              and run <code>ollama serve</code>.
            </div>
          ) : modelsResp && modelsResp.models.length === 0 ? (
            <div className="rounded-md border border-ink-100 bg-ink-50 px-4 py-3 text-sm text-ink-500">
              No models pulled yet. Run e.g.{" "}
              <code className="bg-white px-1 rounded">ollama pull qwen2.5-coder:14b</code> in a
              terminal.
            </div>
          ) : modelsResp ? (
            <div className="space-y-2">
              <select
                value={selectedModel}
                onChange={(e) => persistModel(e.target.value)}
                disabled={savingModel}
                className="w-full max-w-md rounded-md border border-ink-200 bg-white px-3 py-2 text-sm"
              >
                {modelsResp.models.map((m) => (
                  <option key={m.name} value={m.name}>
                    {m.name} · {formatBytes(m.sizeBytes)}
                  </option>
                ))}
              </select>
              {modelsResp.suggested && (
                <p className="text-xs text-ink-500">
                  Suggested default: <code>{modelsResp.suggested}</code>
                </p>
              )}
              {savedNote && <p className="text-xs text-teal-500">{savedNote}</p>}
            </div>
          ) : (
            <p className="text-sm text-ink-500">Checking…</p>
          )}
        </section>
      </div>
    </DesktopShell>
  );
}

function formatDate(iso: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return iso;
  }
}

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = b / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(1)} ${units[i]}`;
}
