/**
 * Cookie and storage consent.
 *
 * The categories below describe what this site actually does, which is less
 * than most consent banners imply. LADX sets one cookie, for your session, and
 * uses browser storage to keep your Studio work. There is no advertising, no
 * third party tracker, and no cross site profiling, so there is no category
 * here for any of that.
 *
 * That honesty has a practical consequence worth stating: rejecting functional
 * storage genuinely breaks something, because Studio saves your ladder program
 * to your own browser and nowhere else. The dialog says so rather than quietly
 * degrading.
 */

export type ConsentCategory = "necessary" | "functional" | "analytics";

export interface ConsentState {
  necessary: true;
  functional: boolean;
  analytics: boolean;
  /** ISO timestamp of the decision, so a stale consent can be re-asked. */
  decidedAt: string;
  /** Bumped when the categories change, which invalidates old decisions. */
  version: number;
}

/**
 * Raise this only when the categories themselves change.
 *
 * Bumping it re-prompts everyone, which is correct when what they consented to
 * has changed and obnoxious when it has not.
 */
export const CONSENT_VERSION = 1;

/** Re-ask after a year, which is the common regulatory expectation. */
export const CONSENT_MAX_AGE_DAYS = 365;

export const STORAGE_KEY = "ladx.consent";

/**
 * Broadcast so that anything depending on consent can react without a reload.
 *
 * Studio in particular needs to know the moment functional storage is granted,
 * because until then it is holding the user's work in memory only.
 */
export const CONSENT_EVENT = "ladx:consent";

export interface CategoryInfo {
  id: ConsentCategory;
  name: string;
  /** Whether the user can turn it off. */
  required: boolean;
  summary: string;
  /** Exactly what is stored, named. Vagueness here is what makes banners useless. */
  items: { name: string; kind: "Cookie" | "Local storage"; purpose: string; retention: string }[];
}

export const CATEGORIES: CategoryInfo[] = [
  {
    id: "necessary",
    name: "Strictly necessary",
    required: true,
    summary:
      "Needed for the site to work at all. Without these you cannot sign in, and we cannot remember that you answered this dialog.",
    items: [
      {
        name: "ladx_session",
        kind: "Cookie",
        purpose: "Keeps you signed in. Holds a random session id and nothing else.",
        retention: "30 days, or until you sign out",
      },
      {
        name: "ladx.consent",
        kind: "Local storage",
        purpose: "Remembers the choice you make here, so you are not asked again.",
        retention: "12 months",
      },
    ],
  },
  {
    id: "functional",
    name: "Functional",
    required: false,
    summary:
      "Keeps your work and your preferences in your own browser. Turning this off means Studio cannot save your ladder program between visits.",
    items: [
      {
        name: "ladx.studio.*",
        kind: "Local storage",
        purpose:
          "Your Studio project: rungs, tags and simulator state. Stored in your browser, never sent to us.",
        retention: "Until you clear it",
      },
      {
        name: "ladx.studio.mode",
        kind: "Local storage",
        purpose: "Whether you last used Studio docked or in focus mode.",
        retention: "Until you clear it",
      },
    ],
  },
  {
    id: "analytics",
    name: "Analytics",
    required: false,
    summary:
      "Anonymous usage statistics, so we can see which pages are worth keeping. Nothing is running today: this category exists so that if we ever add it, it is off until you say otherwise.",
    items: [],
  },
];

/** Everything off except what cannot be turned off. */
export function rejectedState(): ConsentState {
  return {
    necessary: true,
    functional: false,
    analytics: false,
    decidedAt: new Date().toISOString(),
    version: CONSENT_VERSION,
  };
}

export function acceptedState(): ConsentState {
  return {
    necessary: true,
    functional: true,
    analytics: true,
    decidedAt: new Date().toISOString(),
    version: CONSENT_VERSION,
  };
}

/**
 * Read the stored decision, or null when there is nothing usable.
 *
 * Returns null for a decision made against a different set of categories, or
 * one older than the maximum age, because both mean we no longer know that the
 * user agreed to what we are actually doing.
 */
export function readConsent(): ConsentState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ConsentState>;
    if (parsed.version !== CONSENT_VERSION) return null;
    if (typeof parsed.decidedAt !== "string") return null;

    const age = Date.now() - new Date(parsed.decidedAt).getTime();
    if (!Number.isFinite(age) || age > CONSENT_MAX_AGE_DAYS * 86_400_000) return null;

    return {
      necessary: true,
      functional: parsed.functional === true,
      analytics: parsed.analytics === true,
      decidedAt: parsed.decidedAt,
      version: CONSENT_VERSION,
    };
  } catch {
    // Private browsing, a disabled storage API, or corrupted JSON. Treating any
    // of them as "not yet decided" is the safe reading: we ask again rather
    // than assuming permission we cannot prove.
    return null;
  }
}

export function writeConsent(state: ConsentState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage refused. The decision holds for this page view via the event
    // below, and we will ask again next time, which is the honest fallback.
  }
  window.dispatchEvent(new CustomEvent<ConsentState>(CONSENT_EVENT, { detail: state }));
}

/**
 * Withdraw functional consent and remove what it permitted.
 *
 * Turning a category off has to actually delete the data it covered, otherwise
 * the toggle is decoration. Studio keys are namespaced under ladx.studio so
 * they can be found and cleared without touching anything else.
 */
export function purgeFunctionalStorage(): void {
  if (typeof window === "undefined") return;
  try {
    const doomed: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key?.startsWith("ladx.studio")) doomed.push(key);
    }
    for (const key of doomed) window.localStorage.removeItem(key);
  } catch {
    // Nothing to do: if storage cannot be read it cannot be holding anything.
  }
}

/** Whether a given category is permitted right now. */
export function hasConsent(category: ConsentCategory): boolean {
  if (category === "necessary") return true;
  const state = readConsent();
  return state ? state[category] : false;
}
