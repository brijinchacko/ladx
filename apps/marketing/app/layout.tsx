import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "ladX.ai — Local-first PLC AI agent",
  description:
    "Generate ladder, ST, HMI, and regulatory documents — air-gapped on Windows or in the cloud.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
