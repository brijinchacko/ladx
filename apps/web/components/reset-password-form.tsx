"use client";

import { Button, Input, Logo } from "@ladx/ui";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, useState } from "react";

export function ResetPasswordForm() {
  const router = useRouter();
  const params = useSearchParams();
  const uid = params.get("uid") ?? "";
  const token = params.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const linkValid = uid.length > 0 && token.length > 0;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid, token, password }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? `request failed (${res.status})`);
        return;
      }
      router.push("/projects");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-8 bg-white">
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-6">
          <Logo size={48} />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-center text-ink-900 mb-1">
          Choose a new password
        </h1>
        <p className="text-sm text-ink-500 text-center mb-8">Min 8 characters.</p>

        {!linkValid ? (
          <div className="rounded-md border border-danger bg-danger-bg px-4 py-3 text-sm text-danger">
            This reset link is malformed. Request a new one.
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-3">
            <div>
              <label htmlFor="password" className="block text-xs font-medium text-ink-700 mb-1">
                New password
              </label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
              />
            </div>
            {error && (
              <div className="rounded-md border border-danger bg-danger px-3 py-2 text-sm text-danger">
                {error}
              </div>
            )}
            <Button type="submit" variant="primary" className="w-full" disabled={loading}>
              {loading ? "…" : "Set new password"}
            </Button>
          </form>
        )}

        <p className="text-sm text-ink-500 text-center mt-6">
          <Link href="/sign-in" className="text-teal-700 hover:text-teal-800">
            Back to sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
