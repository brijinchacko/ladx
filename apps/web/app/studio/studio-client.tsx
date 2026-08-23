"use client";

import { LadxStudio, localStorageStorage } from "@ladx/studio";
import { useMemo } from "react";

/** A fixed id, so a reload reopens the same scratch project. */
const SCRATCH_PROJECT = "scratch";

export default function StudioClient() {
  // Built once: a new storage object per render would restart the load effect.
  const storage = useMemo(() => localStorageStorage(), []);

  return (
    <div className="h-screen w-screen overflow-hidden">
      <LadxStudio projectId={SCRATCH_PROJECT} storage={storage} />
    </div>
  );
}
