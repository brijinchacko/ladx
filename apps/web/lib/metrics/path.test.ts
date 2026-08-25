/**
 * The counter must not be able to identify anybody.
 *
 * That is a property of what goes into the table, so it is tested here rather
 * than asserted in a policy page. Every case below is either an id that has to
 * be removed or a page name that has to survive.
 */

import { describe, expect, it } from "vitest";
import { normalisePath } from "./path";

describe("ids are removed", () => {
  it("collapses a uuid", () => {
    expect(normalisePath("/studio/projects/2304165a-8c71-4dc7-87d2-e11cc132d8f1")).toBe(
      "/studio/projects/[id]",
    );
  });

  it("collapses an id in the middle of a path", () => {
    expect(normalisePath("/studio/cad/2304165a-8c71-4dc7-87d2-e11cc132d8f1/sheet")).toBe(
      "/studio/cad/[id]/sheet",
    );
  });

  it("collapses a long opaque token", () => {
    expect(normalisePath("/studio/hmi/abcdef0123456789abcdef")).toBe("/studio/hmi/[id]");
  });

  it("collapses a numeric id", () => {
    expect(normalisePath("/forum/12345")).toBe("/forum/[id]");
  });

  it("never records which share link was opened", () => {
    expect(normalisePath("/share/s3cr3t-token-value-here")).toBe("/share/[token]");
    expect(normalisePath("/share/another-one-entirely")).toBe("/share/[token]");
  });

  it("drops the query string whole", () => {
    expect(normalisePath("/sign-in?next=/studio/projects&email=someone@example.com")).toBe(
      "/sign-in",
    );
    expect(normalisePath("/reset-password?token=abc123&uid=x")).toBe("/reset-password");
  });

  it("drops the fragment", () => {
    expect(normalisePath("/help#saving")).toBe("/help");
  });
});

describe("page names survive", () => {
  it("keeps the root", () => {
    expect(normalisePath("/")).toBe("/");
  });

  it("keeps ordinary pages", () => {
    expect(normalisePath("/products")).toBe("/products");
    expect(normalisePath("/studio/ladder")).toBe("/studio/ladder");
  });

  it("keeps an article slug, which is the point of the table", () => {
    expect(normalisePath("/resources/what-is-a-plc")).toBe("/resources/what-is-a-plc");
    expect(normalisePath("/products/hmi")).toBe("/products/hmi");
  });

  it("keeps a template slug", () => {
    expect(normalisePath("/documents/factory-acceptance-test")).toBe(
      "/documents/factory-acceptance-test",
    );
  });

  it("treats a trailing slash as the same page", () => {
    expect(normalisePath("/products/")).toBe("/products");
  });
});

describe("what is not counted at all", () => {
  it("skips assets and build output", () => {
    expect(normalisePath("/_next/static/chunk.js")).toBeNull();
    expect(normalisePath("/logo.svg")).toBeNull();
    expect(normalisePath("/favicon.ico")).toBeNull();
    expect(normalisePath("/sitemap.xml")).toBeNull();
  });

  it("skips the API, which is not a page anybody read", () => {
    expect(normalisePath("/api/projects")).toBeNull();
  });

  it("refuses anything that is not a path", () => {
    expect(normalisePath("https://example.com/x")).toBeNull();
    expect(normalisePath("")).toBeNull();
  });

  it("does not store an absurdly long path", () => {
    expect(normalisePath(`/${"a".repeat(600)}`)).toBe("/other");
  });
});
