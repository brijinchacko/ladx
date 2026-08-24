"use client";

import {
  DRAWING_TEMPLATES,
  type DrawingTemplate,
  TEMPLATE_SECTIONS,
} from "@/lib/cad/drawing-templates";
import { type CadSymbol, symbolsByFamily } from "@/lib/cad/symbols";
import { SHEETS, type SheetSize } from "@/lib/cad/titleblock";
import type { Layer } from "@/lib/cad/types";
import { Eye, EyeOff, Lock, LockOpen, PanelRight, StickyNote } from "lucide-react";
import { useState } from "react";

type Tab = "sheets" | "schematic" | "panel" | "layers";

/**
 * The rail beside the canvas.
 *
 * Symbols first, because on a real job most of what goes onto a drawing is a
 * thing that already exists rather than a line drawn from scratch, and a
 * library you have to go looking for does not get used. Layers sit behind a tab
 * rather than in a permanently open panel: they are set up once and touched
 * rarely, so giving them the same room as the library would be backwards.
 */
export default function CadRail({
  layers,
  activeLayer,
  onActivateLayer,
  onLayerFlag,
  onInsertSymbol,
  onInsertSheet,
  onInsertTemplate,
}: {
  layers: Layer[];
  activeLayer: string;
  onActivateLayer: (name: string) => void;
  onLayerFlag: (name: string, flag: "visible" | "locked", value: boolean) => void;
  onInsertSymbol: (s: CadSymbol) => void;
  onInsertSheet: (s: SheetSize) => void;
  onInsertTemplate: (t: DrawingTemplate) => void;
}) {
  const [open, setOpen] = useState(true);
  const [tab, setTab] = useState<Tab>("sheets");

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Show the symbol library"
        title="Show the symbol library"
        className="flex w-9 shrink-0 items-start justify-center border-l border-ink-100 bg-ink-50/40 pt-3 text-ink-400 transition-colors hover:text-ink-900"
      >
        <PanelRight className="h-4 w-4" />
      </button>
    );
  }

  return (
    <aside className="flex w-60 shrink-0 flex-col border-l border-ink-100 bg-ink-50/40">
      <div className="flex shrink-0 items-center gap-0.5 border-b border-ink-100 p-1.5">
        {(
          [
            { id: "sheets", label: "Sheets" },
            { id: "schematic", label: "Schematic" },
            { id: "panel", label: "Panel" },
            { id: "layers", label: "Layers" },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`flex-1 rounded px-1.5 py-1 text-[11.5px] transition-colors ${
              tab === t.id ? "bg-ink-900 text-white" : "text-ink-500 hover:bg-ink-100"
            }`}
          >
            {t.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Hide the rail"
          className="flex h-6 w-6 items-center justify-center rounded text-ink-300 transition-colors hover:bg-ink-100 hover:text-ink-700"
        >
          <PanelRight className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {tab === "sheets" ? (
          <>
            <p className="mb-2 px-1 text-[11px] leading-snug text-ink-500">
              A working sheet from the standard set, numbered and laid out, with its title block
              filled from the project. Drawn to be corrected rather than admired.
            </p>
            {TEMPLATE_SECTIONS.map((section) => {
              const items = DRAWING_TEMPLATES.filter((t) => t.section === section);
              if (!items.length) return null;
              return (
                <div key={section} className="mb-3">
                  <p className="mb-1 px-1 font-mono text-[9.5px] uppercase tracking-[0.12em] text-ink-400">
                    {section}
                  </p>
                  <ul className="space-y-1">
                    {items.map((t) => (
                      <li key={t.id}>
                        <button
                          type="button"
                          onClick={() => onInsertTemplate(t)}
                          className="w-full rounded-md border border-ink-200 bg-white px-2 py-1.5 text-left transition-colors hover:border-ink-400"
                        >
                          <span className="flex items-baseline gap-2">
                            <span className="shrink-0 rounded bg-ink-900 px-1 py-0.5 font-mono text-[9px] font-semibold text-white">
                              {t.sheet}
                            </span>
                            <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-ink-900">
                              {t.name}
                            </span>
                            <span className="shrink-0 font-mono text-[9px] text-ink-400">
                              {t.sheetSize}
                            </span>
                          </span>
                          <span className="mt-0.5 block text-[11px] leading-snug text-ink-500">
                            {t.note}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </>
        ) : tab === "layers" ? (
          <ul className="space-y-px">
            {layers.map((l) => (
              <li
                key={l.name}
                className={`flex items-center gap-1 rounded px-1.5 py-1 ${
                  activeLayer === l.name ? "bg-ink-900/5" : ""
                }`}
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-sm border border-ink-200"
                  style={{ background: `#${l.color}` }}
                />
                <button
                  type="button"
                  onClick={() => onActivateLayer(l.name)}
                  title="Draw on this layer"
                  className={`min-w-0 flex-1 truncate text-left font-mono text-[11.5px] ${
                    activeLayer === l.name ? "font-semibold text-ink-900" : "text-ink-600"
                  }`}
                >
                  {l.name}
                </button>
                <button
                  type="button"
                  onClick={() => onLayerFlag(l.name, "visible", !l.visible)}
                  aria-label={l.visible ? `Hide ${l.name}` : `Show ${l.name}`}
                  className="flex h-5 w-5 items-center justify-center rounded text-ink-400 hover:bg-ink-100 hover:text-ink-900"
                >
                  {l.visible ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                </button>
                <button
                  type="button"
                  onClick={() => onLayerFlag(l.name, "locked", !l.locked)}
                  aria-label={l.locked ? `Unlock ${l.name}` : `Lock ${l.name}`}
                  className={`flex h-5 w-5 items-center justify-center rounded hover:bg-ink-100 ${
                    l.locked ? "text-[#B4531A]" : "text-ink-400 hover:text-ink-900"
                  }`}
                >
                  {l.locked ? <Lock className="h-3 w-3" /> : <LockOpen className="h-3 w-3" />}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <>
            <ul className="space-y-1">
              {symbolsByFamily(tab).map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => onInsertSymbol(s)}
                    className="w-full rounded-md border border-ink-200 bg-white px-2 py-1.5 text-left transition-colors hover:border-ink-400"
                  >
                    <span className="flex items-baseline gap-2">
                      <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-ink-900">
                        {s.name}
                      </span>
                      <span className="shrink-0 font-mono text-[9.5px] tabular-nums text-ink-400">
                        {s.size}
                      </span>
                    </span>
                    <span className="mt-0.5 block text-[11px] leading-snug text-ink-500">
                      {s.note}
                    </span>
                  </button>
                </li>
              ))}
            </ul>

            {tab === "panel" && (
              <div className="mt-4 border-t border-ink-100 pt-3">
                <p className="mb-1.5 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-400">
                  <StickyNote className="h-3 w-3" />
                  Sheet and title block
                </p>
                <p className="mb-2 text-[11px] leading-snug text-ink-500">
                  Filled from the project, the client and your company profile.
                </p>
                <div className="flex flex-wrap gap-1">
                  {SHEETS.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => onInsertSheet(s)}
                      title={`${s.name}, ${s.w} x ${s.h} mm`}
                      className="rounded border border-ink-200 bg-white px-2 py-1 font-mono text-[11px] text-ink-600 transition-colors hover:border-ink-400 hover:text-ink-900"
                    >
                      {s.id}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </aside>
  );
}
