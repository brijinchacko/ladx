import { AppFrame } from "@/components/app-frame";
import { ProjectFolderProvider } from "@/lib/project-folder";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "ladX Studio",
  description: "Local-first PLC AI agent: air-gapped Windows desktop.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
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
