"use client";

import { BookOpen, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  HELP,
  HELP_BY_ID,
  type HelpBlock,
  type HelpSection,
  INSTRUCTION_DOCS,
  instructionsInGroup,
  searchHelp,
} from "../lib/help";
import { brand, ink, line, radius, shadow, state, surface } from "../lib/theme";
import { type ElementType, INSTRUCTIONS } from "../lib/types";
import { InstructionDiagram, InstructionSymbol } from "./InstructionGraphic";
import css from "./ladx.module.css";

/**
 * The manual, as a dialog rather than a separate page.
 *
 * Deliberately not a new tab: somebody stuck on a rung wants the answer beside
 * the rung, and losing the editor to read about it is how people give up. Esc
 * closes it and they are back exactly where they were.
 */
export default function HelpDialog({
  topic,
  onClose,
}: {
  /** The section to open at, or null when closed. */
  topic: string | null;
  onClose: () => void;
}) {
  const [current, setCurrent] = useState(topic ?? "start");
  const [query, setQuery] = useState("");
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  // Opening at a topic beats opening at the contents: the tooltip that sent
  // them here already knew what they were asking about.
  //
  // Adjusted during render rather than in an effect. An effect would paint the
  // previous topic first and then correct it, which shows as a flicker of the
  // wrong page every time somebody follows a link from a tooltip.
  const [lastTopic, setLastTopic] = useState(topic);
  if (topic !== lastTopic) {
    setLastTopic(topic);
    if (topic) {
      setCurrent(topic);
      setQuery("");
    }
  }

  // A new section starts at its top. Keeping the old scroll position lands
  // people halfway down a page they have not read.
  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 });
  }, [current]);

  useEffect(() => {
    if (!topic) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [topic, onClose]);

  const results = useMemo(() => (query.trim() ? searchHelp(query) : null), [query]);
  const section = HELP_BY_ID.get(current) ?? HELP[0];

  if (!topic) return null;

  return (
    <div
      className={`fixed inset-0 z-[8000] grid place-items-center p-4 ${css.scrimIn}`}
      style={{ background: "rgba(15,23,42,0.42)", backdropFilter: "blur(1.5px)" }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-label="LADX Mini help"
        className={`w-full overflow-hidden flex flex-col ${css.dialogIn}`}
        style={{
          maxWidth: 940,
          height: "min(84vh, 700px)",
          background: surface.raised,
          borderRadius: radius.lg,
          boxShadow: shadow.dialog,
        }}
      >
        {/* Title bar */}
        <div
          className="flex items-center gap-2 px-3.5 shrink-0"
          style={{ height: 42, borderBottom: `1px solid ${line.soft}`, background: surface.subtle }}
        >
          <BookOpen size={14} style={{ color: brand.teal }} />
          <span
            style={{ fontSize: 12.5, fontWeight: 700, color: ink.strong, letterSpacing: "0.01em" }}
          >
            LADX Mini, Help
          </span>
          <span className="flex-1" />
          <div className="relative">
            <Search
              size={11}
              className="absolute left-2 top-1/2 -translate-y-1/2 text-ink-400 pointer-events-none"
            />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search the manual…"
              className={css.searchBox}
            />
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close help"
            className={`ml-1 ${css.iconBtn}`}
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 min-h-0 flex">
          {/* Contents */}
          <nav
            className="w-56 shrink-0 overflow-y-auto py-2"
            style={{ borderRight: `1px solid ${line.soft}`, background: surface.subtle }}
          >
            {(results ?? HELP).map((h) => (
              <button
                type="button"
                key={h.id}
                onClick={() => {
                  setCurrent(h.id);
                  if (results) setQuery("");
                }}
                className={`block w-full text-left px-3 py-1.5 ${css.tocItem}`}
                style={{
                  background: h.id === current && !results ? brand.tealWash : "transparent",
                  borderLeft: `2px solid ${h.id === current && !results ? brand.teal : "transparent"}`,
                }}
              >
                <span
                  style={{
                    display: "block",
                    fontSize: 11.5,
                    fontWeight: 600,
                    color: h.id === current && !results ? brand.tealInk : ink.base,
                  }}
                >
                  {h.title}
                </span>
                <span
                  style={{
                    display: "block",
                    fontSize: 10,
                    color: ink.faint,
                    lineHeight: 1.35,
                    marginTop: 1,
                  }}
                >
                  {h.summary}
                </span>
              </button>
            ))}
            {results?.length === 0 && (
              <p className="px-3 py-3 text-[11px] text-ink-500">
                Nothing matched “{query}”. Try a word from the thing you are stuck on, “timer”,
                “branch”, “download”.
              </p>
            )}
          </nav>

          {/* The page */}
          <div ref={bodyRef} className="flex-1 min-w-0 overflow-y-auto px-6 py-5">
            <h2
              style={{ fontSize: 18, fontWeight: 700, color: ink.strong, letterSpacing: "-0.01em" }}
            >
              {section.title}
            </h2>
            <p style={{ fontSize: 12, color: ink.muted, marginTop: 3 }}>{section.summary}</p>
            <div className="mt-4 space-y-3">
              {section.body.map((b, i) => (
                <Block key={i} b={b} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Block({ b }: { b: HelpBlock }) {
  if (b.kind === "p") {
    return <p className="text-[12.5px] leading-relaxed text-ink-700">{b.text}</p>;
  }
  if (b.kind === "note") {
    return (
      <p
        className="text-[12px] leading-relaxed text-ink-800 rounded px-3 py-2"
        style={{ background: "rgb(var(--ink-50))", borderLeft: "3px solid #2891FF" }}
      >
        {b.text}
      </p>
    );
  }
  if (b.kind === "steps") {
    return (
      <ol className="space-y-1.5">
        {b.items.map((t, i) => (
          <li key={i} className="flex gap-2.5 text-[12.5px] leading-relaxed text-ink-700">
            <span
              className="shrink-0 grid place-items-center rounded-full text-[10px] font-bold text-white mt-0.5"
              style={{ width: 17, height: 17, background: "rgb(var(--action))" }}
            >
              {i + 1}
            </span>
            <span>{t}</span>
          </li>
        ))}
      </ol>
    );
  }
  if (b.kind === "list") {
    return (
      <ul className="space-y-1">
        {b.items.map((t, i) => (
          <li key={i} className="flex gap-2 text-[12.5px] leading-relaxed text-ink-700">
            <span className="text-action shrink-0">•</span>
            <span>{t}</span>
          </li>
        ))}
      </ul>
    );
  }
  if (b.kind === "keys") {
    return (
      <table className="text-[12px]">
        <tbody>
          {b.items.map(([k, v], i) => (
            <tr key={i}>
              <td className="pr-4 py-0.5 align-top whitespace-nowrap">
                <kbd className="px-1.5 py-0.5 rounded text-[10.5px] font-mono border border-ink-200 bg-ink-50 text-ink-700">
                  {k}
                </kbd>
              </td>
              <td className="py-0.5 text-ink-700">{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  // An instruction group, expanded from the live instruction list.
  return (
    <section>
      <h3
        style={{
          fontSize: 11,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: ink.faint,
          marginTop: 26,
          marginBottom: 10,
          paddingBottom: 5,
          borderBottom: `1px solid ${line.soft}`,
        }}
      >
        {b.group}
      </h3>
      <div style={{ display: "grid", gap: 14 }}>
        {instructionsInGroup(b.group).map((meta) => (
          <InstructionCard key={meta.type} type={meta.type} label={meta.label} side={meta.side} />
        ))}
      </div>
    </section>
  );
}

/**
 * One instruction, in full.
 *
 * Laid out as symbol, then behaviour, then the words, which is the order
 * somebody actually needs them in. The drawing answers "what is this" faster
 * than any sentence, and by the time they reach the prose they already have
 * something to hang it on.
 */
function InstructionCard({
  type,
  label,
  side,
}: { type: ElementType; label: string; side: string }) {
  const doc = INSTRUCTION_DOCS[type];
  return (
    <article
      id={`instr-${type}`}
      style={{
        border: `1px solid ${line.soft}`,
        borderRadius: radius.md,
        overflow: "hidden",
        background: surface.raised,
      }}
    >
      {/* Header: the symbol beside the name, on one baseline. */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          padding: "10px 14px",
          background: surface.subtle,
          borderBottom: `1px solid ${line.soft}`,
        }}
      >
        <div style={{ flexShrink: 0, display: "grid", placeItems: "center", width: 86 }}>
          <InstructionSymbol type={type} scale={0.8} />
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span
              style={{
                fontFamily: "ui-monospace, monospace",
                fontSize: 13,
                fontWeight: 700,
                color: ink.strong,
              }}
            >
              {type}
            </span>
            <span style={{ fontSize: 12, color: ink.base }}>{label}</span>
          </div>
          {doc && (
            <p style={{ margin: "3px 0 0", fontSize: 11.5, lineHeight: 1.5, color: ink.muted }}>
              {doc.detail}
            </p>
          )}
        </div>
        <span
          style={{
            flexShrink: 0,
            alignSelf: "flex-start",
            fontSize: 8.5,
            fontWeight: 700,
            letterSpacing: "0.07em",
            textTransform: "uppercase",
            color: side === "output" ? brand.blueInk : ink.faint,
            background: side === "output" ? brand.blueWash : surface.sunken,
            border: `1px solid ${side === "output" ? `${brand.blue}40` : line.base}`,
            borderRadius: 999,
            padding: "2px 7px",
          }}
        >
          {side}
        </span>
      </header>

      <div style={{ padding: "12px 14px", display: "grid", gap: 12 }}>
        {/* The diagram, the part that does the explaining. */}
        <div
          style={{
            background: surface.subtle,
            border: `1px solid ${line.hairline}`,
            borderRadius: radius.sm,
            padding: "10px 12px",
          }}
        >
          <InstructionDiagram type={type} />
        </div>

        {doc && doc.operands.length > 0 && (
          <dl
            style={{
              margin: 0,
              display: "grid",
              gridTemplateColumns: "auto 1fr",
              columnGap: 12,
              rowGap: 3,
              alignItems: "baseline",
            }}
          >
            {doc.operands.map(([n, d]) => (
              <div key={n} style={{ display: "contents" }}>
                <dt
                  style={{
                    fontFamily: "ui-monospace, monospace",
                    fontSize: 10.5,
                    fontWeight: 700,
                    color: brand.tealInk,
                    whiteSpace: "nowrap",
                  }}
                >
                  {n}
                </dt>
                <dd style={{ margin: 0, fontSize: 11, color: ink.muted }}>{d}</dd>
              </div>
            ))}
          </dl>
        )}

        {doc?.example && (
          <p style={{ margin: 0, fontSize: 11.5, lineHeight: 1.55, color: ink.base }}>
            <span style={{ fontWeight: 700, color: ink.strong }}>Example. </span>
            {doc.example}
          </p>
        )}

        {doc?.gotcha && (
          <p
            style={{
              margin: 0,
              fontSize: 11.5,
              lineHeight: 1.55,
              color: state.warn,
              background: state.warnWash,
              borderLeft: `3px solid ${state.warnEdge}`,
              borderRadius: `0 ${radius.sm}px ${radius.sm}px 0`,
              padding: "7px 10px",
            }}
          >
            <span style={{ fontWeight: 700 }}>Watch out. </span>
            {doc.gotcha}
          </p>
        )}
      </div>
    </article>
  );
}

/** Every instruction type, for callers that want to deep-link one. */
export const ALL_INSTRUCTION_TYPES = INSTRUCTIONS.map((i) => i.type);
export type { HelpSection };
