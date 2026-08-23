/**
 * Document templates for automation projects.
 *
 * These are the deliverables a control system project actually produces, in the
 * order a project produces them: what the client wants (URS), how it will work
 * (FDS), what it is made of (I/O list, BOM), proof that it does work (FAT, SAT),
 * and what the site keeps afterwards (O&M, as-built).
 *
 * Every template here is a real working document, not an outline with headings
 * and nothing under them. They carry the tables, the acceptance criteria, the
 * sign-off blocks and the numbering that make a document usable on a live job,
 * because a template that still needs an hour of structure work before you can
 * type into it saves nobody anything.
 */

/** A token the download step substitutes before handing the file over. */
export type Placeholder =
  | "PROJECT_NAME"
  | "CLIENT"
  | "DOC_NO"
  | "REV"
  | "DATE"
  | "AUTHOR"
  | "COMPANY";

export interface TemplateFile {
  /** Filename, with extension. Used verbatim for the download. */
  name: string;
  kind: "markdown" | "csv";
  /** One line on what this particular file is, when a template has several. */
  note?: string;
  /** The document. May contain {{PLACEHOLDER}} tokens. */
  body: string;
}

export type TemplateCategory =
  | "Specification"
  | "Design"
  | "Registers"
  | "Testing"
  | "Safety"
  | "Handover";

export interface DocTemplate {
  slug: string;
  /** Full name, e.g. "Functional Design Specification". */
  title: string;
  /** The abbreviation people actually say out loud, e.g. "FDS". */
  abbr: string;
  category: TemplateCategory;
  /** One sentence, used on cards and in search results. */
  summary: string;
  /** Two or three sentences on what the document is for. */
  purpose: string;
  /** The honest answer to "do I need this one?". */
  whenYouNeedIt: string;
  /** Standards this document is written against, where any apply. */
  standards?: string[];
  /** Who writes it and who signs it. */
  writtenBy: string;
  approvedBy: string;
  /** Section headings, for the outline shown before download. */
  outline: string[];
  files: TemplateFile[];
  /** Other templates that travel with this one. */
  related?: string[];
}

export const PLACEHOLDER_LABELS: Record<Placeholder, string> = {
  PROJECT_NAME: "Project name",
  CLIENT: "Client",
  COMPANY: "Your company",
  DOC_NO: "Document number",
  REV: "Revision",
  DATE: "Date",
  AUTHOR: "Author",
};

/** Sensible stand-ins, so an un-filled download is still a readable document. */
export const PLACEHOLDER_DEFAULTS: Record<Placeholder, string> = {
  PROJECT_NAME: "[Project name]",
  CLIENT: "[Client]",
  COMPANY: "[Your company]",
  DOC_NO: "[Doc no.]",
  REV: "0",
  DATE: "[Date]",
  AUTHOR: "[Author]",
};

/**
 * Substitute the tokens.
 *
 * Unknown tokens are left alone rather than blanked: a document that silently
 * loses a field is worse than one that visibly still has a gap to fill.
 */
export function fillTemplate(body: string, values: Partial<Record<Placeholder, string>>): string {
  return body.replace(/\{\{([A-Z_]+)\}\}/g, (whole, token: string) => {
    const key = token as Placeholder;
    const supplied = values[key];
    if (supplied?.trim()) return supplied.trim();
    return PLACEHOLDER_DEFAULTS[key] ?? whole;
  });
}

/**
 * The standard front matter every controlled document carries.
 *
 * Pulled out because it must be identical across the set. A document control
 * block that differs subtly between the FDS and the FAT is the kind of thing
 * that gets picked up in an audit and costs a day to fix across a dozen files.
 */
export function docHeader(title: string, abbr: string): string {
  return `# ${title}
## {{PROJECT_NAME}}

| | |
|---|---|
| **Document title** | ${title} (${abbr}) |
| **Document number** | {{DOC_NO}} |
| **Revision** | {{REV}} |
| **Date** | {{DATE}} |
| **Project** | {{PROJECT_NAME}} |
| **Client** | {{CLIENT}} |
| **Prepared by** | {{AUTHOR}}, {{COMPANY}} |

### Revision history

| Rev | Date | Description | Author | Approved |
|---|---|---|---|---|
| 0 | {{DATE}} | First issue | {{AUTHOR}} | |
| | | | | |

### Approval

| Role | Name | Signature | Date |
|---|---|---|---|
| Author | {{AUTHOR}} | | |
| Reviewer (engineering) | | | |
| Approver ({{COMPANY}}) | | | |
| Approver ({{CLIENT}}) | | | |

---
`;
}
