/**
 * The session cookie name, alone in its own module.
 *
 * The middleware runs on the Edge runtime and needs only this string. Importing
 * it from `session.ts` dragged the Drizzle client, and through it the whole
 * `postgres` driver, into the Edge bundle: `net`, `fs`, `os` and `stream` are
 * all unavailable there, and the build emitted a wall of warnings for a value
 * that is thirteen characters long.
 *
 * Keeping it separate means the boundary is enforced by the import graph rather
 * than by remembering.
 */
export const SESSION_COOKIE = "ladx_session";
