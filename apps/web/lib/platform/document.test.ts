import type { Client, CompanyProfile, Project } from "@/lib/db/schema";
import { describe, expect, it } from "vitest";
import { autoFillValues, markdownToHtml, renderDocument } from "./document";

const project = {
  id: "p1",
  name: "Line 4 Filler",
  code: "LX-2601",
} as Project;

describe("markdownToHtml", () => {
  it("renders a table", () => {
    const html = markdownToHtml("| Tag | Type |\n|---|---|\n| Start | BOOL |");
    expect(html).toContain("<table>");
    expect(html).toContain("<th>Tag</th>");
    expect(html).toContain("<td>Start</td>");
  });

  it("renders headings at the right level", () => {
    expect(markdownToHtml("## Design")).toContain("<h2>Design</h2>");
    expect(markdownToHtml("#### Notes")).toContain("<h4>Notes</h4>");
  });

  it("renders bold and inline code", () => {
    const html = markdownToHtml("A **bold** word and `code`.");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<code>code</code>");
  });

  it("groups consecutive bullets into one list", () => {
    const html = markdownToHtml("- one\n- two\n- three");
    expect(html.match(/<ul>/g)?.length).toBe(1);
    expect(html.match(/<li>/g)?.length).toBe(3);
  });

  it("renders a blockquote and a rule", () => {
    expect(markdownToHtml("> note")).toContain("<blockquote>note</blockquote>");
    expect(markdownToHtml("---")).toContain("<hr />");
  });

  it("escapes HTML in the content, so a table cell cannot inject markup", () => {
    const html = markdownToHtml("| X |\n|---|\n| <script>alert(1)</script> |");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("autoFillValues", () => {
  it("maps project, client and company onto the placeholders", () => {
    const values = autoFillValues({
      project,
      client: { name: "Acme Foods" } as Client,
      company: { name: "Wartens" } as CompanyProfile,
      author: "J Chacko",
      templateAbbr: "FDS",
    });
    expect(values.PROJECT_NAME).toBe("Line 4 Filler");
    expect(values.CLIENT).toBe("Acme Foods");
    expect(values.COMPANY).toBe("Wartens");
    expect(values.AUTHOR).toBe("J Chacko");
    // Document number is built from the project code and the template.
    expect(values.DOC_NO).toBe("LX-2601-FDS-01");
  });

  it("leaves the document number blank when the project has no code", () => {
    const values = autoFillValues({
      project: { ...project, code: null } as Project,
      client: null,
      company: null,
      author: "x",
      templateAbbr: "URS",
    });
    expect(values.DOC_NO).toBe("");
  });
});

describe("renderDocument", () => {
  const template = {
    slug: "fds-functional-design-specification",
    title: "Functional Design Specification",
    abbr: "FDS",
  } as never;

  it("embeds the logo as a data URL when the company has one", () => {
    const html = renderDocument({
      template,
      fileBody: "# {{PROJECT_NAME}}\n\nBody.",
      values: { PROJECT_NAME: "Line 4 Filler" },
      company: {
        name: "Wartens",
        logo: "data:image/png;base64,ABC123",
      } as CompanyProfile,
      client: null,
      project,
    });
    expect(html).toContain('src="data:image/png;base64,ABC123"');
    expect(html).toContain("Line 4 Filler");
  });

  it("falls back to the company name when there is no logo", () => {
    const html = renderDocument({
      template,
      fileBody: "Body",
      values: {},
      company: { name: "Wartens", logo: null } as CompanyProfile,
      client: null,
      project,
    });
    expect(html).toContain("logo-fallback");
    expect(html).toContain("Wartens");
  });

  it("does not let a malicious company name break out into markup", () => {
    const html = renderDocument({
      template,
      fileBody: "Body",
      values: {},
      company: { name: "<img src=x onerror=alert(1)>", logo: null } as CompanyProfile,
      client: null,
      project,
    });
    expect(html).not.toContain("<img src=x onerror");
    expect(html).toContain("&lt;img");
  });

  it("includes the client block when a client is attached", () => {
    const html = renderDocument({
      template,
      fileBody: "Body",
      values: {},
      company: { name: "Wartens" } as CompanyProfile,
      client: { name: "Acme Foods", city: "Leeds" } as Client,
      project,
    });
    expect(html).toContain("Prepared for");
    expect(html).toContain("Acme Foods");
  });

  it("prints the project site under the client, which is where the project page says it goes", () => {
    // The Site field on the project summary is labelled "Printed under the
    // client on documents". It was not printed anywhere at all: renderDocument
    // never read project.site. On a client with three plants that made two
    // packages identical on the page.
    const html = renderDocument({
      template,
      fileBody: "Body",
      values: {},
      company: { name: "Wartens" } as CompanyProfile,
      client: { name: "Acme Foods" } as Client,
      project: { ...project, site: "Wakefield, packing hall" } as Project,
    });
    expect(html).toMatch(/Prepared for[\s\S]{0,400}Wakefield, packing hall/);
  });

  it("still shows the site when no client has been chosen yet", () => {
    // A project has a site long before anybody decides who is being invoiced,
    // and the whole block used to be gated on the client existing.
    const html = renderDocument({
      template,
      fileBody: "Body",
      values: {},
      company: { name: "Wartens" } as CompanyProfile,
      client: null,
      project: { ...project, site: "Wakefield, packing hall" } as Project,
    });
    expect(html).toContain("Wakefield, packing hall");
  });

  it("substitutes {{SITE}} in a template body", () => {
    const html = renderDocument({
      template,
      fileBody: "Installed at {{SITE}}.",
      values: { SITE: "Wakefield, packing hall" },
      company: null,
      client: null,
      project,
    });
    expect(html).toContain("Installed at Wakefield, packing hall.");
  });

  it("omits the block entirely when there is neither client nor site", () => {
    const html = renderDocument({
      template,
      fileBody: "Body",
      values: {},
      company: { name: "Wartens" } as CompanyProfile,
      client: null,
      project,
    });
    expect(html).not.toContain("Prepared for");
  });
});
