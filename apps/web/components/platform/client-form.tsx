"use client";

import type { Client } from "@/lib/db/schema";
import { useRouter } from "next/navigation";
import { useState } from "react";

const FIELDS: { key: keyof Client; label: string; wide?: boolean; area?: boolean }[] = [
  { key: "contactName", label: "Contact name" },
  { key: "industry", label: "Industry" },
  { key: "contactEmail", label: "Contact email" },
  { key: "contactPhone", label: "Contact phone" },
  { key: "addressLine1", label: "Address line 1", wide: true },
  { key: "addressLine2", label: "Address line 2", wide: true },
  { key: "city", label: "City" },
  { key: "region", label: "County / State" },
  { key: "postcode", label: "Postcode" },
  { key: "country", label: "Country" },
  { key: "notes", label: "Notes", wide: true, area: true },
];

/**
 * Create or edit a client.
 *
 * One component for both, because the fields are identical and keeping them in
 * two files guarantees they drift. Whether it POSTs or PUTs is decided by
 * whether an existing client was passed in.
 */
export default function ClientForm({ initial }: { initial?: Client }) {
  const router = useRouter();
  const editing = Boolean(initial);
  const [name, setName] = useState(initial?.name ?? "");
  const [fields, setFields] = useState<Record<string, string>>(() => {
    const seed: Record<string, string> = {};
    for (const f of FIELDS) seed[f.key as string] = (initial?.[f.key] as string) ?? "";
    return seed;
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      const url = editing ? `/api/clients/${initial?.id}` : "/api/clients";
      const res = await fetch(url, {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), ...fields }),
      });
      if (!res.ok) {
        setError("Could not save. Try again.");
        return;
      }
      router.push("/studio/clients");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-6">
      <label className="block">
        <span className="mb-1 block font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-400">
          Client name
        </span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={200}
          placeholder="Acme Foods Ltd"
          className="w-full rounded-sm border border-ink-200 px-3 py-2 text-[15px] text-ink-900 outline-none transition-colors placeholder:text-ink-400 focus:border-ink-500"
        />
      </label>

      <div className="grid gap-3.5 sm:grid-cols-2">
        {FIELDS.map((f) => (
          // biome-ignore lint/a11y/noLabelWithoutControl: the label wraps a control through the ternary below.
          <label key={f.key as string} className={`block ${f.wide ? "sm:col-span-2" : ""}`}>
            <span className="mb-1 block font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-400">
              {f.label}
            </span>
            {f.area ? (
              <textarea
                value={fields[f.key as string] ?? ""}
                onChange={(e) => setFields((p) => ({ ...p, [f.key]: e.target.value }))}
                rows={3}
                className="w-full rounded-sm border border-ink-200 px-2.5 py-2 text-[14px] text-ink-900 outline-none transition-colors focus:border-ink-500"
              />
            ) : (
              <input
                value={fields[f.key as string] ?? ""}
                onChange={(e) => setFields((p) => ({ ...p, [f.key]: e.target.value }))}
                className="w-full rounded-sm border border-ink-200 px-2.5 py-1.5 text-[14px] text-ink-900 outline-none transition-colors focus:border-ink-500"
              />
            )}
          </label>
        ))}
      </div>

      {error && <p className="text-[13.5px] text-danger">{error}</p>}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={!name.trim() || saving}
          className="rounded-sm bg-ink-900 px-5 py-2.5 text-[14px] font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving ? "Saving…" : editing ? "Save changes" : "Add client"}
        </button>
        <button
          type="button"
          onClick={() => router.push("/studio/clients")}
          className="rounded-sm border border-ink-200 px-4 py-2.5 text-[14px] text-ink-700 transition-colors hover:border-ink-400"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

/** The delete control, split out so the edit page stays a server component. */
export function DeleteClientButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (!window.confirm(`Delete ${name}? Its projects are kept, but lose their client link.`)) {
      return;
    }
    setBusy(true);
    await fetch(`/api/clients/${id}`, { method: "DELETE" });
    router.push("/studio/clients");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={remove}
      disabled={busy}
      className="font-mono text-[12px] text-ink-400 transition-colors hover:text-danger disabled:opacity-50"
    >
      {busy ? "Deleting…" : "Delete client"}
    </button>
  );
}
