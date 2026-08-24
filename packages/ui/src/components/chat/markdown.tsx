import type { ReactNode } from "react";

/**
 * Markdown for chat answers.
 *
 * Assistant replies arrive as markdown and were being rendered as pre-wrapped
 * plain text, so every list, heading and bold run showed its own syntax. That
 * is the single biggest difference between this and the assistants people are
 * used to: the content was right and it read like a source file.
 *
 * Deliberately small. It handles what a model actually emits in an answer,
 * escapes everything it does not understand, and never builds HTML from a
 * string, so there is no innerHTML anywhere and nothing a reply can inject.
 * Code fences are handled by the caller, which owns the validator-aware block.
 */

type Inline =
  | { kind: "text"; text: string }
  | { kind: "bold"; text: string }
  | { kind: "italic"; text: string }
  | { kind: "code"; text: string }
  | { kind: "link"; text: string; href: string };

/**
 * Split a line into styled runs.
 *
 * Order matters: code first, so backticked text containing asterisks is left
 * alone, then links, then bold before italic because `**` would otherwise be
 * consumed as two italic markers.
 */
function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  const pattern = /(`[^`]+`)|(\[[^\]]+\]\([^)\s]+\))|(\*\*[^*]+\*\*)|(\*[^*]+\*|_[^_]+_)/g;
  let last = 0;

  for (const m of text.matchAll(pattern)) {
    const at = m.index ?? 0;
    if (at > last) out.push({ kind: "text", text: text.slice(last, at) });
    const token = m[0];

    if (token.startsWith("`")) {
      out.push({ kind: "code", text: token.slice(1, -1) });
    } else if (token.startsWith("[")) {
      const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(token);
      if (link) out.push({ kind: "link", text: link[1] as string, href: link[2] as string });
      else out.push({ kind: "text", text: token });
    } else if (token.startsWith("**")) {
      out.push({ kind: "bold", text: token.slice(2, -2) });
    } else {
      out.push({ kind: "italic", text: token.slice(1, -1) });
    }
    last = at + token.length;
  }
  if (last < text.length) out.push({ kind: "text", text: text.slice(last) });
  return out;
}

/** Only http(s) and mailto survive. A model can emit a javascript: URL. */
function safeHref(href: string): string | null {
  const trimmed = href.trim();
  return /^(https?:\/\/|mailto:|\/)/i.test(trimmed) ? trimmed : null;
}

function renderInline(spans: Inline[], keyPrefix: string): ReactNode[] {
  return spans.map((span, i) => {
    const key = `${keyPrefix}-${i}`;
    switch (span.kind) {
      case "bold":
        return (
          <strong key={key} className="font-semibold text-ink-900">
            {span.text}
          </strong>
        );
      case "italic":
        return (
          <em key={key} className="italic">
            {span.text}
          </em>
        );
      case "code":
        return (
          <code
            key={key}
            className="rounded border border-ink-200 bg-ink-50 px-1 py-0.5 font-mono text-[0.85em] text-ink-800"
          >
            {span.text}
          </code>
        );
      case "link": {
        const href = safeHref(span.href);
        if (!href) return <span key={key}>{span.text}</span>;
        return (
          <a
            key={key}
            href={href}
            target="_blank"
            rel="noreferrer noopener"
            className="text-teal-700 underline underline-offset-2 hover:text-teal-800"
          >
            {span.text}
          </a>
        );
      }
      default:
        return <span key={key}>{span.text}</span>;
    }
  });
}

/**
 * Render one text segment of an answer.
 *
 * Blank-line separated blocks, with headings, bullets, numbered lists, block
 * quotes and rules recognised. Anything else is a paragraph.
 */
export function Markdown({ text }: { text: string }) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const out: ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = (lines[i] ?? "").trim();

    if (line === "") {
      i++;
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line)) {
      out.push(<hr key={`k${key++}`} className="my-3 border-ink-100" />);
      i++;
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      const level = (heading[1] as string).length;
      const body = renderInline(parseInline(heading[2] ?? ""), `h${key}`);
      const size = level <= 2 ? "text-[15.5px]" : level === 3 ? "text-[14.5px]" : "text-[13.5px]";
      out.push(
        <p key={`k${key++}`} className={`mt-3 mb-1 font-semibold text-ink-900 ${size}`}>
          {body}
        </p>,
      );
      i++;
      continue;
    }

    if (line.startsWith("> ")) {
      const quoted: string[] = [];
      while (i < lines.length && (lines[i] ?? "").trim().startsWith("> ")) {
        quoted.push((lines[i] as string).trim().slice(2));
        i++;
      }
      out.push(
        <blockquote
          key={`k${key++}`}
          className="my-2 border-l-2 border-ink-200 py-0.5 pl-3 text-ink-600"
        >
          {renderInline(parseInline(quoted.join(" ")), `q${key}`)}
        </blockquote>,
      );
      continue;
    }

    if (/^[-*+]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*+]\s+/.test((lines[i] ?? "").trim())) {
        items.push((lines[i] as string).trim().replace(/^[-*+]\s+/, ""));
        i++;
      }
      out.push(
        <ul key={`k${key++}`} className="my-2 list-disc space-y-1 pl-5 marker:text-ink-300">
          {items.map((item, n) => (
            <li key={`li${n}-${item.slice(0, 12)}`}>
              {renderInline(parseInline(item), `ul${key}-${n}`)}
            </li>
          ))}
        </ul>,
      );
      continue;
    }

    if (/^\d+[.)]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+[.)]\s+/.test((lines[i] ?? "").trim())) {
        items.push((lines[i] as string).trim().replace(/^\d+[.)]\s+/, ""));
        i++;
      }
      out.push(
        <ol key={`k${key++}`} className="my-2 list-decimal space-y-1 pl-5 marker:text-ink-400">
          {items.map((item, n) => (
            <li key={`ol${n}-${item.slice(0, 12)}`}>
              {renderInline(parseInline(item), `ol${key}-${n}`)}
            </li>
          ))}
        </ol>,
      );
      continue;
    }

    // A paragraph runs until a blank line or the start of another block.
    const para: string[] = [];
    while (i < lines.length) {
      const next = (lines[i] ?? "").trim();
      if (
        next === "" ||
        /^#{1,6}\s/.test(next) ||
        /^[-*+]\s/.test(next) ||
        /^\d+[.)]\s/.test(next) ||
        next.startsWith("> ") ||
        /^(-{3,}|\*{3,}|_{3,})$/.test(next)
      ) {
        break;
      }
      para.push(next);
      i++;
    }
    out.push(
      <p key={`k${key++}`} className="my-2 leading-relaxed first:mt-0 last:mb-0">
        {renderInline(parseInline(para.join(" ")), `p${key}`)}
      </p>,
    );
  }

  return <>{out}</>;
}
