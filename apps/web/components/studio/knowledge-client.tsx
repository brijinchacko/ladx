"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

interface DocRow {
  id: string;
  title: string;
  filename: string | null;
  byteSize: number;
  chunkCount: number;
  embedModel: string;
  createdAt: string;
}

interface Source {
  n: number;
  docId: string;
  docTitle: string;
  passage: number;
  score: number;
  excerpt: string;
}

/**
 * Knowledge: index your manuals, then ask them questions.
 *
 * The design point is that the sources arrive before the answer. Retrieval
 * either found something relevant or it did not, and showing which passages
 * were used lets a person judge the answer instead of trusting it. An answer
 * about a torque limit with no visible source is worse than no answer, because
 * it is exactly as confident and cannot be checked.
 */
export default function KnowledgeClient() {
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<{ kind: "error" | "info"; text: string } | null>(null);

  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [indexing, setIndexing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [question, setQuestion] = useState("");
  const [scope, setScope] = useState<string>("");
  const [asking, setAsking] = useState(false);
  const [answer, setAnswer] = useState("");
  const [sources, setSources] = useState<Source[]>([]);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/knowledge/documents");
    if (res.ok) {
      const json = (await res.json()) as { documents: DocRow[] };
      setDocs(json.documents);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onFile = useCallback(
    async (file: File) => {
      const content = await file.text();
      setText(content);
      if (!title.trim()) setTitle(file.name.replace(/\.[^.]+$/, ""));
    },
    [title],
  );

  async function index(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || text.trim().length < 20 || indexing) return;
    setIndexing(true);
    setNotice(null);
    try {
      const res = await fetch("/api/knowledge/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), text: text.trim() }),
      });
      const json = (await res.json()) as { chunks?: number; message?: string; error?: string };
      if (!res.ok) {
        setNotice({ kind: "error", text: json.message ?? "That did not index." });
        return;
      }
      setNotice({
        kind: "info",
        text: `Indexed as ${json.chunks} passages. Ask it something below.`,
      });
      setTitle("");
      setText("");
      await refresh();
    } finally {
      setIndexing(false);
    }
  }

  async function remove(id: string, docTitle: string) {
    if (!window.confirm(`Remove "${docTitle}" and everything indexed from it?`)) return;
    await fetch(`/api/knowledge/documents?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    await refresh();
  }

  /**
   * Ask, reading the SSE stream by hand.
   *
   * EventSource cannot POST, and the question plus the document scope do not
   * belong in a URL, so the stream is parsed from a fetch body instead.
   */
  async function ask(e: React.FormEvent) {
    e.preventDefault();
    if (question.trim().length < 3 || asking) return;
    setAsking(true);
    setAnswer("");
    setSources([]);
    setNotice(null);

    try {
      const res = await fetch("/api/knowledge/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: question.trim(),
          ...(scope ? { docId: scope } : {}),
        }),
      });

      const contentType = res.headers.get("Content-Type") ?? "";
      if (!contentType.includes("text/event-stream")) {
        const json = (await res.json()) as { message?: string };
        setNotice({ kind: "error", text: json.message ?? "That did not work." });
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) return;
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // SSE frames are separated by a blank line. Anything after the last one
        // is a partial frame and waits for the next chunk.
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";

        for (const frame of frames) {
          const eventLine = frame.split("\n").find((l) => l.startsWith("event: "));
          const dataLine = frame.split("\n").find((l) => l.startsWith("data: "));
          if (!eventLine || !dataLine) continue;
          const event = eventLine.slice(7);
          const data = JSON.parse(dataLine.slice(6));

          if (event === "sources") setSources(data as Source[]);
          else if (event === "delta") setAnswer((a) => a + (data as string));
          else if (event === "error")
            setNotice({ kind: "error", text: (data as { message: string }).message });
        }
      }
    } catch {
      setNotice({ kind: "error", text: "Lost the connection while answering." });
    } finally {
      setAsking(false);
    }
  }

  return (
    <div className="grid gap-10 lg:grid-cols-[340px_1fr] lg:items-start">
      {/* ── library ── */}
      <div className="space-y-6">
        <section className="border border-ink-200 bg-white">
          <div className="border-b border-ink-100 bg-ink-50/60 px-4 py-2.5">
            <h2 className="font-display text-[14px] font-bold text-ink-900">Add a document</h2>
          </div>
          <form onSubmit={index} className="space-y-3 p-4">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              placeholder="Drive manual, SEW MOVITRAC B"
              className="w-full rounded-sm border border-ink-200 px-2.5 py-1.5 text-[14px] outline-none transition-colors placeholder:text-ink-300 focus:border-ink-500"
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="w-full rounded-sm border border-dashed border-ink-300 px-3 py-3 text-[13px] text-ink-600 transition-colors hover:border-ink-500 hover:text-ink-900"
            >
              Choose a text or Markdown file
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".txt,.md,.markdown,.csv,text/plain,text/markdown"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onFile(f);
              }}
            />
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={5}
              placeholder="Or paste the text here"
              className="w-full rounded-sm border border-ink-200 px-2.5 py-2 font-mono text-[12.5px] leading-relaxed outline-none transition-colors placeholder:text-ink-300 focus:border-ink-500"
            />
            <button
              type="submit"
              disabled={!title.trim() || text.trim().length < 20 || indexing}
              className="w-full rounded-sm bg-ink-900 px-4 py-2 text-[13.5px] font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {indexing ? "Indexing…" : "Index it"}
            </button>
            <p className="text-[12px] leading-relaxed text-ink-400">
              Text and Markdown for now. PDF extraction runs in the desktop app, where a 400 page
              manual is not a browser's problem.
            </p>
          </form>
        </section>

        <section>
          <h2 className="mb-3 font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-400">
            Indexed {docs.length > 0 && `· ${docs.length}`}
          </h2>
          {loading ? (
            <p className="font-mono text-[12px] text-ink-400">Loading…</p>
          ) : docs.length === 0 ? (
            <p className="text-[13.5px] leading-relaxed text-ink-500">
              Nothing indexed yet. Add the manual you keep having to search.
            </p>
          ) : (
            <ul className="space-y-2">
              {docs.map((d) => (
                <li key={d.id} className="border border-ink-200 bg-white px-3 py-2.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-display text-[13.5px] font-bold text-ink-900">
                        {d.title}
                      </p>
                      <p className="mt-0.5 font-mono text-[10.5px] text-ink-400">
                        {d.chunkCount} passages · {Math.round(d.byteSize / 1024)} kB
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void remove(d.id, d.title)}
                      className="shrink-0 font-mono text-[10.5px] text-ink-400 transition-colors hover:text-red-700"
                    >
                      Remove
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* ── ask ── */}
      <div className="min-w-0">
        <form onSubmit={ask} className="mb-6 border border-ink-200 bg-white">
          <div className="border-b border-ink-100 bg-ink-50/60 px-4 py-2.5">
            <h2 className="font-display text-[14px] font-bold text-ink-900">Ask your documents</h2>
          </div>
          <div className="space-y-3 p-4">
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="What is the maximum braking resistor duty cycle?"
              className="w-full rounded-sm border border-ink-200 px-3 py-2.5 text-[14.5px] leading-relaxed outline-none transition-colors placeholder:text-ink-300 focus:border-ink-500"
            />
            <div className="flex flex-wrap items-center gap-3">
              <select
                value={scope}
                onChange={(e) => setScope(e.target.value)}
                className="rounded-sm border border-ink-200 bg-white px-2.5 py-1.5 text-[13px] outline-none focus:border-ink-500"
              >
                <option value="">All documents</option>
                {docs.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.title}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                disabled={question.trim().length < 3 || asking || docs.length === 0}
                className="rounded-sm bg-ink-900 px-4 py-2 text-[13.5px] font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {asking ? "Searching…" : "Ask"}
              </button>
              {docs.length === 0 && (
                <span className="font-mono text-[11.5px] text-ink-400">Index a document first</span>
              )}
            </div>
          </div>
        </form>

        {notice && (
          <p
            className={`mb-6 border-l-2 py-2 pl-3 text-[13.5px] ${
              notice.kind === "error"
                ? "border-red-500 bg-red-50 text-red-800"
                : "border-teal-600 bg-teal-50/50 text-teal-900"
            }`}
          >
            {notice.text}{" "}
            {notice.text.includes("Settings") && (
              <Link href="/studio/settings" className="underline underline-offset-2">
                Open Settings
              </Link>
            )}
          </p>
        )}

        {sources.length > 0 && (
          <section className="mb-6">
            <h3 className="mb-2.5 font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-400">
              Passages used
            </h3>
            <ol className="space-y-2">
              {sources.map((s) => (
                <li key={s.n} className="border-l-2 border-ink-200 py-1 pl-3">
                  <p className="font-mono text-[10.5px] text-ink-500">
                    [{s.n}] {s.docTitle} · passage {s.passage} · match {s.score}
                  </p>
                  <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-500">{s.excerpt}…</p>
                </li>
              ))}
            </ol>
          </section>
        )}

        {answer && (
          <section className="border border-ink-200 bg-white">
            <div className="border-b border-ink-100 bg-ink-50/60 px-4 py-2.5">
              <h3 className="font-display text-[14px] font-bold text-ink-900">Answer</h3>
            </div>
            <div className="whitespace-pre-wrap px-4 py-4 text-[14.5px] leading-relaxed text-ink-800">
              {answer}
              {asking && <span className="ml-0.5 animate-pulse">▍</span>}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
