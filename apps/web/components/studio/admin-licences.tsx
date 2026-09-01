"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export interface LicenceRow {
  id: string;
  prefix: string;
  issuedTo: string;
  email: string | null;
  note: string | null;
  machineId: string | null;
  activatedAt: string | null;
  lastSeenAt: string | null;
  productVersion: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

/**
 * Issuing and withdrawing desktop keys.
 *
 * The key is shown once, in a panel that has to be dismissed deliberately,
 * because there is genuinely no way to see it again: only a hash is stored.
 * A page that flashed it in a toast would lose somebody's licence to a
 * mis-timed click, so it stays until it is closed and says plainly what it is.
 */
export default function AdminLicences({ rows, open }: { rows: LicenceRow[]; open: boolean }) {
  const router = useRouter();
  const [issuedTo, setIssuedTo] = useState("");
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [months, setMonths] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fresh, setFresh] = useState<{ key: string; issuedTo: string } | null>(null);
  const [copied, setCopied] = useState(false);

  async function post(body: unknown) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/licences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const out = await res.json().catch(() => null);
      if (!res.ok) {
        setError(out?.error ?? "That did not go through.");
        return null;
      }
      router.refresh();
      return out;
    } catch {
      setError("Could not reach the server.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function issue() {
    const out = await post({
      action: "issue",
      issuedTo: issuedTo.trim(),
      email: email.trim(),
      note: note.trim(),
      ...(months ? { months: Number(months) } : {}),
    });
    if (out?.key) {
      setFresh({ key: out.key, issuedTo: issuedTo.trim() });
      setIssuedTo("");
      setEmail("");
      setNote("");
      setMonths("");
      setCopied(false);
    }
  }

  return (
    <div>
      {open && (
        <p className="mb-4 rounded-md border border-warning-border bg-warning-bg p-3 text-[12.5px] leading-relaxed text-warning">
          <strong className="font-semibold">Open activation is on.</strong> With{" "}
          <code className="font-mono">LADX_ACTIVATION_OPEN=1</code> set, any key a desktop sends is
          accepted whether it was issued or not. That is for the period before the first key exists.
          Unset it once real keys are out, or the ones below mean nothing.
        </p>
      )}

      {fresh && (
        <div className="mb-4 rounded-md border-2 border-teal-500 bg-teal-50 p-4">
          <p className="text-[13px] font-medium text-ink-900">
            Key for {fresh.issuedTo}. This is the only time it is shown.
          </p>
          <p className="mt-1 text-[12px] leading-relaxed text-ink-600">
            Only a hash is stored, so it cannot be looked up later. Copy it somewhere safe now. If
            it is lost, withdraw it and issue another.
          </p>
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <code className="select-all rounded-sm border border-teal-300 bg-white px-2.5 py-1.5 font-mono text-[14px] tracking-wide text-ink-900">
              {fresh.key}
            </code>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard?.writeText(fresh.key).then(() => setCopied(true));
              }}
              className="rounded-md border border-ink-300 bg-white px-2.5 py-1 text-[12px] text-ink-700 hover:border-ink-500"
            >
              {copied ? "Copied" : "Copy"}
            </button>
            <button
              type="button"
              onClick={() => setFresh(null)}
              className="rounded-md bg-ink-900 px-2.5 py-1 text-[12px] font-medium text-white"
            >
              I have saved it
            </button>
          </div>
        </div>
      )}

      <div className="mb-6 rounded-md border border-ink-200 bg-white p-3.5">
        <h3 className="mb-2 font-display text-[13.5px] font-bold text-ink-900">Issue a key</h3>
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Issued to" value={issuedTo} onChange={setIssuedTo} width="w-52" />
          <Field label="Email" value={email} onChange={setEmail} width="w-56" />
          <Field label="Note" value={note} onChange={setNote} width="w-52" />
          <label className="flex flex-col gap-1">
            <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-400">
              Months
            </span>
            <input
              value={months}
              onChange={(e) => setMonths(e.target.value.replace(/\D/g, ""))}
              placeholder="blank = perpetual"
              className="w-36 rounded-md border border-ink-200 px-2 py-1 text-[12.5px] outline-none focus:border-ink-500"
            />
          </label>
          <button
            type="button"
            disabled={busy || issuedTo.trim().length === 0}
            onClick={() => void issue()}
            className="rounded-md bg-ink-900 px-3 py-1.5 text-[12.5px] font-medium text-white disabled:opacity-40"
          >
            {busy ? "Working" : "Issue"}
          </button>
        </div>
        {error && <p className="mt-2 text-[12px] text-danger">{error}</p>}
      </div>

      <div className="overflow-x-auto rounded-md border border-ink-200 bg-white">
        <table className="w-full min-w-[860px] border-collapse text-[12.5px]">
          <thead>
            <tr className="border-b border-ink-100 bg-ink-50 text-left">
              {["Key", "Issued to", "State", "Machine", "Last seen", "Expires", ""].map((h) => (
                <th
                  key={h}
                  className="whitespace-nowrap px-3 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-500"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-4 text-[12.5px] text-ink-400">
                  No keys issued yet.
                </td>
              </tr>
            ) : (
              rows.map((l) => {
                const expired = l.expiresAt ? new Date(l.expiresAt).getTime() < Date.now() : false;
                const state = l.revokedAt ? "withdrawn" : expired ? "expired" : "live";
                return (
                  <tr key={l.id} className="border-b border-ink-50 last:border-0">
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-[11.5px] text-ink-800">
                      {l.prefix}…
                    </td>
                    <td className="px-3 py-2">
                      <div className="text-ink-900">{l.issuedTo}</div>
                      {l.email && (
                        <div className="font-mono text-[10.5px] text-ink-400">{l.email}</div>
                      )}
                      {l.note && <div className="text-[11px] text-ink-400">{l.note}</div>}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded-sm px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] ${
                          state === "live" ? "bg-teal-50 text-teal-800" : "bg-danger-bg text-danger"
                        }`}
                      >
                        {state}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono text-[10.5px] text-ink-500">
                      {l.machineId ? `${l.machineId.slice(0, 12)}…` : "not activated"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-ink-500">
                      {l.lastSeenAt ? new Date(l.lastSeenAt).toLocaleDateString("en-GB") : "never"}
                      {l.productVersion && (
                        <span className="ml-1 font-mono text-[10px] text-ink-400">
                          v{l.productVersion}
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-ink-500">
                      {l.expiresAt ? new Date(l.expiresAt).toLocaleDateString("en-GB") : "never"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      <div className="flex gap-2">
                        {l.machineId && (
                          <button
                            type="button"
                            disabled={busy}
                            title="Let this key activate on a different machine, for a replaced laptop."
                            onClick={() => void post({ action: "free", id: l.id })}
                            className="text-[11.5px] text-ink-600 underline hover:text-ink-900"
                          >
                            Free machine
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            void post({
                              action: l.revokedAt ? "restore" : "revoke",
                              id: l.id,
                            })
                          }
                          className={`text-[11.5px] underline ${
                            l.revokedAt ? "text-teal-700" : "text-danger"
                          }`}
                        >
                          {l.revokedAt ? "Restore" : "Withdraw"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  width,
}: { label: string; value: string; onChange: (v: string) => void; width: string }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-400">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`${width} rounded-md border border-ink-200 px-2 py-1 text-[12.5px] outline-none focus:border-ink-500`}
      />
    </label>
  );
}
