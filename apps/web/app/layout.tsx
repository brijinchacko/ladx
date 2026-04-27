import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "ladX.ai Cloud",
  description: "Local-first, ladder-first PLC AI agent — cloud edition.",
};

// Conditionally wrap with ClerkProvider — when the publishable key isn't
// configured (e.g., CI without secrets, local typecheck-only), we render
// children directly so the build doesn't blow up. Real auth requires the
// env var at runtime.
export default function RootLayout({ children }: { children: ReactNode }) {
  const hasClerk = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

  const tree = (
    <html lang="en">
      <body>{children}</body>
    </html>
  );

  return hasClerk ? <ClerkProvider>{tree}</ClerkProvider> : tree;
}
