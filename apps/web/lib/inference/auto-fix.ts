// Closes the spec §8.1 loop: when the validator rejects generated ST,
// re-prompt the model with the validator output and ask for a fix. Up to
// `MAX_ATTEMPTS` retries; if every attempt fails, return the last attempt
// + its diagnostics so the user can intervene.

import type { ValidatorReport } from "@ladx/types";
import { type ChatMessage, streamChat } from "./openrouter";

export const MAX_ATTEMPTS = 3;

/**
 * Build the retry prompt. Tightly worded to keep the model from drifting
 * into commentary — "return ONLY the corrected ST in a fenced block".
 */
function feedbackPrompt(report: ValidatorReport): string {
  const lines = report.diagnostics
    .slice(0, 30)
    .map((d) => {
      const loc =
        d.line > 0 ? `line ${d.line}${d.column > 0 ? `, col ${d.column}` : ""}` : "(unknown loc)";
      return `- [${d.severity}] ${loc}: ${d.message} (${d.source})`;
    })
    .join("\n");
  const more =
    report.diagnostics.length > 30
      ? `\n…and ${report.diagnostics.length - 30} more diagnostics.`
      : "";
  return [
    `The previous ST output failed validation (${report.backend} backend).`,
    "",
    "Diagnostics:",
    lines + more,
    "",
    "Fix every diagnostic above and return the corrected routine.",
    "Reply with ONLY one ```st code block — no commentary, no markdown around it.",
  ].join("\n");
}

/**
 * Pull the first ```st (or ```structured-text) fenced block out of an
 * assistant message. If the model ignored our instruction and didn't
 * fence the code, fall back to the whole text.
 */
export function extractStBlock(content: string): string {
  const re = /```(?:st|structured-text|iec)\n([\s\S]*?)```/i;
  const m = re.exec(content);
  if (m?.[1]) return m[1].trim();
  // Last-resort: also accept any ``` fenced block.
  const generic = /```[a-zA-Z0-9_-]*\n([\s\S]*?)```/.exec(content);
  if (generic?.[1]) return generic[1].trim();
  return content.trim();
}

async function callModel(messages: ChatMessage[], model: string): Promise<string> {
  let acc = "";
  for await (const delta of streamChat({ model, messages, temperature: 0.2 })) {
    acc += delta;
  }
  return acc;
}

export interface AutoFixAttempt {
  source: string;
  report: ValidatorReport;
}

export interface AutoFixResult {
  ok: boolean;
  attempts: AutoFixAttempt[];
  /** Final source (best effort if all attempts failed). */
  source: string;
  /** Final report. */
  report: ValidatorReport;
}

export interface AutoFixOpts {
  source: string;
  initialReport: ValidatorReport;
  /** Optional system grounding — usually the project manifest prompt. */
  systemPrompt?: string;
  /** Validator callback. Wired to the Rust CLI in production. */
  validate: (source: string) => Promise<ValidatorReport>;
  model?: string;
  maxAttempts?: number;
}

export async function autoFix(opts: AutoFixOpts): Promise<AutoFixResult> {
  const max = opts.maxAttempts ?? MAX_ATTEMPTS;
  const model = opts.model ?? "anthropic/claude-sonnet-4.6";

  const attempts: AutoFixAttempt[] = [];

  let currentSource = opts.source;
  let currentReport = opts.initialReport;
  attempts.push({ source: currentSource, report: currentReport });

  if (currentReport.ok) {
    return { ok: true, attempts, source: currentSource, report: currentReport };
  }

  for (let i = 0; i < max; i++) {
    const messages: ChatMessage[] = [];
    if (opts.systemPrompt) {
      messages.push({ role: "system", content: opts.systemPrompt });
    }
    messages.push({
      role: "user",
      content: [
        "Here is some IEC 61131-3 Structured Text that failed validation:",
        "",
        "```st",
        currentSource,
        "```",
        "",
        feedbackPrompt(currentReport),
      ].join("\n"),
    });

    const raw = await callModel(messages, model);
    const fixed = extractStBlock(raw);
    const report = await opts.validate(fixed);
    attempts.push({ source: fixed, report });

    if (report.ok) {
      return { ok: true, attempts, source: fixed, report };
    }
    currentSource = fixed;
    currentReport = report;
  }

  return {
    ok: false,
    attempts,
    source: currentSource,
    report: currentReport,
  };
}
