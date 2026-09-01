"use client";

import { Button, Input, Logo } from "@ladx/ui";
import Link from "next/link";
import { type FormEvent, useState } from "react";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
    } finally {
      setLoading(false);
      setSubmitted(true);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-8 bg-white">
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-6">
          <Logo size={48} />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-center text-ink-900 mb-1">
          Reset your password
        </h1>
        <p className="text-sm text-ink-500 text-center mb-8">
          We'll email you a link. Valid for 60 minutes.
        </p>

        {submitted ? (
          <div className="rounded-md border border-teal bg-teal-50 px-4 py-3 text-sm text-ink-700">
            If an account exists for that email, we've sent a reset link.
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-3">
            <div>
              <label htmlFor="email" className="block text-xs font-medium text-ink-700 mb-1">
                Email
              </label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </div>
            <Button type="submit" variant="primary" className="w-full" disabled={loading}>
              {loading ? "…" : "Send reset link"}
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
