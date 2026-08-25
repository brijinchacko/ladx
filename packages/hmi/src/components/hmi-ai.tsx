"use client";

/**
 * Building a screen from a description.
 *
 * Two ways to fill a screen sit here on purpose. One asks a model; the other
 * lays the tag table out directly and needs no provider, no key and no network.
 * The second is not a fallback for when the first breaks, it is the honest
 * baseline: it produces a working screen for the program that is open, every
 * binding on it real, in the time it takes to click. A generated screen has to
 * be better than that to be worth asking for.
 *
 * Whatever comes back lands as one ordinary edit that Undo takes straight out
 * again. That is the property that makes this safe to try: nothing a model
 * writes is harder to remove than anything you drew by hand.
 */

import { Loader2, Sparkles, TriangleAlert, Wand2 } from "lucide-react";
import { useCallback, useState } from "react";
import type { GenContext, GenerateScreen, GeneratedScreen } from "../lib/generate";
import { draftScreen } from "../lib/generate";

interface Turn {
  id: string;
  role: "you" | "ladx";
  text: string;
  problems?: string[];
}

const SUGGESTIONS = [
  "An overview screen: the motor, its start and stop buttons, and a lamp for each output",
  "A tank mimic with a level bar, a pump symbol that turns green when it runs, and a hi level alarm",
  "Add a trend of the analogue values across the bottom",
  "Add an alarm banner at the top and a button that acknowledges everything",
];

export default function HmiAi({
  context,
  onGenerate,
  onApply,
  disabledReason,
}: {
  /** Built by the editor each time, so it is never a screen or two behind. */
  context: () => GenContext;
  /** Absent on a surface with no provider connected. The draft still works. */
  onGenerate?: GenerateScreen;
  onApply: (result: GeneratedScreen, mode: "replace" | "extend") => void;
  /** Why the model is unavailable, if it is. */
  disabledReason?: string | null;
}) {
  const [prompt, setPrompt] = useState("");
  const [mode, setMode] = useState<"extend" | "replace">("extend");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [model, setModel] = useState<string | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);

  const report = useCallback((result: GeneratedScreen, verb: string) => {
    const n = result.widgets.length;
    setTurns((t) => [
      ...t,
      {
        id: `a${t.length}`,
        role: "ladx",
        text: [
          `${n} object${n === 1 ? "" : "s"} ${verb}.`,
          result.hmiTags.length ? `${result.hmiTags.length} screen tags added.` : "",
          result.alarms.length ? `${result.alarms.length} alarms defined.` : "",
          result.notes ?? "",
          "Run it before you hand it over.",
        ]
          .filter(Boolean)
          .join(" "),
        problems: result.problems,
      },
    ]);
  }, []);

  const send = useCallback(async () => {
    const text = prompt.trim();
    if (!text || !onGenerate) return;
    const ctx = { ...context(), mode };

    setBusy(true);
    setError(null);
    setPrompt("");
    setTurns((t) => [...t, { id: `u${t.length}`, role: "you", text }]);

    try {
      const result = await onGenerate({ prompt: text, ctx });
      if (result.widgets.length === 0 && result.problems.length === 0) {
        setError("The model returned nothing to draw. Try describing the screen more concretely.");
        return;
      }
      onApply(result, mode);
      setModel(result.model ?? null);
      report(result, mode === "replace" ? "drawn" : "added");
      // The next request is nearly always "and now add…", and replacing the
      // screen you just accepted is rarely what anybody means twice.
      setMode("extend");
    } catch (e) {
      setError(
        e instanceof Error && e.message
          ? e.message
          : "Could not reach the model. The tag table layout below needs no model at all.",
      );
    } finally {
      setBusy(false);
    }
  }, [prompt, onGenerate, context, mode, onApply, report]);

  const draft = useCallback(() => {
    const ctx = { ...context(), mode: "replace" as const };
    const result = draftScreen(ctx);
    setError(null);
    setTurns((t) => [
      ...t,
      { id: `u${t.length}`, role: "you", text: "Lay this out from the tag table." },
    ]);
    if (result.widgets.length) onApply(result, "replace");
    report(result, "drawn");
  }, [context, onApply, report]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {turns.length === 0 ? (
          <div className="space-y-2">
            <p className="text-[12.5px] leading-relaxed text-ink-500">
              Describe the screen. It is drawn against this project's tag table, so it can only bind
              to tags the controller actually has, and anything it got wrong is listed rather than
              hidden.
            </p>
            <ul className="space-y-1">
              {SUGGESTIONS.map((s) => (
                <li key={s}>
                  <button
                    type="button"
                    onClick={() => setPrompt(s)}
                    className="w-full rounded-md border border-ink-100 bg-white px-2 py-1.5 text-left text-[12px] leading-snug text-ink-600 transition-colors hover:border-ink-300 hover:text-ink-900"
                  >
                    {s}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <ol className="space-y-2.5">
            {turns.map((t) => (
              <li key={t.id}>
                <p
                  className={`text-[12.5px] leading-relaxed ${
                    t.role === "you" ? "font-medium text-ink-900" : "text-ink-600"
                  }`}
                >
                  {t.role === "you" ? "" : "· "}
                  {t.text}
                </p>
                {t.problems && t.problems.length > 0 && (
                  <ul className="mt-1.5 space-y-1 rounded-md border border-[#E4C9A8] bg-[#FDF6EC] p-2">
                    {t.problems.map((p) => (
                      <li
                        key={p}
                        className="flex gap-1.5 text-[11.5px] leading-snug text-[#7A4A12]"
                      >
                        <TriangleAlert className="mt-px h-3 w-3 shrink-0" />
                        <span>{p}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {t.role === "ladx" && t.problems?.length === 0 && (
                  <p className="mt-1 text-[11px] text-ink-400">
                    Every binding resolved, which is not the same as it being the screen you wanted.
                  </p>
                )}
              </li>
            ))}
          </ol>
        )}

        {error && (
          <p className="mt-2 rounded-md border border-[#E4B4A8] bg-[#FDEFEC] px-2 py-1.5 text-[12px] leading-snug text-[#7A2E12]">
            {error}
          </p>
        )}
      </div>

      <div className="shrink-0 border-t border-ink-100 p-2.5">
        <div className="mb-2 flex items-center gap-1.5">
          <div className="flex overflow-hidden rounded-md border border-ink-200">
            {(["extend", "replace"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`px-2 py-1 text-[11.5px] transition-colors ${
                  mode === m ? "bg-ink-900 text-white" : "bg-white text-ink-500 hover:text-ink-900"
                }`}
              >
                {m === "extend" ? "Add to screen" : "Replace screen"}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={draft}
            title="Lay every tag in the program out as a control, with no model involved."
            className="ml-auto flex items-center gap-1 rounded-md border border-ink-200 bg-white px-2 py-1 text-[11.5px] text-ink-600 transition-colors hover:border-ink-400 hover:text-ink-900"
          >
            <Wand2 className="h-3 w-3" />
            From tag table
          </button>
        </div>

        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            // Enter sends, because this is a prompt box and not a document.
            // Shift+Enter is there for the two-sentence description.
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          rows={3}
          disabled={!onGenerate || busy}
          placeholder={
            disabledReason ??
            "A tank mimic with a level bar and a pump that turns green when it runs"
          }
          className="w-full resize-none rounded-md border border-ink-200 bg-white px-2 py-1.5 text-[12.5px] leading-snug outline-none focus:border-ink-500 disabled:bg-ink-50"
        />

        <div className="mt-1.5 flex items-center gap-2">
          <span className="truncate font-mono text-[10.5px] text-ink-400">
            {busy
              ? "Drawing"
              : (model ?? (disabledReason ? "No model connected" : "Enter to send"))}
          </span>
          <button
            type="button"
            onClick={() => void send()}
            disabled={!onGenerate || busy || !prompt.trim()}
            className="ml-auto flex items-center gap-1.5 rounded-md bg-ink-900 px-2.5 py-1 text-[12px] font-medium text-white transition-opacity disabled:opacity-40"
          >
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
            Draw
          </button>
        </div>
      </div>
    </div>
  );
}
