/**
 * The label the IndexNow submission bearer is derived under.
 *
 * Its own file because a Next route handler may only export the HTTP methods
 * and Next's own config keys, and because the deploy script needs the same
 * value to compute the token it sends.
 */
export const INDEXNOW_LABEL = "ladx.indexnow.submit.v1:";
