// GET /api/projects/[id]/document?slug=<template>&format=html|pdf|docx&doc=<id>
//
// One deliverable for a project, in whichever format the user asked for. The
// content comes from a saved document row when there is one (so edits stick),
// otherwise from the template filled with the project, client and company.

import { getTemplate } from "@/content/templates";
import { fillTemplate } from "@/content/templates";
import { getApiUser } from "@/lib/auth/server";
import { db } from "@/lib/db/client";
import { documents } from "@/lib/db/schema";
import { autoFillValues, renderDocument } from "@/lib/platform/document";
import { getClient, getCompany, getProject } from "@/lib/platform/queries";
import { renderDocx } from "@/lib/platform/render-docx";
import { renderPdf } from "@/lib/platform/render-pdf";
import { and, eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";

/** Strip anything that has no business in a Content-Disposition filename. */
function safeName(stem: string, ext: string): string {
  const clean = stem
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60);
  return `${clean || "document"}.${ext}`;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getApiUser();
  if ("error" in auth) return auth.error;
  const { id } = await params;

  const sp = req.nextUrl.searchParams;
  const slug = sp.get("slug") ?? "";
  const docId = sp.get("doc");
  const format = (sp.get("format") ?? "html").toLowerCase();

  const project = await getProject(auth.user.id, id);
  if (!project) return NextResponse.json({ error: "project not found" }, { status: 404 });

  const [company, client] = await Promise.all([
    getCompany(auth.user.id),
    project.clientId ? getClient(auth.user.id, project.clientId) : Promise.resolve(null),
  ]);

  // A saved document wins over the template, because it may have been edited.
  let saved: { title: string; content: string; templateSlug: string | null } | null = null;
  if (docId) {
    const [row] = await db()
      .select({
        title: documents.title,
        content: documents.content,
        templateSlug: documents.templateSlug,
      })
      .from(documents)
      .where(and(eq(documents.id, docId), eq(documents.userId, auth.user.id)))
      .limit(1);
    saved = row ?? null;
  }

  const template = getTemplate(saved?.templateSlug ?? slug);
  if (!template) return NextResponse.json({ error: "unknown template" }, { status: 404 });

  const file = template.files.find((f) => f.kind === "markdown");
  if (!file && !saved) {
    return NextResponse.json(
      { error: "this template has no document body; download its files from the library" },
      { status: 409 },
    );
  }

  const values = autoFillValues({
    project,
    client,
    company,
    author: auth.user.displayName ?? auth.user.email.split("@")[0] ?? "",
    templateAbbr: template.abbr,
  });

  // Saved content already has its values baked in from when it was created.
  const markdown = saved?.content?.trim() ? saved.content : fillTemplate(file?.body ?? "", values);
  const title = saved?.title ?? template.title;
  const stem = `${project.name}-${template.abbr}`;

  if (format === "pdf") {
    const buf = renderPdf({
      title,
      abbr: template.abbr,
      markdown,
      company,
      client,
      project,
    });
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${safeName(stem, "pdf")}"`,
        "Cache-Control": "no-store",
      },
    });
  }

  if (format === "docx") {
    const buf = await renderDocx({
      title,
      abbr: template.abbr,
      markdown,
      company,
      client,
      project,
    });
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${safeName(stem, "docx")}"`,
        "Cache-Control": "no-store",
      },
    });
  }

  if (format === "md") {
    return new NextResponse(markdown, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="${safeName(stem, "md")}"`,
        "Cache-Control": "no-store",
      },
    });
  }

  const html = renderDocument({
    template,
    fileBody: markdown,
    // Already substituted above, so nothing left to fill.
    values: saved?.content?.trim() ? {} : values,
    company,
    client,
    project,
  });
  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}
