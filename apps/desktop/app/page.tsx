"use client";

import { ProjectsList } from "@/components/projects-list";
import { UploadProjectButton } from "@/components/upload-project-button";
import {
  type ActivationRecord,
  type OllamaStatus,
  licenceStatus,
  ollamaStatus,
} from "@/lib/invoke";
import { AlertTriangle, Check, Loader2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

interface Probe {
  loading: boolean;
  ollama: OllamaStatus | null;
  licence: ActivationRecord | null;
  error: string | null;
}

export default function HomePage() {
  const [probe, setProbe] = useState<Probe>({
    loading: true,
    ollama: null,
    licence: null,
    error: null,
  });

  useEffect(() => {
    let live = true;
    Promise.all([ollamaStatus(), licenceStatus()])
      .then(([o, l]) => {
        if (!live) return;
        setProbe({ loading: false, ollama: o, licence: l, error: null });
      })
      .catch((err) => {
        if (!live) return;
        setProbe({
          loading: false,
          ollama: null,
          licence: null,
          error: err instanceof Error ? err.message : "probe failed",
        });
      });
    return () => {
      live = false;
    };
  }, []);

  return (
    <div className="relative min-h-0 flex-1 overflow-y-auto">
      <div className="p-8 max-w-3xl mx-auto space-y-6">
        <header>
          <h1 className="text-3xl font-semibold tracking-tight mb-1">ladX Studio</h1>
          <p className="text-ink-500 text-sm">
            Local-first PLC AI agent · Ollama for inference · air-gapped after activation
          </p>
        </header>

        {probe.error && (
          <div className="rounded-md border border-danger bg-danger-bg px-4 py-3 text-sm text-danger">
            {probe.error}
          </div>
        )}

        <StatusCard
          title="Ollama"
          loading={probe.loading}
          ok={!!probe.ollama?.running}
          okMessage={
            probe.ollama
              ? `Running at ${probe.ollama.baseUrl} · ${probe.ollama.modelCount} model${probe.ollama.modelCount === 1 ? "" : "s"} installed`
              : ""
          }
          failMessage={
            probe.ollama?.error ??
            "Not detected on localhost:11434. Install Ollama and run `ollama serve`."
          }
          action={
            <a
              href="https://ollama.com/download"
              target="_blank"
              rel="noreferrer"
              className="text-xs text-teal-700 hover:text-teal-800"
            >
              Get Ollama →
            </a>
          }
        />

        <StatusCard
          title="Licence"
          loading={probe.loading}
          ok={!!probe.licence}
          okMessage={
            probe.licence
              ? `${probe.licence.productTier} · key …${probe.licence.licenceKeyLast4} · expires ${formatDate(probe.licence.expiresAt)}`
              : ""
          }
          failMessage="Not activated. Enter your licence key in Settings."
          action={
            <Link href="/settings" className="text-xs text-teal-700 hover:text-teal-800">
              Open settings →
            </Link>
          }
        />

        <section>
          <div className="flex items-end justify-between mb-3">
            <div>
              {/* Not "Projects": a project is the folder on disk under
                  Workspace, and two things by that name is a person opening the
                  wrong one. These are the vendor files that have been read. */}
              <h2 className="text-lg font-semibold">Imported programs</h2>
              <p className="text-xs text-ink-500">
                L5X (Rockwell) and PLCopen TC6 .xml. Read on this machine, nothing uploaded.
              </p>
            </div>
            <UploadProjectButton />
          </div>
          <ProjectsList />
        </section>
      </div>
    </div>
  );
}

function StatusCard({
  title,
  loading,
  ok,
  okMessage,
  failMessage,
  action,
}: {
  title: string;
  loading: boolean;
  ok: boolean;
  okMessage: string;
  failMessage: string;
  action?: React.ReactNode;
}) {
  return (
    <section className="border border-ink-100 rounded-lg p-5 flex items-start gap-4">
      <div
        className={`h-9 w-9 rounded-md flex items-center justify-center shrink-0 ${
          loading
            ? "bg-ink-100 text-ink-500"
            : ok
              ? "bg-success-bg text-success"
              : "bg-warning-bg text-warning"
        }`}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : ok ? (
          <Check className="h-4 w-4" />
        ) : (
          <AlertTriangle className="h-4 w-4" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-medium text-ink-900">{title}</p>
        <p className="text-sm text-ink-500">
          {loading ? "Checking…" : ok ? okMessage : failMessage}
        </p>
      </div>
      {action && <div className="shrink-0">{action}</div>}
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
