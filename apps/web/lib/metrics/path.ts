/**
 * A request path, reduced to the page it was.
 *
 * Two reasons, and the second is the important one.
 *
 * The first is size. `/studio/projects/<uuid>` is a different string for every
 * project, so counting raw paths would fill the table with rows of one and
 * answer no question anybody has. Collapsed to `/studio/projects/[id]` it
 * answers the question that was actually being asked, which is how often the
 * project page is opened.
 *
 * The second is that an id in a path can identify a person. A document slug, a
 * share token, a client id: any of them is a thread back to somebody. This
 * table is meant to hold no such thread, so ids are removed here rather than
 * trusted not to matter, and a path that is not recognised at all is counted
 * as `/other` rather than stored.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Id-shaped rather than page-shaped.
 *
 * Length alone is the wrong test: `factory-acceptance-test` is twenty-three
 * characters and is a page name, while `abcdef0123456789abcdef` is the same
 * length and is not. The difference is that a slug is words joined by hyphens
 * and a token is one run of characters, so that is what is tested. Every
 * opaque value this application actually puts in a path is either a uuid or a
 * share token, and both are caught: uuids by the pattern, share tokens by the
 * route being collapsed whole.
 */
function looksLikeId(seg: string): boolean {
  if (UUID.test(seg)) return true;
  if (/^\d+$/.test(seg)) return true;
  if (!seg.includes("-") && seg.length >= 16) return true;
  if (seg.length > 80) return true;
  return false;
}

/**
 * Route shapes whose last segment is content rather than an id.
 *
 * A resource slug is a page: "which article is read most" is the whole reason
 * to look at this table. A share token is not, and neither is a document id.
 */
const KEEP_SLUG = ["/resources/", "/products/", "/documents/", "/forum/c/", "/forum/t/"];

export function normalisePath(rawPath: string): string | null {
  if (!rawPath.startsWith("/")) return null;

  // The query string is dropped whole. It carries search terms, referral
  // codes and reset tokens, none of which belong in a counter.
  const path = rawPath.split("?")[0]?.split("#")[0] ?? "/";

  // Assets and machinery. Counting them says nothing about readers and would
  // swamp everything that does.
  if (
    path.startsWith("/_next/") ||
    path.startsWith("/api/") ||
    path === "/favicon.ico" ||
    /\.[a-z0-9]{2,5}$/i.test(path)
  ) {
    return null;
  }

  if (path === "/") return "/";
  if (path.length > 512) return "/other";

  const keepSlug = KEEP_SLUG.some((p) => path.startsWith(p));
  const segs = path.replace(/\/+$/, "").split("/").filter(Boolean);

  const out = segs.map((seg, i) => {
    const last = i === segs.length - 1;
    if (last && keepSlug && !looksLikeId(seg)) return seg;
    return looksLikeId(seg) ? "[id]" : seg;
  });

  // A share link is a secret in a URL. It is counted as one page, never as
  // which link, because which link is exactly the thing not to write down.
  if (out[0] === "share") return "/share/[token]";

  return `/${out.join("/")}`;
}
