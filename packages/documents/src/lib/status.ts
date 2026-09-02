/**
 * Where a document is in its life.
 *
 * Four states, which is what a controlled document on a small project has:
 * being written, out for somebody else to read, agreed, and replaced by a
 * later revision. Nothing here about who approved it or when; that is the
 * audit log's job, and the log already records every save.
 */
export type DocStatus = "draft" | "review" | "approved" | "superseded";

export const DOC_STATUSES: { id: DocStatus; label: string; about: string }[] = [
  { id: "draft", label: "Draft", about: "Being written. Edit freely." },
  { id: "review", label: "For review", about: "Out with somebody to read. Still editable." },
  { id: "approved", label: "Approved", about: "Agreed. Read only until revised." },
  { id: "superseded", label: "Superseded", about: "Replaced by a later revision. Read only." },
];

export function isDocStatus(value: unknown): value is DocStatus {
  return DOC_STATUSES.some((s) => s.id === value);
}

export function docStatusLabel(status: string): string {
  return DOC_STATUSES.find((s) => s.id === status)?.label ?? "Draft";
}

/** Approved and superseded documents do not take edits; revising returns them to draft. */
export function docReadOnly(status: string): boolean {
  return status === "approved" || status === "superseded";
}
