"use client";

import type { ValidatorDiagnostic, ValidatorReport } from "@ladx/types";
import { AlertTriangle, Check, Copy, Loader2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "../../lib/cn";

export interface CodeBlockProps {
  language: string;
  source: string;
  /** When true, the component runs the validator on mount + on source change. */
  autoValidate?: boolean;
  /** Hand the source off to the host's API route; defaults to /api/validate-code. */
  validateEndpoint?: string;
  /** Called when the user accepts; the host persists. */
  onAccept?: (source: string, report: ValidatorReport | null) => void;
  className?: string;
}

type State =
  | { kind: "idle" }
  | { kind: "validating" }
  | { kind: "ok"; report: ValidatorReport }
  | { kind: "fail"; report: ValidatorReport }
  | { kind: "error"; message: string };

export function CodeBlock({
  language,
  source,
  autoValidate = true,
  validateEndpoint = "/api/validate-code",
  onAccept,
  className,
}: CodeBlockProps) {
  const [state, setState] = useState<State>({ kind: "idle" });
  const [copied, setCopied] = useState(false);
  const lastSourceRef = useRef<string>("");

  useEffect(() => {
    if (!autoValidate || !isValidatableLang(language)) return;
    if (lastSourceRef.current === source) return;
    lastSourceRef.current = source;

    setState({ kind: "validating" });
    const ctrl = new AbortController();
    fetch(validateEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ language: language.toLowerCase(), source }),
      signal: ctrl.signal,
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`validator request failed (${res.status})`);
        const data = (await res.json()) as { report: ValidatorReport };
        setState({ kind: data.report.ok ? "ok" : "fail", report: data.report });
      })
      .catch((err) => {
        if (err?.name === "AbortError") return;
        setState({
          kind: "error",
          message: err instanceof Error ? err.message : "validator failed",
        });
      });
    return () => ctrl.abort();
  }, [source, language, autoValidate, validateEndpoint]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(source);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard denied */
    }
  }

  function reportFor(): ValidatorReport | null {
    if (state.kind === "ok" || state.kind === "fail") return state.report;
    return null;
  }

  return (
    <div className={cn("rounded-md border border-ink-100 overflow-hidden bg-ink-50", className)}>
      <div className="flex items-center justify-between px-3 py-2 bg-white border-b border-ink-100 text-xs">
        <div className="flex items-center gap-2">
          <span className="font-mono text-ink-500 uppercase tracking-wide">{language}</span>
          <ValidatorBadge state={state} />
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={copy}
            className="text-ink-500 hover:text-ink-900 px-2 py-1 rounded hover:bg-ink-50 inline-flex items-center gap-1"
            aria-label="Copy"
          >
            <Copy className="h-3.5 w-3.5" />
            {copied ? "Copied" : "Copy"}
          </button>
          {onAccept && (
            <button
              type="button"
              onClick={() => onAccept(source, reportFor())}
              className="text-teal-600 hover:text-teal-700 px-2 py-1 rounded hover:bg-teal-50 inline-flex items-center gap-1 font-medium"
            >
              <Check className="h-3.5 w-3.5" />
              Accept
            </button>
          )}
        </div>
      </div>
      <pre className="m-0 p-3 text-sm leading-relaxed overflow-x-auto font-mono text-ink-900 whitespace-pre">
        <code>{source}</code>
      </pre>
      {(state.kind === "fail" || state.kind === "error") && <DiagnosticsList state={state} />}
    </div>
  );
}

function ValidatorBadge({ state }: { state: State }) {
  switch (state.kind) {
    case "idle":
      return null;
    case "validating":
      return (
        <span className="inline-flex items-center gap-1 text-ink-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Validating…
        </span>
      );
    case "ok":
      return (
        <span className="inline-flex items-center gap-1 text-success">
          <Check className="h-3.5 w-3.5" />
          {state.report.backend} OK
        </span>
      );
    case "fail":
      return (
        <span className="inline-flex items-center gap-1 text-danger">
          <X className="h-3.5 w-3.5" />
          {state.report.backend} {state.report.diagnostics.length} issue
          {state.report.diagnostics.length === 1 ? "" : "s"}
        </span>
      );
    case "error":
      return (
        <span className="inline-flex items-center gap-1 text-warning" title={state.message}>
          <AlertTriangle className="h-3.5 w-3.5" />
          Validator unavailable
        </span>
      );
  }
}

function DiagnosticsList({
  state,
}: {
  state: Extract<State, { kind: "fail" } | { kind: "error" }>;
}) {
  if (state.kind === "error") {
    return (
      <div className="px-3 py-2 text-xs bg-warning/10 text-warning border-t border-ink-100">
        {state.message}
      </div>
    );
  }
  return (
    <ul className="text-xs bg-danger/5 border-t border-danger/20 divide-y divide-danger/10">
      {state.report.diagnostics.map((d, i) => (
        <DiagItem key={`${d.source}-${d.line}-${d.column}-${i}`} d={d} />
      ))}
    </ul>
  );
}

function DiagItem({ d }: { d: ValidatorDiagnostic }) {
  return (
    <li className="px-3 py-2 flex items-start gap-2">
      <span className="text-danger font-mono shrink-0">{d.line > 0 ? `L${d.line}` : "—"}</span>
      <span className="text-ink-900 flex-1">{d.message}</span>
      <span className="text-ink-400 font-mono shrink-0">{d.source}</span>
    </li>
  );
}

function isValidatableLang(lang: string): boolean {
  return lang.toLowerCase() === "st";
}
