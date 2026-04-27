"use client";

import { Button, Input, Logo } from "@ladx/ui";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, useState } from "react";

export interface AuthFormProps {
  mode: "sign-in" | "sign-up";
}

type SignInVariant = "password" | "magic-link";

export function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/projects";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [variant, setVariant] = useState<SignInVariant>("password");
  const [magicSent, setMagicSent] = useState(false);

  const isSignUp = mode === "sign-up";
  const usingMagic = !isSignUp && variant === "magic-link";

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (usingMagic) {
        await fetch("/api/auth/magic-link/request", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, next }),
        });
        // Always show "sent" — never disclose whether the email is registered.
        setMagicSent(true);
        return;
      }

      const endpoint = isSignUp ? "/api/auth/signup" : "/api/auth/login";
      const body = isSignUp ? { email, password, displayName } : { email, password };
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? `request failed (${res.status})`);
        return;
      }

      router.push(next);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "network error");
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
          {isSignUp ? "Create your account" : "Sign in"}
        </h1>
        <p className="text-sm text-ink-500 text-center mb-8">
          {isSignUp ? "Free tier — 50 prompts/month, no card required." : "Welcome back."}
        </p>

        {magicSent ? (
          <div className="rounded-md border border-teal/30 bg-teal-50 px-4 py-3 text-sm text-ink-700">
            Check your email — we've sent a sign-in link valid for 15 minutes.
          </div>
        ) : (
          <>
            <form onSubmit={onSubmit} className="space-y-3">
              {isSignUp && (
                <div>
                  <label
                    htmlFor="displayName"
                    className="block text-xs font-medium text-ink-700 mb-1"
                  >
                    Name
                  </label>
                  <Input
                    id="displayName"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Brijin Chacko"
                    autoComplete="name"
                    required
                  />
                </div>
              )}
              <div>
                <label htmlFor="email" className="block text-xs font-medium text-ink-700 mb-1">
                  Email
                </label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  required
                />
              </div>
              {!usingMagic && (
                <div>
                  <div className="flex items-baseline justify-between mb-1">
                    <label htmlFor="password" className="block text-xs font-medium text-ink-700">
                      Password
                    </label>
                    {!isSignUp && (
                      <Link
                        href="/forgot-password"
                        className="text-xs text-teal-500 hover:text-teal-600"
                      >
                        Forgot?
                      </Link>
                    )}
                  </div>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={isSignUp ? "min 8 characters" : ""}
                    autoComplete={isSignUp ? "new-password" : "current-password"}
                    minLength={8}
                    required
                  />
                </div>
              )}

              {error && (
                <div className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
                  {error}
                </div>
              )}

              <Button type="submit" variant="primary" className="w-full" disabled={loading}>
                {loading
                  ? "…"
                  : usingMagic
                    ? "Email me a sign-in link"
                    : isSignUp
                      ? "Create account"
                      : "Sign in"}
              </Button>
            </form>

            {!isSignUp && (
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setVariant(variant === "password" ? "magic-link" : "password");
                }}
                className="block w-full text-center mt-3 text-xs text-ink-500 hover:text-ink-900"
              >
                {variant === "password"
                  ? "Or sign in with a magic link instead"
                  : "Use my password instead"}
              </button>
            )}
          </>
        )}

        <p className="text-sm text-ink-500 text-center mt-6">
          {isSignUp ? (
            <>
              Already have an account?{" "}
              <Link href="/sign-in" className="text-teal-500 hover:text-teal-600">
                Sign in
              </Link>
            </>
          ) : (
            <>
              No account?{" "}
              <Link href="/sign-up" className="text-teal-500 hover:text-teal-600">
                Create one
              </Link>
            </>
          )}
        </p>
      </div>
    </main>
  );
}
