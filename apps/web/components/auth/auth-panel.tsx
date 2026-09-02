"use client";

import { Button, Input, Logo } from "@ladx/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ElementType, type FormEvent, type MouseEvent, useState } from "react";

export type AuthMode = "sign-in" | "sign-up";

/** Fired on `window` when a sign-in, sign-up or sign-out changes the session. */
export const AUTH_CHANGED = "ladx:auth-changed";

export interface AuthPanelProps {
  mode: AuthMode;
  /** Where to send them once they are in. */
  next: string;
  /**
   * Swap between the two forms in place.
   *
   * The dialog passes this so "Already have an account?" changes the form
   * rather than closing the dialog and loading a page. The standalone routes
   * leave it out and get real links instead, which is what a crawler, a
   * middle-click and a browser with no JavaScript all need.
   */
  onModeChange?: (mode: AuthMode) => void;
  /** Runs after a successful sign-in or sign-up, before the redirect. */
  onDone?: () => void;
  /**
   * The element the heading and the standfirst render as.
   *
   * A dialog needs its title wired to the dialog itself for screen readers,
   * and the accessible name has to come from the same element that is visible.
   * Passing the components in means one form, correctly labelled in both
   * places, rather than two copies that drift.
   */
  titleAs?: ElementType;
  descriptionAs?: ElementType;
}

type SignInVariant = "password" | "magic-link";

/**
 * The account form itself, with no page around it.
 *
 * Lives apart from the routes because it is now rendered twice: as the whole
 * of /sign-in and /sign-up, and inside the dialog that opens over whatever
 * page somebody was already reading.
 */
export function AuthPanel({
  mode,
  next,
  onModeChange,
  onDone,
  titleAs: Title = "h1",
  descriptionAs: Description = "p",
}: AuthPanelProps) {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [variant, setVariant] = useState<SignInVariant>("password");
  const [magicSent, setMagicSent] = useState(false);

  const isSignUp = mode === "sign-up";
  const usingMagic = !isSignUp && variant === "magic-link";
  const other: AuthMode = isSignUp ? "sign-in" : "sign-up";

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
        // Always show "sent", never disclose whether the email is registered.
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

      /*
        Tell the rest of the page that the session changed.

        The site header reads /api/auth/me once when it mounts, which is right
        for a page load and wrong for a dialog: without this it would still be
        offering "Start free" to somebody who had just signed in behind it.
      */
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event(AUTH_CHANGED));
      }
      onDone?.();
      router.push(next);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "network error");
    } finally {
      setLoading(false);
    }
  }

  function switchTo(e: MouseEvent, to: AuthMode) {
    if (!onModeChange) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    setError(null);
    onModeChange(to);
  }

  return (
    <div className="w-full">
      <div className="mb-6 flex justify-center">
        <Logo size={48} />
      </div>
      <Title className="mb-1 text-center font-semibold text-2xl text-ink-900 tracking-tight">
        {isSignUp ? "Create your account" : "Sign in"}
      </Title>
      <Description className="mb-8 text-center text-ink-500 text-sm">
        {isSignUp ? "Free tier, 50 prompts/month, no card required." : "Welcome back."}
      </Description>

      {magicSent ? (
        <div className="rounded-md border border-teal bg-teal-50 px-4 py-3 text-ink-700 text-sm">
          Check your email, we've sent a sign-in link valid for 15 minutes.
        </div>
      ) : (
        <>
          <form onSubmit={onSubmit} className="space-y-3">
            {isSignUp && (
              <div>
                <label
                  htmlFor="displayName"
                  className="mb-1 block font-medium text-ink-700 text-xs"
                >
                  Full name
                </label>
                <Input
                  id="displayName"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Jane Smith"
                  autoComplete="name"
                  required
                />
              </div>
            )}
            <div>
              <label htmlFor="email" className="mb-1 block font-medium text-ink-700 text-xs">
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
                <div className="mb-1 flex items-baseline justify-between">
                  <label htmlFor="password" className="block font-medium text-ink-700 text-xs">
                    Password
                  </label>
                  {!isSignUp && (
                    <Link
                      href="/forgot-password"
                      className="text-teal-700 text-xs hover:text-teal-800"
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
              <div className="rounded-md border border-danger bg-danger px-3 py-2 text-danger text-sm">
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
              className="mt-3 block w-full text-center text-ink-500 text-xs hover:text-ink-900"
            >
              {variant === "password"
                ? "Or sign in with a magic link instead"
                : "Use my password instead"}
            </button>
          )}
        </>
      )}

      <p className="mt-6 text-center text-ink-500 text-sm">
        {isSignUp ? "Already have an account? " : "No account? "}
        <Link
          href={isSignUp ? "/sign-in" : "/sign-up"}
          onClick={(e) => switchTo(e, other)}
          className="text-teal-700 hover:text-teal-800"
        >
          {isSignUp ? "Sign in" : "Create one"}
        </Link>
      </p>
    </div>
  );
}
