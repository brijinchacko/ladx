"use client";

import { HmiEditor, type HmiEditorProps } from "@ladx/hmi";

/**
 * The editor, wired to the web's storage and the web's inference.
 *
 * The package holds no knowledge of where an application lives or how a model
 * is reached, because the desktop keeps its own in local SQLite and talks to
 * Ollama over IPC, and is forbidden from making an HTTP call at all. This is
 * the web half of both.
 */
export default function HmiEditorClient(props: Omit<HmiEditorProps, "onSave" | "onGenerate">) {
  return (
    <HmiEditor
      {...props}
      onSave={async ({ id, name, doc }) => {
        const res = await fetch(`/api/hmi/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, doc }),
        });
        return res.ok;
      }}
      onGenerate={async ({ prompt, ctx }) => {
        const res = await fetch("/api/hmi/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt, ctx }),
        });
        const body = await res.json().catch(() => null);
        // The message the route wrote, not a generic one: "connect a key in
        // Settings" is actionable and "something went wrong" is not.
        if (!res.ok) throw new Error(body?.error ?? "Could not reach the model.");
        return body;
      }}
    />
  );
}
