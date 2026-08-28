import { parseL5X } from "./import-l5x";
import type { ImportNote, ImportedProgram } from "./import-l5x";
import { parsePlcopenXml } from "./import-plcopen";
import { parseImport } from "./portable";

/**
 * Working out what somebody just handed us, and reading it if we can.
 *
 * Three formats are read: LADX's own JSON, a Rockwell L5X export, and PLCopen
 * TC6 XML. All three are documented and all three are produced by the person's
 * own licensed software, which is the whole basis on which LADX reads them. See
 * ADR 0003.
 *
 * The more interesting half is what happens with a file we deliberately do not
 * read. A proprietary project file is recognised by its extension purely so the
 * answer can be "here is the export to do instead", in the two clicks it takes,
 * rather than "unsupported file". Somebody holding an `.ACD` is not doing
 * anything wrong; they are holding the file their tool saved. Telling them
 * which menu item produces something readable is the difference between a tool
 * that failed and a tool that helped.
 */

export interface ReadResult {
  ok: true;
  name: string;
  imported: ImportedProgram;
  /** Which format it turned out to be, for the report. */
  format: "LADX JSON" | "Rockwell L5X" | "PLCopen XML";
}

export interface ReadFailure {
  ok: false;
  error: string;
  /** What to do instead, when there is a specific answer. */
  remedy?: string;
}

/**
 * Project files LADX will not open, and the export that replaces each one.
 *
 * Every entry here is a proprietary binary. Reading one means reverse
 * engineering an undocumented format, which ADR 0003 decided against: the
 * interoperability exception that would permit it belongs to a licensee of the
 * software being decompiled, and LADX is not one.
 */
const REFUSED: { ext: string[]; what: string; remedy: string }[] = [
  {
    ext: [".acd"],
    what: "a Studio 5000 project",
    remedy:
      "In Studio 5000, right click the program or the controller in the tree and choose Export. That writes a .L5X, which LADX reads.",
  },
  {
    ext: [
      ".ap13",
      ".ap14",
      ".ap15",
      ".ap16",
      ".ap17",
      ".ap18",
      ".ap19",
      ".ap20",
      ".zap13",
      ".zap14",
      ".zap15",
      ".zap16",
      ".zap17",
      ".zap18",
      ".zap19",
      ".zap20",
      ".s7p",
    ],
    what: "a TIA Portal or STEP 7 project",
    remedy:
      "In TIA Portal, right click the block and choose Generate source from blocks, which writes .scl or .awl. If your site has TIA Portal Openness set up, exporting the block as SimaticML XML also works.",
  },
  {
    ext: [".gx3", ".gxw", ".gx2"],
    what: "a GX Works project",
    remedy:
      "Mitsubishi does not publish a program level export that another tool can read, so there is no route in for this one yet. Tag lists can be exported as CSV.",
  },
  {
    ext: [".stu", ".xef", ".zef", ".sta"],
    what: "a Schneider project",
    remedy:
      "In Control Expert or Machine Expert, export the POU as PLCopen XML, which LADX reads. A .XEF is a Schneider file rather than an interchange one.",
  },
  {
    ext: [".smc2", ".cxp", ".opt"],
    what: "an Omron project",
    remedy:
      "Omron does not publish a program level export another tool can read, so there is no route in for this one yet.",
  },
  {
    ext: [".project", ".pro"],
    what: "a CODESYS project",
    remedy:
      "In CODESYS, right click the POU and choose Export PLCopenXML. That is the file LADX reads.",
  },
  {
    ext: [".tsproj", ".tpy"],
    what: "a TwinCAT project",
    remedy:
      "In TwinCAT, right click the POU and choose Export PLCopenXML. That is the file LADX reads.",
  },
];

function extensionOf(filename: string): string {
  const i = filename.lastIndexOf(".");
  return i < 0 ? "" : filename.slice(i).toLowerCase();
}

/** The refusal for a project file we deliberately do not open, if this is one. */
export function refusalFor(filename: string): ReadFailure | null {
  const ext = extensionOf(filename);
  if (!ext) return null;
  const hit = REFUSED.find((r) => r.ext.includes(ext));
  if (!hit) return null;
  return {
    ok: false,
    error: `${filename} is ${hit.what}, which is a proprietary project file rather than an export. LADX does not open those.`,
    remedy: hit.remedy,
  };
}

export function readProgramFile(filename: string, text: string): ReadResult | ReadFailure {
  const refused = refusalFor(filename);
  if (refused) return refused;

  const ext = extensionOf(filename);
  const head = text.slice(0, 4000);
  const base = filename.replace(/\.[^.]+$/, "");

  /*
   * Sniffed from the content, with the extension only as a tie break.
   *
   * People rename files, and a file saved as .txt from an email is still an
   * L5X. Trusting the extension first would refuse it for no reason.
   */
  const looksL5X = /<RSLogix5000Content/i.test(head);
  const looksPlcopen =
    /plcopen\.org\/xml\/tc6/i.test(head) || /<project[\s>][\s\S]{0,400}<pou/i.test(head);

  if (looksL5X || ext === ".l5x") {
    const out = parseL5X(text);
    if ("error" in out) return { ok: false, error: out.error };
    return { ok: true, name: out.program.name || base, imported: out, format: "Rockwell L5X" };
  }

  if (looksPlcopen || ext === ".xml") {
    const out = parsePlcopenXml(text);
    if ("error" in out) return { ok: false, error: out.error };
    return { ok: true, name: out.program.name || base, imported: out, format: "PLCopen XML" };
  }

  if (ext === ".l5k") {
    return {
      ok: false,
      error: "L5K is the older ASCII export and LADX does not read it yet.",
      remedy:
        "In Studio 5000, export as .L5X instead. Same menu, and it is the XML form of the same information.",
    };
  }

  // LADX's own file, and the fallback: its error message is the most specific
  // one available for something that is simply not a program.
  const parsed = parseImport(text);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const notes: ImportNote[] = [];
  return {
    ok: true,
    name: parsed.name || base,
    imported: { program: parsed.program, notes },
    format: "LADX JSON",
  };
}

/** What the file picker should offer, so the dialog does not hide readable files. */
export const READABLE_ACCEPT = ".json,.l5x,.xml,application/json,text/xml,application/xml";
