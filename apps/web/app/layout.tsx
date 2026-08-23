import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://ladx.ai";

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: {
    default: "LADX — the AI workbench for automation engineers",
    // Pages set their own title; this keeps the brand on the end of it.
    template: "%s · LADX",
  },
  description:
    "Draw ladder logic and watch it run, generate PLC code that compiles before you see it, " +
    "and move programs between platforms. Bring your own AI key.",
  applicationName: "LADX",
  icons: {
    icon: [
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/brand/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  manifest: "/manifest.webmanifest",
  openGraph: {
    type: "website",
    siteName: "LADX",
    title: "LADX — the AI workbench for automation engineers",
    description:
      "Ladder logic you can draw, run and convert — with every generated line validated first.",
    url: APP_URL,
    // The wordmark doubles as the share card. A dedicated 1200×630 image is
    // better and comes with the marketing site; this stops the card from
    // rendering blank until then.
    images: [{ url: "/brand/wordmark.png", width: 772, height: 180, alt: "LADX" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "LADX — the AI workbench for automation engineers",
    description:
      "Ladder logic you can draw, run and convert — with every generated line validated first.",
    images: ["/brand/wordmark.png"],
  },
};

export const viewport: Viewport = {
  // Matches the icon's ground, so mobile browser chrome doesn't clash with it.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FFFFFF" },
    { media: "(prefers-color-scheme: dark)", color: "#0F1A24" },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
