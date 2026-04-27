"use client";

import { Button } from "@ladx/ui";
import { useState } from "react";

export function ManageBillingButton() {
  const [busy, setBusy] = useState(false);

  async function open() {
    setBusy(true);
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      alert(data.error ?? `request failed (${res.status})`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button variant="outline" onClick={open} disabled={busy}>
      {busy ? "…" : "Manage billing"}
    </Button>
  );
}

export function UpgradeButton({
  tier,
  label,
  variant = "primary",
}: {
  tier: "pro";
  label: string;
  variant?: "primary" | "outline";
}) {
  const [busy, setBusy] = useState(false);

  async function go() {
    setBusy(true);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier }),
      });
      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      alert(data.error ?? `request failed (${res.status})`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button variant={variant} onClick={go} disabled={busy}>
      {busy ? "…" : label}
    </Button>
  );
}
