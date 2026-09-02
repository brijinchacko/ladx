// GET /share/d/[token]              the document, read only, for anyone with the link
// GET /share/d/[token]?format=pdf   the same as a PDF
//
// Public on purpose, which is what "share" means. The token is the credential.
// A route handler rather than a page, so the reader gets exactly the document
// the export produces, letterhead and all, rather than a rendering of it inside
// the website's chrome. Nothing here links back into the account.

import { db } from "@/lib/db/client";
import { documents } from "@/lib/db/schema";
import { getClient, getCompany, getProject } from "@/lib/platform/queries";
import { getTemplate, renderDocument } from "@ladx/documents";
import { renderPdf } from "@ladx/documents/lib/render-pdf";
import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function gone(message: string, status: number) {
  return new NextResponse(
    `<!doctype html><meta charset="utf-8"><title>LADX</title><body style="font-family:system-ui;padding:48px;color:#3d4c58"><p>${message}</p></body>`,
    {
      status,
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
    },
  );
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!token || token.length > 64) return gone("This link is not valid.", 404);

  const [doc] = await db().select().from(documents).where(eq(documents.shareToken, token)).limit(1);
  if (!doc) return gone("This link is not valid, or it has been revoked.", 404);
  if (doc.shareExpiresAt && doc.shareExpiresAt < new Date()) {
    return gone("This link has expired. Ask whoever sent it for a new one.", 410);
  }
  if (!doc.projectId) return gone("This document is not attached to a project.", 404);

  const project = await getProject(doc.userId, doc.projectId);
  if (!project) return gone("This link is not valid.", 404);
  const [company, client] = await Promise.all([
    getCompany(doc.userId),
    project.clientId ? getClient(doc.userId, project.clientId) : Promise.resolve(null),
  ]);

  const template = doc.templateSlug ? (getTemplate(doc.templateSlug) ?? null) : null;
  const abbr = template?.abbr ?? "DOC";
  const format = (req.nextUrl.searchParams.get("format") ?? "html").toLowerCase();
  const stem = `${project.name}-${abbr}`.replace(/[^\w.-]+/g, "_");

  if (format === "pdf") {
    const buf = renderPdf({
      title: doc.title,
      abbr,
      markdown: doc.content,
      company,
      client,
      project,
    });
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${stem}.pdf"`,
        "Cache-Control": "no-store",
        "X-Robots-Tag": "noindex",
      },
    });
  }

  const html = renderDocument({
    template,
    docTitle: doc.title,
    docAbbr: abbr,
    fileBody: doc.content,
    // Saved content already has its values in it.
    values: {},
    company,
    client,
    project,
  });

  // One line above the document saying what this is and where the PDF is.
  // Kept out of the document itself, so the print is the print.
  const bar = `<div style="position:sticky;top:0;z-index:9;display:flex;gap:16px;align-items:center;justify-content:space-between;padding:10px 20px;background:#0f1a24;color:#edf1f4;font:13px system-ui,sans-serif"><span>Shared read only${company?.name ? ` by ${company.name}` : ""}.</span><a href="?format=pdf" style="color:#5fcbc2;text-decoration:none;font-weight:600">Download PDF</a></div>`;
  const page = html.includes("<body")
    ? html.replace(/<body([^>]*)>/, `<body$1>${bar}`)
    : bar + html;

  return new NextResponse(page, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
