/**
 * Documents on the desktop are files in the project folder.
 *
 * Not rows in a database, which is what the web does and what CAD and the
 * ladder programs do here. The difference is deliberate and it is the thing
 * the project folder exists for: a document is the deliverable, it goes in the
 * pack that leaves with the machine, and it has to be openable by somebody who
 * has never installed this application. A markdown file in `01 Specification`
 * is; a row in SQLite is not.
 *
 * The workspace commands already know where each kind belongs, so nothing here
 * decides folder names.
 */

import { listProjectFiles, readFromProject, saveIntoProject } from "@/lib/invoke";
import type { TemplateCategory } from "@ladx/documents";

/**
 * Which project folder a document of this kind belongs in.
 *
 * The category is what the template library already sorts by, and it maps onto
 * the lifecycle folders almost exactly, because both describe the same thing:
 * the order a control project produces its paperwork.
 */
export function folderKindFor(category: TemplateCategory): string {
  switch (category) {
    case "Testing":
      return "test";
    case "Handover":
      return "handover";
    // Specification, Design, Registers and Safety are all what the job is
    // supposed to do and what it is made of, which is one folder on site and
    // one folder here.
    default:
      return "spec";
  }
}

/** A `.md` file already in the project. */
export interface ProjectDocument {
  /** The folder it is filed in, e.g. "01 Specification". */
  folder: string;
  filename: string;
  /** What the tools call this kind when filing it. */
  kind: string;
  bytes: number;
}

const KIND_BY_FOLDER: Record<string, string> = {
  "01 Specification": "spec",
  "05 Testing": "test",
  "06 Commissioning": "commissioning",
  "07 Handover": "handover",
};

/**
 * Every document in the project.
 *
 * Markdown only. A project folder holds datasheets somebody dragged in and
 * drawings the CAD tool wrote, and offering to open a PDF in a markdown editor
 * would be a worse answer than not listing it.
 */
export async function listDocuments(project: string): Promise<ProjectDocument[]> {
  const files = await listProjectFiles(project);
  return files
    .filter((f) => f.name.toLowerCase().endsWith(".md"))
    .map((f) => ({
      folder: f.folder,
      filename: f.name,
      kind: KIND_BY_FOLDER[f.folder] ?? "document",
      bytes: f.bytes,
    }))
    .sort((a, b) => a.folder.localeCompare(b.folder) || a.filename.localeCompare(b.filename));
}

export async function readDocument(project: string, doc: ProjectDocument): Promise<string | null> {
  return readFromProject({ project, kind: doc.kind, filename: doc.filename });
}

/**
 * Returns the path it was written to, which is what the screen shows.
 *
 * `base64` for the formats that are not text. Writing a PDF as a string would
 * put a PDF-shaped text file in the handover pack.
 */
export async function writeDocument(
  project: string,
  kind: string,
  filename: string,
  contents: string,
  base64 = false,
): Promise<string> {
  return saveIntoProject({ project, kind, filename, contents, base64 });
}

/**
 * A filename a person will recognise in a folder listing.
 *
 * The document number first, because that is what a drawing register and an
 * email subject line both use, and because it sorts a folder into issue order.
 */
export function documentFileName(docNo: string, title: string, ext: string): string {
  const stem = [docNo, title].filter(Boolean).join(" ").trim() || "Document";
  return `${stem
    .replace(/[<>:"/\\|?*]+/g, "-")
    .replace(/\s+/g, " ")
    .trim()}.${ext}`;
}
