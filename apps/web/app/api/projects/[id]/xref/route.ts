// GET /api/projects/[id]/xref          every tag, with everywhere it is used
// GET /api/projects/[id]/xref?tag=X    one tag

import { getApiUser } from "@/lib/auth/server";
import { getProject } from "@/lib/platform/queries";
import { xrefForProject } from "@/lib/xref/load";
import { xrefFindings } from "@/lib/xref/xref";
import { type NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getApiUser();
  if ("error" in auth) return auth.error;
  const { id } = await params;

  const project = await getProject(auth.user.id, id);
  if (!project) return NextResponse.json({ error: "not found" }, { status: 404 });

  const entries = await xrefForProject(auth.user.id, id);
  const tag = req.nextUrl.searchParams.get("tag");
  if (tag) {
    const entry = entries.find((e) => e.tag === tag);
    if (!entry) return NextResponse.json({ error: "no such tag" }, { status: 404 });
    return NextResponse.json({ entry });
  }
  return NextResponse.json({ entries, findings: xrefFindings(entries) });
}
