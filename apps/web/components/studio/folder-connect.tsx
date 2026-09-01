"use client";

import {
  type ConnectedFolder,
  UNSUPPORTED_REASON,
  isFolderConnectionSupported,
  pickProjectFolder,
} from "@/lib/fs/project-folder";
import { Check, FolderOpen, X } from "lucide-react";
import { useEffect, useState } from "react";

/**
 * Connect a folder on this computer to the project being created.
 *
 * Optional, and stays optional: everything works without it, files just
 * download instead. Offering it at creation is the moment it is worth asking,
 * because that is when somebody is already deciding where this job lives.
 */
export function FolderConnect({
  folder,
  onChange,
}: {
  folder: ConnectedFolder | null;
  onChange: (folder: ConnectedFolder | null) => void;
}) {
  // Checked on the client, because the server has no window to ask.
  const [supported, setSupported] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setSupported(isFolderConnectionSupported()), []);

  // Nothing at all until the check has run, rather than a button that might be
  // about to disappear.
  if (supported === null) return null;

  if (!supported) {
    return <p className="text-[12px] leading-relaxed text-ink-400">{UNSUPPORTED_REASON}</p>;
  }

  const pick = async () => {
    setError(null);
    try {
      const picked = await pickProjectFolder();
      // Null is a dismissed picker. Nothing should change on the form.
      if (picked) onChange(picked);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That folder could not be opened.");
    }
  };

  return (
    <div>
      {folder ? (
        <div className="flex items-center gap-2 rounded-sm bg-ink-50 px-2.5 py-1.5">
          <Check className="h-3.5 w-3.5 shrink-0 text-teal-700" />
          <span className="min-w-0 flex-1 truncate text-[13px] text-ink-900">{folder.name}</span>
          <button
            type="button"
            onClick={() => onChange(null)}
            aria-label="Disconnect the folder"
            className="shrink-0 rounded p-0.5 text-ink-400 transition-colors hover:bg-ink-200 hover:text-ink-900"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={pick}
          className="flex items-center gap-1.5 rounded-sm border border-ink-200 px-2.5 py-1.5 text-[13px] text-ink-700 transition-colors hover:border-ink-400"
        >
          <FolderOpen className="h-3.5 w-3.5" />
          Choose a folder
        </button>
      )}

      <p className="mt-1.5 text-[12px] leading-relaxed text-ink-400">
        {folder
          ? "Exports, documents and the handover pack are written here. LADX can only see this folder, and not where it is on the disk."
          : "Optional. Pick where this job lives and LADX writes its files there instead of into Downloads."}
      </p>

      {error && <p className="mt-1.5 text-[12px] text-danger">{error}</p>}
    </div>
  );
}
