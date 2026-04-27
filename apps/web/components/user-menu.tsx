"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function UserMenu({
  email,
  displayName,
}: {
  email: string | null;
  displayName: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  if (!email) {
    return <p className="text-xs text-ink-400">Not signed in</p>;
  }

  async function signOut() {
    setBusy(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/sign-in");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-ink-900 truncate">{displayName ?? email}</p>
        {displayName && <p className="text-xs text-ink-500 truncate">{email}</p>}
      </div>
      <button
        type="button"
        onClick={signOut}
        disabled={busy}
        className="text-ink-400 hover:text-ink-700 p-1 rounded-md hover:bg-ink-100"
        aria-label="Sign out"
        title="Sign out"
      >
        <LogOut className="h-4 w-4" />
      </button>
    </div>
  );
}
