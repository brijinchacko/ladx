"use client";

import { useAuthModal } from "@/components/auth/auth-modal";
import { CATEGORIES } from "@/lib/forum/categories";
import { useRouter } from "next/navigation";
import { useState } from "react";

const MIN_TITLE = 12;
const MIN_BODY = 30;

/**
 * Start a thread.
 *
 * The length minimums are the same ones the API enforces, shown as a live
 * count rather than as an error after submitting. A form that accepts input and
 * then rejects it wastes the effort of typing it.
 */
export default function ThreadForm({ defaultCategory }: { defaultCategory?: string }) {
  const router = useRouter();
  const auth = useAuthModal();
  const [category, setCategory] = useState(defaultCategory ?? CATEGORIES[0]?.slug ?? "");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const titleShort = title.trim().length < MIN_TITLE;
  const bodyShort = body.trim().length < MIN_BODY;
  const canPost = !titleShort && !bodyShort && !busy;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canPost) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/forum/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), body: body.trim(), category }),
      });
      if (res.status === 401) {
        /*
          Over the top of the draft, rather than instead of it.

          They came back here afterwards even before, but by way of /sign-in,
          which meant retyping a title and thirty words of body from memory.
        */
        if (auth) auth.open({ mode: "sign-in", next: "/forum/new" });
        else router.push(`/sign-in?next=${encodeURIComponent("/forum/new")}`);
        return;
      }
      if (!res.ok) {
        setError("That did not post. Check the title and body lengths and try again.");
        return;
      }
      const { slug } = (await res.json()) as { slug: string };
      router.push(`/forum/t/${slug}`);
      router.refresh();
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <div>
        <label
          htmlFor="category"
          className="mb-1.5 block font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-400"
        >
          Category
        </label>
        <select
          id="category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="w-full rounded-sm border border-ink-200 bg-white px-3 py-2 text-[14.5px] text-ink-900 outline-none transition-colors focus:border-ink-500"
        >
          {CATEGORIES.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.name}
            </option>
          ))}
        </select>
        <p className="mt-1.5 text-[13px] text-ink-500">
          {CATEGORIES.find((c) => c.slug === category)?.blurb}
        </p>
      </div>

      <div>
        <label
          htmlFor="title"
          className="mb-1.5 block font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-400"
        >
          Title
        </label>
        <input
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={160}
          placeholder="Ask the specific question, e.g. Why does my TON reset when the rung goes false?"
          className="w-full rounded-sm border border-ink-200 px-3 py-2 text-[15px] text-ink-900 outline-none transition-colors placeholder:text-ink-400 focus:border-ink-500"
        />
        <p className="mt-1.5 font-mono text-[11.5px] text-ink-400">
          {titleShort
            ? `${MIN_TITLE - title.trim().length} more characters`
            : `${title.length} / 160`}
        </p>
      </div>

      <div>
        <label
          htmlFor="body"
          className="mb-1.5 block font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-400"
        >
          What is happening
        </label>
        <textarea
          id="body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={12}
          maxLength={20_000}
          placeholder={
            "Include the platform and version, what you expected, and what actually happens.\n\nIf it is a logic problem, the rung matters more than the description of the rung."
          }
          className="w-full rounded-sm border border-ink-200 px-3 py-2.5 font-mono text-[13.5px] leading-relaxed text-ink-900 outline-none transition-colors placeholder:text-ink-400 focus:border-ink-500"
        />
        <p className="mt-1.5 font-mono text-[11.5px] text-ink-400">
          {bodyShort
            ? `${MIN_BODY - body.trim().length} more characters`
            : `${body.length} characters`}
        </p>
      </div>

      {error && (
        <p className="border-l-2 border-danger bg-danger-bg py-2 pl-3 text-[13.5px] text-danger">
          {error}
        </p>
      )}

      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={!canPost}
          className="rounded-sm bg-ink-900 px-5 py-2.5 text-[14px] font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? "Posting…" : "Post thread"}
        </button>
        <p className="text-[13px] text-ink-400">You need an account to post. Reading is open.</p>
      </div>
    </form>
  );
}
