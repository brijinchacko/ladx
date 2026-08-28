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
 *
 * The panel, the step list, the model picker and the clarifying questions are
 * the shared assistant, so this behaves exactly like the one in CAD and in the
 * ladder editor. What is specific to an HMI is only what happens between the
 * prompt and the drawing, which is the `run` below.
 */

import {
  type AssistRunContext,
  Assistant,
  type AssistantStore,
  type ModelsSource,
  RELAY_TITLES,
  useAssistant,
} from "@ladx/ui";
import { useCallback, useRef, useState } from "react";
import type { GenContext, GenerateScreen, GeneratedScreen } from "../lib/generate";
import { draftScreen } from "../lib/generate";

const SUGGESTIONS = [
  "An overview screen: the motor, its start and stop buttons, and a lamp for each output",
  "A tank mimic with a level bar, a pump that turns green when it runs, and a hi level alarm",
  "Add a trend of the analogue values across the bottom",
  "An alarm banner at the top and a button that acknowledges everything",
];

/**
 * Whether a request is too vague to draw without guessing.
 *
 * The test is deliberately crude, because the cost of the two mistakes is not
 * symmetric. Asking a question that was not needed costs one click. Guessing on
 * "make me a screen" produces something that looks finished, is bound to
 * whatever the model felt like, and gets found out later.
 */
function tooVagueToDraw(prompt: string): boolean {
  const p = prompt.trim().toLowerCase();
  if (p.length < 24) return true;
  const vague = /^(make|build|draw|create|do|give me)\b.{0,28}$/.test(p);
  return vague;
}

export default function HmiAi({
  context,
  onGenerate,
  onApply,
  onUndo,
  disabledReason,
  models = "/api/models",
  memoryKey,
  store,
}: {
  /** Built by the editor each time, so it is never a screen or two behind. */
  context: () => GenContext;
  /** Absent on a surface with no provider connected. The draft still works. */
  onGenerate?: GenerateScreen;
  onApply: (result: GeneratedScreen, mode: "replace" | "extend") => void;
  /** Takes the last generated screen back out. */
  onUndo?: () => void;
  /** Why the model is unavailable, if it is. */
  disabledReason?: string | null;
  /**
   * Where the list of choosable models comes from.
   *
   * A URL on the web, a function on the desktop, null on a surface with no
   * provider. This was a boolean called hasProvider, which conflated two
   * different questions: whether a model can be reached at all, and whether it
   * can be reached over HTTP. The desktop can do the first and not the second,
   * so it answered true and then fetched a route that does not exist there,
   * leaving the picker stuck on "Could not read the model list".
   */
  models?: ModelsSource;
  /** What this conversation belongs to, so it is still here next time. */
  memoryKey?: string | null;
  /** Where that conversation is kept. The browser's storage by default. */
  store?: AssistantStore;
}) {
  const [mode, setMode] = useState<"extend" | "replace">("extend");
  // Read inside `run` rather than closed over, so a mode changed after pressing
  // send is not applied to a request that is already in flight.
  const modeRef = useRef(mode);
  modeRef.current = mode;

  const run = useCallback(
    async (prompt: string, { step, ask, model, signal }: AssistRunContext) => {
      if (!onGenerate)
        throw new Error(
          disabledReason ??
            "Drawing a screen from a description needs a provider key, which belongs to an account. Sign up and connect one in Settings.",
        );

      step.start("read", "Reading the tag table");
      const ctx = { ...context(), mode: modeRef.current };
      const plc = ctx.plcTags.length;
      const analogue = ctx.plcTags.filter((t) => t.type !== "BOOL").length;
      step.detail(
        `${plc} controller tag${plc === 1 ? "" : "s"}, ${analogue} analogue, ` +
          `${ctx.existing.length} object${ctx.existing.length === 1 ? "" : "s"} already on the glass, ` +
          `${ctx.size.width}×${ctx.size.height} panel`,
      );

      if (plc === 0) {
        step.fail("No controller tags, so nothing to bind to");
        throw new Error(
          "This project has no ladder program, so there are no tags to bind to. Draw a rung first, or use From tag table once there is one.",
        );
      }

      /*
       * Ask before guessing, on the one input a drawing cannot recover from.
       *
       * "Make me a screen" has no answer that is not a guess, and a guessed
       * screen is worse than a question because it looks finished.
       */
      let request = prompt;
      if (tooVagueToDraw(prompt)) {
        step.start("ask", "Working out what to draw");
        const answer = await ask({
          text: "What should this screen be for? Naming the equipment and what the operator does from it is enough.",
          options: [
            "An overview of the whole machine",
            "A tank and its pump",
            "A conveyor, start and stop",
            "Alarms and their history",
          ],
        });
        request = `${prompt}. ${answer}`;
        step.start("asked", "Using that");
        step.detail(answer);
      }

      step.start("draw", model ? `Asking ${model}` : "Asking the model");
      const result = await onGenerate({ prompt: request, ctx, model, signal });
      if (signal.aborted) throw new DOMException("Aborted", "AbortError");
      step.detail(
        result.model ? `${result.model} replied` : "Reply received, checking what came back",
      );

      step.start("check", "Checking every binding against the tag table");
      if (result.widgets.length === 0 && result.problems.length === 0) {
        step.fail("Nothing to draw");
        throw new Error(
          "The model returned nothing to draw. Describing the screen more concretely usually fixes it.",
        );
      }
      step.detail(
        result.problems.length === 0
          ? "Every binding resolved"
          : `${result.problems.length} thing${result.problems.length === 1 ? "" : "s"} repaired or flagged`,
      );

      step.start(
        "place",
        modeRef.current === "replace" ? "Drawing the screen" : "Adding to the screen",
      );
      onApply(result, modeRef.current);
      const n = result.widgets.length;
      step.detail(`${n} object${n === 1 ? "" : "s"} placed`);

      if (result.hmiTags.length) {
        step.start("tags", "Adding the screen's own tags");
        step.detail(result.hmiTags.map((t) => t.name).join(", "));
      } else {
        step.skip("tags", "No screen tags needed");
      }
      if (result.alarms.length) {
        step.start("alarms", "Defining alarms");
        step.detail(`${result.alarms.length} defined`);
      } else {
        step.skip("alarms", "No alarms proposed");
      }

      // The next request is nearly always "and now add…", and replacing the
      // screen you just accepted is rarely what anybody means twice.
      setMode("extend");

      return {
        text: [
          `${n} object${n === 1 ? "" : "s"} ${modeRef.current === "replace" ? "drawn" : "added"}.`,
          result.notes ?? "",
          "Run it before you hand it over.",
        ]
          .filter(Boolean)
          .join(" "),
        problems: result.problems,
        undoable: true,
      };
    },
    [onGenerate, context, onApply, disabledReason],
  );

  const a = useAssistant({
    run,
    modelsUrl: models,
    store,
    memoryKey,
  });

  /**
   * The layout with no model involved.
   *
   * Reported through the same step list as a generated screen, because it is
   * the same job done a different way and showing it differently would suggest
   * it is a lesser one. It is not: every binding on it is real by construction.
   */
  const draft = useCallback(() => {
    const ctx = { ...context(), mode: "replace" as const };
    const result = draftScreen(ctx);
    if (result.widgets.length) onApply(result, "replace");
    const n = result.widgets.length;
    a.record(
      "Lay this out from the tag table.",
      {
        text: n
          ? `${n} object${n === 1 ? "" : "s"} drawn straight from the tag table. Every binding on it is real by construction, because it was built from the tags rather than described. Run it before you hand it over.`
          : "There are no tags to lay out. Draw a rung in the ladder editor first, and this will have something to bind to.",
        problems: result.problems,
        undoable: n > 0,
      },
      [
        {
          id: "d1",
          label: "Laying out every tag in the program",
          state: "done",
          detail: `${ctx.plcTags.length} controller tags, ${ctx.size.width}×${ctx.size.height} panel, no model involved`,
        },
      ],
    );
  }, [context, onApply, a]);

  return (
    <Assistant
      toolId="hmi"
      title={RELAY_TITLES.hmi}
      placeholder="A tank mimic with a level bar and a pump that turns green when it runs"
      suggestions={SUGGESTIONS}
      turns={a.turns}
      busy={a.busy}
      steps={a.steps}
      error={a.error}
      models={models ? a.models : undefined}
      question={a.question}
      onSend={a.send}
      onAnswer={a.answer}
      onStop={a.stop}
      onUndo={
        onUndo
          ? () => {
              onUndo();
              a.markUndone();
            }
          : undefined
      }
      disabledReason={disabledReason}
      /*
       * The plus, rather than a row of buttons above the box.
       *
       * "From tag table" is the deterministic version of what the model does,
       * and it belongs with the other ways of bringing something in rather than
       * competing with the prompt for space.
       */
      actions={[
        {
          id: "draft",
          label: "Lay it out from the tag table",
          hint: "Every tag as a control, no model involved. Every binding real by construction.",
          onSelect: draft,
        },
      ]}
      /*
       * Add or replace, as its own control rather than as the run mode.
       *
       * It was briefly wired to Auto and Manual, which was wrong: those mean
       * how much the assistant does on its own, and this means where the
       * result lands. Two different questions sharing one control is how
       * somebody presses Manual expecting to review a change and gets their
       * screen replaced instead.
       */
      controls={
        <div className="flex overflow-hidden rounded-md border border-ink-200">
          {(["extend", "replace"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`flex-1 px-2 py-1 text-[11px] transition-colors ${
                mode === m ? "bg-ink-900 text-white" : "bg-white text-ink-500 hover:text-ink-900"
              }`}
            >
              {m === "extend" ? "Add to screen" : "Replace screen"}
            </button>
          ))}
        </div>
      }
    />
  );
}
