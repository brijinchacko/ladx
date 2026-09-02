"use client";

import { ChevronDown, ChevronRight, FileCode2 } from "lucide-react";
import { useEffect, useState } from "react";

interface Pou {
  name: string;
  language: string;
  source: string;
}

const LANGUAGE: Record<string, string> = {
  structuredText: "Structured Text",
  functionBlockDiagram: "Function Block Diagram",
  sequentialFunctionChart: "Sequential Function Chart",
  instructionList: "Instruction List",
};

/**
 * The routines in the uploaded file that are not ladder.
 *
 * The reader carries structured text, FBD and SFC through as source so the
 * file is never corrupted, and the ladder editor drops them with a note. Until
 * now that note was the last anyone saw of them. Here they are, read only,
 * next to the ladder that was converted, so the ST that came in the L5X is at
 * least visible where somebody is looking at the rest of the program.
 */
export function OtherLanguages({ projectId }: { projectId: string }) {
  const [pous, setPous] = useState<Pou[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/projects/${projectId}/ir`)
      .then((r) => (r.ok ? r.json() : null))
      .then(
        (d: { project?: { pous?: { name: string; body: Record<string, unknown> }[] } } | null) => {
          if (cancelled || !d?.project?.pous) {
            if (!cancelled) setPous([]);
            return;
          }
          setPous(
            d.project.pous
              .filter((p) => p.body.language !== "ladder" && typeof p.body.source === "string")
              .map((p) => ({
                name: p.name,
                language: String(p.body.language),
                source: String(p.body.source),
              })),
          );
        },
      )
      .catch(() => {
        if (!cancelled) setPous([]);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  if (!pous || pous.length === 0) return null;

  return (
    <div className="shrink-0 border-t border-ink-100 bg-ink-50 px-4 py-2.5">
      <p className="text-[12.5px] text-ink-700">
        <span className="font-medium text-ink-900">Also in the uploaded file:</span> {pous.length}{" "}
        routine{pous.length === 1 ? "" : "s"} the ladder editor cannot show. Read only, exactly as
        they came in.
      </p>
      <ul className="mt-1.5 space-y-1">
        {pous.map((p) => {
          const isOpen = open === p.name;
          return (
            <li key={p.name} className="rounded-md border border-ink-200 bg-white">
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : p.name)}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12.5px] text-ink-800"
              >
                {isOpen ? (
                  <ChevronDown className="h-3.5 w-3.5 text-ink-400" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5 text-ink-400" />
                )}
                <FileCode2 className="h-3.5 w-3.5 text-ink-400" />
                <span className="font-mono">{p.name}</span>
                <span className="text-ink-500">{LANGUAGE[p.language] ?? p.language}</span>
                <span className="ml-auto font-mono text-[11px] text-ink-400">
                  {p.source.split("\n").length} lines
                </span>
              </button>
              {isOpen && (
                <pre className="max-h-80 overflow-auto border-t border-ink-100 px-3 py-2 font-mono text-[12px] leading-relaxed text-ink-800">
                  {p.source}
                </pre>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
