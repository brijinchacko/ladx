"use client";

import { ChevronDown, Cpu, Paperclip, Square, X } from "lucide-react";
import { type FormEvent, type KeyboardEvent, useEffect, useId, useRef, useState } from "react";

/**
 * The composer.
 *
 * One rounded field with its controls inside it, which is the shape every
 * assistant has converged on because it reads as a single object rather than a
 * form with buttons beside it. Attachments sit above the text, the model picker
 * and send sit below, and nothing appears until it is relevant.
 */

export interface Attachment {
  id: string;
  name: string;
  /** Extracted text. What is actually sent; the file itself never leaves. */
  text: string;
  /** A short note for the chip, e.g. "12 pages". */
  detail?: string;
}

export interface ModelOption {
  id: string;
  label: string;
  free?: boolean;
  contextTokens?: number;
}

export interface ModelPicker {
  /** Where the list came from, said plainly. */
  source: string;
  /** What Auto does. Shown under the Auto row. */
  autoNote: string;
  options: ModelOption[];
  /** null is Auto. */
  value: string | null;
  onChange: (id: string | null) => void;
}

export interface ComposerProps {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  /** Present while a reply is streaming; clicking stops it. */
  onStop?: () => void;
  streaming?: boolean;
  placeholder?: string;
  disabled?: boolean;
  attachments?: Attachment[];
  onAttach?: (files: FileList) => void;
  onRemoveAttachment?: (id: string) => void;
  /** File types the attach button accepts. Absent hides the button. */
  accept?: string;
  attaching?: boolean;
  models?: ModelPicker;
  footnote?: string;
}

export function Composer({
  value,
  onChange,
  onSubmit,
  onStop,
  streaming = false,
  placeholder = "Reply to LADX…",
  disabled = false,
  attachments = [],
  onAttach,
  onRemoveAttachment,
  accept,
  attaching = false,
  models,
  footnote,
}: ComposerProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const [dragging, setDragging] = useState(false);

  // Grows with the content up to a ceiling, then scrolls, so a long paste does
  // not push the conversation off the screen.
  // biome-ignore lint/correctness/useExhaustiveDependencies: resize on every value change, including programmatic ones
  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  }, [value]);

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (streaming || disabled) return;
    if (!value.trim() && attachments.length === 0) return;
    onSubmit();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    // `relative` because the attach input below is sr-only, which is
    // position:absolute. Without a positioned ancestor it resolves against the
    // initial containing block, and in a long thread that puts a stray 1px box
    // far down the page, stretching the document and scrolling the whole shell.
    <form onSubmit={submit} className="relative mx-auto w-full max-w-3xl">
      <div
        onDragOver={
          onAttach
            ? (e) => {
                e.preventDefault();
                setDragging(true);
              }
            : undefined
        }
        onDragLeave={() => setDragging(false)}
        onDrop={
          onAttach
            ? (e) => {
                e.preventDefault();
                setDragging(false);
                if (e.dataTransfer.files.length) onAttach(e.dataTransfer.files);
              }
            : undefined
        }
        className={`rounded-2xl border bg-white shadow-sm transition-colors ${
          dragging ? "border-teal-500 bg-teal-50" : "border-ink-200 focus-within:border-ink-400"
        }`}
      >
        {attachments.length > 0 && (
          <ul className="flex flex-wrap gap-1.5 px-2.5 pt-2.5">
            {attachments.map((a) => (
              <li
                key={a.id}
                className="flex max-w-full items-center gap-1.5 rounded-lg border border-ink-200 bg-ink-50 py-1 pl-2 pr-1"
              >
                <Paperclip className="h-3 w-3 shrink-0 text-ink-400" />
                <span className="min-w-0 truncate text-[12px] text-ink-700">{a.name}</span>
                {a.detail && (
                  <span className="shrink-0 font-mono text-[10px] text-ink-400">{a.detail}</span>
                )}
                {onRemoveAttachment && (
                  <button
                    type="button"
                    onClick={() => onRemoveAttachment(a.id)}
                    aria-label={`Remove ${a.name}`}
                    className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-ink-400 hover:bg-ink-200 hover:text-ink-900"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        <textarea
          ref={areaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          onPaste={
            onAttach
              ? (e) => {
                  // A dragged-in file and a pasted one are the same intent.
                  if (e.clipboardData.files.length) {
                    e.preventDefault();
                    onAttach(e.clipboardData.files);
                  }
                }
              : undefined
          }
          placeholder={placeholder}
          rows={1}
          disabled={disabled}
          className="max-h-[220px] min-h-[46px] w-full resize-none border-0 bg-transparent px-3.5 py-3 text-[14.5px] leading-relaxed text-ink-900 outline-none placeholder:text-ink-400 disabled:opacity-60"
        />

        <div className="flex items-center gap-1.5 px-2 pb-2">
          {accept && onAttach && (
            <>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={attaching || disabled}
                title="Attach a specification, drawing list or program file"
                aria-label="Attach a file"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-900 disabled:opacity-40"
              >
                <Paperclip className={`h-4 w-4 ${attaching ? "animate-pulse" : ""}`} />
              </button>
              <input
                ref={fileRef}
                type="file"
                multiple
                accept={accept}
                className="sr-only"
                onChange={(e) => {
                  if (e.target.files?.length) onAttach(e.target.files);
                  e.target.value = "";
                }}
              />
            </>
          )}

          {models && <ModelMenu picker={models} />}

          <div className="ml-auto">
            {streaming && onStop ? (
              <button
                type="button"
                onClick={onStop}
                aria-label="Stop"
                title="Stop"
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink-900 text-white transition-opacity hover:opacity-90"
              >
                <Square className="h-3 w-3" fill="currentColor" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={(!value.trim() && attachments.length === 0) || streaming || disabled}
                aria-label="Send"
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink-900 text-white transition-opacity hover:opacity-90 disabled:opacity-30"
              >
                <SendGlyph />
              </button>
            )}
          </div>
        </div>
      </div>

      {footnote && <p className="mt-1.5 text-center text-[11px] text-ink-400">{footnote}</p>}
    </form>
  );
}

function SendGlyph() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" aria-hidden="true">
      <title>Send</title>
      <path
        d="M8 13V3M8 3L4 7M8 3l4 4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Auto, then everything the key can reach.
 *
 * Auto is first and is the default, because on the shared free tier it is
 * genuinely the better choice: the server tries the healthiest model and falls
 * through when one is busy, which no fixed pick can do. Naming a model is for
 * when you have a reason, so the list says which are free and how much context
 * each has rather than leaving you to recognise the ids.
 */
function ModelMenu({ picker }: { picker: ModelPicker }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const current = picker.value
    ? (picker.options.find((m) => m.id === picker.value)?.label ?? picker.value)
    : "Auto";

  const q = query.trim().toLowerCase();
  const shown = q
    ? picker.options.filter(
        (m) => m.label.toLowerCase().includes(q) || m.id.toLowerCase().includes(q),
      )
    : picker.options;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={listId}
        title={`Model: ${current}`}
        className="flex h-8 max-w-[13rem] items-center gap-1.5 rounded-lg px-2 text-[12.5px] text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-900"
      >
        <Cpu className="h-3.5 w-3.5 shrink-0" />
        <span className="min-w-0 truncate">{current}</span>
        <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
      </button>

      {open && (
        <div
          id={listId}
          className="absolute bottom-full left-0 z-40 mb-1.5 w-80 overflow-hidden rounded-xl border border-ink-200 bg-white shadow-xl"
        >
          <div className="border-b border-ink-100 px-3 py-2">
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-400">
              Models from {picker.source}
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              picker.onChange(null);
              setOpen(false);
            }}
            className={`block w-full px-3 py-2 text-left transition-colors hover:bg-ink-50 ${
              picker.value === null ? "bg-ink-900/[0.04]" : ""
            }`}
          >
            <span className="flex items-center gap-2">
              <span className="text-[13.5px] font-semibold text-ink-900">Auto</span>
              {picker.value === null && (
                <span className="rounded bg-teal-100 px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-wide text-teal-700">
                  in use
                </span>
              )}
            </span>
            <span className="mt-0.5 block text-[11.5px] leading-snug text-ink-500">
              {picker.autoNote}
            </span>
          </button>

          {picker.options.length > 8 && (
            <div className="border-t border-ink-100 px-2 py-1.5">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter models"
                className="w-full rounded-md border border-ink-200 px-2 py-1 text-[12.5px] outline-none placeholder:text-ink-400 focus:border-ink-500"
              />
            </div>
          )}

          <ul className="max-h-64 overflow-y-auto border-t border-ink-100">
            {shown.length === 0 && (
              <li className="px-3 py-3 text-[12.5px] text-ink-400">
                {picker.options.length === 0
                  ? "No models to list. Auto still works."
                  : "Nothing matches that."}
              </li>
            )}
            {shown.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => {
                    picker.onChange(m.id);
                    setOpen(false);
                  }}
                  className={`block w-full px-3 py-1.5 text-left transition-colors hover:bg-ink-50 ${
                    picker.value === m.id ? "bg-ink-900/[0.04]" : ""
                  }`}
                >
                  <span className="flex items-baseline gap-2">
                    <span className="min-w-0 flex-1 truncate text-[13px] text-ink-800">
                      {m.label}
                    </span>
                    {m.free && (
                      <span className="shrink-0 font-mono text-[9.5px] uppercase tracking-wide text-teal-700">
                        free
                      </span>
                    )}
                    {m.contextTokens ? (
                      <span className="shrink-0 font-mono text-[9.5px] tabular-nums text-ink-400">
                        {Math.round(m.contextTokens / 1000)}k
                      </span>
                    ) : null}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
