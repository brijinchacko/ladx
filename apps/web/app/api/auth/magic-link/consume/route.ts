// GET /api/auth/magic-link/consume?token=...&uid=...&next=...
// Single-use, time-limited. On success, sets the session cookie and
// redirects to `next` (default /projects). On failure, redirects to
// /sign-in with an error flag.

import { createSession, setSessionCookie } from "@/lib/auth/session";
import { consumeToken } from "@/lib/auth/tokens";
import { redirect } from "next/navigation";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token") ?? "";
  const uid = url.searchParams.get("uid") ?? "";
  const next = url.searchParams.get("next") ?? "/projects";

  if (!token || !uid) {
    return redirect("/sign-in?magic_error=invalid_link");
  }

  const consumed = await consumeToken({
    userId: uid,
    kind: "magic_link",
    plaintext: token,
  });
  if (!consumed) {
    return redirect("/sign-in?magic_error=expired");
  }

  const session = await createSession(uid);
  await setSessionCookie(session.id);
  return redirect(next);
}
