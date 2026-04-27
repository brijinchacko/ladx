import { AppShell } from "@/components/app-shell";
import type { ReactNode } from "react";

export const dynamic = "force-dynamic";

export default function AuthenticatedLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
