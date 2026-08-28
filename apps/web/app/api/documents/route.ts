// GET  /api/documents?projectId=…|clientId=…   list
// POST /api/documents                          create, generated or uploaded

import { getApiUser } from "@/lib/auth/server";
import { db } from "@/lib/db/client";
import { documents } from "@/lib/db/schema";
import { getClient, getCompany, getProject } from "@/lib/platform/queries";
import { fillTemplate, getTemplate } from "@ladx/documents";
import { autoFillValues, withDesignBasis } from "@ladx/documents";
import { and, desc, eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

/** ~6 MB of base64 is ~4.5 MB of file. Enough for a datasheet or a signed scan. */
const MAX_FILE = 6_000_000;

const createSchema = z.object({
  title: z.string().trim().min(1).max(200),
  projectId: z.string().uuid().nullish(),
  clientId: z.string().uuid().nullish(),
  kind: z.enum(["generated", "uploaded"]).default("generated"),
  /** generated: the template to seed the body from. */
  templateSlug: z.string().max(120).nullish(),
  content: z.string().max(400_000).optional(),
  /** uploaded: the file itself. */
  fileName: z.string().max(255).nullish(),
  mimeType: z.string().max(160).nullish(),
  fileData: z.string().max(MAX_FILE).nullish(),
});

export async function GET(req: NextRequest) {
  const auth = await getApiUser();
  if ("error" in auth) return auth.error;

  const projectId = req.nextUrl.searchParams.get("projectId");
  const clientId = req.nextUrl.searchParams.get("clientId");

  const where = projectId
    ? and(eq(documents.userId, auth.user.id), eq(documents.projectId, projectId))
    : clientId
      ? and(eq(documents.userId, auth.user.id), eq(documents.clientId, clientId))
      : eq(documents.userId, auth.user.id);

  // fileData is deliberately not selected: a listing must not carry megabytes
  // of base64 for every row.
  const rows = await db()
    .select({
      id: documents.id,
      title: documents.title,
      kind: documents.kind,
      templateSlug: documents.templateSlug,
      fileName: documents.fileName,
      mimeType: documents.mimeType,
      byteSize: documents.byteSize,
      projectId: documents.projectId,
      clientId: documents.clientId,
      updatedAt: documents.updatedAt,
    })
    .from(documents)
    .where(where)
    .orderBy(desc(documents.updatedAt));

  return NextResponse.json({ documents: rows });
}

export async function POST(req: Request) {
  const auth = await getApiUser();
  if ("error" in auth) return auth.error;

  const parsed = createSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid request", detail: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }
  const input = parsed.data;

  // Ownership: a project or client id from the client is only trusted after we
  // have confirmed the caller owns it.
  const project = input.projectId ? await getProject(auth.user.id, input.projectId) : null;
  if (input.projectId && !project) {
    return NextResponse.json({ error: "project not found" }, { status: 404 });
  }
  const client = input.clientId ? await getClient(auth.user.id, input.clientId) : null;
  if (input.clientId && !client) {
    return NextResponse.json({ error: "client not found" }, { status: 404 });
  }

  let content = input.content ?? "";

  // A generated document is seeded from its template with the project's values
  // already substituted, so the first edit starts from something finished
  // rather than from a page of {{PLACEHOLDER}}.
  if (input.kind === "generated" && input.templateSlug && !content) {
    const template = getTemplate(input.templateSlug);
    const body = template?.files.find((f) => f.kind === "markdown")?.body;
    if (template && body && project) {
      const company = await getCompany(auth.user.id);
      content = fillTemplate(
        // The design basis goes in before substitution, so any tokens inside it
        // are filled the same way as the rest of the document.
        withDesignBasis(body, template.slug, project.brief),
        autoFillValues({
          project,
          client:
            client ?? (project.clientId ? await getClient(auth.user.id, project.clientId) : null),
          company,
          author: auth.user.displayName ?? auth.user.email.split("@")[0] ?? "",
          templateAbbr: template.abbr,
        }),
      );
    } else if (body) {
      content = body;
    }
  }

  const [row] = await db()
    .insert(documents)
    .values({
      userId: auth.user.id,
      projectId: input.projectId ?? null,
      clientId: input.clientId ?? project?.clientId ?? null,
      kind: input.kind,
      templateSlug: input.templateSlug ?? null,
      title: input.title,
      content,
      fileName: input.fileName ?? null,
      mimeType: input.mimeType ?? null,
      fileData: input.fileData ?? null,
      byteSize: input.fileData?.length ?? content.length,
    })
    .returning({ id: documents.id });

  if (!row) return NextResponse.json({ error: "could not save" }, { status: 500 });
  return NextResponse.json({ id: row.id }, { status: 201 });
}
