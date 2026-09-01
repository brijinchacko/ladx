"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Granting and revoking administrator.
 *
 * Typing the address confirms it rather than a yes/no dialog. Making somebody
 * an administrator hands them every account on the system, and the one mistake
 * worth designing against is doing it to the wrong row of a table where the
 * rows look alike. Copying the address out of the row you meant is a check
 * that a second click is not.
 */
export default function RoleControl({
  userId,
  role,
  email,
}: { userId: string; role: string; email: string }) {
  const router = useRouter();
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const next = role === "admin" ? "user" : "admin";
  const armed = typed.trim().toLowerCase() === email.toLowerCase();

  async function apply() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}/role`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: next, confirmEmail: typed.trim() }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.error ?? "That did not go through.");
        return;
      }
      setTyped("");
      router.refresh();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-md border border-ink-200 bg-white p-3.5">
      <p className="text-[12.5px] leading-relaxed text-ink-600">
        {role === "admin" ? (
          <>
            This account is an administrator. Removing it takes away access to this area and to
            everybody in it.
          </>
        ) : (
          <>
            Making this account an administrator gives it every account on the system, the traffic
            figures and the status page. It does not give it anybody's work, their keys or their
            files.
          </>
        )}
      </p>
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder={`Type ${email} to confirm`}
          className="w-72 rounded-md border border-ink-200 px-2 py-1 text-[12.5px] outline-none focus:border-ink-500"
        />
        <button
          type="button"
          disabled={!armed || busy}
          onClick={() => void apply()}
          className={`rounded-md px-3 py-1 text-[12.5px] font-medium text-white transition-opacity disabled:opacity-40 ${
            next === "admin" ? "bg-ink-900" : "bg-danger"
          }`}
        >
          {busy ? "Saving" : next === "admin" ? "Make administrator" : "Remove administrator"}
        </button>
      </div>
      {error && <p className="mt-2 text-[12px] text-danger">{error}</p>}
    </div>
  );
}
