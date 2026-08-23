import { type Placeholder, fillTemplate, getTemplate } from "@/content/templates";
import { type NextRequest, NextResponse } from "next/server";

/**
 * GET /api/templates/download?slug=...&file=...&PROJECT_NAME=...
 *
 * Returns one template file, with the placeholder tokens substituted from the
 * query string. A GET rather than a POST so the result is a plain link: it can
 * be bookmarked, shared with a colleague, and fetched by a script that wants
 * the same document pack for every job.
 *
 * Public, deliberately. The templates are useful without an account, and
 * putting them behind a sign-up would be a worse product for no benefit.
 */

const FIELDS: Placeholder[] = [
  "PROJECT_NAME",
  "CLIENT",
  "COMPANY",
  "DOC_NO",
  "REV",
  "DATE",
  "AUTHOR",
];

/** Guard against a hostile value being reflected into the file we hand back. */
const MAX_FIELD = 120;

/**
 * Build a filename that is safe in a Content-Disposition header.
 *
 * A quote or a newline in this header is a response splitting vector, and the
 * project name reaches it from the query string, so it is stripped rather than
 * escaped: filenames have no legitimate need for either character.
 */
function safeFilename(projectName: string, fileName: string): string {
  const prefix = projectName
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 40);
  return prefix ? `${prefix}-${fileName}` : fileName;
}

export function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const slug = params.get("slug") ?? "";
  const fileName = params.get("file") ?? "";

  const template = getTemplate(slug);
  if (!template) {
    return NextResponse.json({ error: "unknown template" }, { status: 404 });
  }

  const file = template.files.find((f) => f.name === fileName) ?? template.files[0];
  if (!file) {
    return NextResponse.json({ error: "unknown file" }, { status: 404 });
  }

  const values: Partial<Record<Placeholder, string>> = {};
  for (const field of FIELDS) {
    const raw = params.get(field);
    if (raw) values[field] = raw.slice(0, MAX_FIELD);
  }

  const body = fillTemplate(file.body, values);
  const download = safeFilename(values.PROJECT_NAME ?? "", file.name);

  return new NextResponse(body, {
    headers: {
      "Content-Type":
        file.kind === "csv" ? "text/csv; charset=utf-8" : "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${download}"`,
      // The templates change only when this code changes, so they cache well,
      // but the filled values vary per request and must not be shared.
      "Cache-Control": "no-store",
    },
  });
}
