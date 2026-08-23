"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

const TOPICS = [
  "A technical question",
  "Something is broken",
  "Air-gapped / on-premise deployment",
  "Training institutes",
  "Something else",
];

function Form() {
  const params = useSearchParams();
  // The forum links here with the question prefilled, so somebody who clicked
  // "Ask" on a thread does not have to retype what they were already looking at.
  const prefilled = params.get("subject") ?? "";

  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setState("sending");
    setError(null);

    const data = Object.fromEntries(new FormData(e.currentTarget));
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? "Could not send that.");
      }
      setState("sent");
    } catch (err) {
      setState("error");
      setError(err instanceof Error ? err.message : "Could not send that.");
    }
  }

  if (state === "sent") {
    return (
      <div className="rounded-sm border border-teal-300 bg-teal-50 p-6">
        <h3 className="mb-1.5 text-[15.5px] font-semibold text-ink-900">Sent, thank you.</h3>
        <p className="text-[14.5px] leading-relaxed text-ink-600">
          You'll get a reply from someone who works on this, usually within a working day. If it was
          a bug report, it may arrive as a question asking for the file that broke it.
        </p>
      </div>
    );
  }

  const field =
    "w-full rounded-sm border border-ink-200 bg-white px-3 py-2.5 text-[15px] text-ink-900 placeholder:text-ink-300 focus:border-ink-500 focus:outline-none focus:ring-1 focus:ring-ink-500";

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="name" className="mb-1.5 block text-[13.5px] font-medium text-ink-700">
            Name
          </label>
          <input id="name" name="name" required className={field} placeholder="Your name" />
        </div>
        <div>
          <label htmlFor="email" className="mb-1.5 block text-[13.5px] font-medium text-ink-700">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            className={field}
            placeholder="you@company.com"
          />
        </div>
      </div>

      <div>
        <label htmlFor="topic" className="mb-1.5 block text-[13.5px] font-medium text-ink-700">
          What is this about?
        </label>
        <select id="topic" name="topic" className={field} defaultValue={TOPICS[0]}>
          {TOPICS.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="message" className="mb-1.5 block text-[13.5px] font-medium text-ink-700">
          Message
        </label>
        <textarea
          id="message"
          name="message"
          required
          rows={7}
          defaultValue={prefilled}
          className={`${field} resize-y`}
          placeholder="If something broke: what you did, what you expected, and what happened instead."
        />
      </div>

      {error && (
        <p className="text-[14px] text-danger" role="alert">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={state === "sending"}
        className="rounded-sm bg-ink-900 px-5 py-2.5 text-[14.5px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {state === "sending" ? "Sending…" : "Send"}
      </button>
      <p className="text-[12.5px] text-ink-400">
        Used to answer you and nothing else. No list, no sequence, no CRM.
      </p>
    </form>
  );
}

export function ContactForm() {
  // useSearchParams needs a Suspense boundary to keep the rest of the page
  // static, without it this one form would opt the whole route into dynamic
  // rendering.
  return (
    <Suspense fallback={<div className="h-96 rounded-sm border border-ink-100 bg-ink-50/40" />}>
      <Form />
    </Suspense>
  );
}
