"use client";

import type { SaveRecord } from "@ladx/studio";

/**
 * How the web writes a generated record.
 *
 * Monitor and Convert both produce one: a test record from a run, a conversion
 * record from a transform. They used to POST at /api/documents from inside the
 * component, which made them unusable on the desktop build, where outbound HTTP
 * is forbidden and documents live in local SQLite. The write is a prop now, and
 * this is the web's half of it.
 */
export const saveRecordViaApi: SaveRecord = async (doc) => {
  const res = await fetch("/api/documents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...doc, kind: "generated" }),
  });
  return res.ok;
};
