"use client";

import { AuthPanel } from "@/components/auth/auth-panel";
import { useSearchParams } from "next/navigation";

export interface AuthFormProps {
  mode: "sign-in" | "sign-up";
}

/**
 * /sign-in and /sign-up as whole pages.
 *
 * Most people meet this form in the dialog now. These routes stay because a
 * server redirect off a protected page has nowhere else to send anyone, a
 * failed magic link comes back here, and a browser with no JavaScript follows
 * the link rather than opening anything. Same form either way.
 */
export function AuthForm({ mode }: AuthFormProps) {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/projects";

  return (
    <main className="flex min-h-screen items-center justify-center bg-white p-8">
      <div className="w-full max-w-sm">
        <AuthPanel mode={mode} next={next} />
      </div>
    </main>
  );
}
