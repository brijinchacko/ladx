"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  AssistantModels,
  AssistantQuestion,
  AssistantTurn,
} from "../components/assistant/assistant";
import type { AssistStep } from "../components/assistant/steps";
import { StepLog } from "../components/assistant/steps";
import type { ModelList, ModelsSource } from "./ask-model";
import { type AssistantStore, localAssistantStore } from "./assistant-store";

/**
 * The assistant's behaviour, once, for every tool.
 *
 * The panel is what it looks like; this is what it does. Both are shared for
 * the same reason: three copies of "what happens when the model fails" produced
 * three different answers, and the one in the tool nobody was looking at
 * swallowed the error.
 *
 * What a tool supplies is a single `run` function: given a prompt and a place
 * to report steps, do the work and say what happened. Everything else, the turn
 * log, the busy flag, cancellation, the step list, the clarifying question and
 * which model is selected, is the same everywhere and lives here.
 */

export interface AssistRunContext {
  /** Report progress. The steps appear under the turn as they happen. */
  step: StepLog;
  /** Ask before guessing. Resolves with what the person answered. */
  ask: (question: Omit<AssistantQuestion, "id">) => Promise<string>;
  /** Which model to use, or null for Auto. */
  model: string | null;
  /** Aborts when the person presses Stop. */
  signal: AbortSignal;
}

export interface AssistResult {
  /** What to say back. */
  text: string;
  /** Warnings worth their own block. */
  problems?: string[];
  /** Whether this changed the document, so Undo is offered. */
  undoable?: boolean;
}

export interface UseAssistantOptions {
  run: (prompt: string, ctx: AssistRunContext) => Promise<AssistResult>;
  /**
   * Where the list of choosable models comes from.
   *
   * A URL on the web, a function on the desktop, or null on a surface with no
   * provider. It used to be a URL only, so the desktop fetched a route that
   * does not exist in a static export and its model picker sat permanently on
   * "Could not read the model list".
   */
  modelsUrl?: ModelsSource;
  /** Where the chosen model is remembered. One per tool would be surprising. */
  storageKey?: string;
  /**
   * What this conversation belongs to, so it is still there next time.
   *
   * Usually the tool and the project: `hmi:<projectId>`. Opening the HMI
   * builder on the Acme job and finding the conversation about the Acme job is
   * the difference between an assistant and a text box. Opening a different
   * project gets a different thread, because carrying one job's context into
   * another is worse than starting fresh: the tag names are wrong and the
   * assumptions are somebody else's.
   *
   * Omit on a surface with nothing to belong to, like a scratch program, and
   * the thread lives for the visit.
   */
  memoryKey?: string | null;
  /**
   * How many turns to keep.
   *
   * A cap rather than everything, because these are held in the browser and a
   * long thread with step lists attached is not small. The oldest go first,
   * which is the right end to lose.
   */
  memoryTurns?: number;
  /**
   * Where the thread and the chosen model are kept.
   *
   * Defaults to the browser's own storage, which is right for the web and
   * wrong for the desktop: a conversation about why an interlock is written
   * the way it is should not live somewhere that a webview reset clears and
   * that never travels with the project.
   */
  store?: AssistantStore;
}

interface Pending {
  question: AssistantQuestion;
  resolve: (answer: string) => void;
}

const MODEL_KEY = "ladx.assistant.model.v1";

export function useAssistant({
  run,
  modelsUrl = "/api/models",
  storageKey = MODEL_KEY,
  memoryKey = null,
  memoryTurns = 40,
  store = localAssistantStore,
}: UseAssistantOptions) {
  const [turns, setTurns] = useState<AssistantTurn[]>([]);
  const [busy, setBusy] = useState(false);
  const [steps, setSteps] = useState<AssistStep[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  /* ── what it remembers ── */

  /*
   * Restored on the client only, and keyed to the work.
   *
   * Reading storage during a server render is a hydration mismatch, and
   * seeding state from it in the initialiser is the same bug wearing a hat.
   * Defensive about shape: a thread written by an older build must not take
   * the tool down on load, so anything that does not look like turns is
   * discarded rather than rendered.
   */
  useEffect(() => {
    if (!memoryKey) {
      setTurns([]);
      return;
    }
    let live = true;
    (async () => {
      try {
        const raw = await store.get(`ladx.ai.thread.${memoryKey}`);
        if (!live) return;
        const parsed = raw ? JSON.parse(raw) : null;
        setTurns(
          Array.isArray(parsed)
            ? parsed.filter(
                (t: unknown): t is AssistantTurn =>
                  Boolean(t) &&
                  typeof (t as AssistantTurn).id === "string" &&
                  typeof (t as AssistantTurn).text === "string",
              )
            : [],
        );
      } catch {
        if (live) setTurns([]);
      }
    })();
    return () => {
      live = false;
    };
  }, [memoryKey, store]);

  // Written back whenever the thread changes. Undo is deliberately not
  // restorable across a reload: the inverses describe a document as it was in
  // that session, and offering to apply them to a document somebody has since
  // changed is worse than not offering.
  useEffect(() => {
    if (!memoryKey) return;
    const keep = turns.slice(-memoryTurns).map((t) => ({ ...t, undoable: false }));
    // Not awaited: a thread that has not finished being written must not hold
    // up the next thing somebody types. The store swallows its own failures.
    void store.set(`ladx.ai.thread.${memoryKey}`, JSON.stringify(keep));
  }, [turns, memoryKey, memoryTurns, store]);

  /* ── which model ── */

  const [model, setModel] = useState<string | null>(null);
  const [modelList, setModelList] = useState<AssistantModels["options"]>([]);
  const [source, setSource] = useState("Checking what is available");
  const [autoNote, setAutoNote] = useState("Picks a model for you.");
  const [loadingModels, setLoadingModels] = useState(Boolean(modelsUrl));

  // Restored on the client only; reading storage during a server render is a
  // hydration mismatch.
  useEffect(() => {
    let live = true;
    void store.get(storageKey).then((saved) => {
      // Auto is a fine answer if nothing was saved or the read failed.
      if (live && saved) setModel(saved);
    });
    return () => {
      live = false;
    };
  }, [storageKey, store]);

  useEffect(() => {
    if (!modelsUrl) {
      setLoadingModels(false);
      return;
    }
    let cancelled = false;
    const load =
      typeof modelsUrl === "function"
        ? modelsUrl()
        : fetch(modelsUrl).then((r) => (r.ok ? (r.json() as Promise<ModelList>) : null));

    Promise.resolve(load)
      .then((d) => {
        if (cancelled || !d) return;
        setModelList(d.models ?? []);
        setSource(d.source === "none" ? "No provider connected" : `Models from your ${d.source}`);
        if (d.autoNote) setAutoNote(d.autoNote);
      })
      .catch(() => {
        if (!cancelled) setSource("Could not read the model list");
      })
      .finally(() => {
        if (!cancelled) setLoadingModels(false);
      });
    return () => {
      cancelled = true;
    };
  }, [modelsUrl]);

  const chooseModel = useCallback(
    (id: string | null) => {
      setModel(id);
      // Not awaited: the choice applies to the next question either way, and
      // failing to remember it is not worth interrupting somebody over.
      void (id ? store.set(storageKey, id) : store.remove(storageKey));
    },
    [storageKey, store],
  );

  const models: AssistantModels = useMemo(
    () => ({
      source,
      autoNote,
      options: modelList,
      value: model,
      onChange: chooseModel,
      loading: loadingModels,
    }),
    [source, autoNote, modelList, model, chooseModel, loadingModels],
  );

  /* ── the conversation ── */

  const answer = useCallback((text: string) => {
    setPending((p) => {
      if (p) {
        // Recorded as a turn so the transcript reads as a conversation rather
        // than a request and an unexplained answer.
        setTurns((t) => [...t, { id: `a${t.length}`, role: "you", text }]);
        p.resolve(text);
      }
      return null;
    });
  }, []);

  const send = useCallback(
    async (prompt: string) => {
      if (busy) return;
      setError(null);
      setSteps([]);
      setBusy(true);
      setTurns((t) => [...t, { id: `u${t.length}`, role: "you", text: prompt }]);

      const controller = new AbortController();
      abortRef.current = controller;
      const log = new StepLog(setSteps);

      const ask = (q: Omit<AssistantQuestion, "id">) =>
        new Promise<string>((resolve, reject) => {
          if (controller.signal.aborted) {
            reject(new DOMException("Aborted", "AbortError"));
            return;
          }
          // A question is not work, so the step spinner stops while it waits.
          // Leaving it spinning under a question nobody has answered is how a
          // person concludes it has hung and reloads the page.
          log.done();
          const onAbort = () => reject(new DOMException("Aborted", "AbortError"));
          controller.signal.addEventListener("abort", onAbort, { once: true });
          setPending({
            question: { ...q, id: `q${Date.now()}` },
            resolve: (a) => {
              controller.signal.removeEventListener("abort", onAbort);
              resolve(a);
            },
          });
        });

      try {
        const result = await run(prompt, {
          step: log,
          ask,
          model,
          signal: controller.signal,
        });
        log.done();
        setTurns((t) => [
          ...t,
          {
            id: `r${t.length}`,
            role: "ladx",
            text: result.text,
            steps: log.value,
            problems: result.problems,
            undoable: result.undoable,
          },
        ]);
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") {
          log.fail("Stopped.");
          setTurns((t) => [
            ...t,
            { id: `r${t.length}`, role: "ladx", text: "Stopped.", steps: log.value },
          ]);
        } else {
          const message =
            e instanceof Error && e.message ? e.message : "That did not work. Try again.";
          log.fail(message);
          setError(message);
        }
      } finally {
        setBusy(false);
        setSteps([]);
        setPending(null);
        abortRef.current = null;
      }
    },
    [busy, run, model],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const reset = useCallback(() => {
    setTurns([]);
    setError(null);
    setSteps([]);
    setPending(null);
    if (memoryKey) void store.remove(`ladx.ai.thread.${memoryKey}`);
  }, [memoryKey, store]);

  /**
   * Put a turn in the transcript without running the model.
   *
   * For the actions a tool can do on its own, like laying a screen out straight
   * from the tag table. They belong in the same log: they are the same job done
   * a different way, and showing them somewhere else would suggest they are a
   * lesser one.
   */
  const record = useCallback((you: string, reply: AssistResult, steps?: AssistStep[]) => {
    setTurns((t) => [
      ...t,
      { id: `u${t.length}`, role: "you", text: you },
      {
        id: `r${t.length + 1}`,
        role: "ladx",
        text: reply.text,
        ...(steps ? { steps } : {}),
        problems: reply.problems,
        undoable: reply.undoable,
      },
    ]);
  }, []);

  /** Mark the last reply as taken back, so Undo is not offered twice. */
  const markUndone = useCallback(() => {
    setTurns((t) => {
      // Walked backwards by hand rather than with findLastIndex, which needs a
      // newer lib target than this package builds against.
      let i = -1;
      for (let n = t.length - 1; n >= 0; n--) {
        if (t[n]?.undoable) {
          i = n;
          break;
        }
      }
      if (i < 0) return t;
      const copy = [...t];
      const turn = copy[i];
      if (turn) copy[i] = { ...turn, undoable: false, text: `${turn.text} (undone)` };
      return copy;
    });
  }, []);

  return {
    turns,
    busy,
    steps,
    error,
    models,
    question: pending?.question ?? null,
    send,
    record,
    answer,
    stop,
    reset,
    markUndone,
    setError,
  };
}
