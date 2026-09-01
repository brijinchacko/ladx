"use client";

import type { Tag } from "@ladx/studio";
import { ImagePlus, Trash2, X } from "lucide-react";
import { useRef, useState } from "react";
import { sanitiseSvg } from "../lib/svg-import";
import { allSymbols, isRealistic } from "../lib/symbols";
import type { LineStyle, Screen, TextStyle, Widget } from "../lib/types";
import ColourField from "./colour-field";

/**
 * Everything about the selected object.
 *
 * Grouped and collapsible rather than one long column, because the useful set
 * differs completely between a text label and a trend, and showing all of it
 * flat means scrolling past twenty irrelevant fields to reach the one that
 * matters. Sections open on the kind that needs them.
 */

const FONTS = [
  { label: "System", value: "ui-sans-serif, system-ui, sans-serif" },
  { label: "Monospace", value: "ui-monospace, SFMono-Regular, Menlo, monospace" },
  { label: "Serif", value: "ui-serif, Georgia, serif" },
  { label: "Arial", value: "Arial, Helvetica, sans-serif" },
  { label: "Helvetica", value: "Helvetica, Arial, sans-serif" },
  { label: "Verdana", value: "Verdana, Geneva, sans-serif" },
  { label: "Tahoma", value: "Tahoma, Verdana, sans-serif" },
  { label: "Segoe UI", value: "'Segoe UI', Roboto, sans-serif" },
  { label: "Roboto", value: "Roboto, 'Segoe UI', sans-serif" },
  { label: "Courier", value: "'Courier New', Courier, monospace" },
  { label: "Georgia", value: "Georgia, 'Times New Roman', serif" },
  { label: "Times", value: "'Times New Roman', Times, serif" },
];

const WEIGHTS = [300, 400, 500, 600, 700, 800];

/** Which sections a kind actually uses, so nothing irrelevant is shown. */
function sectionsFor(kind: Widget["kind"]): string[] {
  const common = ["Layout", "Appearance"];
  switch (kind) {
    case "text":
      return [...common, "Type"];
    case "numeric":
      return [...common, "Type", "Value", "Format", "Animation"];
    case "button":
    case "toggle":
      return [...common, "Type", "Action", "Animation"];
    case "lamp":
      return [...common, "Value", "Animation"];
    case "bar":
    case "gauge":
      return [...common, "Value", "Format", "Animation"];
    case "symbol":
      return [...common, "Symbol", "Value", "Format", "Animation"];
    case "multistate":
      return [...common, "Type", "Value", "States", "Animation"];
    case "trend":
    case "alarmSummary":
    case "alarmHistory":
      return [...common, "Type", "Data"];
    case "line":
    case "polyline":
      return [...common];
    default:
      return [...common, "Value", "Animation"];
  }
}

export default function Properties({
  widget: w,
  plc,
  hmiTags,
  screens,
  trends,
  onChange,
  onDelete,
}: {
  widget: Widget;
  plc: Tag[];
  hmiTags: { name: string }[];
  screens: Screen[];
  trends: { id: string; name: string }[];
  onChange: (patch: Partial<Widget>) => void;
  onDelete: () => void;
}) {
  const wanted = sectionsFor(w.kind);
  const [open, setOpen] = useState<Record<string, boolean>>({ Layout: true, Appearance: true });
  const imgRef = useRef<HTMLInputElement>(null);
  const [imgNote, setImgNote] = useState<string | null>(null);

  const t = (patch: Partial<TextStyle>) => onChange({ text_: { ...(w.text_ ?? {}), ...patch } });
  const tagNames = [...plc.map((x) => x.name), ...hmiTags.map((x) => x.name)];

  /**
   * Replace the drawing with a picture.
   *
   * SVG goes through the same sanitiser as an import; a raster is read to a
   * data URI and carried on the widget, so the application takes its artwork
   * with it rather than pointing at a file that will not be there tomorrow.
   */
  async function useImage(file: File) {
    setImgNote(null);
    if (/svg/i.test(file.type) || /\.svg$/i.test(file.name)) {
      const { svg, error } = sanitiseSvg(await file.text());
      if (error || !svg) {
        setImgNote(error ?? "Could not read that SVG.");
        return;
      }
      onChange({ image: { kind: "svg", svg } });
      setImgNote(`Using ${file.name}.`);
      return;
    }
    if (file.size > 1_500_000) {
      setImgNote("That image is over 1.5 MB. A panel graphic should be smaller than a photograph.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      onChange({ image: { kind: "raster", src: String(reader.result), alt: file.name } });
      setImgNote(`Using ${file.name}.`);
    };
    reader.readAsDataURL(file);
  }

  return (
    <div className="relative space-y-1 p-2">
      <div className="flex items-baseline gap-2 pb-1">
        <input
          value={w.name ?? ""}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder={w.kind}
          className="min-w-0 flex-1 rounded-sm border border-transparent px-1 py-0.5 font-display text-[13px] font-bold text-ink-900 outline-none hover:border-ink-200 focus:border-ink-400"
        />
        <span className="font-mono text-[10px] text-ink-400">{w.kind}</span>
        <button
          type="button"
          onClick={onDelete}
          title="Delete"
          className="text-ink-400 hover:text-danger"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Layout */}
      <Section name="Layout" open={open} setOpen={setOpen}>
        <Grid>
          <Num
            label="X"
            value={w.rect.x}
            onChange={(v) => onChange({ rect: { ...w.rect, x: v } })}
          />
          <Num
            label="Y"
            value={w.rect.y}
            onChange={(v) => onChange({ rect: { ...w.rect, y: v } })}
          />
          <Num
            label="W"
            value={w.rect.w}
            onChange={(v) => onChange({ rect: { ...w.rect, w: Math.max(4, v) } })}
          />
          <Num
            label="H"
            value={w.rect.h}
            onChange={(v) => onChange({ rect: { ...w.rect, h: Math.max(4, v) } })}
          />
        </Grid>
        <Grid>
          <Num label="Rotate" value={w.rotation ?? 0} onChange={(v) => onChange({ rotation: v })} />
          <Num label="Z" value={w.z ?? 0} onChange={(v) => onChange({ z: v })} />
          <Check
            label="Lock"
            checked={Boolean(w.locked)}
            onChange={(v) => onChange({ locked: v })}
          />
          <Check
            label="Hide"
            checked={Boolean(w.designHidden)}
            onChange={(v) => onChange({ designHidden: v })}
          />
        </Grid>
      </Section>

      {/* Appearance */}
      <Section name="Appearance" open={open} setOpen={setOpen}>
        <div className="grid grid-cols-2 gap-2">
          <ColourField
            label="Fill"
            value={w.fill ?? "#D8DCDF"}
            onChange={(c) => onChange({ fill: c })}
            allowNone
          />
          <ColourField
            label="Line"
            value={w.stroke ?? "#3A4550"}
            onChange={(c) => onChange({ stroke: c })}
          />
        </div>
        <div className="mt-1.5 grid grid-cols-2 gap-2">
          <ColourField
            label="Fade to"
            value={w.fillTo ?? "transparent"}
            onChange={(c) => onChange({ fillTo: c === "transparent" ? undefined : c })}
            allowNone
          />
          <Num
            label="Angle"
            value={w.gradientAngle ?? 180}
            onChange={(v) => onChange({ gradientAngle: v })}
          />
        </div>
        <Grid>
          <Num
            label="Line w"
            value={w.strokeWidth ?? 1.5}
            step={0.5}
            onChange={(v) => onChange({ strokeWidth: v })}
          />
          <Num
            label="Radius"
            value={w.radius ?? 2}
            onChange={(v) => onChange({ radius: Math.max(0, v) })}
          />
          <Field label="Style">
            <select
              value={w.lineStyle ?? "solid"}
              onChange={(e) => onChange({ lineStyle: e.target.value as LineStyle })}
              className={box}
            >
              <option value="solid">Solid</option>
              <option value="dashed">Dashed</option>
              <option value="dotted">Dotted</option>
            </select>
          </Field>
          <Num
            label="Opacity"
            value={w.opacity ?? 1}
            step={0.05}
            onChange={(v) => onChange({ opacity: Math.max(0, Math.min(1, v)) })}
          />
        </Grid>
        <Check
          label="Drop shadow"
          checked={Boolean(w.shadow)}
          onChange={(v) => onChange({ shadow: v })}
        />
      </Section>

      {/* Type */}
      {wanted.includes("Type") && (
        <Section name="Type" open={open} setOpen={setOpen}>
          {(w.kind === "text" || w.kind === "button" || w.kind === "toggle") && (
            <Field label="Caption">
              <textarea
                value={w.text ?? ""}
                onChange={(e) => onChange({ text: e.target.value })}
                rows={2}
                className={box}
              />
            </Field>
          )}
          <Field label="Font">
            <select
              value={w.text_?.fontFamily ?? FONTS[0]?.value}
              onChange={(e) => t({ fontFamily: e.target.value })}
              className={box}
            >
              {FONTS.map((f) => (
                <option key={f.label} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </Field>
          <Grid>
            <Num
              label="Size"
              value={w.text_?.fontSize ?? w.fontSize ?? 14}
              onChange={(v) => t({ fontSize: Math.max(6, v) })}
            />
            <Field label="Weight">
              <select
                value={String(w.text_?.fontWeight ?? 400)}
                onChange={(e) => t({ fontWeight: Number(e.target.value) })}
                className={box}
              >
                {WEIGHTS.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </Field>
            <Num
              label="Spacing"
              value={w.text_?.letterSpacing ?? 0}
              step={0.5}
              onChange={(v) => t({ letterSpacing: v })}
            />
            <Num
              label="Leading"
              value={w.text_?.lineHeight ?? 1.2}
              step={0.1}
              onChange={(v) => t({ lineHeight: v })}
            />
          </Grid>
          <Grid>
            <Field label="Align">
              <select
                value={w.text_?.align ?? "left"}
                onChange={(e) => t({ align: e.target.value as TextStyle["align"] })}
                className={box}
              >
                <option value="left">Left</option>
                <option value="center">Centre</option>
                <option value="right">Right</option>
              </select>
            </Field>
            <Field label="Vertical">
              <select
                value={w.text_?.valign ?? "middle"}
                onChange={(e) => t({ valign: e.target.value as TextStyle["valign"] })}
                className={box}
              >
                <option value="top">Top</option>
                <option value="middle">Middle</option>
                <option value="bottom">Bottom</option>
              </select>
            </Field>
            <Field label="Case">
              <select
                value={w.text_?.transform ?? "none"}
                onChange={(e) => t({ transform: e.target.value as TextStyle["transform"] })}
                className={box}
              >
                <option value="none">As typed</option>
                <option value="uppercase">UPPER</option>
                <option value="lowercase">lower</option>
              </select>
            </Field>
            <div className="flex items-end gap-2 pb-0.5">
              <Check
                label="B"
                checked={(w.text_?.fontWeight ?? 400) >= 600}
                onChange={(v) => t({ fontWeight: v ? 700 : 400 })}
              />
              <Check
                label="I"
                checked={Boolean(w.text_?.italic)}
                onChange={(v) => t({ italic: v })}
              />
              <Check
                label="U"
                checked={Boolean(w.text_?.underline)}
                onChange={(v) => t({ underline: v })}
              />
            </div>
          </Grid>
          <Check
            label="Wrap lines"
            checked={w.text_?.wrap !== false}
            onChange={(v) => t({ wrap: v })}
          />
        </Section>
      )}

      {/* Symbol */}
      {wanted.includes("Symbol") && (
        <Section name="Symbol" open={open} setOpen={setOpen}>
          {w.image ? (
            <div className="rounded-sm border border-ink-200 p-1.5">
              <p className="text-[11.5px] text-ink-600">
                Using your own picture
                {w.image.kind === "raster" ? ` (${w.image.alt ?? "image"})` : " (SVG)"}.
              </p>
              <button
                type="button"
                onClick={() => onChange({ image: undefined })}
                className="mt-1 flex items-center gap-1 text-[11.5px] text-ink-500 hover:text-danger"
              >
                <X className="h-3 w-3" />
                Back to the drawing
              </button>
            </div>
          ) : (
            <Field label="Drawing">
              <select
                value={w.symbol ?? "tank"}
                onChange={(e) => onChange({ symbol: e.target.value })}
                className={box}
              >
                {allSymbols().map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.category} · {s.name}
                    {isRealistic(s.id) ? " ✦" : ""}
                  </option>
                ))}
              </select>
            </Field>
          )}

          <button
            type="button"
            onClick={() => imgRef.current?.click()}
            className="mt-1.5 flex w-full items-center justify-center gap-1.5 rounded-sm border border-ink-200 bg-white px-2 py-1 text-[12px] text-ink-700 hover:border-teal-500"
          >
            <ImagePlus className="h-3.5 w-3.5" />
            Replace with an image
          </button>
          <input
            ref={imgRef}
            type="file"
            accept=".svg,.png,.jpg,.jpeg,.webp,image/*"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void useImage(f);
              e.target.value = "";
            }}
          />
          {imgNote && <p className="mt-1 text-[11px] text-ink-500">{imgNote}</p>}
          <p className="mt-1 text-[11px] leading-snug text-ink-400">
            PNG, JPG, WebP or SVG. Carried inside the application, so it travels with it. The ✦
            symbols have a realistic drawing as well as a schematic one.
          </p>
        </Section>
      )}

      {/* Value */}
      {wanted.includes("Value") && (
        <Section name="Value" open={open} setOpen={setOpen}>
          <Field label="Tag or expression">
            <select
              value={
                w.value?.kind === "plc" ? w.value.tag : w.value?.kind === "expr" ? "__expr" : ""
              }
              onChange={(e) => {
                const v = e.target.value;
                if (!v) onChange({ value: undefined });
                else if (v === "__expr") onChange({ value: { kind: "expr", source: "{Tag} > 0" } });
                else onChange({ value: { kind: "plc", tag: v } });
              }}
              className={box}
            >
              <option value="">not bound</option>
              {tagNames.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
              <option value="__expr">expression…</option>
            </select>
          </Field>
          {w.value?.kind === "expr" && (
            <input
              value={w.value.source}
              onChange={(e) => onChange({ value: { kind: "expr", source: e.target.value } })}
              placeholder="{Level} > 80"
              className={`${box} mt-1 font-mono`}
            />
          )}
        </Section>
      )}

      {/* Format */}
      {wanted.includes("Format") && (
        <Section name="Format" open={open} setOpen={setOpen}>
          <Grid>
            <Num label="Min" value={w.min ?? 0} onChange={(v) => onChange({ min: v })} />
            <Num label="Max" value={w.max ?? 100} onChange={(v) => onChange({ max: v })} />
            <Num
              label="Decimals"
              value={w.decimals ?? 0}
              onChange={(v) => onChange({ decimals: Math.max(0, v) })}
            />
            <Field label="Units">
              <input
                value={w.units ?? ""}
                onChange={(e) => onChange({ units: e.target.value })}
                className={box}
              />
            </Field>
          </Grid>
        </Section>
      )}

      {/* Data, for trends and alarm lists */}
      {wanted.includes("Data") && (
        <Section name="Data" open={open} setOpen={setOpen}>
          {w.kind === "trend" ? (
            <Field label="Trend">
              <select
                value={(w.config?.trendId as string) ?? ""}
                onChange={(e) =>
                  onChange({ config: { ...(w.config ?? {}), trendId: e.target.value } })
                }
                className={box}
              >
                <option value="">first defined</option>
                {trends.map((tr) => (
                  <option key={tr.id} value={tr.id}>
                    {tr.name}
                  </option>
                ))}
              </select>
            </Field>
          ) : (
            <>
              <Field label="Show">
                <select
                  value={(w.config?.filter as string) ?? "outstanding"}
                  onChange={(e) =>
                    onChange({ config: { ...(w.config ?? {}), filter: e.target.value } })
                  }
                  className={box}
                >
                  <option value="outstanding">Outstanding</option>
                  <option value="unacked">Unacknowledged only</option>
                  <option value="all">Everything</option>
                </select>
              </Field>
              <Field label="Lowest priority shown">
                <select
                  value={(w.config?.minPriority as string) ?? "journal"}
                  onChange={(e) =>
                    onChange({ config: { ...(w.config ?? {}), minPriority: e.target.value } })
                  }
                  className={box}
                >
                  <option value="critical">Critical only</option>
                  <option value="high">High and above</option>
                  <option value="medium">Medium and above</option>
                  <option value="low">Low and above</option>
                  <option value="journal">Everything</option>
                </select>
              </Field>
            </>
          )}
        </Section>
      )}

      {/* Action */}
      {wanted.includes("Action") && (
        <Section name="Action" open={open} setOpen={setOpen}>
          <Field label="Writes">
            <select
              value={
                (w.onPress?.find((a) => a.kind === "setTag") as { target?: { tag: string } })
                  ?.target?.tag ?? ""
              }
              onChange={(e) => {
                const tag = e.target.value;
                if (!tag) return onChange({ onPress: [], onRelease: [] });
                onChange({
                  onPress: [
                    {
                      kind: "setTag",
                      target: { source: "plc", tag },
                      value: { kind: "const", value: 1 },
                    },
                  ],
                  onRelease:
                    w.kind === "button"
                      ? [
                          {
                            kind: "setTag",
                            target: { source: "plc", tag },
                            value: { kind: "const", value: 0 },
                          },
                        ]
                      : [],
                });
              }}
              className={box}
            >
              <option value="">nothing</option>
              {plc.map((x) => (
                <option key={x.name} value={x.name}>
                  {x.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Or go to">
            <select
              value={
                (w.onPress?.find((a) => a.kind === "goToScreen") as { slug?: string })?.slug ?? ""
              }
              onChange={(e) =>
                onChange({
                  onPress: e.target.value ? [{ kind: "goToScreen", slug: e.target.value }] : [],
                })
              }
              className={box}
            >
              <option value="">no</option>
              {screens.map((s) => (
                <option key={s.id} value={s.slug}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Or acknowledge">
            <select
              value={w.onPress?.some((a) => a.kind === "ackAll") ? "all" : ""}
              onChange={(e) => onChange({ onPress: e.target.value ? [{ kind: "ackAll" }] : [] })}
              className={box}
            >
              <option value="">no</option>
              <option value="all">all alarms</option>
            </select>
          </Field>
          <p className="mt-1 text-[11px] leading-snug text-ink-400">
            {w.kind === "button"
              ? "Momentary: 1 while held, 0 on release, like a pushbutton."
              : "Maintained: stays where you put it."}
          </p>
        </Section>
      )}

      {/* Animation */}
      {wanted.includes("Animation") && (
        <Section name="Animation" open={open} setOpen={setOpen}>
          <Field label="When this is true">
            <input
              value={(w.animations?.[0]?.when as { source?: string })?.source ?? ""}
              onChange={(e) =>
                onChange({
                  animations: e.target.value
                    ? [
                        {
                          id: "a1",
                          when: { kind: "expr", source: e.target.value },
                          fill: w.animations?.[0]?.fill ?? "#B4531A",
                        },
                      ]
                    : [],
                })
              }
              placeholder="{Level} > 80"
              className={`${box} font-mono`}
            />
          </Field>
          {w.animations?.[0] && (
            <div className="mt-1.5">
              <ColourField
                label="Use this colour"
                value={w.animations[0].fill ?? "#B4531A"}
                onChange={(c) => {
                  const first = w.animations?.[0];
                  if (!first) return;
                  onChange({ animations: [{ ...first, fill: c }] });
                }}
              />
            </div>
          )}
          <p className="mt-1 text-[11px] leading-snug text-ink-400">
            ISA-101: grey at rest, colour only when something has deviated.
          </p>
        </Section>
      )}
    </div>
  );
}

/* ─────────────────────────────── bits ─────────────────────────────── */

const box =
  "w-full rounded-sm border border-ink-200 bg-white px-1.5 py-0.5 text-[11.5px] outline-none focus:border-ink-500";

function Section({
  name,
  open,
  setOpen,
  children,
}: {
  name: string;
  open: Record<string, boolean>;
  setOpen: (fn: (o: Record<string, boolean>) => Record<string, boolean>) => void;
  children: React.ReactNode;
}) {
  const isOpen = Boolean(open[name]);
  return (
    <div className="border-t border-ink-100 pt-1">
      <button
        type="button"
        onClick={() => setOpen((o) => ({ ...o, [name]: !o[name] }))}
        className="flex w-full items-center gap-1 py-0.5 text-left"
      >
        <span className="w-3 font-mono text-[9px] text-ink-400">{isOpen ? "▾" : "▸"}</span>
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-500">
          {name}
        </span>
      </button>
      {isOpen && <div className="pb-1 pl-3">{children}</div>}
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="mt-1 grid grid-cols-4 gap-1.5">{children}</div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-1">
      <span className="mb-0.5 block font-mono text-[9.5px] uppercase tracking-[0.08em] text-ink-400">
        {label}
      </span>
      {children}
    </div>
  );
}

function Num({
  label,
  value,
  onChange,
  step = 1,
}: { label: string; value: number; onChange: (v: number) => void; step?: number }) {
  return (
    <Field label={label}>
      <input
        type="number"
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        className={box}
      />
    </Field>
  );
}

function Check({
  label,
  checked,
  onChange,
}: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="mt-1 flex items-center gap-1 text-[11.5px] text-ink-600">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-3 w-3"
      />
      {label}
    </label>
  );
}
