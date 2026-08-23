// Serves the IndexNow key file at /<key>.txt.
//
// IndexNow verifies ownership by fetching a file at the site root whose name
// and contents are both the key. Serving it from an env var rather than a
// static file means rotating the key is a redeploy rather than a commit.

export async function GET(_req: Request, ctx: { params: Promise<{ key: string }> }) {
  const { key } = await ctx.params;
  const expected = process.env.INDEXNOW_KEY;

  if (!expected || key !== `${expected}.txt`) {
    return new Response("Not found", { status: 404 });
  }
  return new Response(expected, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
