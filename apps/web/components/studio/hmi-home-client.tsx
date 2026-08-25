"use client";

import { HmiHome, type HmiRow } from "@ladx/hmi";

/** The HMI list, wired to the web's API. */
export default function HmiHomeClient(props: {
  applications: HmiRow[];
  projects: { id: string; name: string }[];
  defaultProjectId?: string | null;
}) {
  return (
    <HmiHome
      {...props}
      onCreate={async (input) => {
        const res = await fetch("/api/hmi", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        });
        if (!res.ok) return null;
        const { id } = (await res.json()) as { id: string };
        return id;
      }}
    />
  );
}
