// GET /api/auth/me, returns the current user or null. Used by the client
// to hydrate UI state without a full server round-trip.

import { getCurrentUser } from "@/lib/auth/server";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ user: null });
  return Response.json({
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
    },
  });
}
