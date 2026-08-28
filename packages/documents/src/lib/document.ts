import { type DocTemplate, type Placeholder, fillTemplate } from "../templates";
import { type ProjectBrief, designBasisSection } from "./brief";

/**
 * Who the document is for and who it is from.
 *
 * Deliberately narrow, and not the database's row types. The renderer used
 * seven fields between the three of them, and taking whole Drizzle rows meant
 * this file could only run where Postgres was: the desktop's project, client
 * and company come from a project folder on disk.
 *
 * Every field is optional except a name, because a document has to render
 * before somebody has finished filling in their company details. A letterhead
 * with a missing VAT number is a letterhead; a renderer that throws is not.
 */
export interface DocProject {
  name: string;
  code?: string | null;
  site?: string | null;
}

/** A postal address, as it appears on a letterhead or in front matter. */
export interface DocAddress {
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  region?: string | null;
  postcode?: string | null;
  country?: string | null;
}

/** The client the document is for. */
export interface DocParty extends DocAddress {
  name: string;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
}

/** The company issuing it, whose details become the letterhead. */
export interface DocCompany extends DocAddress {
  name: string;
  logo?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  registrationNumber?: string | null;
  vatNumber?: string | null;
}

/**
 * Turning a template into a finished, branded document.
 *
 * This is where the platform earns the data it collected. A template is markdown
 * with {{PLACEHOLDER}} tokens; a project has a client and a company behind it;
 * so the document generates itself. The company logo and details become the
 * letterhead, the client and project fill the front matter, and the engineer
 * never types any of it into a document by hand.
 *
 * The output is a standalone HTML file. HTML rather than PDF because it prints
 * to PDF from any browser, opens in Word, needs no toolchain, and, crucially,
 * can carry the logo inline as a data URL. Everything is embedded, so the file
 * is portable with nothing to fetch.
 */

/* ─────────────────────────── auto-fill ─────────────────────────── */

/**
 * Build the placeholder values from the project, client and company.
 *
 * This is the mapping that makes the whole platform worth logging into: enter
 * your company once, your client once, and every document is filled from them.
 */
export function autoFillValues(input: {
  project: DocProject;
  client: DocParty | null;
  company: DocCompany | null;
  author: string;
  templateAbbr: string;
}): Partial<Record<Placeholder, string>> {
  const { project, client, company, author, templateAbbr } = input;

  // Document number: project code as the stem, template abbreviation, then a
  // serial the engineer can bump. LX-2601-FDS-01 rather than a bare title.
  const docNo = project.code ? `${project.code}-${templateAbbr}-01` : "";

  return {
    PROJECT_NAME: project.name,
    SITE: project.site ?? "",
    CLIENT: client?.name ?? "",
    COMPANY: company?.name ?? "",
    AUTHOR: author,
    DOC_NO: docNo,
    REV: "0",
    DATE: isoDate(),
  };
}

/**
 * Put the design basis into a generated document.
 *
 * Inserted immediately after the document control front matter, where a real
 * controlled document carries it. Only the fields this particular document is
 * written from, and only the ones that have been answered, so a project with an
 * empty brief still produces exactly the document it produced before.
 *
 * Markdown only. The CSV files in a template are registers, and a prose block
 * at the top of one would break every tool that opens it.
 */
export function withDesignBasis(
  body: string,
  slug: string,
  brief: ProjectBrief | null | undefined,
): string {
  const section = designBasisSection(slug, brief);
  if (!section) return body;

  // The front matter produced by docHeader ends at its first horizontal rule.
  const end = body.indexOf("\n---\n");
  if (end === -1) return `${section}${body}`;
  const at = end + "\n---\n".length;
  return `${body.slice(0, at)}\n${section}${body.slice(at)}`;
}

function isoDate(): string {
  // Server-rendered, so a fixed format rather than a locale-dependent one.
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/* ─────────────────────── markdown to safe HTML ─────────────────────── */

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Inline formatting: bold and code, everything else escaped.
 *
 * The text has already had user values substituted into it, so it is escaped
 * first and the markup is applied to the escaped string. A company named
 * `<script>` becomes inert text, and the bold markers still work.
 */
function inline(text: string): string {
  let out = esc(text);
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/`([^`]+)`/g, "<code>$1</code>");
  return out;
}

function splitRow(line: string): string[] {
  // Trim the leading and trailing pipe, then split. Escaped pipes are not used
  // in these templates, so a plain split is safe.
  return line
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((c) => c.trim());
}

const SEP_ROW = /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?$/;

/**
 * Render the template markdown to an HTML body.
 *
 * Deliberately small: it handles exactly the constructs the templates use,
 * because a general markdown library is a dependency and an attack surface for
 * output that is mostly tables and headings. Anything it does not recognise
 * falls through as an escaped paragraph, so nothing is ever dropped.
 */
export function markdownToHtml(md: string): string {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const html: string[] = [];
  let i = 0;
  let inList = false;

  const closeList = () => {
    if (inList) {
      html.push("</ul>");
      inList = false;
    }
  };

  while (i < lines.length) {
    const line = lines[i] ?? "";
    const trimmed = line.trim();

    // Table: a header row, then a separator row, then body rows.
    if (trimmed.startsWith("|") && i + 1 < lines.length && SEP_ROW.test(lines[i + 1] ?? "")) {
      closeList();
      const header = splitRow(trimmed);
      i += 2; // skip header and separator
      const body: string[][] = [];
      while (i < lines.length && (lines[i] ?? "").trim().startsWith("|")) {
        body.push(splitRow((lines[i] as string).trim()));
        i++;
      }
      html.push('<div class="table-wrap"><table>');
      // An all-empty header is the document control block's key/value table; a
      // shaded empty strip above it reads as a rendering fault.
      if (header.some((h) => h.trim().length > 0)) {
        html.push(`<thead><tr>${header.map((h) => `<th>${inline(h)}</th>`).join("")}</tr></thead>`);
      }
      html.push("<tbody>");
      for (const row of body) {
        html.push(`<tr>${header.map((_, c) => `<td>${inline(row[c] ?? "")}</td>`).join("")}</tr>`);
      }
      html.push("</tbody></table></div>");
      continue;
    }

    if (trimmed === "") {
      closeList();
      i++;
      continue;
    }

    if (trimmed === "---") {
      closeList();
      html.push("<hr />");
      i++;
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (heading) {
      closeList();
      const level = Math.min(heading[1]?.length ?? 1, 6);
      html.push(`<h${level}>${inline(heading[2] ?? "")}</h${level}>`);
      i++;
      continue;
    }

    if (trimmed.startsWith("> ")) {
      closeList();
      html.push(`<blockquote>${inline(trimmed.slice(2))}</blockquote>`);
      i++;
      continue;
    }

    const bullet = /^[-*]\s+(.*)$/.exec(trimmed);
    if (bullet) {
      if (!inList) {
        html.push("<ul>");
        inList = true;
      }
      html.push(`<li>${inline(bullet[1] ?? "")}</li>`);
      i++;
      continue;
    }

    const numbered = /^\d+\.\s+(.*)$/.exec(trimmed);
    if (numbered) {
      closeList();
      html.push(`<p class="numbered">${inline(numbered[1] ?? "")}</p>`);
      i++;
      continue;
    }

    closeList();
    html.push(`<p>${inline(trimmed)}</p>`);
    i++;
  }
  closeList();
  return html.join("\n");
}

/* ─────────────────────────── letterhead ─────────────────────────── */

function companyAddressLines(c: DocAddress | null): string[] {
  if (!c) return [];
  return [
    c.addressLine1,
    c.addressLine2,
    [c.city, c.region].filter(Boolean).join(", "),
    [c.postcode, c.country].filter(Boolean).join(" "),
  ].filter((l): l is string => Boolean(l?.trim()));
}

function clientAddressLines(c: DocAddress | null): string[] {
  if (!c) return [];
  return [
    c.addressLine1,
    c.addressLine2,
    [c.city, c.region].filter(Boolean).join(", "),
    [c.postcode, c.country].filter(Boolean).join(" "),
  ].filter((l): l is string => Boolean(l?.trim()));
}

/**
 * The full document as a standalone HTML page.
 *
 * The letterhead carries the logo and the company block; a "prepared for" block
 * carries the client; then the template body. Print styles turn it into a clean
 * A4 PDF, and the logo, being a data URL, is embedded rather than linked so the
 * file works with nothing to fetch.
 */
export function renderDocument(input: {
  /**
   * The template behind the document, when there is one.
   *
   * Null for a document that was not generated from a template: a test record
   * from the Monitor, or anything written from scratch. Those still carry the
   * letterhead and the project block, because the letterhead belongs to the
   * project and the company, not to the template.
   */
  template: DocTemplate | null;
  /** Used when there is no template to take them from. */
  docTitle?: string;
  docAbbr?: string;
  /** The template file to render (a template can have several). */
  fileBody: string;
  values: Partial<Record<Placeholder, string>>;
  company: DocCompany | null;
  client: DocParty | null;
  project: DocProject;
}): string {
  const { template, fileBody, values, company, client, project } = input;
  const docTitle = template?.title ?? input.docTitle ?? "Document";
  const docAbbr = template?.abbr ?? input.docAbbr ?? "DOC";

  const filled = fillTemplate(fileBody, values);
  const body = markdownToHtml(filled);

  const companyName = company?.name ?? values.COMPANY ?? "";
  const companyLines = companyAddressLines(company);
  const companyContact = [company?.phone, company?.email, company?.website]
    .filter(Boolean)
    .join("  ·  ");
  const companyReg = [
    company?.registrationNumber ? `Reg. ${company.registrationNumber}` : "",
    company?.vatNumber ? `VAT ${company.vatNumber}` : "",
  ]
    .filter(Boolean)
    .join("  ·  ");

  const clientLines = clientAddressLines(client);
  const clientContact = [client?.contactName, client?.contactEmail, client?.contactPhone]
    .filter(Boolean)
    .join("  ·  ");

  const logo = company?.logo
    ? `<img class="logo" src="${esc(company.logo)}" alt="${esc(companyName)}" />`
    : `<div class="logo-fallback">${esc(companyName || "LADX")}</div>`;

  const title = `${docTitle} (${docAbbr}) — ${project.name}`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)}</title>
<style>
  :root {
    --ink: #0F1A24; --ink-soft: #4A5A68; --ink-faint: #7A8894;
    --line: #D5DCE2; --line-soft: #E8EDF1; --teal: #2C9A9E; --bg: #FFFFFF;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; color: var(--ink); background: #F4F7F9;
    font-family: "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    font-size: 13px; line-height: 1.55;
  }
  .sheet {
    max-width: 820px; margin: 24px auto; background: var(--bg);
    padding: 40px 48px 64px; box-shadow: 0 1px 4px rgba(15,26,36,0.08);
  }
  .toolbar {
    max-width: 820px; margin: 0 auto; padding: 0 8px; display: flex; gap: 10px;
    align-items: center; justify-content: flex-end;
  }
  .toolbar button {
    font: inherit; font-size: 12px; padding: 7px 14px; border: 1px solid var(--ink);
    background: var(--ink); color: #fff; border-radius: 3px; cursor: pointer;
  }
  .toolbar .muted { margin-right: auto; color: var(--ink-faint); font-size: 12px; }

  header.letter {
    display: flex; justify-content: space-between; align-items: flex-start;
    gap: 24px; border-bottom: 2px solid var(--ink); padding-bottom: 18px;
  }
  .logo { max-height: 64px; max-width: 240px; object-fit: contain; display: block; }
  .logo-fallback { font-size: 22px; font-weight: 800; letter-spacing: 0.06em; }
  .company { text-align: right; font-size: 11.5px; color: var(--ink-soft); }
  .company .name { font-size: 14px; font-weight: 700; color: var(--ink); }
  .company div { margin-top: 1px; }

  .meta { display: flex; gap: 40px; margin: 22px 0 8px; flex-wrap: wrap; }
  .meta section { min-width: 200px; }
  .meta h4 {
    margin: 0 0 5px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em;
    color: var(--ink-faint); font-weight: 700;
  }
  .meta .v { font-size: 12.5px; }
  .meta .v strong { display: block; font-size: 14px; }

  main { margin-top: 8px; }
  h1 { font-size: 22px; margin: 20px 0 2px; letter-spacing: -0.01em; }
  h2 { font-size: 16px; margin: 26px 0 6px; padding-bottom: 4px; border-bottom: 1px solid var(--line); }
  h3 { font-size: 13.5px; margin: 18px 0 4px; }
  h4 { font-size: 12px; margin: 14px 0 4px; color: var(--ink-soft); }
  p { margin: 6px 0; }
  p.numbered { margin: 4px 0; }
  ul { margin: 6px 0 6px 18px; padding: 0; }
  li { margin: 2px 0; }
  hr { border: 0; border-top: 1px solid var(--line); margin: 18px 0; }
  blockquote {
    margin: 10px 0; padding: 8px 14px; border-left: 3px solid var(--teal);
    background: #F0FAFA; color: var(--ink-soft); font-size: 12.5px;
  }
  code { font-family: "SFMono-Regular", Consolas, monospace; font-size: 0.9em;
         background: #F4F7F9; padding: 1px 4px; border-radius: 2px; }
  .table-wrap { overflow-x: auto; margin: 10px 0; }
  table { border-collapse: collapse; width: 100%; font-size: 11.5px; }
  th, td { border: 1px solid var(--line); padding: 5px 8px; text-align: left; vertical-align: top; }
  th { background: #F4F7F9; font-weight: 700; }

  footer.docfoot {
    margin-top: 40px; padding-top: 12px; border-top: 1px solid var(--line);
    display: flex; justify-content: space-between; font-size: 10.5px; color: var(--ink-faint);
  }

  @media print {
    body { background: #fff; }
    .toolbar { display: none; }
    .sheet { box-shadow: none; margin: 0; max-width: none; padding: 0; }
    h2 { break-after: avoid; }
    tr, blockquote { break-inside: avoid; }
    @page { margin: 18mm 16mm; }
  }
</style>
</head>
<body>
  <div class="toolbar">
    <span class="muted">Generated by LADX Studio. Print to PDF, or open in Word.</span>
    <button onclick="window.print()">Print / Save as PDF</button>
  </div>

  <div class="sheet">
    <header class="letter">
      <div>${logo}</div>
      <div class="company">
        <div class="name">${esc(companyName)}</div>
        ${companyLines.map((l) => `<div>${esc(l)}</div>`).join("")}
        ${companyContact ? `<div>${esc(companyContact)}</div>` : ""}
        ${companyReg ? `<div>${esc(companyReg)}</div>` : ""}
      </div>
    </header>

    <div class="meta">
      <section>
        <h4>Document</h4>
        <div class="v"><strong>${esc(docTitle)}</strong>${esc(docAbbr)}</div>
      </section>
      <section>
        <h4>Project</h4>
        <div class="v"><strong>${esc(project.name)}</strong>${esc(project.code ?? "")}</div>
      </section>
      ${
        // The site belongs here rather than under Project: a document is
        // prepared for a client at a place, and on a multi-site client that
        // place is the only thing distinguishing two otherwise identical
        // packages. Rendered without a client too, because a project can have
        // a site before anybody has decided who is being invoiced.
        client || project.site
          ? `<section>
        <h4>Prepared for</h4>
        <div class="v">${client ? `<strong>${esc(client.name)}</strong>` : ""}${clientLines
          .map((l) => esc(l))
          .join(
            "<br />",
          )}${project.site ? `<br />${esc(project.site)}` : ""}${clientContact ? `<br />${esc(clientContact)}` : ""}</div>
      </section>`
          : ""
      }
    </div>

    <main>${body}</main>

    <footer class="docfoot">
      <span>${esc(companyName)}</span>
      <span>${esc(docAbbr)} · ${esc(project.name)}${project.code ? ` · ${esc(project.code)}` : ""}</span>
    </footer>
  </div>
</body>
</html>`;
}
