import { ArrowLeft } from "lucide-react";
import Link from "next/link";

/**
 * Which project this tool is working on.
 *
 * A tool opened from a project used to look exactly like the same tool opened
 * from the sidebar: a dropdown with a program already chosen, and nothing
 * saying why that one. Two programs with similar names, and there is no way to
 * tell from the screen which job you are looking at.
 *
 * Shown only when a project was actually carried in. On a tool reached from the
 * sidebar there is no project, and inventing one would be worse than the bar
 * being absent.
 */
export function ProjectContext({
  projectId,
  projectName,
}: {
  projectId: string | null;
  projectName: string | null;
}) {
  if (!projectId || !projectName) return null;

  return (
    <div className="flex items-center gap-2 border-b border-ink-100 bg-ink-50 px-6 py-1.5">
      <Link
        href={`/studio/projects/${projectId}`}
        className="flex items-center gap-1.5 text-[12.5px] text-ink-600 transition-colors hover:text-ink-900"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        {projectName}
      </Link>
      <span className="text-[12.5px] text-ink-400">·</span>
      <span className="text-[12.5px] text-ink-500">working on this project</span>
    </div>
  );
}
