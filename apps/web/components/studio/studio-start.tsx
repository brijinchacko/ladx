import { FolderKanban, GitCompareArrows, Grid2x2Check, Plus } from "lucide-react";
import Link from "next/link";

interface RecentProject {
  id: string;
  name: string;
  clientName: string | null;
  /** Whether a program has been written or imported for it yet. */
  hasProgram: boolean;
}

/**
 * The strip above the chat box.
 *
 * Home used to be a chat box and nothing else, which answers "ask me anything"
 * and leaves "where was I" and "what is this for" unanswered. Somebody opening
 * Studio in the morning wants the job they were on, and somebody opening it for
 * the first time wants to know what the thing does. A blank prompt gives
 * neither.
 *
 * It stays short on purpose. Chat is still where most sessions start, so this
 * orients and gets out of the way rather than becoming a dashboard.
 */
export function StudioStart({ projects }: { projects: RecentProject[] }) {
  if (projects.length === 0) {
    return (
      <div className="border-b border-ink-100 px-6 py-5">
        <p className="text-[13.5px] text-ink-700">
          Start with a job. A project holds one program and everything read out of it: the I/O list,
          the acceptance tests, the drawings and the handover pack.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Start href="/studio/projects" icon={Plus} primary>
            New project
          </Start>
          <Start href="/studio/ladder" icon={Grid2x2Check}>
            Write ladder
          </Start>
          <Start href="/studio/convert" icon={GitCompareArrows}>
            Import an L5X or SCL file
          </Start>
        </div>
        <p className="mt-3 text-[12.5px] text-ink-500">
          Or ask below. The assistant can read a program you already have.
        </p>
      </div>
    );
  }

  return (
    <div className="border-b border-ink-100 px-6 py-4">
      <div className="mb-2.5 flex items-baseline justify-between gap-3">
        <h2 className="text-[12.5px] font-medium text-ink-700">Pick up where you left off</h2>
        <Link
          href="/studio/projects"
          className="text-[12.5px] text-ink-500 transition-colors hover:text-ink-900"
        >
          All projects
        </Link>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        {projects.map((p) => (
          <Link
            key={p.id}
            href={`/studio/projects/${p.id}`}
            className="flex items-start gap-2.5 rounded-sm border border-ink-200 px-3 py-2.5 transition-colors hover:border-ink-400 hover:bg-ink-50/50"
          >
            <FolderKanban className="mt-0.5 h-4 w-4 shrink-0 text-ink-500" />
            <div className="min-w-0">
              <p className="truncate text-[13px] font-medium text-ink-900">{p.name}</p>
              <p className="truncate text-[12px] text-ink-500">
                {p.clientName ?? "No client"}
                {p.hasProgram ? "" : " · no program yet"}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function Start({
  href,
  icon: Icon,
  primary,
  children,
}: {
  href: string;
  icon: typeof Plus;
  primary?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-1.5 rounded-sm px-3 py-1.5 text-[13px] transition-colors ${
        primary
          ? "bg-ink-900 text-white hover:opacity-90"
          : "border border-ink-200 text-ink-700 hover:border-ink-400"
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      {children}
    </Link>
  );
}
