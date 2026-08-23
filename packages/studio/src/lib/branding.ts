/**
 * Who the exported PDF says it came from.
 *
 * LADX Mini grew up inside the Edwartens India CRM, where the PDF header was
 * hardwired to that company's details. Studio is a product now, and the same
 * export has to be able to say "LADX" — or, for a training institute running a
 * white-labelled lab, say their name instead. So branding is a parameter with a
 * LADX default rather than a compile-time import.
 *
 * `logoPath` is resolved from `process.cwd()` at export time and is optional:
 * a missing file degrades to a text wordmark rather than failing the export,
 * because losing a logo is not a reason to lose somebody's project PDF.
 */
export type Branding = {
  /** Shown large in the header. */
  tradingName: string;
  /** Small caps under the wordmark. */
  strapline: string;
  /** Printed in the footer rule. */
  legalName: string;
  addressLines: string[];
  website: string;
  /** PNG, relative to process.cwd(). Optional. */
  logoPath?: string;
  /** width / height of that PNG, used to scale it without distortion. */
  logoAspect: number;
};

export const LADX_BRANDING: Branding = {
  tradingName: "LADX",
  strapline: "AI workbench for automation engineers",
  legalName: "LADX",
  addressLines: [],
  website: "ladx.ai",
  logoPath: "public/ladx-logo.png",
  // The shipped wordmark is 3860x900.
  logoAspect: 3860 / 900,
};
