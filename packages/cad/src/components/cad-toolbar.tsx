"use client";

import type { LucideIcon } from "lucide-react";
import {
  Circle as CircleIcon,
  Copy,
  CornerUpRight,
  Dot,
  Egg,
  Grid3x3,
  Magnet,
  MessageSquareQuote,
  Minus,
  MousePointer2,
  PaintBucket,
  Redo2,
  Ruler,
  Scissors,
  Spline,
  Square,
  Trash2,
  Type as TypeIcon,
  Undo2,
  Waypoints,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

/**
 * The toolbar, in panels.
 *
 * Grouped the way a CAD ribbon groups things, because that grouping is not
 * arbitrary: Draw makes new geometry, Modify changes what is there, Annotate
 * adds what is written on the sheet rather than what is built from it. Somebody
 * who knows where trim lives in one package finds it here.
 *
 * The panel labels are small and permanent rather than hover-revealed. On a
 * toolbar of twenty-four identical grey glyphs the label is the only thing that
 * makes it scannable, and the space it costs is one line.
 */

export type ToolId =
  | "select"
  | "line"
  | "rect"
  | "circle"
  | "arc"
  | "ellipse"
  | "polyline"
  | "point"
  | "hatch"
  | "text"
  | "dimension"
  | "leader"
  | "measure"
  | "offset"
  | "fillet"
  | "trim"
  | "extend";

export interface ToolSpec {
  id: ToolId;
  label: string;
  icon: LucideIcon;
  key: string;
  /** What to do next, shown in the prompt and the status strip. */
  hint?: string;
}

export const TOOL_PANELS: { name: string; tools: ToolSpec[] }[] = [
  {
    name: "Draw",
    tools: [
      { id: "line", label: "Line", icon: Minus, key: "L" },
      {
        id: "polyline",
        label: "Polyline",
        icon: Waypoints,
        key: "PL",
        hint: "Enter finishes, right click closes",
      },
      { id: "rect", label: "Rectangle", icon: Square, key: "REC" },
      {
        id: "circle",
        label: "Circle",
        icon: CircleIcon,
        key: "C",
        hint: "centre, then the radius",
      },
      { id: "arc", label: "Arc", icon: Spline, key: "A", hint: "centre, then start, then end" },
      { id: "ellipse", label: "Ellipse", icon: Egg, key: "EL", hint: "centre, then a corner" },
      { id: "point", label: "Point", icon: Dot, key: "PO" },
      {
        id: "hatch",
        label: "Hatch",
        icon: PaintBucket,
        key: "H",
        hint: "trace the region, Enter closes it",
      },
    ],
  },
  {
    name: "Modify",
    tools: [
      { id: "trim", label: "Trim", icon: Scissors, key: "TR", hint: "click the piece to remove" },
      {
        id: "extend",
        label: "Extend",
        icon: CornerUpRight,
        key: "EX",
        hint: "click the end to stretch",
      },
      { id: "offset", label: "Offset", icon: Copy, key: "O", hint: "pick a line, then the side" },
      { id: "fillet", label: "Fillet", icon: Spline, key: "F", hint: "two lines" },
    ],
  },
  {
    name: "Annotate",
    tools: [
      { id: "text", label: "Text", icon: TypeIcon, key: "T" },
      {
        id: "dimension",
        label: "Dimension",
        icon: Ruler,
        key: "D",
        hint: "two points, then the offset",
      },
      {
        id: "leader",
        label: "Leader",
        icon: MessageSquareQuote,
        key: "LE",
        hint: "arrow, then the note",
      },
      {
        id: "measure",
        label: "Measure",
        icon: Ruler,
        key: "DI",
        hint: "two points, nothing is drawn",
      },
    ],
  },
];

export const ALL_TOOLS: ToolSpec[] = [
  {
    id: "select",
    label: "Select",
    icon: MousePointer2,
    key: "S",
    hint: "drag to move, Alt to copy",
  },
  ...TOOL_PANELS.flatMap((p) => p.tools),
];

export function toolSpec(id: ToolId): ToolSpec | undefined {
  return ALL_TOOLS.find((t) => t.id === id);
}

export default function CadToolbar({
  tool,
  onTool,
  gridSnap,
  objectSnap,
  ortho,
  grid,
  angleStep,
  canUndo,
  canRedo,
  hasSelection,
  onToggle,
  onUndo,
  onRedo,
  onDelete,
  onZoom,
}: {
  tool: ToolId;
  onTool: (id: ToolId) => void;
  gridSnap: boolean;
  objectSnap: boolean;
  ortho: boolean;
  grid: number;
  angleStep: number;
  canUndo: boolean;
  canRedo: boolean;
  hasSelection: boolean;
  onToggle: (which: "grid" | "object" | "ortho") => void;
  onUndo: () => void;
  onRedo: () => void;
  onDelete: () => void;
  onZoom: (dir: "in" | "out") => void;
}) {
  return (
    <div className="flex shrink-0 items-stretch gap-3 overflow-x-auto border-b border-ink-100 bg-ink-50 px-3 py-1.5">
      <Panel name="Select">
        <ToolButton
          spec={ALL_TOOLS[0] as ToolSpec}
          active={tool === "select"}
          onClick={() => onTool("select")}
        />
      </Panel>

      {TOOL_PANELS.map((panel) => (
        <Panel key={panel.name} name={panel.name}>
          {panel.tools.map((t) => (
            <ToolButton key={t.id} spec={t} active={tool === t.id} onClick={() => onTool(t.id)} />
          ))}
        </Panel>
      ))}

      <Panel name="Edit">
        <IconButton label="Undo" onClick={onUndo} disabled={!canUndo}>
          <Undo2 className="h-3.5 w-3.5" />
        </IconButton>
        <IconButton label="Redo" onClick={onRedo} disabled={!canRedo}>
          <Redo2 className="h-3.5 w-3.5" />
        </IconButton>
        <IconButton label="Delete" onClick={onDelete} disabled={!hasSelection}>
          <Trash2 className="h-3.5 w-3.5" />
        </IconButton>
      </Panel>

      <Panel name="View">
        <IconButton label="Zoom in" onClick={() => onZoom("in")}>
          <ZoomIn className="h-3.5 w-3.5" />
        </IconButton>
        <IconButton label="Zoom out" onClick={() => onZoom("out")}>
          <ZoomOut className="h-3.5 w-3.5" />
        </IconButton>
      </Panel>

      <Panel name="Snapping">
        <Toggle
          on={gridSnap}
          label={`${grid}mm grid`}
          title="Snap to the grid"
          onClick={() => onToggle("grid")}
        >
          <Grid3x3 className="h-3.5 w-3.5" />
        </Toggle>
        <Toggle
          on={objectSnap}
          label="Object"
          title="Snap to existing geometry: endpoints, midpoints, centres"
          onClick={() => onToggle("object")}
        >
          <Magnet className="h-3.5 w-3.5" />
        </Toggle>
        <Toggle
          on={ortho}
          label={`Ortho ${angleStep}`}
          title={`Constrain to ${angleStep} degree steps from the last point`}
          onClick={() => onToggle("ortho")}
        >
          <CornerUpRight className="h-3.5 w-3.5" />
        </Toggle>
      </Panel>
    </div>
  );
}

function Panel({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <div className="flex shrink-0 flex-col items-center gap-0.5 border-r border-ink-200 pr-3 last:border-0 last:pr-0">
      <div className="flex items-center gap-0.5">{children}</div>
      <span className="font-mono text-[8.5px] uppercase tracking-[0.1em] text-ink-400">{name}</span>
    </div>
  );
}

function ToolButton({
  spec,
  active,
  onClick,
}: {
  spec: ToolSpec;
  active: boolean;
  onClick: () => void;
}) {
  const Icon = spec.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      title={`${spec.label} (${spec.key})${spec.hint ? `, ${spec.hint}` : ""}`}
      aria-pressed={active}
      className={`flex h-7 w-7 items-center justify-center rounded transition-colors ${
        active ? "bg-ink-900 text-white" : "text-ink-500 hover:bg-ink-200 hover:text-ink-900"
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="flex h-7 w-7 items-center justify-center rounded text-ink-500 transition-colors hover:bg-ink-200 hover:text-ink-900 disabled:opacity-30 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}

function Toggle({
  on,
  label,
  title,
  onClick,
  children,
}: {
  on: boolean;
  label: string;
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-pressed={on}
      onClick={onClick}
      className={`flex h-7 items-center gap-1.5 rounded border px-2 text-[11.5px] transition-colors ${
        on ? "border-teal-400 bg-teal-50 text-teal-700" : "border-ink-200 bg-white text-ink-500"
      }`}
    >
      {children}
      {label}
    </button>
  );
}
