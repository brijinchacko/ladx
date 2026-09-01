"use client";

import type { ClientContact, ClientSite, ClientStandards } from "@/lib/db/schema";
import { Loader2, MapPin, Plus, Star, Trash2, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * The three things a client is, beyond a name and an address.
 *
 * Who to ring, where the work happens, and how this client wants it done. The
 * last of those is the one that makes this belong in an engineering tool rather
 * than a CRM, and it is the one nobody writes down: a customer specification
 * routinely requires the drawing descriptor and the PLC descriptor to match
 * character for character, and that lives in one engineer's head until they are
 * on holiday.
 *
 * Deliberately not built: quotes, invoices, payment terms, a pipeline. That is
 * accounting and sales, LADX has no billing layer, and a half-built version of
 * either is worse than sending people to the tool they already use for it.
 */

const field =
  "w-full rounded-md border border-ink-200 bg-white px-2 py-1 text-[13px] outline-none focus:border-ink-500";
const label = "mb-1 block font-mono text-[10.5px] text-ink-400 uppercase tracking-[0.1em]";

/* ─────────────────────────────── contacts ─────────────────────────────── */

const ROLE_SUGGESTIONS = [
  "Buyer",
  "Project manager",
  "Site engineer",
  "Maintenance manager",
  "Electrical supervisor",
  "Accounts payable",
  "Health and safety",
];

export function Contacts({
  clientId,
  contacts,
  sites,
}: {
  clientId: string;
  contacts: ClientContact[];
  sites: ClientSite[];
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);

  async function add(form: FormData) {
    setBusy(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/contacts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: String(form.get("name") ?? "").trim(),
          role: String(form.get("role") ?? "").trim() || null,
          email: String(form.get("email") ?? "").trim() || null,
          phone: String(form.get("phone") ?? "").trim() || null,
          siteId: String(form.get("siteId") ?? "") || null,
          isPrimary: contacts.length === 0,
        }),
      });
      if (res.ok) {
        setAdding(false);
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  async function change(id: string, body: Record<string, unknown>) {
    setBusy(true);
    try {
      await fetch(`/api/clients/${clientId}/contacts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function remove(c: ClientContact) {
    if (!window.confirm(`Remove ${c.name}?`)) return;
    setBusy(true);
    try {
      await fetch(`/api/clients/${clientId}/contacts/${c.id}`, { method: "DELETE" });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-md border border-ink-100">
      <header className="flex items-center gap-2 border-ink-100 border-b bg-ink-50/60 px-4 py-2.5">
        <UserRound className="h-3.5 w-3.5 text-ink-400" />
        <h2 className="font-display font-bold text-[14px] text-ink-900">Contacts</h2>
        <span className="font-mono text-[11px] text-ink-400">{contacts.length}</span>
        {busy && <Loader2 className="h-3.5 w-3.5 animate-spin text-ink-400" />}
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          className="ml-auto flex items-center gap-1 text-[12.5px] text-ink-600 hover:text-teal-700"
        >
          <Plus className="h-3 w-3" />
          Add
        </button>
      </header>

      {adding && (
        <form
          action={add}
          className="grid gap-2 border-ink-100 border-b bg-ink-50/30 p-4 sm:grid-cols-2"
        >
          <label>
            <span className={label}>Name</span>
            {/* biome-ignore lint/a11y/noAutofocus: the form only appears on a deliberate click */}
            <input name="name" required autoFocus className={field} />
          </label>
          <label>
            <span className={label}>Role</span>
            <input name="role" list="contact-roles" className={field} />
            <datalist id="contact-roles">
              {ROLE_SUGGESTIONS.map((r) => (
                <option key={r} value={r} />
              ))}
            </datalist>
          </label>
          <label>
            <span className={label}>Email</span>
            <input name="email" type="email" className={field} />
          </label>
          <label>
            <span className={label}>Phone</span>
            <input name="phone" className={field} />
          </label>
          {sites.length > 0 && (
            <label>
              <span className={label}>Based at</span>
              <select name="siteId" className={field}>
                <option value="">Not site specific</option>
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="flex items-end gap-2">
            <button
              type="submit"
              disabled={busy}
              className="rounded-md bg-ink-900 px-3 py-1.5 font-medium text-[13px] text-white disabled:opacity-50"
            >
              Add contact
            </button>
            <button
              type="button"
              onClick={() => setAdding(false)}
              className="text-[13px] text-ink-500 hover:text-ink-900"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {contacts.length === 0 ? (
        <p className="p-4 text-[13px] text-ink-500 leading-relaxed">
          Nobody yet. A control project usually has a buyer who signs the order, a site engineer who
          says where the panel goes, and a maintenance manager who has to live with it. They are
          rarely the same person.
        </p>
      ) : (
        <ul className="divide-y divide-ink-100">
          {contacts.map((c) => (
            <li key={c.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-2.5">
              <span className="font-medium text-[13.5px] text-ink-900">{c.name}</span>
              {c.role && <span className="text-[12.5px] text-ink-500">{c.role}</span>}
              {c.isPrimary && (
                <span
                  title="Goes on documents when nothing else is said"
                  className="flex items-center gap-1 font-mono text-[10px] text-teal-700 uppercase tracking-[0.1em]"
                >
                  <Star className="h-2.5 w-2.5" />
                  On documents
                </span>
              )}
              {c.email && (
                <a
                  href={`mailto:${c.email}`}
                  className="font-mono text-[11.5px] text-ink-500 hover:text-teal-700"
                >
                  {c.email}
                </a>
              )}
              {c.phone && <span className="font-mono text-[11.5px] text-ink-500">{c.phone}</span>}
              {c.siteId && (
                <span className="font-mono text-[11px] text-ink-400">
                  {sites.find((s) => s.id === c.siteId)?.name ?? ""}
                </span>
              )}
              <span className="ml-auto flex items-center gap-3">
                {!c.isPrimary && (
                  <button
                    type="button"
                    onClick={() => void change(c.id, { isPrimary: true })}
                    title="Put this one on documents"
                    className="text-[12px] text-ink-400 hover:text-teal-700"
                  >
                    Use on documents
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void remove(c)}
                  title={`Remove ${c.name}`}
                  className="text-ink-400 hover:text-danger"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ──────────────────────────────── sites ──────────────────────────────── */

export function Sites({ clientId, sites }: { clientId: string; sites: ClientSite[] }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);

  async function add(form: FormData) {
    setBusy(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/sites`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: String(form.get("name") ?? "").trim(),
          addressLine1: String(form.get("addressLine1") ?? "").trim() || null,
          city: String(form.get("city") ?? "").trim() || null,
          postcode: String(form.get("postcode") ?? "").trim() || null,
          supplyVoltage: String(form.get("supplyVoltage") ?? "").trim() || null,
          accessNotes: String(form.get("accessNotes") ?? "").trim() || null,
          inductionRequired: form.get("inductionRequired") === "on",
        }),
      });
      if (res.ok) {
        setAdding(false);
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  async function remove(s: ClientSite) {
    if (!window.confirm(`Remove ${s.name}?`)) return;
    setBusy(true);
    try {
      await fetch(`/api/clients/${clientId}/sites/${s.id}`, { method: "DELETE" });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-md border border-ink-100">
      <header className="flex items-center gap-2 border-ink-100 border-b bg-ink-50/60 px-4 py-2.5">
        <MapPin className="h-3.5 w-3.5 text-ink-400" />
        <h2 className="font-display font-bold text-[14px] text-ink-900">Sites</h2>
        <span className="font-mono text-[11px] text-ink-400">{sites.length}</span>
        {busy && <Loader2 className="h-3.5 w-3.5 animate-spin text-ink-400" />}
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          className="ml-auto flex items-center gap-1 text-[12.5px] text-ink-600 hover:text-teal-700"
        >
          <Plus className="h-3 w-3" />
          Add
        </button>
      </header>

      {adding && (
        <form
          action={add}
          className="grid gap-2 border-ink-100 border-b bg-ink-50/30 p-4 sm:grid-cols-2"
        >
          <label>
            <span className={label}>Site name</span>
            {/* biome-ignore lint/a11y/noAutofocus: the form only appears on a deliberate click */}
            <input name="name" required autoFocus placeholder="Bakery 2" className={field} />
          </label>
          <label>
            <span className={label}>Address</span>
            <input name="addressLine1" className={field} />
          </label>
          <label>
            <span className={label}>Town</span>
            <input name="city" className={field} />
          </label>
          <label>
            <span className={label}>Postcode</span>
            <input name="postcode" className={field} />
          </label>
          <label>
            <span className={label}>Supply</span>
            <input name="supplyVoltage" placeholder="400 V 3ph 50 Hz" className={field} />
          </label>
          <label className="flex items-end gap-2 pb-1 text-[13px] text-ink-600">
            <input name="inductionRequired" type="checkbox" className="h-3.5 w-3.5" />
            Induction needed before working here
          </label>
          <label className="sm:col-span-2">
            <span className={label}>Getting on site</span>
            <textarea
              name="accessNotes"
              rows={2}
              placeholder="Permit to work from the shift manager. Gate 3, sign in at the lodge. Arc flash PPE in the switchroom."
              className={field}
            />
          </label>
          <div className="flex items-end gap-2 sm:col-span-2">
            <button
              type="submit"
              disabled={busy}
              className="rounded-md bg-ink-900 px-3 py-1.5 font-medium text-[13px] text-white disabled:opacity-50"
            >
              Add site
            </button>
            <button
              type="button"
              onClick={() => setAdding(false)}
              className="text-[13px] text-ink-500 hover:text-ink-900"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {sites.length === 0 ? (
        <p className="p-4 text-[13px] text-ink-500 leading-relaxed">
          No sites yet. A client is a company; a panel goes into a building, and a group with four
          plants is one client and four sites. What it takes to get through the gate is worth
          writing down once.
        </p>
      ) : (
        <ul className="divide-y divide-ink-100">
          {sites.map((s) => (
            <li key={s.id} className="px-4 py-2.5">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="font-medium text-[13.5px] text-ink-900">{s.name}</span>
                <span className="text-[12.5px] text-ink-500">
                  {[s.addressLine1, s.city, s.postcode].filter(Boolean).join(", ")}
                </span>
                {s.supplyVoltage && (
                  <span className="font-mono text-[11px] text-ink-400">{s.supplyVoltage}</span>
                )}
                {s.inductionRequired && (
                  <span className="rounded-sm bg-warning-bg px-1.5 py-0.5 font-mono text-[10px] text-warning uppercase tracking-[0.08em]">
                    Induction needed
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => void remove(s)}
                  title={`Remove ${s.name}`}
                  className="ml-auto text-ink-400 hover:text-danger"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              {s.accessNotes && (
                <p className="mt-1 max-w-2xl text-[12.5px] text-ink-600 leading-relaxed">
                  {s.accessNotes}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ────────────────────────────── standards ────────────────────────────── */

const STANDARD_FIELDS: {
  key: keyof ClientStandards;
  label: string;
  placeholder: string;
  wide?: boolean;
}[] = [
  {
    key: "tagConvention",
    label: "Tag naming",
    placeholder: "AREA_EQUIP_FUNC, upper case, 18 characters. Must match the drawing descriptor.",
    wide: true,
  },
  {
    key: "drawingNumbering",
    label: "Drawing numbers",
    placeholder: "PRJ-DISC-SHEET, three digits, sheets numbered in tens.",
    wide: true,
  },
  { key: "preferredPlc", label: "PLC", placeholder: "Rockwell CompactLogix 5380" },
  { key: "preferredHmi", label: "HMI", placeholder: "PanelView Plus 7" },
  { key: "preferredDrive", label: "Drives", placeholder: "PowerFlex 525" },
  {
    key: "hmiConvention",
    label: "Screen conventions",
    placeholder: "ISA-101 greyscale. Colour only for deviation. No flashing except unacked alarms.",
    wide: true,
  },
  {
    key: "alarmConvention",
    label: "Alarm conventions",
    placeholder: "Three priorities. Every alarm needs a documented response.",
    wide: true,
  },
  {
    key: "documentRequirements",
    label: "What they want handed over",
    placeholder: "FDS, I/O schedule, alarm schedule, as-built drawings in PDF and DWG, FAT record.",
    wide: true,
  },
  { key: "notes", label: "Anything else", placeholder: "", wide: true },
];

export function Standards({
  clientId,
  standards,
}: {
  clientId: string;
  standards: ClientStandards | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save(form: FormData) {
    setBusy(true);
    setSaved(false);
    try {
      const body: Record<string, string | null> = {};
      for (const f of STANDARD_FIELDS) {
        body[f.key as string] = String(form.get(f.key as string) ?? "").trim() || null;
      }
      const res = await fetch(`/api/clients/${clientId}/standards`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setSaved(true);
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-md border border-teal-500/40">
      <header className="flex items-center gap-2 border-teal-500/25 border-b bg-teal-50/60 px-4 py-2.5">
        <h2 className="font-display font-bold text-[14px] text-ink-900">
          How this client wants it done
        </h2>
        {busy && <Loader2 className="h-3.5 w-3.5 animate-spin text-ink-400" />}
        {saved && !busy && <span className="text-[12px] text-teal-700">Saved</span>}
      </header>

      <form action={save} className="grid gap-3 p-4 sm:grid-cols-2">
        <p className="text-[12.5px] text-ink-500 leading-relaxed sm:col-span-2">
          The conventions that make a job right or rework. A customer specification often requires
          the drawing descriptor and the PLC descriptor to match character for character, and that
          usually lives in one engineer's head until they are on holiday. Written here, it goes onto
          every project for this client.
        </p>

        {/* Associated by id rather than by nesting: the control is behind a
            conditional, and an implicit association a reader cannot see is one
            a screen reader may not find either. */}
        {STANDARD_FIELDS.map((f) => (
          <div key={f.key as string} className={f.wide ? "sm:col-span-2" : ""}>
            <label htmlFor={`std-${f.key as string}`} className={label}>
              {f.label}
            </label>
            {f.wide ? (
              <textarea
                id={`std-${f.key as string}`}
                name={f.key as string}
                rows={2}
                defaultValue={(standards?.[f.key] as string | null) ?? ""}
                placeholder={f.placeholder}
                className={field}
              />
            ) : (
              <input
                id={`std-${f.key as string}`}
                name={f.key as string}
                defaultValue={(standards?.[f.key] as string | null) ?? ""}
                placeholder={f.placeholder}
                className={field}
              />
            )}
          </div>
        ))}

        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-ink-900 px-3.5 py-1.5 font-medium text-[13px] text-white disabled:opacity-50"
          >
            Save standards
          </button>
        </div>
      </form>
    </section>
  );
}
