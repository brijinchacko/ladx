"use client";

import { ChevronRight, Terminal } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import {
  COMMANDS,
  type CommandSpec,
  findCommand,
  parseCoordinate,
  suggestCommands,
} from "../lib/commands";

/**
 * The command line.
 *
 * Not a legacy affordance. A draughtsman who knows the aliases works faster
 * than one reaching for a toolbar, and the commands people type are
 * overwhelmingly the same handful: trim, copy and offset alone are around forty
 * percent of typed commands in real 2D work. It also takes coordinates, which
 * is the only way to place something at exactly 137.5 without arithmetic.
 *
 * It sits at the foot of the drawing area and answers to Escape from anywhere,
 * so it never has to be found.
 */
export default function CadCommandLine({
  prompt,
  onCommand,
  onCoordinate,
  onEnter,
  history,
}: {
  /** What the active tool is waiting for, echoed as the prompt. */
  prompt: string;
  onCommand: (spec: CommandSpec) => void;
  onCoordinate: (raw: string) => boolean;
  /** Enter on an empty line: finishes a polyline, repeats the last command. */
  onEnter: () => void;
  history: string[];
}) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [past, setPast] = useState<string[]>([]);
  const [pastAt, setPastAt] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const id = useId();

  const suggestions = suggestCommands(value);

  // Escape puts the caret here from anywhere on the canvas, which is where a
  // CAD user's hand goes when they want to start again.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing =
        t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
      if (typing) return;
      // A single printable character starts a command, as it does in AutoCAD.
      if (e.key.length === 1 && /[a-zA-Z?]/.test(e.key) && !e.metaKey && !e.ctrlKey) {
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const submit = () => {
    const text = value.trim();
    setError(null);

    if (!text) {
      onEnter();
      return;
    }

    // A coordinate first: "40,25" is never a command, and trying commands
    // first would report "unknown command 40,25" for a perfectly good entry.
    if (parseCoordinate(text)) {
      if (onCoordinate(text)) {
        setValue("");
        setPast((h) => [text, ...h].slice(0, 50));
        setPastAt(-1);
        return;
      }
      setError("Nothing is being drawn, so there is no point to measure that from.");
      return;
    }

    const spec = findCommand(text);
    if (!spec) {
      setError(`${text.toUpperCase()} is not a command. Type ? for the list.`);
      return;
    }
    if (spec.id === "help") {
      setShowHelp(true);
      setValue("");
      return;
    }
    onCommand(spec);
    setValue("");
    setPast((h) => [text, ...h].slice(0, 50));
    setPastAt(-1);
  };

  return (
    <div className="flex h-full flex-col bg-ink-50/60">
      {showHelp && <HelpTable onClose={() => setShowHelp(false)} />}

      {(suggestions.length > 0 || error) && (
        <div className="border-b border-ink-100 px-3 py-1.5">
          {error ? (
            <p className="text-[11.5px] text-danger">{error}</p>
          ) : (
            <ul className="flex flex-wrap gap-x-4 gap-y-1">
              {suggestions.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      // mousedown, not click: click fires after the input has
                      // blurred and the suggestion list has already gone.
                      e.preventDefault();
                      onCommand(c);
                      setValue("");
                      inputRef.current?.focus();
                    }}
                    className="text-left"
                  >
                    <span className="font-mono text-[11.5px] font-semibold text-ink-900">
                      {c.name}
                    </span>
                    <span className="ml-1.5 font-mono text-[10px] text-ink-400">
                      {c.aliases[0]}
                    </span>
                    <span className="ml-2 text-[11px] text-ink-500">{c.hint}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="flex items-center gap-2 px-3 py-1.5">
        <Terminal className="h-3.5 w-3.5 shrink-0 text-ink-400" />
        <span className="shrink-0 font-mono text-[11.5px] text-ink-500">{prompt}</span>
        <ChevronRight className="h-3 w-3 shrink-0 text-ink-400" />
        <input
          ref={inputRef}
          id={id}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            // The canvas binds nearly every key, so nothing typed here escapes.
            e.stopPropagation();
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
              return;
            }
            if (e.key === "Escape") {
              setValue("");
              setError(null);
              inputRef.current?.blur();
              return;
            }
            // Up and down walk what has been typed before, as a shell does.
            if (e.key === "ArrowUp" || e.key === "ArrowDown") {
              if (past.length === 0) return;
              e.preventDefault();
              const next = e.key === "ArrowUp" ? pastAt + 1 : pastAt - 1;
              const clamped = Math.max(-1, Math.min(next, past.length - 1));
              setPastAt(clamped);
              setValue(clamped === -1 ? "" : (past[clamped] as string));
            }
          }}
          placeholder="A command, or a coordinate: 40,25 or @30,0 or 50<45"
          spellCheck={false}
          autoComplete="off"
          className="min-w-0 flex-1 border-0 bg-transparent font-mono text-[12px] text-ink-900 outline-none placeholder:text-ink-400"
        />
        {history.length > 0 && (
          <span className="hidden shrink-0 truncate font-mono text-[10.5px] text-ink-400 sm:block">
            {history[0]}
          </span>
        )}
      </div>
    </div>
  );
}

/** Every command, grouped, for when somebody types a question mark. */
function HelpTable({ onClose }: { onClose: () => void }) {
  const groups = ["Draw", "Modify", "Annotate", "View", "File"] as const;
  return (
    <div className="max-h-64 overflow-y-auto border-b border-ink-100 bg-white px-3 py-2">
      <div className="mb-1.5 flex items-center justify-between">
        <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-400">Commands</p>
        <button
          type="button"
          onClick={onClose}
          className="text-[11.5px] text-ink-500 hover:text-ink-900"
        >
          close
        </button>
      </div>
      <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
        {groups.map((g) => (
          <div key={g}>
            <p className="mb-1 font-mono text-[9.5px] uppercase tracking-[0.12em] text-ink-400">
              {g}
            </p>
            <ul className="space-y-0.5">
              {COMMANDS.filter((c) => c.group === g).map((c) => (
                <li key={c.id} className="flex items-baseline gap-2">
                  <span className="w-24 shrink-0 font-mono text-[11px] text-ink-800">{c.name}</span>
                  <span className="w-10 shrink-0 font-mono text-[10px] text-teal-700">
                    {c.aliases[0]}
                  </span>
                  <span className="min-w-0 flex-1 text-[11px] leading-snug text-ink-500">
                    {c.hint}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
