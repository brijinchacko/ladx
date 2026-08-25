"use client";

import { HmiEditor, type HmiEditorProps } from "@ladx/hmi";

/**
 * The editor, wired to the web's storage.
 *
 * The package holds no knowledge of where an application lives, because the
 * desktop keeps its own in local SQLite and is forbidden from making an HTTP
 * call. This is the web half.
 */
export default function HmiEditorClient(props: Omit<HmiEditorProps, "onSave">) {
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
    />
  );
}
