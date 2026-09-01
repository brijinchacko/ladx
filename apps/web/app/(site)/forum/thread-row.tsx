import { getCategory } from "@/lib/forum/categories";
import type { ThreadSummary } from "@/lib/forum/queries";
import Link from "next/link";

/**
 * How long ago, in the shortest form that is still unambiguous.
 *
 * Exact timestamps are noise on a list. The thread page shows the real date.
 */
export function timeAgo(date: Date): string {
  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

/** One row in a thread listing. */
export function ThreadRow({
  thread,
  showCategory = false,
}: {
  thread: ThreadSummary;
  showCategory?: boolean;
}) {
  const category = getCategory(thread.category);
  return (
    <li className="py-4">
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            {thread.pinned && (
              <span className="bg-ink-900 px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.08em] text-white">
                Pinned
              </span>
            )}
            {thread.answered && (
              <span className="border border-teal-600 px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.08em] text-teal-700">
                Answered
              </span>
            )}
            {thread.locked && (
              <span className="border border-ink-300 px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.08em] text-ink-400">
                Locked
              </span>
            )}
            {showCategory && category && (
              <Link
                href={`/forum/c/${category.slug}`}
                className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-teal-700 transition-colors hover:text-teal-800"
              >
                {category.name}
              </Link>
            )}
          </div>

          <h3 className="font-display text-[16px] font-bold leading-snug tracking-[-0.01em] text-ink-900">
            <Link
              href={`/forum/t/${thread.slug}`}
              className="transition-colors hover:text-teal-800"
            >
              {thread.title}
            </Link>
          </h3>

          <p className="mt-1 line-clamp-2 text-[13.5px] leading-relaxed text-ink-500">
            {thread.excerpt}
          </p>

          <p className="mt-2 font-mono text-[11px] text-ink-400">
            {thread.authorName} · {timeAgo(thread.createdAt)}
            {thread.replyCount > 0 && ` · last activity ${timeAgo(thread.lastActivityAt)}`}
          </p>
        </div>

        <div className="shrink-0 text-right">
          <span className="block font-mono text-[15px] tabular-nums text-ink-700">
            {thread.replyCount}
          </span>
          <span className="block font-mono text-[10px] uppercase tracking-[0.08em] text-ink-400">
            {thread.replyCount === 1 ? "reply" : "replies"}
          </span>
        </div>
      </div>
    </li>
  );
}
