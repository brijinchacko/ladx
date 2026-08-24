// GET /api/projects/[id]/document?slug=<template>&file=<name>
//
// Generates one deliverable for a project as a finished, branded HTML document:
// the company logo and details as the letterhead, the client in the front
// matter, and the template body filled from the project. Print to PDF or open
// in Word. Everything is embedded, so the file is self-contained.

import { getTemplate } from "@/content/templates";
import { getApiUser } from "@/lib/auth/server";
import { autoFillValues, renderDocument } from "@/lib/platform/document";
import { getClient, getCompany, getProject } from "@/lib/platform/queries";
import { type NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getApiUser();
  if ("error" in auth) return auth.error;
  const { id } = await params;

  const slug = req.nextUrl.searchParams.get("slug") ?? "";
  const fileName = req.nextUrl.searchParams.get("file") ?? "";

  const template = getTemplate(slug);
  if (!template) return NextResponse.json({ error: "unknown template" }, { status: 404 });

  // Only the markdown files are rendered to a document; the CSV registers are
  // downloaded as-is from the template library and are not branded letterhead.
  const file =
    template.files.find((f) => f.name === fileName && f.kind === "markdown") ??
    template.files.find((f) => f.kind === "markdown");
  if (!file) {
    return NextResponse.json(
      { error: "this template has no document to render; download its files from /documents" },
      { status: 409 },
    );
  }

  const project = await getProject(auth.user.id, id);
  if (!project) return NextResponse.json({ error: "project not found" }, { status: 404 });

  const [company, client] = await Promise.all([
    getCompany(auth.user.id),
    project.clientId ? getClient(auth.user.id, project.clientId) : Promise.resolve(null),
  ]);

  const values = autoFillValues({
    project,
    client,
    company,
    author: auth.user.displayName ?? auth.user.email.split("@")[0] ?? "",
    templateAbbr: template.abbr,
  });

  const html = renderDocument({
    template,
    fileBody: file.body,
    values,
    company,
    client,
    project,
  });

  // Inline so it opens in a browser tab ready to print, rather than downloading
  // a file the user then has to find and open.
  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}
