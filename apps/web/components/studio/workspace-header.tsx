import type { ReactNode } from "react";

/**
 * The bar at the top of every tool.
 *
 * Thin and consistent, so moving between tools feels like moving between panes
 * of one application rather than between pages of a website. It carries the
 * name of the tool and whatever that tool needs on the right.
 */
export function WorkspaceHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="flex shrink-0 items-center gap-4 border-b border-ink-100 px-6 py-3">
      <div className="min-w-0">
        <h1 className="truncate font-display text-[15px] font-bold tracking-tight text-ink-900">
          {title}
        </h1>
        {subtitle && <p className="truncate text-[12.5px] text-ink-500">{subtitle}</p>}
      </div>
      {actions && <div className="ml-auto flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}
