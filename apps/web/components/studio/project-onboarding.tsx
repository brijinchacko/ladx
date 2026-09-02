"use client";

import { ACCEPTED_DOCUMENTS, extractText } from "@/lib/documents/extract-text";
import {
  BRIEF_GROUPS,
  type BriefField,
  type BriefKey,
  type ProjectBrief,
  briefField,
} from "@ladx/documents";
import { ArrowLeft, ArrowRight, Check, FileUp, Loader2, Sparkles, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

interface Doc {
  id: string;
  name: string;
  text: string;
  detail: string;
}

type Step = "import" | number;

/**
 * Setting a project up.
 *
 * The design basis is twenty-two questions, and a blank form of twenty-two
 * questions is a wall. But the answers almost always exist already: the client
 * sent a URS, a scope of works, an enquiry with the throughput in it. So the
 * wizard offers to read those first and propose the fields, and the engineer
 * corrects rather than types.
 *
 * Three properties it has to have, and each one is a real decision:
 *
 * Skippable, at any point. Somebody who opened a project to check one thing
 * must not be held hostage by a setup flow, and a wizard that cannot be
 * dismissed teaches people to dismiss the product.
 *
 * Resumable, from the project page, whenever. Skipping is not refusing; most
 * projects get their details a week later when the client answers.
 *
 * Never authoritative. What comes back from reading a document is a proposal
 * shown beside the note saying where it came from, and nothing is saved until
 * the engineer has seen it. These fields end up in documents that get signed.
 */
export default function ProjectOnboarding({
  projectId,
  projectName,
  brief,
  onClose,
}: {
  projectId: string;
  projectName: string;
  brief: ProjectBrief;
  onClose: () => void;
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("import");
  const [draft, setDraft] = useState<ProjectBrief>({ ...brief });
  const [sources, setSources] = useState<Partial<Record<BriefKey, string>>>({});
  const [saving, setSaving] = useState(false);

  async function persist(values: ProjectBrief, finish: boolean) {
    setSaving(true);
    try {
      await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brief: values, ...(finish ? { onboarded: true } : {}) }),
      });
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  /** Closing at any point counts as answering the question "later?" with yes. */
  async function close() {
    await persist(draft, true);
    onClose();
  }

  const groupIndex = typeof step === "number" ? step : -1;
  const group = groupIndex >= 0 ? BRIEF_GROUPS[groupIndex] : null;
  const total = BRIEF_GROUPS.length;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 sm:items-center">
      <div className="w-full max-w-2xl rounded-lg border border-ink-200 bg-white shadow-2xl">
        <header className="flex items-start gap-4 border-b border-ink-100 bg-ink-50 px-5 py-3.5">
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-[15px] font-bold text-ink-900">
              Set up {projectName}
            </h2>
            <p className="mt-0.5 text-[12.5px] leading-snug text-ink-500">
              {step === "import"
                ? "Start from the documents you already have, or fill it in yourself."
                : `${group?.blurb} · ${groupIndex + 1} of ${total}`}
            </p>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Close setup"
            className="shrink-0 rounded p-1 text-ink-400 transition-colors hover:bg-ink-200 hover:text-ink-900"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        {step === "import" ? (
          <ImportStep
            projectId={projectId}
            onProposal={(fields, notes) => {
              setDraft((d) => ({ ...d, ...fields }));
              setSources(notes);
              setStep(0);
            }}
            onSkipToForm={() => setStep(0)}
            onSkipAll={close}
          />
        ) : (
          group && (
            <>
              <div className="max-h-[55vh] space-y-4 overflow-y-auto px-5 py-4">
                <div className="flex items-center gap-1">
                  {BRIEF_GROUPS.map((g, i) => (
                    <span
                      key={g.id}
                      className={`h-1 flex-1 rounded-full ${
                        i <= groupIndex ? "bg-teal-600" : "bg-ink-200"
                      }`}
                    />
                  ))}
                </div>
                <h3 className="font-display text-[14px] font-bold text-ink-900">{group.title}</h3>

                {group.fields.map((f) => (
                  <Field
                    key={f.key}
                    field={f}
                    value={draft[f.key] ?? ""}
                    source={sources[f.key]}
                    onChange={(v) => setDraft((d) => ({ ...d, [f.key]: v }))}
                  />
                ))}
              </div>

              <footer className="flex items-center gap-3 border-t border-ink-100 px-5 py-3.5">
                <button
                  type="button"
                  onClick={() => setStep(groupIndex === 0 ? "import" : groupIndex - 1)}
                  className="flex items-center gap-1.5 text-[13px] text-ink-500 transition-colors hover:text-ink-900"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Back
                </button>

                <div className="ml-auto flex items-center gap-3">
                  <button
                    type="button"
                    onClick={close}
                    disabled={saving}
                    className="text-[13px] text-ink-500 transition-colors hover:text-ink-900 disabled:opacity-50"
                  >
                    Finish later
                  </button>
                  {groupIndex < total - 1 ? (
                    <button
                      type="button"
                      onClick={async () => {
                        await persist(draft, false);
                        setStep(groupIndex + 1);
                      }}
                      disabled={saving}
                      className="flex items-center gap-1.5 rounded-md bg-ink-900 px-4 py-2 text-[13.5px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                    >
                      {saving ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <ArrowRight className="h-3.5 w-3.5" />
                      )}
                      Next
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={close}
                      disabled={saving}
                      className="flex items-center gap-1.5 rounded-md bg-ink-900 px-4 py-2 text-[13.5px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                    >
                      {saving ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Check className="h-3.5 w-3.5" />
                      )}
                      Done
                    </button>
                  )}
                </div>
              </footer>
            </>
          )
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────── reading the documents ─────────────────────────── */

function ImportStep({
  projectId,
  onProposal,
  onSkipToForm,
  onSkipAll,
}: {
  projectId: string;
  onProposal: (fields: ProjectBrief, sources: Partial<Record<BriefKey, string>>) => void;
  onSkipToForm: () => void;
  onSkipAll: () => void;
}) {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [busy, setBusy] = useState<"reading" | "thinking" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function take(files: FileList) {
    setBusy("reading");
    setError(null);
    const added: Doc[] = [];
    const failed: string[] = [];
    for (const file of Array.from(files)) {
      try {
        const doc = await extractText(file);
        added.push({
          id: `${file.name}-${file.size}`,
          name: doc.name,
          text: doc.text,
          detail:
            doc.kind === "pdf"
              ? `${doc.units} page${doc.units === 1 ? "" : "s"}`
              : `${Math.max(1, Math.round(doc.text.length / 1000))}k chars`,
        });
      } catch (err) {
        failed.push(err instanceof Error ? err.message : `Could not read ${file.name}.`);
      }
    }
    setDocs((cur) => [...cur, ...added.filter((a) => !cur.some((c) => c.id === a.id))]);
    if (failed.length) setError(failed[0] as string);
    setBusy(null);
  }

  async function read() {
    setBusy("thinking");
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/read-documents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documents: docs.map(({ name, text }) => ({ name, text })) }),
      });
      const body = (await res.json()) as {
        fields?: ProjectBrief;
        sources?: Partial<Record<BriefKey, string>>;
        error?: string;
        found?: number;
      };
      if (!res.ok || !body.fields) {
        setError(body.error ?? "Could not read those documents.");
        return;
      }
      onProposal(body.fields, body.sources ?? {});
    } catch {
      setError("Could not reach the reader. Fill the fields in yourself, or try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <div className="px-5 py-4">
        <label
          className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-8 text-center transition-colors ${
            busy
              ? "border-ink-200 opacity-60"
              : "border-ink-200 hover:border-teal-500 hover:bg-teal-50"
          }`}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (e.dataTransfer.files.length) void take(e.dataTransfer.files);
          }}
        >
          <FileUp className="mb-2 h-6 w-6 text-ink-400" />
          <span className="text-[14px] font-medium text-ink-900">
            Drop the client's documents here
          </span>
          <span className="mt-1 max-w-sm text-[12.5px] leading-relaxed text-ink-500">
            A URS, a scope of works, an enquiry, a datasheet. PDF, Word, text and CSV are read on
            this machine; only the text is sent, and only when you press the button.
          </span>
          <input
            type="file"
            multiple
            accept={ACCEPTED_DOCUMENTS}
            className="sr-only"
            disabled={Boolean(busy)}
            onChange={(e) => {
              if (e.target.files?.length) void take(e.target.files);
              e.target.value = "";
            }}
          />
        </label>

        {docs.length > 0 && (
          <ul className="mt-3 space-y-1">
            {docs.map((d) => (
              <li
                key={d.id}
                className="flex items-center gap-2 rounded-md border border-ink-200 px-2.5 py-1.5"
              >
                <span className="min-w-0 flex-1 truncate text-[13px] text-ink-800">{d.name}</span>
                <span className="shrink-0 font-mono text-[10.5px] text-ink-400">{d.detail}</span>
                <button
                  type="button"
                  onClick={() => setDocs((cur) => cur.filter((c) => c.id !== d.id))}
                  aria-label={`Remove ${d.name}`}
                  className="shrink-0 text-ink-400 transition-colors hover:text-danger"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}

        {busy === "reading" && (
          <p className="mt-3 flex items-center gap-2 text-[12.5px] text-ink-500">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Reading the file on this machine…
          </p>
        )}
        {busy === "thinking" && (
          <p className="mt-3 flex items-center gap-2 text-[12.5px] text-ink-500">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Working through {docs.length} document{docs.length === 1 ? "" : "s"}. This takes a
            moment on the free tier.
          </p>
        )}
        {error && <p className="mt-3 text-[13px] text-danger">{error}</p>}
      </div>

      <footer className="flex flex-wrap items-center gap-3 border-t border-ink-100 px-5 py-3.5">
        <button
          type="button"
          onClick={onSkipAll}
          className="text-[13px] text-ink-500 transition-colors hover:text-ink-900"
        >
          Skip setup
        </button>
        <div className="ml-auto flex items-center gap-3">
          <button
            type="button"
            onClick={onSkipToForm}
            className="text-[13px] text-ink-600 transition-colors hover:text-ink-900"
          >
            Fill it in myself
          </button>
          <button
            type="button"
            onClick={read}
            disabled={docs.length === 0 || Boolean(busy)}
            className="flex items-center gap-1.5 rounded-md bg-ink-900 px-4 py-2 text-[13.5px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {busy === "thinking" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            Read and fill
          </button>
        </div>
      </footer>
    </>
  );
}

/* ─────────────────────────────── one field ─────────────────────────────── */

function Field({
  field,
  value,
  source,
  onChange,
}: {
  field: BriefField;
  value: string;
  source?: string;
  onChange: (v: string) => void;
}) {
  const id = `${useId()}${field.key}`;
  const shared =
    "w-full rounded-md border px-2.5 py-2 text-[13.5px] leading-relaxed outline-none placeholder:text-ink-400 focus:border-ink-500";
  // A field that came from a document is marked, so it is obvious which values
  // were read rather than typed and therefore which ones want a second look.
  const border = source ? "border-teal-400 bg-teal-50" : "border-ink-200";

  return (
    <div>
      <label
        htmlFor={id}
        className="block font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-500"
      >
        {field.label}
      </label>
      <p className="mb-1.5 text-[12px] leading-snug text-ink-400">{field.hint}</p>
      {field.long ? (
        <textarea
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          maxLength={4000}
          placeholder={field.placeholder}
          className={`${shared} ${border}`}
        />
      ) : (
        <input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={4000}
          placeholder={field.placeholder}
          className={`${shared} ${border}`}
        />
      )}
      {source && (
        <p className="mt-1 flex items-start gap-1.5 text-[11.5px] leading-snug text-teal-800">
          <Sparkles className="mt-[3px] h-2.5 w-2.5 shrink-0" />
          Read from your documents: {source}. Check it.
        </p>
      )}
    </div>
  );
}

/** Kept next to the wizard so the reopen control and the wizard cannot drift. */
export function briefFieldLabel(key: BriefKey): string {
  return briefField(key)?.label ?? key;
}
