"use client";

import type { Tag } from "@ladx/studio";
import { Layers, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import { type BulkOptions, DEFAULT_BULK, buildBulkAlarms } from "../lib/alarm-bulk";
import { paramsUsed } from "../lib/faceplates";
import { PANEL_PRESETS, sanitiseSize } from "../lib/panels";
import { getSymbol } from "../lib/symbols";
import { ROLE_ORDER } from "../lib/types";
import type {
  AlarmCondition,
  AlarmDef,
  AlarmPriority,
  Connection,
  Faceplate,
  HmiDoc,
  Protocol,
  Recipe,
  Screen,
  TrendDef,
} from "../lib/types";

/**
 * Everything about the application that is not a drawing.
 *
 * The tags it owns, the alarms defined on tags, the trends, the connection,
 * and the screens themselves. In a drawer rather than the properties pane
 * because these are documents in their own right: an alarm has eight fields
 * and a response instruction, and squeezing that into a 280 pixel column is
 * how alarm configuration ends up done badly.
 */

type Tab =
  | "screen"
  | "tags"
  | "alarms"
  | "trends"
  | "recipes"
  | "faceplates"
  | "security"
  | "connection";

const CONDITIONS: { id: AlarmCondition; label: string; needsSetpoint: boolean; hint: string }[] = [
  { id: "digital", label: "Digital", needsSetpoint: false, hint: "Trips on a bit." },
  { id: "hi", label: "High", needsSetpoint: true, hint: "Trips at or above the limit." },
  { id: "hihi", label: "High high", needsSetpoint: true, hint: "The second, more urgent limit." },
  { id: "lo", label: "Low", needsSetpoint: true, hint: "Trips at or below the limit." },
  { id: "lolo", label: "Low low", needsSetpoint: true, hint: "The second, more urgent limit." },
  {
    id: "deviation",
    label: "Deviation",
    needsSetpoint: true,
    hint: "Trips on magnitude, either direction.",
  },
  {
    id: "roc",
    label: "Rate of change",
    needsSetpoint: true,
    hint: "Trips on how fast it is moving.",
  },
];

/**
 * Four priorities and a journal level.
 *
 * EEMUA 191 and ISA-18.2 both warn that more than about four is a distinction
 * an operator cannot make under load. "Journal" is the honest name for
 * recorded but not an alarm, which is where most of what people want to alarm
 * on actually belongs.
 */
const PRIORITIES: { id: AlarmPriority; label: string; hint: string }[] = [
  { id: "critical", label: "Critical", hint: "Act now or something is damaged or hurt." },
  { id: "high", label: "High", hint: "Act within minutes." },
  { id: "medium", label: "Medium", hint: "Act this shift." },
  { id: "low", label: "Low", hint: "Note it." },
  { id: "journal", label: "Journal", hint: "Recorded, never announced." },
];

const PROTOCOLS: { id: Protocol; label: string; hint: string }[] = [
  {
    id: "simulated",
    label: "Simulated",
    hint: "Driven by this project's ladder program. What Run uses, and the only one that moves.",
  },
  { id: "opcua", label: "OPC UA", hint: "Vendor-neutral. An endpoint URL and a security policy." },
  {
    id: "modbus-tcp",
    label: "Modbus TCP",
    hint: "Registers, a unit id, and a word order you must state.",
  },
  { id: "ethernet-ip", label: "EtherNet/IP", hint: "Rockwell. Tag-based, addressed by CIP path." },
  { id: "s7", label: "S7 comms", hint: "Siemens. Rack and slot, data blocks." },
];

export default function HmiSetup({
  doc,
  plcTags,
  screenId,
  initialTab = "alarms",
  onChange,
  onClose,
}: {
  doc: HmiDoc;
  plcTags: Tag[];
  screenId: string;
  /** Which tab to land on, so clicking Alarms in the tree opens Alarms. */
  initialTab?: Tab;
  onChange: (fn: (d: HmiDoc) => HmiDoc) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const screen = doc.screens.find((s) => s.id === screenId) ?? doc.screens[0];

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-ink-900/30"
      onClick={onClose}
      onKeyDown={undefined}
    >
      <div
        className="flex h-full w-full max-w-2xl flex-col bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-center gap-3 border-b border-ink-100 px-4 py-3">
          <h2 className="font-display text-[15px] font-bold text-ink-900">Setup</h2>
          <nav className="ml-2 flex gap-0.5">
            {(
              [
                "screen",
                "tags",
                "alarms",
                "trends",
                "recipes",
                "faceplates",
                "security",
                "connection",
              ] as Tab[]
            ).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`rounded-sm px-2 py-1 text-[12.5px] capitalize transition-colors ${
                  tab === t ? "bg-ink-900 text-white" : "text-ink-600 hover:bg-ink-50"
                }`}
              >
                {t}
              </button>
            ))}
          </nav>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto text-ink-400 hover:text-ink-900"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {tab === "screen" && screen && (
            <ScreenTab screen={screen} doc={doc} onChange={onChange} />
          )}
          {tab === "tags" && <TagsTab doc={doc} onChange={onChange} />}
          {tab === "alarms" && <AlarmsTab doc={doc} plcTags={plcTags} onChange={onChange} />}
          {tab === "trends" && <TrendsTab doc={doc} plcTags={plcTags} onChange={onChange} />}
          {tab === "recipes" && <RecipesTab doc={doc} plcTags={plcTags} onChange={onChange} />}
          {tab === "faceplates" && (
            <FaceplatesTab doc={doc} screenId={screenId} onChange={onChange} />
          )}
          {tab === "security" && <SecurityTab doc={doc} onChange={onChange} />}
          {tab === "connection" && <ConnectionTab conn={doc.connection} onChange={onChange} />}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────── screen ─────────────────────────────── */

function ScreenTab({
  screen,
  doc,
  onChange,
}: { screen: Screen; doc: HmiDoc; onChange: (fn: (d: HmiDoc) => HmiDoc) => void }) {
  const patch = (p: Partial<Screen>) =>
    onChange((d) => {
      const s = d.screens.find((x) => x.id === screen.id);
      if (s) Object.assign(s, p);
      return d;
    });

  return (
    <div className="space-y-4">
      <Field label="Name">
        <input
          value={screen.name}
          onChange={(e) => patch({ name: e.target.value })}
          className={box}
        />
      </Field>
      <Field label="Slug" hint="What a navigation button names.">
        <input
          value={screen.slug}
          onChange={(e) =>
            patch({ slug: e.target.value.replace(/[^a-z0-9-]/gi, "-").toLowerCase() })
          }
          className={box}
        />
      </Field>

      <Field label="Size" hint="Changing this does not move what is already drawn.">
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="number"
            value={screen.size.width}
            onChange={(e) =>
              patch({ size: sanitiseSize({ ...screen.size, width: Number(e.target.value) }) })
            }
            className={`${box} w-24`}
          />
          <span className="text-ink-400">×</span>
          <input
            type="number"
            value={screen.size.height}
            onChange={(e) =>
              patch({ size: sanitiseSize({ ...screen.size, height: Number(e.target.value) }) })
            }
            className={`${box} w-24`}
          />
          <select
            value=""
            onChange={(e) => {
              const p = PANEL_PRESETS.find((x) => x.id === e.target.value);
              if (p) patch({ size: p.size });
            }}
            className={`${box} w-auto`}
          >
            <option value="">from a panel…</option>
            {PANEL_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label} · {p.size.width}×{p.size.height}
              </option>
            ))}
          </select>
        </div>
      </Field>

      <Field label="Background" hint="ISA-101 asks for a quiet ground so deviation stands out.">
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={screen.background}
            onChange={(e) => patch({ background: e.target.value })}
            className="h-7 w-12"
          />
          {["#E8EAEC", "#DDE1E4", "#F2F4F5", "#2B3138"].map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => patch({ background: c })}
              style={{ background: c }}
              className="h-7 w-7 rounded-sm border border-ink-300"
              aria-label={`Use ${c}`}
            />
          ))}
        </div>
      </Field>

      <Field label="Home screen" hint="What the panel opens on.">
        <select
          value={doc.homeSlug ?? ""}
          onChange={(e) => onChange((d) => ({ ...d, homeSlug: e.target.value }))}
          className={box}
        >
          {doc.screens.map((s) => (
            <option key={s.id} value={s.slug}>
              {s.name}
            </option>
          ))}
        </select>
      </Field>

      {doc.screens.length > 1 && (
        <button
          type="button"
          onClick={() =>
            onChange((d) => ({ ...d, screens: d.screens.filter((s) => s.id !== screen.id) }))
          }
          className="flex items-center gap-1.5 text-[12.5px] text-danger hover:underline"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Delete this screen and its {screen.widgets.length} objects
        </button>
      )}
    </div>
  );
}

/* ─────────────────────────────── tags ─────────────────────────────── */

function TagsTab({
  doc,
  onChange,
}: { doc: HmiDoc; onChange: (fn: (d: HmiDoc) => HmiDoc) => void }) {
  return (
    <div>
      <p className="mb-3 text-[12.5px] leading-relaxed text-ink-500">
        The HMI's own tags: setpoint buffers, screen state, recipe selection. Controller tags are
        not listed here because the HMI does not own them, it binds to the ladder program's table by
        name.
      </p>

      <button
        type="button"
        onClick={() =>
          onChange((d) => {
            d.tags.push({ name: `Tag_${d.tags.length + 1}`, type: "INT", value: 0 });
            return d;
          })
        }
        className={addBtn}
      >
        <Plus className="h-3 w-3" />
        Add a tag
      </button>

      {doc.tags.length === 0 ? (
        <p className="mt-3 text-[12.5px] text-ink-400">None yet.</p>
      ) : (
        <table className="mt-3 w-full text-[12.5px]">
          <thead>
            <tr className="text-left font-mono text-[10px] uppercase tracking-[0.1em] text-ink-400">
              <th className="pb-1">Name</th>
              <th className="pb-1">Type</th>
              <th className="pb-1">Initial</th>
              <th className="pb-1">Comment</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {doc.tags.map((t, i) => (
              <tr key={t.name} className="border-t border-ink-100">
                <td className="py-1 pr-1">
                  <input
                    value={t.name}
                    onChange={(e) =>
                      onChange((d) => {
                        const x = d.tags[i];
                        // Names are identifiers: a tag with a space in it
                        // cannot be written in a binding expression.
                        if (x) x.name = e.target.value.replace(/[^\w]/g, "_");
                        return d;
                      })
                    }
                    className={`${box} font-mono`}
                  />
                </td>
                <td className="py-1 pr-1">
                  <select
                    value={t.type}
                    onChange={(e) =>
                      onChange((d) => {
                        const x = d.tags[i];
                        if (x) x.type = e.target.value as typeof t.type;
                        return d;
                      })
                    }
                    className={box}
                  >
                    <option>BOOL</option>
                    <option>INT</option>
                  </select>
                </td>
                <td className="py-1 pr-1">
                  <input
                    type="number"
                    value={t.value}
                    onChange={(e) =>
                      onChange((d) => {
                        const x = d.tags[i];
                        if (x) x.value = Number(e.target.value) || 0;
                        return d;
                      })
                    }
                    className={`${box} w-16`}
                  />
                </td>
                <td className="py-1 pr-1">
                  <input
                    value={t.comment ?? ""}
                    onChange={(e) =>
                      onChange((d) => {
                        const x = d.tags[i];
                        if (x) x.comment = e.target.value;
                        return d;
                      })
                    }
                    className={box}
                  />
                </td>
                <td>
                  <button
                    type="button"
                    onClick={() =>
                      onChange((d) => ({ ...d, tags: d.tags.filter((_, j) => j !== i) }))
                    }
                    className="text-ink-400 hover:text-danger"
                    aria-label={`Delete ${t.name}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/* ─────────────────────────────── alarms ─────────────────────────────── */

function AlarmsTab({
  doc,
  plcTags,
  onChange,
}: { doc: HmiDoc; plcTags: Tag[]; onChange: (fn: (d: HmiDoc) => HmiDoc) => void }) {
  const patch = (i: number, p: Partial<AlarmDef>) =>
    onChange((d) => {
      const a = d.alarms[i];
      if (a) Object.assign(a, p);
      return d;
    });

  return (
    <div>
      <p className="mb-3 text-[12.5px] leading-relaxed text-ink-500">
        Alarms are defined on tags, which is how Ignition and FactoryTalk do it and for the same
        reason: a list kept beside the tag table drifts from it.
      </p>

      <BulkAlarms doc={doc} plcTags={plcTags} onChange={onChange} />

      <button
        type="button"
        onClick={() =>
          onChange((d) => {
            d.alarms.push({
              id: `al${Math.random().toString(36).slice(2, 8)}`,
              target: { source: "plc", tag: plcTags[0]?.name ?? "" },
              condition: "digital",
              priority: "medium",
              message: "New alarm",
              enabled: true,
            });
            return d;
          })
        }
        className={addBtn}
      >
        <Plus className="h-3 w-3" />
        Add an alarm
      </button>

      <div className="mt-3 space-y-3">
        {doc.alarms.map((a, i) => {
          const cond = CONDITIONS.find((c) => c.id === a.condition);
          return (
            <div key={a.id} className="rounded-md border border-ink-200 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={a.message}
                  onChange={(e) => patch(i, { message: e.target.value })}
                  placeholder="What the operator sees"
                  className={`${box} min-w-0 flex-1`}
                />
                <label className="flex items-center gap-1 text-[12px] text-ink-600">
                  <input
                    type="checkbox"
                    checked={a.enabled}
                    onChange={(e) => patch(i, { enabled: e.target.checked })}
                  />
                  on
                </label>
                <button
                  type="button"
                  onClick={() =>
                    onChange((d) => ({ ...d, alarms: d.alarms.filter((_, j) => j !== i) }))
                  }
                  className="text-ink-400 hover:text-danger"
                  aria-label="Delete alarm"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                <Field label="Tag">
                  <select
                    value={`${a.target.source}:${a.target.tag}`}
                    onChange={(e) => {
                      const [source, tag] = e.target.value.split(":");
                      patch(i, { target: { source: source as "plc" | "hmi", tag: tag ?? "" } });
                    }}
                    className={box}
                  >
                    {plcTags.map((t) => (
                      <option key={t.name} value={`plc:${t.name}`}>
                        {t.name}
                      </option>
                    ))}
                    {doc.tags.map((t) => (
                      <option key={t.name} value={`hmi:${t.name}`}>
                        {t.name} (HMI)
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Condition">
                  <select
                    value={a.condition}
                    onChange={(e) => patch(i, { condition: e.target.value as AlarmCondition })}
                    className={box}
                  >
                    {CONDITIONS.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Priority">
                  <select
                    value={a.priority}
                    onChange={(e) => patch(i, { priority: e.target.value as AlarmPriority })}
                    className={box}
                  >
                    {PRIORITIES.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </Field>

                {cond?.needsSetpoint ? (
                  <>
                    <Field label="Limit">
                      <input
                        type="number"
                        value={a.setpoint ?? 0}
                        onChange={(e) => patch(i, { setpoint: Number(e.target.value) })}
                        className={box}
                      />
                    </Field>
                    <Field label="Deadband" hint="Stops it chattering on the limit.">
                      <input
                        type="number"
                        value={a.deadband ?? 0}
                        onChange={(e) => patch(i, { deadband: Number(e.target.value) })}
                        className={box}
                      />
                    </Field>
                  </>
                ) : (
                  <Field label="Alarms when">
                    <select
                      value={a.trueIsAlarm === false ? "0" : "1"}
                      onChange={(e) => patch(i, { trueIsAlarm: e.target.value === "1" })}
                      className={box}
                    >
                      <option value="1">the bit is 1</option>
                      <option value="0">the bit is 0</option>
                    </select>
                  </Field>
                )}

                <Field label="On delay" hint="Seconds it must hold.">
                  <input
                    type="number"
                    value={a.onDelay ?? 0}
                    onChange={(e) => patch(i, { onDelay: Number(e.target.value) })}
                    className={box}
                  />
                </Field>
              </div>

              <Field label="Response" hint="ISA-18.2 asks what the operator should actually do.">
                <input
                  value={a.response ?? ""}
                  onChange={(e) => patch(i, { response: e.target.value })}
                  placeholder="Close the inlet valve and check the level transmitter."
                  className={box}
                />
              </Field>

              <p className="mt-1 text-[11.5px] text-ink-400">
                {cond?.hint} {PRIORITIES.find((p) => p.id === a.priority)?.hint}
              </p>
            </div>
          );
        })}
        {doc.alarms.length === 0 && <p className="text-[12.5px] text-ink-400">None yet.</p>}
      </div>
    </div>
  );
}

/* ─────────────────────────────── trends ─────────────────────────────── */

function TrendsTab({
  doc,
  plcTags,
  onChange,
}: { doc: HmiDoc; plcTags: Tag[]; onChange: (fn: (d: HmiDoc) => HmiDoc) => void }) {
  const patch = (i: number, p: Partial<TrendDef>) =>
    onChange((d) => {
      const t = d.trends[i];
      if (t) Object.assign(t, p);
      return d;
    });

  return (
    <div>
      <button
        type="button"
        onClick={() =>
          onChange((d) => {
            d.trends.push({
              id: `tr${Math.random().toString(36).slice(2, 8)}`,
              name: `Trend ${d.trends.length + 1}`,
              pens: [],
              span: 300,
              interval: 1000,
            });
            return d;
          })
        }
        className={addBtn}
      >
        <Plus className="h-3 w-3" />
        Add a trend
      </button>

      <div className="mt-3 space-y-3">
        {doc.trends.map((tr, i) => (
          <div key={tr.id} className="rounded-md border border-ink-200 p-3">
            <div className="flex items-center gap-2">
              <input
                value={tr.name}
                onChange={(e) => patch(i, { name: e.target.value })}
                className={`${box} flex-1`}
              />
              <button
                type="button"
                onClick={() =>
                  onChange((d) => ({ ...d, trends: d.trends.filter((_, j) => j !== i) }))
                }
                className="text-ink-400 hover:text-danger"
                aria-label="Delete trend"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <Field label="Span" hint="Seconds of history held.">
                <input
                  type="number"
                  value={tr.span}
                  onChange={(e) => patch(i, { span: Number(e.target.value) || 60 })}
                  className={box}
                />
              </Field>
              <Field label="Interval" hint="Milliseconds between samples.">
                <input
                  type="number"
                  value={tr.interval}
                  onChange={(e) => patch(i, { interval: Number(e.target.value) || 1000 })}
                  className={box}
                />
              </Field>
            </div>

            <p className="mt-1 text-[11.5px] text-ink-400">
              {Math.ceil((tr.span * 1000) / Math.max(50, tr.interval))} samples held. Sampling
              faster than the eye can use costs memory and buys nothing.
            </p>

            <div className="mt-2">
              <span className="mb-1 block font-mono text-[10px] uppercase tracking-[0.1em] text-ink-400">
                Pens
              </span>
              {tr.pens.map((pen, pi) => (
                <div key={pen.id} className="mb-1 flex items-center gap-2">
                  <input
                    type="color"
                    value={pen.colour}
                    onChange={(e) =>
                      onChange((d) => {
                        const p = d.trends[i]?.pens[pi];
                        if (p) p.colour = e.target.value;
                        return d;
                      })
                    }
                    className="h-6 w-9"
                  />
                  <select
                    value={pen.target.tag}
                    onChange={(e) =>
                      onChange((d) => {
                        const p = d.trends[i]?.pens[pi];
                        if (p) p.target = { source: "plc", tag: e.target.value };
                        return d;
                      })
                    }
                    className={`${box} flex-1`}
                  >
                    {plcTags.map((t) => (
                      <option key={t.name} value={t.name}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() =>
                      onChange((d) => {
                        const t = d.trends[i];
                        if (t) t.pens = t.pens.filter((_, j) => j !== pi);
                        return d;
                      })
                    }
                    className="text-ink-400 hover:text-danger"
                    aria-label="Remove pen"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() =>
                  onChange((d) => {
                    const t = d.trends[i];
                    if (t)
                      t.pens.push({
                        id: `p${Math.random().toString(36).slice(2, 7)}`,
                        target: { source: "plc", tag: plcTags[0]?.name ?? "" },
                        colour: ["#3FBFB5", "#B4531A", "#3A4550", "#7A8894"][
                          t.pens.length % 4
                        ] as string,
                      });
                    return d;
                  })
                }
                className="text-[12px] text-ink-600 hover:text-teal-700"
              >
                + pen
              </button>
            </div>
          </div>
        ))}
        {doc.trends.length === 0 && <p className="text-[12.5px] text-ink-400">None yet.</p>}
      </div>
    </div>
  );
}

/* ─────────────────────────── connection ─────────────────────────── */

function ConnectionTab({
  conn,
  onChange,
}: { conn: Connection; onChange: (fn: (d: HmiDoc) => HmiDoc) => void }) {
  const patch = (p: Partial<Connection>) =>
    onChange((d) => ({ ...d, connection: { ...d.connection, ...p } }));
  const proto = PROTOCOLS.find((p) => p.id === conn.protocol);

  return (
    <div className="space-y-4">
      <p className="text-[12.5px] leading-relaxed text-ink-500">
        Configured and exported, never dialled. LADX does not open sockets to plant equipment: Run
        is driven by this project's ladder program, which is what makes a screen testable at a desk.
        These settings exist because the design has to be recorded and handed over, and because a
        screen built against the wrong word order is a commissioning day nobody enjoys.
      </p>

      <Field label="Protocol">
        <select
          value={conn.protocol}
          onChange={(e) => {
            // The protocol's defaults are written, not just displayed.
            // Showing 502 in a port field that stores nothing means an
            // exported connection is missing the port that the person
            // configuring it believed they had set.
            const next = e.target.value as Protocol;
            patch({
              protocol: next,
              port: defaultPort(next) || undefined,
              ...(next === "s7" ? { rack: conn.rack ?? 0, slot: conn.slot ?? 1 } : {}),
              ...(next === "modbus-tcp"
                ? { unitId: conn.unitId ?? 1, wordOrder: conn.wordOrder ?? "big" }
                : {}),
              ...(next === "ethernet-ip" ? { path: conn.path ?? "1,0" } : {}),
            });
          }}
          className={box}
        >
          {PROTOCOLS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </Field>
      <p className="-mt-2 text-[11.5px] text-ink-400">{proto?.hint}</p>

      {conn.protocol !== "simulated" && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Endpoint">
              <input
                value={conn.endpoint ?? ""}
                onChange={(e) => patch({ endpoint: e.target.value })}
                placeholder={conn.protocol === "opcua" ? "opc.tcp://10.0.0.5:4840" : "10.0.0.5"}
                className={box}
              />
            </Field>
            <Field label="Port">
              <input
                type="number"
                value={conn.port ?? defaultPort(conn.protocol)}
                onChange={(e) => patch({ port: Number(e.target.value) })}
                className={box}
              />
            </Field>
          </div>

          {conn.protocol === "s7" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Rack">
                <input
                  type="number"
                  value={conn.rack ?? 0}
                  onChange={(e) => patch({ rack: Number(e.target.value) })}
                  className={box}
                />
              </Field>
              <Field label="Slot" hint="1 on an S7-1200/1500, 2 on most S7-300/400.">
                <input
                  type="number"
                  value={conn.slot ?? 1}
                  onChange={(e) => patch({ slot: Number(e.target.value) })}
                  className={box}
                />
              </Field>
            </div>
          )}

          {conn.protocol === "modbus-tcp" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Unit id">
                <input
                  type="number"
                  value={conn.unitId ?? 1}
                  onChange={(e) => patch({ unitId: Number(e.target.value) })}
                  className={box}
                />
              </Field>
              <Field
                label="Word order"
                hint="Modbus carries no types, so this has to be stated rather than guessed."
              >
                <select
                  value={conn.wordOrder ?? "big"}
                  onChange={(e) => patch({ wordOrder: e.target.value as "big" | "little" })}
                  className={box}
                >
                  <option value="big">Big endian (high word first)</option>
                  <option value="little">Little endian (low word first)</option>
                </select>
              </Field>
            </div>
          )}

          {conn.protocol === "ethernet-ip" && (
            <Field label="CIP path" hint="Backplane, slot. 1,0 reaches a controller in slot 0.">
              <input
                value={conn.path ?? "1,0"}
                onChange={(e) => patch({ path: e.target.value })}
                className={box}
              />
            </Field>
          )}
        </>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Poll" hint="Milliseconds between reads.">
          <input
            type="number"
            value={conn.pollMs}
            onChange={(e) => patch({ pollMs: Number(e.target.value) || 250 })}
            className={box}
          />
        </Field>
        <Field label="Timeout" hint="Before a read is called failed.">
          <input
            type="number"
            value={conn.timeoutMs}
            onChange={(e) => patch({ timeoutMs: Number(e.target.value) || 3000 })}
            className={box}
          />
        </Field>
      </div>
    </div>
  );
}

function defaultPort(p: Protocol): number {
  switch (p) {
    case "opcua":
      return 4840;
    case "modbus-tcp":
      return 502;
    case "ethernet-ip":
      return 44818;
    case "s7":
      return 102;
    default:
      return 0;
  }
}

/* ─────────────────────────────── bits ─────────────────────────────── */

const box =
  "w-full rounded-sm border border-ink-200 bg-white px-2 py-1 text-[12.5px] outline-none focus:border-ink-500";
const addBtn =
  "flex items-center gap-1.5 rounded-md border border-ink-200 bg-white px-2.5 py-1 text-[12.5px] text-ink-700 transition-colors hover:border-teal-500";

function Field({
  label,
  hint,
  children,
}: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="mt-2">
      <span className="mb-1 block font-mono text-[10px] uppercase tracking-[0.1em] text-ink-400">
        {label}
      </span>
      {children}
      {hint && <span className="mt-0.5 block text-[11px] leading-snug text-ink-400">{hint}</span>}
    </div>
  );
}

export { getSymbol };

/* ─────────────────────────── bulk alarms ─────────────────────────── */

/**
 * Make alarms for many tags at once.
 *
 * A plant has hundreds and they are overwhelmingly the same few shapes. Doing
 * them one at a time is how an alarm system ends up half-built, with the last
 * forty tags never done. Previewed before it commits, because a bulk operation
 * you cannot see the result of is one people are right to be afraid of.
 */
function BulkAlarms({
  doc,
  plcTags,
  onChange,
}: { doc: HmiDoc; plcTags: Tag[]; onChange: (fn: (d: HmiDoc) => HmiDoc) => void }) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [opts, setOpts] = useState<BulkOptions>(DEFAULT_BULK);

  const tags = plcTags.filter((t) => t.type === "BOOL" || t.type === "INT");
  const chosen = tags.filter((t) => picked.has(t.name));
  const preview = buildBulkAlarms(chosen, opts, doc.alarms);

  const toggle = (name: string) =>
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(name)) n.delete(name);
      else n.add(name);
      return n;
    });

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={`${addBtn} mb-2`}>
        <Layers className="h-3 w-3" />
        Make alarms in bulk
      </button>
    );
  }

  return (
    <div className="mb-3 rounded-md border border-teal-300 bg-teal-50/30 p-3">
      <div className="mb-2 flex items-center gap-2">
        <h4 className="font-display text-[13px] font-bold text-ink-900">Bulk alarms</h4>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="ml-auto text-ink-400 hover:text-ink-900"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-400">
              Tags · {picked.size} of {tags.length}
            </span>
            <button
              type="button"
              onClick={() => setPicked(new Set(tags.map((t) => t.name)))}
              className="text-[11px] text-ink-600 hover:text-teal-700"
            >
              All
            </button>
            <button
              type="button"
              onClick={() =>
                setPicked(new Set(tags.filter((t) => t.type === "INT").map((t) => t.name)))
              }
              className="text-[11px] text-ink-600 hover:text-teal-700"
            >
              Analogue
            </button>
            <button
              type="button"
              onClick={() =>
                setPicked(new Set(tags.filter((t) => t.type === "BOOL").map((t) => t.name)))
              }
              className="text-[11px] text-ink-600 hover:text-teal-700"
            >
              Digital
            </button>
            <button
              type="button"
              onClick={() => setPicked(new Set())}
              className="text-[11px] text-ink-600 hover:text-teal-700"
            >
              None
            </button>
          </div>
          <div className="max-h-40 overflow-y-auto rounded-sm border border-ink-200 bg-white">
            {tags.map((t) => (
              <label
                key={t.name}
                className="flex cursor-pointer items-center gap-1.5 px-1.5 py-0.5 text-[11.5px] hover:bg-ink-50"
              >
                <input
                  type="checkbox"
                  checked={picked.has(t.name)}
                  onChange={() => toggle(t.name)}
                  className="h-3 w-3"
                />
                <span className="min-w-0 flex-1 truncate text-ink-700">{t.name}</span>
                <span className="font-mono text-[9.5px] text-ink-400">{t.type}</span>
              </label>
            ))}
            {tags.length === 0 && (
              <p className="p-2 text-[11.5px] text-ink-400">No ladder tags on this project yet.</p>
            )}
          </div>
        </div>

        <div>
          <span className="mb-1 block font-mono text-[10px] uppercase tracking-[0.1em] text-ink-400">
            Conditions
          </span>
          <div className="mb-2 flex flex-wrap gap-1">
            {CONDITIONS.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() =>
                  setOpts((o) => ({
                    ...o,
                    conditions: o.conditions.includes(c.id)
                      ? o.conditions.filter((x) => x !== c.id)
                      : [...o.conditions, c.id],
                  }))
                }
                className={`rounded-sm border px-1.5 py-0.5 text-[11px] transition-colors ${
                  opts.conditions.includes(c.id)
                    ? "border-teal-500 bg-teal-50 text-teal-800"
                    : "border-ink-200 bg-white text-ink-500"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Field label="Priority">
              <select
                value={opts.priority}
                onChange={(e) =>
                  setOpts((o) => ({ ...o, priority: e.target.value as AlarmPriority }))
                }
                className={box}
              >
                {PRIORITIES.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Range">
              <div className="flex gap-1">
                <input
                  type="number"
                  value={opts.rangeMin}
                  onChange={(e) => setOpts((o) => ({ ...o, rangeMin: Number(e.target.value) }))}
                  className={box}
                />
                <input
                  type="number"
                  value={opts.rangeMax}
                  onChange={(e) => setOpts((o) => ({ ...o, rangeMax: Number(e.target.value) }))}
                  className={box}
                />
              </div>
            </Field>
          </div>

          <div className="grid grid-cols-4 gap-1.5">
            {(
              [
                ["hihiPercent", "HH %"],
                ["hiPercent", "H %"],
                ["loPercent", "L %"],
                ["loloPercent", "LL %"],
              ] as const
            ).map(([k, label]) => (
              <Field key={k} label={label}>
                <input
                  type="number"
                  value={opts[k]}
                  onChange={(e) => setOpts((o) => ({ ...o, [k]: Number(e.target.value) }))}
                  className={box}
                />
              </Field>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Field label="Deadband %">
              <input
                type="number"
                value={opts.deadbandPercent}
                onChange={(e) =>
                  setOpts((o) => ({ ...o, deadbandPercent: Number(e.target.value) }))
                }
                className={box}
              />
            </Field>
            <Field label="On delay, s">
              <input
                type="number"
                value={opts.onDelay}
                onChange={(e) => setOpts((o) => ({ ...o, onDelay: Number(e.target.value) }))}
                className={box}
              />
            </Field>
          </div>

          <label className="mt-1 flex items-center gap-1.5 text-[11.5px] text-ink-600">
            <input
              type="checkbox"
              checked={opts.escalateOuter}
              onChange={(e) => setOpts((o) => ({ ...o, escalateOuter: e.target.checked }))}
              className="h-3 w-3"
            />
            Outer limits one priority higher
          </label>
          <label className="flex items-center gap-1.5 text-[11.5px] text-ink-600">
            <input
              type="checkbox"
              checked={opts.trueIsAlarm}
              onChange={(e) => setOpts((o) => ({ ...o, trueIsAlarm: e.target.checked }))}
              className="h-3 w-3"
            />
            Digital alarms on 1 (off means on 0)
          </label>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-teal-200 pt-2">
        <span className="text-[12.5px] text-ink-700">
          Will make <strong>{preview.alarms.length}</strong> alarm
          {preview.alarms.length === 1 ? "" : "s"}
          {preview.skipped.length > 0 && `, skipping ${preview.skipped.length}`}.
        </span>
        <button
          type="button"
          disabled={preview.alarms.length === 0}
          onClick={() => {
            onChange((d) => ({ ...d, alarms: [...d.alarms, ...preview.alarms] }));
            setPicked(new Set());
            setOpen(false);
          }}
          className="rounded-md bg-ink-900 px-3 py-1 text-[12.5px] font-medium text-white disabled:opacity-40"
        >
          Create them
        </button>
      </div>

      {preview.alarms.length > 0 && (
        <ul className="mt-2 max-h-28 overflow-y-auto text-[11.5px] text-ink-600">
          {preview.alarms.slice(0, 40).map((a) => (
            <li key={a.id} className="truncate">
              {a.message}
              {a.setpoint !== undefined && (
                <span className="font-mono text-ink-400"> @ {a.setpoint}</span>
              )}
              <span className="ml-1 font-mono text-[9.5px] uppercase text-ink-400">
                {a.priority}
              </span>
            </li>
          ))}
        </ul>
      )}
      {preview.skipped.length > 0 && (
        <p className="mt-1 text-[11px] text-ink-400">
          Skipped:{" "}
          {preview.skipped
            .slice(0, 3)
            .map((s) => `${s.tag} (${s.reason})`)
            .join(", ")}
          {preview.skipped.length > 3 && ` and ${preview.skipped.length - 3} more`}.
        </p>
      )}
    </div>
  );
}

/* ─────────────────────────────── recipes ─────────────────────────────── */

/**
 * Named parameter sets, and loading one.
 *
 * The failure this replaces is a laminated card beside the panel with the
 * settings for each product written on it, typed in by hand every changeover.
 * The card is the recipe system, and it has no version, no record of who
 * changed it, and no way to tell whether what is in the controller matches it.
 *
 * Capturing from the live tags rather than only typing values is what makes it
 * get used: the settings that work are the ones currently in the machine after
 * somebody spent a shift getting them right, and asking them to transcribe
 * those into a form is asking them not to bother.
 */
function RecipesTab({
  doc,
  plcTags,
  onChange,
}: {
  doc: HmiDoc;
  plcTags: Tag[];
  onChange: (fn: (d: HmiDoc) => HmiDoc) => void;
}) {
  const recipes = doc.recipes ?? [];
  const [openId, setOpenId] = useState<string | null>(recipes[0]?.id ?? null);
  const open = recipes.find((r) => r.id === openId) ?? null;

  /*
   * The id is minted before the update, not inside it.
   *
   * `onChange` runs inside a state updater, and React deliberately invokes
   * those twice in development to surface impurity. Generating a random id in
   * there produced two different ids, so the recipe stored in the document and
   * the one selected afterwards were not the same recipe: the chip appeared
   * and the panel below it said there were no recipes. Minting outside and
   * closing over the value makes the updater pure and the two agree.
   */
  const addRecipe = () => {
    const id = `rc${Math.random().toString(36).slice(2, 9)}`;
    onChange((d) => {
      d.recipes = [
        ...(d.recipes ?? []),
        { id, name: `Recipe ${(d.recipes?.length ?? 0) + 1}`, values: [] },
      ];
      return d;
    });
    setOpenId(id);
  };

  const patch = (id: string, fn: (r: Recipe) => void) =>
    onChange((d) => {
      const r = (d.recipes ?? []).find((x) => x.id === id);
      if (r) fn(r);
      return d;
    });

  /** Every numeric tag a recipe could sensibly set. */
  const settable = plcTags.filter(
    (t) => t.type === "INT" || t.type === "TIMER" || t.type === "COUNTER",
  );

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-display text-[14px] font-bold text-ink-900">Recipes</h3>
        <p className="mt-1 text-[12.5px] leading-relaxed text-ink-500">
          A named set of values written to tags on demand. This is the laminated card beside the
          panel, with a version and a record of what it contains.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {recipes.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => setOpenId(r.id)}
            className={`rounded-sm border px-2 py-1 text-[12.5px] transition-colors ${
              r.id === openId
                ? "border-ink-900 bg-ink-900 text-white"
                : "border-ink-200 text-ink-700 hover:border-ink-400"
            }`}
          >
            {r.name}
            <span className="ml-1.5 font-mono text-[10px] opacity-60">{r.values.length}</span>
          </button>
        ))}
        <button
          type="button"
          onClick={addRecipe}
          className="rounded-sm border border-dashed border-ink-300 px-2 py-1 text-[12.5px] text-ink-500 hover:border-ink-500 hover:text-ink-900"
        >
          New recipe
        </button>
      </div>

      {!open ? (
        <p className="rounded-sm border border-dashed border-ink-200 p-4 text-[12.5px] text-ink-400">
          No recipes yet. A machine that makes one product does not need any.
        </p>
      ) : (
        <div className="space-y-3 rounded-sm border border-ink-200 p-3">
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1">
              <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-400">
                Name
              </span>
              <input
                value={open.name}
                onChange={(e) =>
                  patch(open.id, (r) => {
                    r.name = e.target.value;
                  })
                }
                className="w-44 rounded-sm border border-ink-200 px-2 py-1 text-[12.5px] outline-none focus:border-ink-500"
              />
            </label>
            <label className="flex flex-1 flex-col gap-1">
              <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-400">
                Note
              </span>
              <input
                value={open.note ?? ""}
                placeholder="Product code, customer, whatever identifies it"
                onChange={(e) =>
                  patch(open.id, (r) => {
                    r.note = e.target.value;
                  })
                }
                className="w-full rounded-sm border border-ink-200 px-2 py-1 text-[12.5px] outline-none focus:border-ink-500 placeholder:text-ink-400"
              />
            </label>
            <button
              type="button"
              onClick={() => {
                const remaining = recipes.filter((r) => r.id !== open.id);
                onChange((d) => {
                  d.recipes = (d.recipes ?? []).filter((r) => r.id !== open.id);
                  return d;
                });
                setOpenId(remaining[0]?.id ?? null);
              }}
              className="rounded-sm border border-ink-200 px-2 py-1 text-[12px] text-danger hover:border-danger"
            >
              Delete
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={settable.length === 0}
              onClick={() =>
                patch(open.id, (r) => {
                  // Captured from what is in the machine now. The values that
                  // work are the ones somebody spent a shift arriving at, and
                  // asking them to transcribe those is asking them not to.
                  r.values = settable.map((t) => ({
                    target: { source: "plc" as const, tag: t.name },
                    value: t.type === "TIMER" || t.type === "COUNTER" ? (t.preset ?? 0) : t.value,
                  }));
                  r.updated = new Date().toISOString();
                })
              }
              className="rounded-sm border border-ink-200 px-2.5 py-1 text-[12px] text-ink-700 hover:border-ink-400 disabled:opacity-40"
            >
              Capture from live tags
            </button>
            <span className="self-center text-[11.5px] text-ink-400">
              {settable.length} numeric tags in the program
              {open.updated ? ` · captured ${new Date(open.updated).toLocaleString("en-GB")}` : ""}
            </span>
          </div>

          {open.values.length === 0 ? (
            <p className="text-[12.5px] text-ink-400">
              No values yet. Capture from the live tags, or add them one at a time below.
            </p>
          ) : (
            <ul className="space-y-1">
              {open.values.map((v, i) => (
                <li key={`${v.target.tag}-${i}`} className="flex items-center gap-2">
                  <span className="w-40 truncate font-mono text-[11.5px] text-ink-700">
                    {v.target.tag}
                  </span>
                  <input
                    type="number"
                    value={v.value}
                    onChange={(e) =>
                      patch(open.id, (r) => {
                        const row = r.values[i];
                        if (row) row.value = Number(e.target.value);
                      })
                    }
                    className="w-28 rounded-sm border border-ink-200 px-2 py-0.5 text-[12px] tabular-nums outline-none focus:border-ink-500"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      patch(open.id, (r) => {
                        r.values = r.values.filter((_, j) => j !== i);
                      })
                    }
                    className="text-[11.5px] text-ink-400 hover:text-danger"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}

          <p className="border-t border-ink-100 pt-2 text-[11.5px] leading-relaxed text-ink-400">
            To load one on the panel, put a button on a screen and give it a Load recipe action.
            Loading writes every value in the set to its tag in one go.
          </p>
        </div>
      )}
    </div>
  );
}

/* ───────────────────────────── faceplates ────────────────────────────── */

/**
 * Reusable pieces of screen.
 *
 * Created from what is on the current screen, because that is the gesture that
 * matches how one actually comes about: somebody draws a valve, decides they
 * need forty, and wants the one they just drew to become the template. Asking
 * them to start from an empty definition and draw it again is why template
 * systems go unused.
 *
 * Parameters are found by scanning for `{{Name}}` in the definition rather than
 * declared separately, so the two cannot disagree.
 */
function FaceplatesTab({
  doc,
  screenId,
  onChange,
}: {
  doc: HmiDoc;
  screenId: string;
  onChange: (fn: (d: HmiDoc) => HmiDoc) => void;
}) {
  const faceplates = doc.faceplates ?? [];
  const screen = doc.screens.find((s) => s.id === screenId) ?? doc.screens[0];

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-display text-[14px] font-bold text-ink-900">Faceplates</h3>
        <p className="mt-1 text-[12.5px] leading-relaxed text-ink-500">
          Draw a valve once and place it forty times. Write{" "}
          <code className="font-mono">{"{{Tag}}"}</code> where a tag name goes in the definition,
          and each instance supplies its own. Changing the definition changes every instance, which
          is the whole point.
        </p>
      </div>

      <div className="rounded-sm border border-ink-200 p-3">
        <p className="text-[12.5px] text-ink-600">
          Make one from the {screen?.widgets.length ?? 0} objects on{" "}
          <strong className="font-semibold">{screen?.name ?? "this screen"}</strong>. Draw the thing
          once with <code className="font-mono">{"{{Tag}}"}</code> in its bindings, then capture it.
        </p>
        <button
          type="button"
          disabled={!screen || screen.widgets.length === 0}
          onClick={() => {
            // Minted outside the updater, for the same reason as a recipe id.
            const id = `fp${Math.random().toString(36).slice(2, 9)}`;
            onChange((d) => {
              const sc = d.screens.find((s) => s.id === screenId) ?? d.screens[0];
              if (!sc || sc.widgets.length === 0) return d;
              // Normalised to the top left of what was drawn, so the definition
              // is the shape rather than the shape plus wherever it happened to
              // sit on the screen it came from.
              const minX = Math.min(...sc.widgets.map((w) => w.rect.x));
              const minY = Math.min(...sc.widgets.map((w) => w.rect.y));
              const maxX = Math.max(...sc.widgets.map((w) => w.rect.x + w.rect.w));
              const maxY = Math.max(...sc.widgets.map((w) => w.rect.y + w.rect.h));
              const widgets = sc.widgets
                .filter((w) => w.kind !== "faceplate")
                .map((w) => ({
                  ...structuredClone(w),
                  rect: { ...w.rect, x: w.rect.x - minX, y: w.rect.y - minY },
                }));
              const fp: Faceplate = {
                id,
                name: `Faceplate ${(d.faceplates?.length ?? 0) + 1}`,
                size: { width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) },
                params: paramsUsed({
                  id,
                  name: "",
                  size: { width: 1, height: 1 },
                  params: [],
                  widgets,
                }).map((name) => ({ name, kind: "tag" as const })),
                widgets,
              };
              d.faceplates = [...(d.faceplates ?? []), fp];
              return d;
            });
          }}
          className="mt-2.5 rounded-sm bg-ink-900 px-3 py-1.5 text-[12.5px] font-medium text-white disabled:opacity-40"
        >
          Capture this screen as a faceplate
        </button>
      </div>

      {faceplates.length === 0 ? (
        <p className="rounded-sm border border-dashed border-ink-200 p-4 text-[12.5px] text-ink-400">
          None yet.
        </p>
      ) : (
        <ul className="space-y-2">
          {faceplates.map((fp) => (
            <li key={fp.id} className="rounded-sm border border-ink-200 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={fp.name}
                  onChange={(e) =>
                    onChange((d) => {
                      const f = (d.faceplates ?? []).find((x) => x.id === fp.id);
                      if (f) f.name = e.target.value;
                      return d;
                    })
                  }
                  className="w-44 rounded-sm border border-ink-200 px-2 py-1 text-[12.5px] outline-none focus:border-ink-500"
                />
                <span className="font-mono text-[11px] text-ink-400">
                  {fp.widgets.length} objects · {fp.size.width}×{fp.size.height}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    onChange((d) => {
                      d.faceplates = (d.faceplates ?? []).filter((x) => x.id !== fp.id);
                      return d;
                    })
                  }
                  className="ml-auto text-[11.5px] text-ink-400 hover:text-danger"
                >
                  Delete
                </button>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {fp.params.length === 0 ? (
                  <span className="text-[11.5px] text-ink-400">
                    No parameters. Put {"{{Tag}}"} in a binding and capture again.
                  </span>
                ) : (
                  fp.params.map((prm) => (
                    <span
                      key={prm.name}
                      className="rounded-sm border border-ink-200 bg-ink-50 px-1.5 py-0.5 font-mono text-[10.5px] text-ink-700"
                    >
                      {prm.name}
                    </span>
                  ))
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ────────────────────────────── security ─────────────────────────────── */

/**
 * Which role the runtime is acting as.
 *
 * Not authentication, and the page says so. Nothing here checks a password
 * against anything: it records which role a control needs so the design can be
 * reviewed and handed over, and so a demonstration can show what an operator
 * sees rather than what an engineer sees. Real authentication belongs to
 * whatever the panel runs on.
 */
function SecurityTab({
  doc,
  onChange,
}: { doc: HmiDoc; onChange: (fn: (d: HmiDoc) => HmiDoc) => void }) {
  const current = doc.role ?? "engineer";
  const gated = doc.screens.flatMap((s) => s.widgets.filter((w) => w.requiresRole));

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-display text-[14px] font-bold text-ink-900">Roles</h3>
        <p className="mt-1 text-[12.5px] leading-relaxed text-ink-500">
          Four levels, because an HMI's security exists to stop the wrong action rather than to
          model an organisation, and a scheme an operator cannot explain becomes a single shared
          login.
        </p>
      </div>

      <div>
        <span className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.1em] text-ink-400">
          Acting as
        </span>
        <div className="flex flex-wrap gap-1.5">
          {ROLE_ORDER.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() =>
                onChange((d) => {
                  d.role = r;
                  return d;
                })
              }
              className={`rounded-sm border px-2.5 py-1 text-[12.5px] capitalize transition-colors ${
                r === current
                  ? "border-ink-900 bg-ink-900 text-white"
                  : "border-ink-200 text-ink-700 hover:border-ink-400"
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <p className="rounded-sm border border-warning-border bg-warning-bg p-3 text-[12px] leading-relaxed text-warning">
        This is a design and demonstration setting, not a credential. Nothing here authenticates
        anybody, and switching role needs no password. It exists so a screen can be built and
        reviewed against what each role may touch, and so the requirement can be handed over.
      </p>

      <div>
        <span className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.1em] text-ink-400">
          Controls with a role set
        </span>
        {gated.length === 0 ? (
          <p className="text-[12.5px] text-ink-400">
            None. Set one on a control in Properties, and anybody below that role sees it greyed.
          </p>
        ) : (
          <ul className="space-y-1">
            {gated.map((w) => (
              <li key={w.id} className="flex items-center gap-2 text-[12.5px] text-ink-700">
                <span className="font-mono text-[11px] text-ink-400">{w.kind}</span>
                {w.name ?? w.text ?? w.id}
                <span className="ml-auto rounded-sm border border-ink-200 px-1.5 py-0.5 font-mono text-[10.5px] capitalize text-ink-600">
                  {w.requiresRole}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
