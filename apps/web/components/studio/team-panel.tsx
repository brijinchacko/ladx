"use client";

import { Check, Copy, UserPlus, Users, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

interface Team {
  workspace: { id: string; name: string; ownerId: string } | null;
  role: "owner" | "member" | null;
  members: { userId: string; email: string; displayName: string | null; role: string }[];
  invites: { id: string; email: string; expiresAt: string; token: string | null }[];
}

/**
 * The people who share this work.
 *
 * One workspace, its members, and the invitations still open. Inviting makes
 * a link the owner sends however they send things; there is no email from
 * here, because the address that goes out from a product is the one that
 * lands in spam. The link is shown once per invitation and can be copied
 * again from the list while it is open.
 */
export function TeamPanel({ userId }: { userId: string }) {
  const router = useRouter();
  const [team, setTeam] = useState<Team | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/team");
    if (res.ok) setTeam((await res.json()) as Team);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function call(
    method: string,
    body: Record<string, unknown>,
  ): Promise<Record<string, unknown> | null> {
    setBusy(true);
    setProblem(null);
    try {
      const res = await fetch("/api/team", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) {
        setProblem((d.error as string) ?? "That did not work.");
        return null;
      }
      await load();
      router.refresh();
      return d;
    } finally {
      setBusy(false);
    }
  }

  function linkFor(token: string) {
    return `${window.location.origin}/studio/team/accept?token=${token}`;
  }

  async function copy(token: string, id: string) {
    try {
      await navigator.clipboard.writeText(linkFor(token));
      setCopied(id);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      // The link is in the field; it can be copied by hand.
    }
  }

  if (!team) return <p className="text-[13px] text-ink-500">Loading…</p>;

  if (!team.workspace) {
    return (
      <div>
        <p className="text-[14px] text-ink-700">
          Work alone for now, or make a workspace and invite the people you work with. Everything
          any member makes is visible to all of them; the audit log still names who did what.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Workspace name, usually the company"
            className="h-9 min-w-64 flex-1 rounded-md border border-ink-200 bg-white px-3 text-[13.5px] outline-none focus:border-ink-500"
          />
          <button
            type="button"
            onClick={() => void call("POST", { name: name.trim() })}
            disabled={!name.trim() || busy}
            className="flex items-center gap-1.5 rounded-md bg-ink-900 px-4 py-2 text-[13px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            <Users className="h-3.5 w-3.5" />
            Make a workspace
          </button>
        </div>
        {problem && <p className="mt-2 text-[12.5px] text-danger">{problem}</p>}
      </div>
    );
  }

  const owner = team.role === "owner";

  return (
    <div>
      <p className="text-[14px] text-ink-700">
        <span className="font-medium text-ink-900">{team.workspace.name}</span>
        {" · "}
        {team.members.length} member{team.members.length === 1 ? "" : "s"}
        {owner ? " · you own it" : ""}
      </p>

      <ul className="mt-3 divide-y divide-ink-100 overflow-hidden rounded-md border border-ink-200 bg-white">
        {team.members.map((m) => (
          <li key={m.userId} className="flex items-center gap-3 px-3 py-2">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13.5px] text-ink-900">
                {m.displayName?.trim() || m.email}
                {m.userId === userId ? " (you)" : ""}
              </span>
              <span className="block truncate text-[12px] text-ink-500">{m.email}</span>
            </span>
            <span className="font-mono text-[10.5px] text-ink-400">{m.role}</span>
            {((owner && m.userId !== team.workspace?.ownerId) ||
              (!owner && m.userId === userId)) && (
              <button
                type="button"
                onClick={() => {
                  const leaving = m.userId === userId;
                  if (window.confirm(leaving ? "Leave this workspace?" : `Remove ${m.email}?`))
                    void call("DELETE", { memberId: m.userId });
                }}
                aria-label={m.userId === userId ? "Leave" : `Remove ${m.email}`}
                className="text-ink-400 transition-colors hover:text-danger"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </li>
        ))}
      </ul>

      {owner && (
        <>
          <div className="mt-4 flex flex-wrap gap-2">
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="colleague@company.com"
              type="email"
              className="h-9 min-w-64 flex-1 rounded-md border border-ink-200 bg-white px-3 text-[13.5px] outline-none focus:border-ink-500"
            />
            <button
              type="button"
              onClick={() =>
                void call("POST", { invite: email.trim() }).then((d) => d && setEmail(""))
              }
              disabled={!email.includes("@") || busy}
              className="flex items-center gap-1.5 rounded-md bg-ink-900 px-4 py-2 text-[13px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              <UserPlus className="h-3.5 w-3.5" />
              Invite
            </button>
          </div>
          <p className="mt-1 text-[12px] text-ink-500">
            Makes a link that lasts fourteen days. Send it yourself; they sign in with that address
            and they are in.
          </p>

          {team.invites.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {team.invites.map((i) => (
                <li
                  key={i.id}
                  className="flex flex-wrap items-center gap-2 rounded-md border border-ink-200 bg-ink-50 px-3 py-2"
                >
                  <span className="text-[13px] text-ink-900">{i.email}</span>
                  <span className="text-[11.5px] text-ink-500">
                    until {new Date(i.expiresAt).toLocaleDateString()}
                  </span>
                  {i.token && (
                    <>
                      <input
                        readOnly
                        value={linkFor(i.token)}
                        onFocus={(e) => e.currentTarget.select()}
                        aria-label="Invitation link"
                        className="h-7 min-w-0 flex-1 rounded border border-ink-200 bg-white px-2 font-mono text-[11px] text-ink-700 outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => copy(i.token as string, i.id)}
                        aria-label="Copy link"
                        className="text-ink-500 transition-colors hover:text-ink-900"
                      >
                        {copied === i.id ? (
                          <Check className="h-3.5 w-3.5 text-success" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => void call("DELETE", { inviteId: i.id })}
                    aria-label="Revoke"
                    className="text-ink-400 transition-colors hover:text-danger"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {problem && <p className="mt-2 text-[12.5px] text-danger">{problem}</p>}
    </div>
  );
}
