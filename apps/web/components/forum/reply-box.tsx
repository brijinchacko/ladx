"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Reply to a thread.
 *
 * Signed out visitors see the box rather than a wall: the prompt to sign in
 * arrives when they try to post, by which point they know what they want to
 * say. Hiding the box entirely makes the page look read-only and is the reason
 * a lot of forums feel dead.
 */
export default function ReplyBox({
  threadId,
  threadSlug,
  signedIn,
  locked,
}: {
  threadId: string;
  threadSlug: string;
  signedIn: boolean;
  locked: boolean;
}) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (locked) {
    return (
      <div className="border border-ink-200 bg-ink-50/60 px-5 py-4 text-[14px] text-ink-500">
        This thread is locked. It stays readable, but no new replies can be added.
      </div>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (body.trim().length < 2 || busy) return;

    if (!signedIn) {
      router.push(`/sign-in?next=${encodeURIComponent(`/forum/t/${threadSlug}`)}`);
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/forum/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId, body: body.trim() }),
      });
      if (res.status === 401) {
        router.push(`/sign-in?next=${encodeURIComponent(`/forum/t/${threadSlug}`)}`);
        return;
      }
      if (!res.ok) {
        setError("That did not post. Try again.");
        return;
      }
      setBody("");
      router.refresh();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="border border-ink-200 bg-white">
      <div className="border-b border-ink-100 bg-ink-50/60 px-4 py-2.5">
        <h2 className="font-display text-[14px] font-bold text-ink-900">Reply</h2>
      </div>
      <div className="p-4">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={7}
          maxLength={20_000}
          placeholder={
            signedIn
              ? "What have you tried, and what happened?"
              : "Write your reply. You will be asked to sign in when you post."
          }
          className="w-full rounded-sm border border-ink-200 px-3 py-2.5 font-mono text-[13.5px] leading-relaxed text-ink-900 outline-none transition-colors placeholder:text-ink-400 focus:border-ink-500"
        />
        {error && <p className="mt-2 text-[13px] text-danger">{error}</p>}
        <div className="mt-3 flex items-center gap-4">
          <button
            type="submit"
            disabled={body.trim().length < 2 || busy}
            className="rounded-sm bg-ink-900 px-4 py-2 text-[13.5px] font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? "Posting…" : signedIn ? "Post reply" : "Sign in and post"}
          </button>
          <p className="font-mono text-[11.5px] text-ink-400">
            Be specific. Platform and version help.
          </p>
        </div>
      </div>
    </form>
  );
}

/**
 * The thread author's control for marking which reply solved it.
 *
 * Shown only to the author, because they are the only person who can know.
 */
export function AnswerToggle({
  threadId,
  postId,
  isAnswer,
}: {
  threadId: string;
  postId: string;
  isAnswer: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setBusy(true);
    try {
      await fetch("/api/forum/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId, postId: isAnswer ? null : postId }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      className={`rounded-sm border px-2 py-1 font-mono text-[11px] transition-colors disabled:opacity-50 ${
        isAnswer
          ? "border-teal-600 text-teal-700"
          : "border-ink-200 text-ink-400 hover:border-ink-400 hover:text-ink-700"
      }`}
    >
      {isAnswer ? "Answer, click to unmark" : "Mark as answer"}
    </button>
  );
}
