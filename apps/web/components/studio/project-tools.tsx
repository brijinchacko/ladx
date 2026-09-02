import { type Tool, scopedTools, toolHref } from "@/lib/studio/tools";
import {
  Activity,
  Cable,
  ClipboardCheck,
  GitCompareArrows,
  Grid2x2Check,
  Library,
  type LucideIcon,
  MonitorCog,
  PencilRuler,
  Workflow,
} from "lucide-react";
import Link from "next/link";

const ICONS: Record<string, LucideIcon> = {
  Grid2x2Check,
  GitCompareArrows,
  MonitorCog,
  PencilRuler,
  Activity,
  Cable,
  ClipboardCheck,
  Library,
  Workflow,
};

/**
 * Every tool that works on this project, from the project.
 *
 * Before this, four of them had exactly one inbound link in the whole
 * application, which was the sidebar. Somebody standing on a project could not
 * get to the acceptance tests for that project without going out to a list of
 * tools and picking the program again from a dropdown, which is the same
 * program they were already looking at.
 *
 * Each link carries the project, so the tool opens on this work rather than on
 * whatever it happened to show last.
 */
export function ProjectTools({
  projectId,
  hasProgram,
}: {
  projectId: string;
  /** Without a program most of these have nothing to work on, and saying so is
      better than opening an empty tool. */
  hasProgram: boolean;
}) {
  const tools = scopedTools();

  return (
    <section>
      <h2 className="text-[15px] font-semibold text-ink-900">Tools</h2>
      <p className="mt-0.5 text-[13px] text-ink-500">
        {hasProgram
          ? "Each opens on this project."
          : "Write or import a program and these open on it."}
      </p>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {tools.map((tool: Tool) => {
          const Icon = ICONS[tool.icon] ?? Library;
          // Ladder and Convert are how a program gets here in the first place,
          // so they stay live on an empty project. The rest would open on
          // nothing.
          const usable =
            hasProgram || tool.href === "/studio/ladder" || tool.href === "/studio/convert";

          if (!usable) {
            return (
              <div
                key={tool.href}
                className="flex items-start gap-2.5 rounded-md px-3 py-2.5 opacity-40"
              >
                <Icon className="mt-0.5 h-4 w-4 shrink-0 text-ink-400" />
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-ink-700">{tool.label}</p>
                  <p className="text-[12px] leading-relaxed text-ink-500">{tool.about}</p>
                </div>
              </div>
            );
          }

          return (
            <Link
              key={tool.href}
              href={toolHref(tool, projectId)}
              className="flex items-start gap-2.5 rounded-md px-3 py-2.5 transition-colors hover:bg-ink-100"
            >
              <Icon className="mt-0.5 h-4 w-4 shrink-0 text-ink-500" />
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-ink-900">{tool.label}</p>
                <p className="text-[12px] leading-relaxed text-ink-500">{tool.about}</p>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
