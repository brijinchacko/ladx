"use client";

import type { Element, LadderNode, Routine, Tag } from "../index";
import { rungLogic } from "../index";

/**
 * The program, drawn live.
 *
 * This is what "online" means to anybody who has stood in front of a running
 * machine with a laptop: the rung is on the screen and the parts of it that are
 * passing power are lit. You do not read values off a table and reason about
 * which contact must be open, you look at it.
 *
 * Read-only on purpose. Editing belongs in the Ladder tool; a monitor that lets
 * you change the logic you are watching is how you lose track of which version
 * produced the result you just recorded.
 */

const LIVE = "#2C9A9E";
const DEAD = "#C3CCD4";

function glyph(type: string): string {
  switch (type) {
    case "XIC":
      return "] [";
    case "XIO":
      return "]/[";
    case "OTE":
      return "( )";
    case "OTL":
      return "(L)";
    case "OTU":
      return "(U)";
    case "ONS":
      return "[ONS]";
    case "RES":
      return "(RES)";
    default:
      return type;
  }
}

function label(el: Element, tags: Map<string, Tag>): string | null {
  const t = tags.get(el.tag);
  if (!t) return null;
  if (t.type === "TIMER") {
    const acc = ((t.acc ?? 0) / 1000).toFixed(1);
    const pre = ((t.preset ?? el.preset ?? 0) / 1000).toFixed(1);
    return `${acc} / ${pre} s`;
  }
  if (t.type === "COUNTER") return `${t.acc ?? 0} / ${t.preset ?? el.preset ?? 0}`;
  if (t.type === "INT") return String(t.value);
  return null;
}

function El({
  node,
  power,
  tags,
}: {
  node: Extract<LadderNode, { kind: "el" }>;
  power: Record<string, boolean>;
  tags: Map<string, Tag>;
}) {
  const on = power[node.id] === true;
  const el: Element = {
    id: node.id,
    type: node.type,
    tag: node.tag,
    preset: node.preset,
    operand: node.operand,
    dest: node.dest,
  };
  const wide = !["XIC", "XIO", "OTE", "OTL", "OTU"].includes(node.type);
  const detail = label(el, tags);

  return (
    <span className="flex shrink-0 flex-col items-center px-0.5">
      <span className="mb-0.5 max-w-[7rem] truncate font-mono text-[9.5px] text-ink-500">
        {node.tag || "-"}
      </span>
      <span
        className={`flex h-8 flex-col items-center justify-center rounded border-2 ${
          wide ? "min-w-[3.5rem] px-2" : "w-12"
        }`}
        style={{
          borderColor: on ? LIVE : DEAD,
          color: on ? LIVE : "#5A6773",
          background: on ? "rgba(44,154,158,0.08)" : "transparent",
        }}
      >
        <span className="font-mono text-[12px] leading-none">{glyph(node.type)}</span>
        {detail && <span className="mt-0.5 font-mono text-[8px] leading-none">{detail}</span>}
      </span>
    </span>
  );
}

function Node({
  node,
  power,
  tags,
}: {
  node: LadderNode;
  power: Record<string, boolean>;
  tags: Map<string, Tag>;
}) {
  if (node.kind === "el") return <El node={node} power={power} tags={tags} />;

  if (node.kind === "series") {
    return (
      <span className="flex items-center">
        {node.children.map((c) => (
          <span key={c.id} className="flex items-center">
            <Rail on={false} />
            <Node node={c} power={power} tags={tags} />
          </span>
        ))}
      </span>
    );
  }

  // Parallel: the legs stack, joined by a vertical at each end.
  return (
    <span className="flex items-stretch">
      <span className="w-px shrink-0 self-stretch bg-ink-300" />
      <span className="flex flex-col gap-1 py-0.5">
        {node.children.map((c) => (
          <span key={c.id} className="flex items-center">
            <Node node={c} power={power} tags={tags} />
          </span>
        ))}
      </span>
      <span className="w-px shrink-0 self-stretch bg-ink-300" />
    </span>
  );
}

function Rail({ on }: { on: boolean }) {
  return (
    <span
      className="h-px w-3 shrink-0"
      style={{ background: on ? LIVE : DEAD }}
      aria-hidden="true"
    />
  );
}

export default function MonitorRungs({
  routine,
  elementPower,
  rungPower,
  tags,
}: {
  routine: Routine;
  elementPower: Record<string, boolean>;
  rungPower: Record<string, boolean>;
  tags: Tag[];
}) {
  const byName = new Map(tags.map((t) => [t.name, t]));

  if (routine.rungs.length === 0) {
    return (
      <p className="px-4 py-10 text-center text-[13.5px] text-ink-500">
        {routine.name} has no rungs.
      </p>
    );
  }

  return (
    <div className="space-y-2 p-3">
      {routine.rungs.map((rung, i) => {
        const live = rungPower[rung.id] === true;
        return (
          <div
            key={rung.id}
            className="rounded-md border bg-white p-2"
            style={{ borderColor: live ? "rgba(44,154,158,0.45)" : "#E4EAEF" }}
          >
            <div className="mb-1 flex items-center gap-2">
              <span className="rounded bg-ink-100 px-1.5 py-0.5 font-mono text-[9.5px] font-bold text-ink-500">
                {String(i + 1).padStart(3, "0")}
              </span>
              {rung.comment && (
                <span className="truncate text-[11.5px] text-ink-500">{rung.comment}</span>
              )}
            </div>

            <div className="flex items-center overflow-x-auto pb-1">
              {/* left rail */}
              <span
                className="mr-1 h-8 w-[3px] shrink-0 rounded-sm"
                style={{ background: LIVE }}
                aria-hidden="true"
              />
              <Node node={rungLogic(rung)} power={elementPower} tags={byName} />
              <Rail on={live} />
              <span className="mx-1 flex-1 border-t border-dashed border-ink-200" />
              {rung.outputs.map((o) => (
                <El
                  key={o.id}
                  node={{
                    kind: "el",
                    id: o.id,
                    type: o.type,
                    tag: o.tag,
                    preset: o.preset,
                    operand: o.operand,
                    dest: o.dest,
                  }}
                  power={elementPower}
                  tags={byName}
                />
              ))}
              {/* right rail */}
              <span
                className="ml-1 h-8 w-[3px] shrink-0 rounded-sm"
                style={{ background: "#C3CCD4" }}
                aria-hidden="true"
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
