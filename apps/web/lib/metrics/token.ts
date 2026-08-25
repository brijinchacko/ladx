/**
 * The token the middleware presents when it posts a batch of counts.
 *
 * Derived from a secret the server already has rather than a new one that
 * would have to be set, remembered and rotated. The secret itself never leaves
 * the process: what travels is a SHA-256 of it under a fixed label, which is
 * useless anywhere else and cannot be turned back into the key.
 *
 * Two callers, in two runtimes. The middleware is on the edge runtime, which
 * has WebCrypto and no node:crypto; the route is on Node, which has both. They
 * have to agree, which is why the label lives here and only here.
 */

export const METRICS_LABEL = "ladx.metrics.ingest.v1:";

/** Edge and browser runtimes. */
export async function metricsTokenAsync(secret: string): Promise<string> {
  const bytes = new TextEncoder().encode(METRICS_LABEL + secret);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
