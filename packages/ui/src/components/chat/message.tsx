"use client";

import type { ValidatorReport } from "@ladx/types";
import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { cn } from "../../lib/cn";
import { CodeBlock } from "../code/code-block";
import { Markdown } from "./markdown";
import { StreamCaret, Thinking } from "./thinking";

export interface ChatMessageProps {
  role: "user" | "assistant" | "system";
  content: string;
  pending?: boolean;
  /** Optional project id forwarded to <CodeBlock/> for auto-fix grounding. */
  projectId?: string;
  /** Optional validate transport, used on desktop to call a Tauri command. */
  validate?: (source: string) => Promise<ValidatorReport>;
  /** Optional auto-fix transport, used on desktop to call a Tauri command. */
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
 * as a code block too, so the user sees code rendering as it streams.
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
    out.push({ kind: "code", language: m[1] || "text", body: m[2] ?? "" });
    cursor = m.index + m[0].length;
  }
  if (cursor < content.length) {
    out.push({ kind: "text", body: content.slice(cursor) });
  }
  return out;
}

/**
 * One turn in the conversation.
 *
 * Laid out the way the assistants people already use lay it out, because those
 * conventions are load bearing rather than decorative. The user's words sit in
 * a contained bubble on the right, which makes a long thread scannable: you can
 * find your own question without reading. The answer runs full width on the
 * page ground with no bubble and no avatar column, because an answer containing
 * a table or a rung of code needs the width, and boxing it wastes a third of it.
 *
 * Assistant text renders as markdown. It used to render as pre-wrapped plain
 * text, so every heading and bullet showed its own syntax.
 */
export function ChatMessage({
  role,
  content,
  pending,
  projectId,
  validate,
  autoFix,
  onAcceptCode,
}: ChatMessageProps) {
  const [copied, setCopied] = useState(false);
  if (role === "system") return null;

  const isUser = role === "user";

  if (isUser) {
    return (
      <div className="flex justify-end px-4 py-2.5">
        <div className="max-w-[80%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-ink-100 px-4 py-2.5 text-[14.5px] leading-relaxed text-ink-900">
          {content}
        </div>
      </div>
    );
  }

  // Nothing has arrived yet: show that it is working rather than an empty box.
  if (pending && content.length === 0) {
    return (
      <div className="px-4 py-3">
        <Thinking />
      </div>
    );
  }

  const blocks = parseBlocks(content);

  async function copyAll() {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard refused, usually an insecure context. Nothing to recover.
    }
  }

  return (
    <div className="group px-4 py-3">
      <div className="text-[14.5px] text-ink-800">
        {blocks.map((b, i) => {
          const key = `${b.kind}-${i}-${b.body.slice(0, 16)}`;
          const isLast = i === blocks.length - 1;
          return b.kind === "text" ? (
            <div key={key}>
              <Markdown text={b.body} />
              {pending && isLast && <StreamCaret />}
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

      {/* Copy sits under the finished answer and stays out of the way until the
          turn is hovered, which is where every assistant puts it. */}
      {!pending && content.length > 0 && (
        <div className="mt-1.5 flex items-center gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
          <button
            type="button"
            onClick={copyAll}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-2 py-1 font-mono text-[11px] transition-colors",
              copied ? "text-teal-700" : "text-ink-400 hover:bg-ink-100 hover:text-ink-700",
            )}
          >
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      )}
    </div>
  );
}
