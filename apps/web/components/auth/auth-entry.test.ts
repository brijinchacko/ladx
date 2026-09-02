// Signing in happens over the page, not instead of it.
//
// The dialog is easy to add and easy to lose: a plain `<Link href="/sign-up">`
// still works, still looks right in review, and quietly throws away whatever
// the visitor was reading or typing. So the calls to action are checked here
// against the source rather than trusted.
//
// The two routes stay in the sweep on purpose. They are the fallback for a
// server redirect off a protected page, for a magic link that has expired, and
// for a browser that never ran our JavaScript, and deleting them because the
// dialog exists would break all three.

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const webRoot = path.resolve(__dirname, "../..");

function read(rel: string): string {
  return readFileSync(path.join(webRoot, rel), "utf8");
}

/** Files that offer an account to somebody who does not have one yet. */
const CALLS_TO_ACTION = [
  "components/site/chrome.tsx",
  "app/(site)/free/page.tsx",
  "app/(site)/share/[token]/page.tsx",
];

/** Files that hit a 401 partway through something the visitor was writing. */
const RECOVERS_FROM_401 = ["components/forum/reply-box.tsx", "components/forum/thread-form.tsx"];

describe("signing in", () => {
  it("still has both routes to fall back to", () => {
    expect(() => read("app/sign-in/page.tsx")).not.toThrow();
    expect(() => read("app/sign-up/page.tsx")).not.toThrow();
  });

  it("is offered as a dialog, never as a plain link away from the page", () => {
    for (const file of CALLS_TO_ACTION) {
      const src = read(file);
      const plain = src.match(/href="\/sign-(?:in|up)"/g) ?? [];
      expect(plain, `${file} links straight to ${plain[0]} instead of opening the dialog`).toEqual(
        [],
      );
      expect(src, `${file} offers an account but never opens the dialog`).toContain("AuthLink");
    }
  });

  it("keeps what somebody had already typed when the session has gone", () => {
    for (const file of RECOVERS_FROM_401) {
      const src = read(file);
      expect(src, `${file} handles a 401 by navigating away from the draft`).toContain(
        "useAuthModal",
      );
      // The route is still there underneath, for the case where the dialog is
      // not mounted. It just is not the first thing tried.
      expect(src, `${file} has no fallback if the dialog is missing`).toMatch(/sign-in\?next=/);
    }
  });

  it("mounts the dialog once, high enough for every page to reach it", () => {
    expect(read("app/layout.tsx")).toContain("AuthModalProvider");
  });

  it("opens above the cookie banner rather than under it", () => {
    // At z-50 it did open underneath: the banner is fixed at the bottom at 60,
    // and on a phone that is exactly where the password field and the button
    // are. Read from source rather than asserted in prose, because the two
    // numbers live in different packages and neither mentions the other.
    const highest = (src: string) =>
      Math.max(...[...src.matchAll(/\bz-\[?(\d{1,4})\]?\b/g)].map((m) => Number(m[1])));

    const dialog = highest(
      readFileSync(path.resolve(webRoot, "../../packages/ui/src/components/ui/dialog.tsx"), "utf8"),
    );
    const banner = highest(read("components/consent/consent-banner.tsx"));
    expect(dialog, `dialog sits at ${dialog}, under the banner at ${banner}`).toBeGreaterThan(
      banner,
    );
  });

  it("asks the header to look again once the session changes", () => {
    // Without this the header goes on offering "Start free" to somebody who
    // just made an account in the dialog below it: nothing navigated, so
    // nothing remounted.
    expect(read("components/auth/auth-panel.tsx")).toContain(
      "dispatchEvent(new Event(AUTH_CHANGED)",
    );
    expect(read("components/site/chrome.tsx")).toContain("addEventListener(AUTH_CHANGED");
  });

  it("does not put a real person's name in the placeholder", () => {
    const src = read("components/auth/auth-panel.tsx");
    expect(src).not.toContain("Brijin");
    expect(src, "the name field should show an example full name").toMatch(
      /placeholder="[A-Z][a-z]+ [A-Z][a-z]+"/,
    );
  });
});
