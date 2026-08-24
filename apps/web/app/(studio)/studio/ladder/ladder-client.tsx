"use client";

import { CONSENT_EVENT, type ConsentState, hasConsent } from "@/lib/consent/consent";
import {
  LadxStudio,
  type StudioProject,
  type StudioStorage,
  localStorageStorage,
} from "@ladx/studio";
import { useEffect, useMemo, useState } from "react";

/** In-memory storage, used when functional storage has not been consented to. */
function memoryStorage(): StudioStorage {
  let held: StudioProject | null = null;
  return {
    load: async () => held,
    save: async (_id, project) => {
      held = project;
    },
    retentionNote: "Not saved. This project is lost when you close the tab.",
  };
}

/**
 * The ladder editor, inside Studio.
 *
 * The same component the public editor uses, mounted in the workspace instead
 * of in the marketing site. There is no focus or fullscreen control here: the
 * Studio shell is already the chrome, and its sidebar collapses, which is the
 * equivalent gesture in an app.
 */
export default function LadderClient() {
  const [mayPersist, setMayPersist] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    setMayPersist(hasConsent("functional"));
    const onConsent = (e: Event) =>
      setMayPersist((e as CustomEvent<ConsentState>).detail.functional);
    window.addEventListener(CONSENT_EVENT, onConsent);
    return () => window.removeEventListener(CONSENT_EVENT, onConsent);
  }, []);

  const storage = useMemo(
    () => (mayPersist ? localStorageStorage() : memoryStorage()),
    [mayPersist],
  );

  return (
    <div className="min-h-0 flex-1">
      <LadxStudio projectId="scratch" storage={storage} />
    </div>
  );
}
