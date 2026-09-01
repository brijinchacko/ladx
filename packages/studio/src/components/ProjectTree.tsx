"use client";

import {
  ChevronDown,
  ChevronRight,
  ExternalLink,
  FileCode2,
  Home,
  MonitorPlay,
  Pencil,
  Plus,
  Table2,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import type { Routine } from "../lib/types";

/**
 * The project tree.
 *
 * Every PLC IDE opens with the same column on the left, TIA, Studio 5000 and
 * CODESYS all put the project's structure there, because it answers the two
 * questions a student has on opening a file: what is in this program, and where
 * am I in it. A flat list of rungs answers neither once the program is longer
 * than a screen.
 *
 * Three groups, matching what a controller actually holds: the program pages,
 * the tag table, and the simulator. Each collapses, and each leaf can be popped
 * into its own window and docked back.
 */

export type TreeSelection = { kind: "routine"; id: string } | { kind: "tags" } | { kind: "sim" };

function Group({
  label,
  icon,
  open,
  onToggle,
  children,
  action,
}: {
  label: string;
  icon: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-1 px-1.5 h-7 hover:bg-ink-100 rounded">
        <button
          type="button"
          onClick={onToggle}
          className="flex items-center gap-1 flex-1 min-w-0 text-left"
        >
          <span className="text-ink-500 shrink-0">
            {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </span>
          <span className="text-ink-700 shrink-0">{icon}</span>
          <span className="text-[11.5px] font-semibold text-ink-700 truncate">{label}</span>
        </button>
        {action}
      </div>
      {open && <div className="ml-4 border-l border-ink-100 pl-1">{children}</div>}
    </div>
  );
}

function Leaf({
  label,
  active,
  icon,
  onClick,
  onPop,
  popTitle,
  onRename,
  onDelete,
  badge,
  onContextMenu,
}: {
  label: string;
  active: boolean;
  icon?: React.ReactNode;
  onClick: () => void;
  onPop?: () => void;
  popTitle?: string;
  onRename?: () => void;
  onDelete?: () => void;
  badge?: string;
  onContextMenu?: (e: React.MouseEvent) => void;
}) {
  return (
    <div
      className={`group flex items-center gap-1 px-1.5 h-6 rounded cursor-pointer ${
        active ? "bg-action/12" : "hover:bg-ink-100"
      }`}
      onClick={onClick}
      onContextMenu={onContextMenu}
    >
      {icon && <span className="text-ink-500 shrink-0">{icon}</span>}
      <span
        className={`text-[11.5px] truncate flex-1 min-w-0 ${
          active ? "text-action font-semibold" : "text-ink-700"
        }`}
      >
        {label}
      </span>
      {badge && <span className="text-[9.5px] text-ink-400 shrink-0">{badge}</span>}
      <span className="hidden group-hover:flex items-center gap-0.5 shrink-0">
        {onRename && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRename();
            }}
            title="Rename"
            className="text-ink-400 hover:text-action"
          >
            <Pencil size={10} />
          </button>
        )}
        {onPop && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onPop();
            }}
            title={popTitle ?? "Open in its own window"}
            className="text-ink-400 hover:text-action"
          >
            <ExternalLink size={10} />
          </button>
        )}
        {onDelete && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            title="Delete"
            className="text-ink-400 hover:text-danger"
          >
            <Trash2 size={10} />
          </button>
        )}
      </span>
    </div>
  );
}

export default function ProjectTree({
  projectName,
  routines,
  selection,
  tagCount,
  simFloating,
  tagsFloating,
  onSelect,
  onAddRoutine,
  onRenameRoutine,
  onDeleteRoutine,
  onPopOut,
  onRoutineMenu,
  onTreeMenu,
}: {
  projectName: string;
  routines: Routine[];
  selection: TreeSelection;
  tagCount: number;
  /** True when the simulator panel is open. Named for its old floating form. */
  simFloating: boolean;
  tagsFloating: boolean;
  onSelect: (s: TreeSelection) => void;
  /** Right-click on one routine in the tree. */
  onRoutineMenu?: (e: React.MouseEvent, routineId: string, index: number) => void;
  /** Right-click on the tree itself, away from any row. */
  onTreeMenu?: (e: React.MouseEvent) => void;
  onAddRoutine: () => void;
  onRenameRoutine: (id: string) => void;
  onDeleteRoutine: (id: string) => void;
  onPopOut: (what: "tags" | "sim") => void;
}) {
  const [openProgram, setOpenProgram] = useState(true);
  const [openTags, setOpenTags] = useState(true);
  const [openSim, setOpenSim] = useState(true);

  return (
    <div
      className="h-full overflow-y-auto bg-ink-50 border-r border-ink-200 p-1.5"
      onContextMenu={onTreeMenu}
    >
      <p className="px-1.5 py-1 text-[10px] font-bold uppercase tracking-wider text-ink-400 truncate">
        {projectName || "Untitled project"}
      </p>

      <Group
        label="Program"
        icon={<FileCode2 size={12} />}
        open={openProgram}
        onToggle={() => setOpenProgram((v) => !v)}
        action={
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onAddRoutine();
            }}
            title="Add a routine: a new page of logic, called with JSR"
            className="text-ink-400 hover:text-action"
          >
            <Plus size={12} />
          </button>
        }
      >
        {routines.map((r, i) => (
          <Leaf
            key={r.id}
            label={r.name}
            icon={i === 0 ? <Home size={10} /> : undefined}
            badge={`${r.rungs.length}`}
            active={selection.kind === "routine" && selection.id === r.id}
            onClick={() => onSelect({ kind: "routine", id: r.id })}
            onRename={() => onRenameRoutine(r.id)}
            // Main is the entry point. Deleting it would leave the controller
            // with nothing to execute, so it is not offered.
            onDelete={i === 0 ? undefined : () => onDeleteRoutine(r.id)}
            onContextMenu={(e) => onRoutineMenu?.(e, r.id, i)}
          />
        ))}
      </Group>

      <Group
        label="Tags"
        icon={<Table2 size={12} />}
        open={openTags}
        onToggle={() => setOpenTags((v) => !v)}
      >
        <Leaf
          label="Tag table"
          badge={tagsFloating ? "window" : `${tagCount}`}
          active={selection.kind === "tags"}
          onClick={() => onSelect({ kind: "tags" })}
          onPop={() => onPopOut("tags")}
        />
      </Group>

      <Group
        label="Simulation"
        icon={<MonitorPlay size={12} />}
        open={openSim}
        onToggle={() => setOpenSim((v) => !v)}
      >
        <Leaf
          label="Simulator"
          badge={simFloating ? "open" : "closed"}
          active={selection.kind === "sim"}
          onClick={() => onSelect({ kind: "sim" })}
          onPop={() => onPopOut("sim")}
          popTitle="Show the simulator panel"
        />
      </Group>
    </div>
  );
}
