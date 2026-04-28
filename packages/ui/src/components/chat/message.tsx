"use client";

import type { ValidatorReport } from "@ladx/types";
import { Bot, User } from "lucide-react";
import { cn } from "../../lib/cn";
import { CodeBlock } from "../code/code-block";

export interface ChatMessageProps {
  role: "user" | "assistant" | "system";
  content: string;
  pending?: boolean;
  /** Optional project id forwarded to <CodeBlock/> for auto-fix grounding. */
  projectId?: string;
  /** Optional validate transport — used on desktop to call a Tauri command. */
  validate?: (source: string) => Promise<ValidatorReport>;
  /** Optional auto-fix transport — used on desktop to call a Tauri command. */
  autoFix?: (input: {
    source: string;
    report: ValidatorReport;
  }) => Promise<{
    ok: boolean;
    source: string;
    report: ValidatorReport;
    attempts: Array<{ source: string; report: ValidatorReport }>;
  }>;
  /** When provided, accepted code blocks are sent here for persistence. */
  onAcceptCode?: (input: {
    language: string;
    source: string;
    report: ValidatorReport | null;
  }) => void;
}

interface Block {
  kind: "text" | "code";
  language?: string;
  body: string;
}

/**
 * Splits assistant content on triple-backtick fences so we can render code
 * with the validator-aware <CodeBlock/>. Fenced blocks are matched
 * non-greedily; an unclosed fence at the end of streaming text is treated
 * as a code block too (so the user sees code rendering as it streams).
 */
function parseBlocks(content: string): Block[] {
  const out: Block[] = [];
  const re = /```([a-zA-Z0-9_-]*)\n([\s\S]*?)(?:```|$)/g;
  let cursor = 0;
  let m: RegExpExecArray | null;
  // biome-ignore lint/suspicious/noAssignInExpressions: classic regex .exec loop
  while ((m = re.exec(content)) !== null) {
    if (m.index > cursor) {
      out.push({ kind: "text", body: content.slice(cursor, m.index) });
    }
    out.push({
      kind: "code",
      language: m[1] || "text",
      body: m[2] ?? "",
    });
    cursor = m.index + m[0].length;
  }
  if (cursor < content.length) {
    out.push({ kind: "text", body: content.slice(cursor) });
  }
  return out;
}

export function ChatMessage({
  role,
  content,
  pending,
  projectId,
  validate,
  autoFix,
  onAcceptCode,
}: ChatMessageProps) {
  if (role === "system") return null;
  const isUser = role === "user";
  const Icon = isUser ? User : Bot;

  const blocks = isUser ? [{ kind: "text" as const, body: content }] : parseBlocks(content);

  return (
    <div className={cn("flex gap-3 px-4 py-3", isUser ? "bg-white" : "bg-ink-50")}>
      <div
        className={cn(
          "h-8 w-8 rounded-md flex items-center justify-center shrink-0",
          isUser ? "bg-ink-100 text-ink-900" : "bg-teal text-white",
        )}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        <p className="text-xs font-medium text-ink-500">{isUser ? "You" : "ladX"}</p>
        {blocks.map((b, i) => {
          // Block-list keys are stable per (kind, position, body-prefix) —
          // good enough for a chat turn where blocks are append-only.
          const key = `${b.kind}-${i}-${b.body.slice(0, 16)}`;
          return b.kind === "text" ? (
            <div
              key={key}
              className={cn(
                "prose prose-sm max-w-none whitespace-pre-wrap text-ink-900",
                pending && i === blocks.length - 1 && "text-ink-500",
              )}
            >
              {b.body}
              {pending && i === blocks.length - 1 && (
                <span className="inline-block w-2 h-4 bg-ink-400 animate-pulse ml-1 align-middle" />
              )}
            </div>
          ) : (
            <CodeBlock
              key={key}
              language={b.language ?? "text"}
              source={b.body}
              autoValidate={!pending}
              projectId={projectId}
              validate={validate}
              autoFix={autoFix}
              onAccept={
                onAcceptCode
                  ? (source, report) =>
                      onAcceptCode({ language: b.language ?? "text", source, report })
                  : undefined
              }
            />
          );
        })}
      </div>
    </div>
  );
}
