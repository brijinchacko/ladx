"use client";

import { DesktopShell } from "@/components/desktop-shell";
import {
  type ActivationRecord,
  type OllamaStatus,
  licenceStatus,
  ollamaStatus,
} from "@/lib/invoke";
import { Button } from "@ladx/ui";
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
    <DesktopShell>
      <div className="p-8 max-w-3xl mx-auto space-y-6">
        <header>
          <h1 className="text-3xl font-semibold tracking-tight mb-1">ladX Studio</h1>
          <p className="text-ink-500 text-sm">
            Local-first PLC AI agent · Ollama for inference · air-gapped after activation
          </p>
        </header>

        {probe.error && (
          <div className="rounded-md border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
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
              className="text-xs text-teal-500 hover:text-teal-600"
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
            <Link href="/settings" className="text-xs text-teal-500 hover:text-teal-600">
              Open settings →
            </Link>
          }
        />

        <section className="border border-ink-100 rounded-lg p-6">
          <h2 className="text-lg font-semibold mb-2">Next steps</h2>
          <p className="text-sm text-ink-500 mb-4">
            Phase 2 is in motion. Project Reader (TIA Openness, Studio 5000, TwinCAT, CODESYS) and
            the ladder generator land in subsequent commits. The validator pipeline is already
            shared with cloud — see <code>ladx-validator</code> in <code>packages/core</code>.
          </p>
          <Link href="/chat">
            <Button variant="primary">Open chat</Button>
          </Link>
        </section>
      </div>
    </DesktopShell>
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
              ? "bg-success/10 text-success"
              : "bg-warning/10 text-warning"
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
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return iso;
  }
}
