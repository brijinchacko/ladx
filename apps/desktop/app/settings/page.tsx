"use client";

import {
  type ActivationRecord,
  type OllamaModelsResponse,
  licenceActivate,
  licenceStatus,
  ollamaModels,
  setCheckForUpdates,
  settingsLoad,
  settingsSave,
} from "@/lib/invoke";
import { type UpdateFound, lookForUpdate } from "@/lib/updates";
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
    <div className="relative min-h-0 flex-1 overflow-y-auto">
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

        <UpdatesSection />
      </div>
    </div>
  );
}

/**
 * Updates, off unless somebody turns them on.
 *
 * The default is the product rather than a preference. This app is sold on
 * making no outbound call, and a plant that has air gapped the machine has to
 * be able to rely on that without reading the source. So the switch says
 * plainly what turning it on does, and the button beside it checks once
 * without turning anything on, because "is there a new version" is a fair
 * question to ask without agreeing to be asked every launch.
 */
function UpdatesSection() {
  const [enabled, setEnabled] = useState(false);
  const [checking, setChecking] = useState(false);
  const [found, setFound] = useState<UpdateFound | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    settingsLoad()
      .then((s) => setEnabled(Boolean(s.checkForUpdates)))
      .catch(() => {});
  }, []);

  const toggle = async (next: boolean) => {
    setEnabled(next);
    await setCheckForUpdates(next).catch(() => {});
  };

  const checkNow = async () => {
    setChecking(true);
    setNote(null);
    setFound(null);
    try {
      const update = await lookForUpdate(true);
      if (update) setFound(update);
      else setNote("You are on the latest version.");
    } catch (err) {
      setNote(
        err instanceof Error
          ? `Could not check: ${err.message}`
          : "Could not reach ladx.ai to check.",
      );
    } finally {
      setChecking(false);
    }
  };

  return (
    <section className="space-y-4 rounded-lg border border-ink-100 p-6">
      <div>
        <h2 className="text-lg font-semibold">Updates</h2>
        <p className="mt-1 text-sm text-ink-500">
          Off by default, and it stays off until you say otherwise. Turned on, LADX asks ladx.ai
          once per launch whether there is a newer version. That and the licence check are the only
          times this application uses the network. Every update is signed, and one that is not is
          refused before anything is written to disk.
        </p>
      </div>

      <label className="flex items-start gap-3" htmlFor="check-updates">
        <input
          id="check-updates"
          type="checkbox"
          checked={enabled}
          onChange={(e) => void toggle(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0"
        />
        <span className="text-sm text-ink-700">
          Look for a new version when LADX starts
          <span className="mt-0.5 block text-xs text-ink-500">
            Leave this off on a machine that is not supposed to reach the internet.
          </span>
        </span>
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void checkNow()}
          disabled={checking || installing}
          className="rounded-md border border-ink-200 px-3 py-2 text-sm text-ink-700 hover:bg-ink-50 disabled:opacity-50"
        >
          {checking ? "Checking…" : "Check now"}
        </button>
        {note && <p className="text-xs text-ink-500">{note}</p>}
      </div>

      {found && (
        <div className="rounded-md border border-teal-500/40 bg-teal-500/5 p-4">
          <p className="text-sm font-medium text-ink-900">
            Version {found.version} is available
            {found.date ? ` · ${found.date.slice(0, 10)}` : ""}
          </p>
          {found.notes && (
            <p className="mt-1 whitespace-pre-wrap text-[12.5px] leading-relaxed text-ink-600">
              {found.notes}
            </p>
          )}
          <button
            type="button"
            disabled={installing}
            onClick={() => {
              setInstalling(true);
              found
                .install()
                .catch((err) =>
                  setNote(
                    err instanceof Error ? err.message : "The update could not be installed.",
                  ),
                )
                .finally(() => setInstalling(false));
            }}
            className="mt-3 rounded-md bg-teal-500 px-3 py-2 text-sm font-medium text-white hover:bg-teal-600 disabled:opacity-50"
          >
            {installing ? "Installing…" : "Download and install"}
          </button>
          <p className="mt-2 text-[11.5px] text-ink-500">
            LADX closes and reopens itself once it is done. Save your work first.
          </p>
        </div>
      )}
    </section>
  );
}

function formatDate(iso: string): string {
  if (!iso) return "-";
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
