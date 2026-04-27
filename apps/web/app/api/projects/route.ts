// GET /api/projects — list current user's projects.
// POST /api/projects — multipart upload: store the file, run the Rust
// parser, persist a row keyed to the user.

import { getApiUser } from "@/lib/auth/server";
import { db } from "@/lib/db/client";
import { projects } from "@/lib/db/schema";
import { parseProjectFile } from "@/lib/parsers/spawn";
import { getStorage } from "@/lib/storage";
import { eq } from "drizzle-orm";

const ACCEPTED_EXT = new Set(["xml", "l5x"]);
const MAX_BYTES = 50 * 1024 * 1024; // 50 MB — bigger projects are rare.
const VENDOR_VALUES = ["siemens", "rockwell", "beckhoff", "codesys", "mitsubishi"] as const;
type Vendor = (typeof VENDOR_VALUES)[number];

function vendorFromParsed(raw: string | undefined): Vendor {
  const v = (raw ?? "").toLowerCase() as Vendor;
  return VENDOR_VALUES.includes(v) ? v : "codesys";
}

export async function GET() {
  const authResult = await getApiUser();
  if ("error" in authResult) return authResult.error;

  const rows = await db()
    .select()
    .from(projects)
    .where(eq(projects.userId, authResult.user.id))
    .orderBy(projects.createdAt);

  return Response.json({ projects: rows });
}

export async function POST(req: Request) {
  const authResult = await getApiUser();
  if ("error" in authResult) return authResult.error;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: "expected multipart/form-data" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "missing 'file' field" }, { status: 400 });
  }

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!ACCEPTED_EXT.has(ext)) {
    return Response.json(
      { error: `unsupported format .${ext} — accepted: .l5x, .xml (PLCopen TC6)` },
      { status: 415 },
    );
  }

  if (file.size > MAX_BYTES) {
    return Response.json(
      { error: `file too large (${file.size} bytes, max ${MAX_BYTES})` },
      { status: 413 },
    );
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const storage = await getStorage();
  const stored = await storage.put(file.name, bytes);

  // Parse via the Rust CLI. Persistence row is created either way — if the
  // parse fails, the row records the error and the user can retry.
  const localPath = await storage.resolveLocalPath(stored.key);

  let parseError: string | null = null;
  let parsed: Awaited<ReturnType<typeof parseProjectFile>> | null = null;
  try {
    parsed = await parseProjectFile(localPath);
  } catch (err) {
    parseError = err instanceof Error ? err.message : "parse failed";
  }

  const [row] = await db()
    .insert(projects)
    .values({
      userId: authResult.user.id,
      name: parsed?.name ?? file.name.replace(/\.[^.]+$/, ""),
      vendor: vendorFromParsed(parsed?.vendor),
      r2Key: stored.key,
      sizeBytes: stored.sizeBytes,
      tagCount: parsed?.stats.tag_count ?? 0,
      routineCount: parsed?.stats.routine_count ?? 0,
      udtCount: parsed?.stats.udt_count ?? 0,
      aoiCount: parsed?.stats.aoi_count ?? 0,
      parsedAt: parsed ? new Date() : null,
      parseError,
    })
    .returning();

  if (!row) {
    return Response.json({ error: "project insert returned no row" }, { status: 500 });
  }

  return Response.json({ project: row, parseError }, { status: 201 });
}
