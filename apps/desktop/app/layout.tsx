import { AppFrame } from "@/components/app-frame";
import { ProjectFolderProvider } from "@/lib/project-folder";
import type { Metadata } from "next";
import { JetBrains_Mono, Public_Sans, Saira } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";

/**
 * The same three faces as the web app, for the same reasons.
 *
 * next/font downloads these during the build and emits them into the bundle,
 * so the running app loads them from its own files and never asks the network.
 * That is what makes them usable here at all.
 *
 * They are not decoration. The ladder editor, the monitor and the tag tables
 * lay out in columns against monospace advance widths, so the face that
 * actually loads decides whether a rung lines up. Without this the variables
 * below were never defined, JetBrains Mono was not present on the machine, and
 * every one of those columns fell back to Menlo and drifted out of alignment.
 */
const sans = Public_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans",
});

const display = Saira({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  display: "swap",
  variable: "--font-display",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "ladX Studio",
  description: "Local-first PLC AI agent: air-gapped Windows desktop.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${display.variable} ${mono.variable}`}>
      <body>
        {/* Which project is open is a whole-app fact: Convert files its exports
            into it, the HMI files its panels, and the shell says which one.

            The shell is here rather than in each page, matching the web app's
            route group layout. It used to be a component a page opted into and
            four of the tools never did, so they opened with no sidebar. */}
        <ProjectFolderProvider>
          <AppFrame>{children}</AppFrame>
        </ProjectFolderProvider>
      </body>
    </html>
  );
}
