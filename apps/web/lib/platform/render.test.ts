import type { Client, CompanyProfile, Project } from "@/lib/db/schema";
import { describe, expect, it } from "vitest";
import { parseDocument, parseInline, spansToText } from "./doc-ast";
import { renderDocx } from "./render-docx";
import { renderPdf } from "./render-pdf";

const project = { id: "p", name: "Line 4 Filler", code: "LX-2601" } as Project;
const company = { name: "Wartens Automation", city: "Leeds" } as CompanyProfile;
const client = { name: "Acme Foods", city: "Wakefield" } as Client;

const SAMPLE = `# Functional Design Specification
## Line 4 Filler

| Field | Value |
|---|---|
| **Document** | FDS |
| Revision | 0 |

## 1. Purpose

The system shall do the thing, and \`FT-101\` measures it.

- First point
- Second point

> A note that matters.

---

1. Do this
2. Then that
`;

describe("parseInline", () => {
  it("splits bold and code out of plain text", () => {
    const spans = parseInline("A **bold** and `code` run");
    expect(spans.find((s) => s.bold)?.text).toBe("bold");
    expect(spans.find((s) => s.code)?.text).toBe("code");
    expect(spansToText(spans)).toBe("A bold and code run");
  });

  it("returns a single span for plain text", () => {
    expect(parseInline("plain")).toEqual([{ text: "plain" }]);
  });
});

describe("parseDocument", () => {
  const blocks = parseDocument(SAMPLE);

  it("finds every block kind", () => {
    const kinds = new Set(blocks.map((b) => b.kind));
    expect(kinds).toContain("heading");
    expect(kinds).toContain("table");
    expect(kinds).toContain("paragraph");
    expect(kinds).toContain("bullets");
    expect(kinds).toContain("quote");
    expect(kinds).toContain("rule");
    expect(kinds).toContain("numbered");
  });

  it("collapses consecutive bullets into one list", () => {
    const lists = blocks.filter((b) => b.kind === "bullets");
    expect(lists).toHaveLength(1);
    expect((lists[0] as { items: unknown[] }).items).toHaveLength(2);
  });

  it("normalises table rows to the header width", () => {
    const table = blocks.find((b) => b.kind === "table") as {
      header: unknown[];
      rows: unknown[][];
    };
    expect(table.header).toHaveLength(2);
    for (const row of table.rows) expect(row).toHaveLength(2);
  });

  it("keeps heading levels", () => {
    const h1 = blocks.find((b) => b.kind === "heading" && b.level === 1);
    const h2 = blocks.find((b) => b.kind === "heading" && b.level === 2);
    expect(h1).toBeDefined();
    expect(h2).toBeDefined();
  });
});

describe("renderPdf", () => {
  it("produces a real PDF", () => {
    const buf = renderPdf({
      title: "Functional Design Specification",
      abbr: "FDS",
      markdown: SAMPLE,
      company,
      client,
      project,
    });
    // %PDF- magic bytes.
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(buf.length).toBeGreaterThan(1000);
  });

  it("paginates a long document rather than overflowing one page", () => {
    const long = Array.from({ length: 120 }, (_, i) => `## Section ${i}\n\nBody text ${i}.`).join(
      "\n\n",
    );
    const buf = renderPdf({
      title: "Long",
      abbr: "L",
      markdown: long,
      company,
      client: null,
      project,
    });
    // More than one page object present.
    expect(buf.toString("latin1").split("/Type /Page").length).toBeGreaterThan(2);
  });

  it("survives a company with no logo and no client", () => {
    const buf = renderPdf({
      title: "T",
      abbr: "T",
      markdown: "# Hi",
      company: null,
      client: null,
      project,
    });
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
  });
});

describe("renderDocx", () => {
  it("produces a real .docx package", async () => {
    const buf = await renderDocx({
      title: "Functional Design Specification",
      abbr: "FDS",
      markdown: SAMPLE,
      company,
      client,
      project,
    });
    // docx is a zip: PK magic bytes.
    expect(buf.subarray(0, 2).toString()).toBe("PK");
    expect(buf.length).toBeGreaterThan(1000);
  });

  it("survives no company and no client", async () => {
    const buf = await renderDocx({
      title: "T",
      abbr: "T",
      markdown: "# Hi\n\n| a |\n|---|\n| b |",
      company: null,
      client: null,
      project,
    });
    expect(buf.subarray(0, 2).toString()).toBe("PK");
  });
});
