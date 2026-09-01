"use client";

import {
  Check,
  Copy,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Pin,
  Share2,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export interface HistoryItem {
  id: string;
  title: string | null;
  pinned: boolean;
  shareToken: string | null;
  updatedAt: string;
}

/**
 * The conversation list.
 *
 * Pinned threads first, then the rest by recency, which is the arrangement
 * every assistant uses because it matches how people actually work: a handful
 * of things you keep coming back to, and a long tail you mostly do not.
 *
 * The row menu opens on demand rather than living in the row, because a list of
 * twenty conversations with four buttons each is eighty controls competing with
 * the titles you are trying to read.
 */
export default function ChatHistory({ items }: { items: HistoryItem[] }) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [shared, setShared] = useState<{ id: string; url: string } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuFor) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setMenuFor(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuFor(null);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuFor]);

  async function patch(id: string, body: Record<string, unknown>) {
    const res = await fetch(`/api/conversations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    router.refresh();
    return res.ok ? ((await res.json()) as { shareToken?: string | null }) : null;
  }

  async function commitRename(id: string) {
    const title = draft.trim();
    setRenaming(null);
    if (title) await patch(id, { title });
  }

  async function remove(id: string, title: string) {
    if (!window.confirm(`Delete "${title}"? This cannot be undone.`)) return;
    setMenuFor(null);
    await fetch(`/api/conversations/${id}`, { method: "DELETE" });
    // Leaving the page you just deleted would 404, so step back to a new chat.
    if (pathname === `/studio/c/${id}`) router.push("/studio");
    router.refresh();
  }

  async function share(item: HistoryItem) {
    setMenuFor(null);
    if (item.shareToken) {
      // Already shared: hand the link back rather than minting a second one.
      setShared({ id: item.id, url: `${window.location.origin}/share/${item.shareToken}` });
      return;
    }
    const res = await patch(item.id, { share: true });
    if (res?.shareToken) {
      setShared({ id: item.id, url: `${window.location.origin}/share/${res.shareToken}` });
    }
  }

  if (items.length === 0) return null;

  const pinned = items.filter((i) => i.pinned);
  const rest = items.filter((i) => !i.pinned);

  return (
    <div ref={ref}>
      {shared && <ShareNotice url={shared.url} onClose={() => setShared(null)} />}

      {pinned.length > 0 && (
        <Group label="Pinned">
          {pinned.map((item) => (
            <Row
              key={item.id}
              item={item}
              active={pathname === `/studio/c/${item.id}`}
              menuOpen={menuFor === item.id}
              renaming={renaming === item.id}
              draft={draft}
              onDraft={setDraft}
              onMenu={() => setMenuFor(menuFor === item.id ? null : item.id)}
              onStartRename={() => {
                setMenuFor(null);
                setDraft(item.title ?? "");
                setRenaming(item.id);
              }}
              onCommitRename={() => commitRename(item.id)}
              onPin={() => {
                setMenuFor(null);
                void patch(item.id, { pinned: !item.pinned });
              }}
              onShare={() => share(item)}
              onDelete={() => remove(item.id, item.title ?? "Untitled chat")}
            />
          ))}
        </Group>
      )}

      <Group label={pinned.length > 0 ? "Chats" : "Recent"}>
        {rest.map((item) => (
          <Row
            key={item.id}
            item={item}
            active={pathname === `/studio/c/${item.id}`}
            menuOpen={menuFor === item.id}
            renaming={renaming === item.id}
            draft={draft}
            onDraft={setDraft}
            onMenu={() => setMenuFor(menuFor === item.id ? null : item.id)}
            onStartRename={() => {
              setMenuFor(null);
              setDraft(item.title ?? "");
              setRenaming(item.id);
            }}
            onCommitRename={() => commitRename(item.id)}
            onPin={() => {
              setMenuFor(null);
              void patch(item.id, { pinned: !item.pinned });
            }}
            onShare={() => share(item)}
            onDelete={() => remove(item.id, item.title ?? "Untitled chat")}
          />
        ))}
      </Group>
    </div>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <p className="mb-1 px-2 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-400">
        {label}
      </p>
      <div className="space-y-px">{children}</div>
    </div>
  );
}

function Row({
  item,
  active,
  menuOpen,
  renaming,
  draft,
  onDraft,
  onMenu,
  onStartRename,
  onCommitRename,
  onPin,
  onShare,
  onDelete,
}: {
  item: HistoryItem;
  active: boolean;
  menuOpen: boolean;
  renaming: boolean;
  draft: string;
  onDraft: (v: string) => void;
  onMenu: () => void;
  onStartRename: () => void;
  onCommitRename: () => void;
  onPin: () => void;
  onShare: () => void;
  onDelete: () => void;
}) {
  if (renaming) {
    return (
      <div className="px-2 py-1">
        <input
          ref={(el) => el?.focus()}
          value={draft}
          onChange={(e) => onDraft(e.target.value)}
          onBlur={onCommitRename}
          onKeyDown={(e) => {
            if (e.key === "Enter") onCommitRename();
            if (e.key === "Escape") onDraft("");
          }}
          className="w-full rounded border border-ink-400 bg-white px-1.5 py-1 text-[13px] outline-none"
        />
      </div>
    );
  }

  return (
    <div className="group relative">
      <Link
        href={`/studio/c/${item.id}`}
        className={`flex items-center gap-2 rounded-md py-1.5 pl-2 pr-7 text-[13px] transition-colors ${
          active
            ? "bg-white font-medium text-ink-900 shadow-[0_1px_2px_rgb(var(--ink-900)/0.06)]"
            : "text-ink-600 hover:bg-ink-100/70 hover:text-ink-900"
        }`}
      >
        {item.pinned ? (
          <Pin
            className={`h-3 w-3 shrink-0 ${active ? "text-teal-700" : "text-teal-600"}`}
            fill="currentColor"
          />
        ) : (
          <MessageSquare
            className={`h-3.5 w-3.5 shrink-0 ${active ? "text-ink-900" : "text-ink-400"}`}
          />
        )}
        <span className="min-w-0 flex-1 truncate">{item.title?.trim() || "Untitled chat"}</span>
        {item.shareToken && <Share2 className="h-3 w-3 shrink-0 text-ink-400" />}
      </Link>

      <button
        type="button"
        onClick={onMenu}
        aria-label={`Options for ${item.title ?? "chat"}`}
        className={`absolute right-1 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded transition-opacity ${
          menuOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus:opacity-100"
        } ${active ? "text-ink-500 hover:bg-ink-100" : "text-ink-400 hover:bg-ink-200"}`}
      >
        <MoreHorizontal className="h-3.5 w-3.5" />
      </button>

      {menuOpen && (
        <div className="absolute right-1 top-full z-30 mt-0.5 w-40 overflow-hidden rounded-md border border-ink-200 bg-white shadow-lg">
          <MenuItem icon={Pencil} onClick={onStartRename}>
            Rename
          </MenuItem>
          <MenuItem icon={Pin} onClick={onPin}>
            {item.pinned ? "Unpin" : "Pin"}
          </MenuItem>
          <MenuItem icon={Share2} onClick={onShare}>
            {item.shareToken ? "Copy link" : "Share"}
          </MenuItem>
          <MenuItem icon={Trash2} onClick={onDelete} danger>
            Delete
          </MenuItem>
        </div>
      )}
    </div>
  );
}

function MenuItem({
  icon: Icon,
  onClick,
  danger,
  children,
}: {
  icon: typeof Pencil;
  onClick: () => void;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[12.5px] transition-colors hover:bg-ink-50 ${
        danger ? "text-danger" : "text-ink-700"
      }`}
    >
      <Icon className="h-3 w-3 shrink-0 opacity-60" />
      {children}
    </button>
  );
}

/** The link, shown once so it can be copied. */
function ShareNotice({ url, onClose }: { url: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(onClose, 1200);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="mb-2 rounded-md border border-teal-300 bg-teal-50 p-2">
      <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.1em] text-teal-700">
        Anyone with this link can read it
      </p>
      <div className="flex items-center gap-1">
        <input
          readOnly
          value={url}
          onFocus={(e) => e.currentTarget.select()}
          className="min-w-0 flex-1 rounded border border-teal-200 bg-white px-1.5 py-1 font-mono text-[10.5px] text-ink-700 outline-none"
        />
        <button
          type="button"
          onClick={copy}
          aria-label="Copy link"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-teal-700 hover:bg-teal-100"
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
        </button>
      </div>
    </div>
  );
}
