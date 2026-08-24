"use client";

import { ACCEPTED_DOCUMENTS, extractText } from "@/lib/documents/extract-text";
import type { Attachment, ModelPicker } from "@ladx/ui";
import { useCallback, useEffect, useState } from "react";

export interface ModelsResponse {
  source: "your key" | "free tier" | "none";
  provider: string | null;
  autoNote: string;
  defaultModel: string | null;
  models: { id: string; label: string; free: boolean; contextTokens?: number }[];
}

const MODEL_KEY = "ladx.chat.model";

/** A size a person can judge at a glance, in the unit that suits the format. */
function describe(doc: { kind: string; units: number; text: string }): string {
  if (doc.kind === "pdf") return `${doc.units} page${doc.units === 1 ? "" : "s"}`;
  const chars = doc.text.length;
  if (chars < 1000) return `${chars} chars`;
  return `${Math.round(chars / 1000)}k chars`;
}

/**
 * Attachments and model choice, for any chat surface.
 *
 * Both belong to the composer rather than to a page, and there are three chat
 * surfaces now: the Studio chat, a saved conversation, and the project dock.
 * Written once here so a fix to how a PDF is read, or to how Auto is
 * described, reaches all three.
 *
 * The chosen model is remembered in browser storage rather than on the account.
 * It is a per-session preference like a zoom level, not a setting, and the
 * account already has a default model that Auto honours.
 */
export function useComposer() {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [attaching, setAttaching] = useState(false);
  const [attachError, setAttachError] = useState<string | null>(null);

  const [model, setModel] = useState<string | null>(null);
  const [info, setInfo] = useState<ModelsResponse | null>(null);

  useEffect(() => {
    const saved = window.localStorage.getItem(MODEL_KEY);
    if (saved) setModel(saved);
  }, []);

  useEffect(() => {
    let live = true;
    fetch("/api/models")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: ModelsResponse | null) => {
        if (!live || !d) return;
        setInfo(d);
        // A model remembered from a key that has since been disconnected would
        // be sent and rejected, so it is dropped back to Auto.
        setModel((cur) => (cur && !d.models.some((m) => m.id === cur) ? null : cur));
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  const chooseModel = useCallback((id: string | null) => {
    setModel(id);
    if (id) window.localStorage.setItem(MODEL_KEY, id);
    else window.localStorage.removeItem(MODEL_KEY);
  }, []);

  const attach = useCallback((files: FileList) => {
    setAttaching(true);
    setAttachError(null);
    void (async () => {
      const added: Attachment[] = [];
      const failed: string[] = [];
      for (const file of Array.from(files)) {
        try {
          const doc = await extractText(file);
          added.push({
            id: `${file.name}-${file.size}-${added.length}`,
            name: doc.name,
            text: doc.text,
            detail: describe(doc),
          });
        } catch (err) {
          failed.push(err instanceof Error ? err.message : `Could not read ${file.name}.`);
        }
      }
      setAttachments((cur) => [...cur, ...added]);
      if (failed.length) setAttachError(failed[0] as string);
      setAttaching(false);
    })();
  }, []);

  const removeAttachment = useCallback((id: string) => {
    setAttachments((cur) => cur.filter((a) => a.id !== id));
  }, []);

  const clearAttachments = useCallback(() => setAttachments([]), []);

  const models: ModelPicker = {
    source: info?.source ?? "free tier",
    autoNote: info?.autoNote ?? "Picks a model when you send.",
    options: info?.models ?? [],
    value: model,
    onChange: chooseModel,
  };

  return {
    attachments,
    attach,
    attaching,
    attachError,
    dismissAttachError: () => setAttachError(null),
    removeAttachment,
    clearAttachments,
    accept: ACCEPTED_DOCUMENTS,
    models,
    /** Passed to the chat transport. Undefined means Auto. */
    model: model ?? undefined,
  };
}
