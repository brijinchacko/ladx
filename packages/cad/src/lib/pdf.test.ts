import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * How the PDF leaves this module.
 *
 * jsPDF can emit a document several ways, and one of them,
 * `output("pdfobjectnewwindow")`, loads PDFObject from a CDN to preview it in
 * a browser tab. On the desktop that would be an outbound call from an app
 * whose entire reason to exist is not making any, and it would appear only
 * when somebody exported a drawing.
 *
 * The desktop's build check allows cdnjs to appear as a string, because it is
 * in the library either way, on the strength of that mode never being reached.
 * This is what makes that true rather than hopeful.
 */
describe("the PDF writer's output mode", () => {
  const src = readFileSync(fileURLToPath(new URL("./pdf.ts", import.meta.url)), "utf8");

  it("returns a blob", () => {
    expect(src).toContain('output("blob")');
  });

  it("never asks jsPDF for a mode that fetches from a CDN", () => {
    expect(src).not.toContain("pdfobjectnewwindow");
    expect(src).not.toContain("pdfobjectdraft");
  });

  it("asks for no other output mode either", () => {
    // Any second mode is a decision somebody should make deliberately, and
    // two of them here would make the claim above harder to check than to
    // read.
    const modes = [...src.matchAll(/\.output\(\s*"([a-z]+)"/g)].map((m) => m[1]);
    expect(modes).toEqual(["blob"]);
  });
});
