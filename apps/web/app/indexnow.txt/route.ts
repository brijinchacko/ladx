import { env } from "@/lib/env";

/**
 * The IndexNow ownership proof.
 *
 * IndexNow asks for a file on the host containing the key, to prove that
 * whoever is submitting URLs controls the site. The convention is
 * `/{key}.txt`, and the protocol also accepts an explicit `keyLocation`, which
 * is what this uses: a fixed path is a route Next can serve, and a path named
 * after a value only known at runtime is not.
 *
 * The key is meant to be public. That is the whole mechanism: a submission is
 * trusted because the key it carries matches the one published here. It is an
 * ownership proof, not a secret, which is exactly why the submission endpoint
 * must not use it as a bearer token.
 */
export const dynamic = "force-dynamic";

export function GET() {
  const key = env.indexNowKey;
  if (!key) return new Response("Not found", { status: 404 });
  return new Response(key, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
