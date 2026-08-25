/**
 * The sitemap and robots.txt must agree.
 *
 * They disagreed for weeks and nothing said so. The application moved under a
 * /studio prefix, the disallow list kept the old route names, and the result
 * was that `/documents` was blocked from every crawler while the sitemap went
 * on advertising it and its sixteen template pages. Meanwhile the actual
 * application was fully crawlable.
 *
 * Neither half is wrong on its own, which is why nobody spotted it. The bug
 * only exists in the relationship between two files, so the test has to be
 * about the relationship.
 */

import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { SITE } from "@/lib/seo/schema";
import { describe, expect, it } from "vitest";

/** The path part of a sitemap entry, as robots.txt would match it. */
function pathOf(url: string): string {
  return url.replace(SITE.url, "") || "/";
}

/** robots.txt prefix matching, which is what a crawler actually applies. */
function isBlocked(path: string, disallow: string[]): boolean {
  return disallow.some((rule) => {
    if (rule === "/") return true;
    // A rule without a trailing slash blocks the exact path and anything under
    // it, which is how "/studio" blocks "/studio/ladder".
    return path === rule || path.startsWith(rule.endsWith("/") ? rule : `${rule}/`);
  });
}

const rules = robots().rules;
const allRules = Array.isArray(rules) ? rules : [rules];
const wildcard = allRules.find((r) => r.userAgent === "*");
const disallow = ([] as string[]).concat(wildcard?.disallow ?? []);

describe("robots.txt does not block what the sitemap advertises", () => {
  const entries = sitemap();

  it("has a sitemap with real entries", () => {
    expect(entries.length).toBeGreaterThan(50);
  });

  it("blocks none of them", () => {
    const blocked = entries.map((e) => pathOf(e.url)).filter((p) => isBlocked(p, disallow));
    expect(blocked).toEqual([]);
  });

  it("lists no url twice", () => {
    const urls = entries.map((e) => e.url);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it("uses the canonical host for every url", () => {
    const wrong = entries.map((e) => e.url).filter((u) => !u.startsWith(SITE.url));
    expect(wrong).toEqual([]);
  });

  it("has no trailing slash on anything but the root", () => {
    const trailing = entries
      .map((e) => e.url)
      .filter((u) => u !== SITE.url && u !== `${SITE.url}/` && u.endsWith("/"));
    expect(trailing).toEqual([]);
  });
});

describe("robots.txt keeps the private surface private", () => {
  const mustBlock = [
    "/studio",
    "/studio/projects",
    "/studio/admin",
    "/studio/admin/users",
    "/api/projects",
    "/sign-in",
    "/share/some-token",
  ];

  for (const path of mustBlock) {
    it(`blocks ${path}`, () => {
      expect(isBlocked(path, disallow)).toBe(true);
    });
  }

  const mustAllow = [
    "/",
    "/products",
    "/products/hmi",
    "/resources",
    "/resources/plc-scan-cycle-explained",
    "/documents",
    "/documents/control-narrative",
    "/forum",
    "/help",
    "/ladder",
    "/convert",
  ];

  for (const path of mustAllow) {
    it(`allows ${path}`, () => {
      expect(isBlocked(path, disallow)).toBe(false);
    });
  }
});

describe("the AI crawlers are named, and allowed", () => {
  /**
   * Named individually rather than relying on the wildcard, because several of
   * these read a rule addressed to them and ignore the wildcard entirely. The
   * commonest own goal in this area is a crawler that was never refused and
   * never invited either.
   */
  const wanted = [
    "GPTBot",
    "OAI-SearchBot",
    "ChatGPT-User",
    "ClaudeBot",
    "PerplexityBot",
    "Google-Extended",
    "Applebot-Extended",
    "Bingbot",
  ];

  for (const bot of wanted) {
    it(`names ${bot}`, () => {
      const rule = allRules.find((r) => r.userAgent === bot);
      expect(rule, `${bot} has no rule of its own`).toBeDefined();
      expect(rule?.allow).toBe("/");
    });
  }

  it("gives every named crawler the same disallow list as the wildcard", () => {
    for (const rule of allRules) {
      if (rule.userAgent === "*") continue;
      expect(([] as string[]).concat(rule.disallow ?? [])).toEqual(disallow);
    }
  });
});
