import type { NextConfig } from "next";

/**
 * Development and production builds get separate output directories.
 *
 * Both default to `.next`, so running `pnpm build` while `pnpm dev` is running
 * leaves the dev server reading half-overwritten manifests and serving 500s on
 * every route. The failure is confusing because nothing is wrong with the code:
 * the fix is to stop the two writing to the same place.
 */
const config: NextConfig = {
  reactStrictMode: true,
  distDir: process.env.NODE_ENV === "production" ? ".next-build" : ".next",
  transpilePackages: ["@ladx/ui", "@ladx/studio", "@ladx/design-system", "@ladx/types"],
};

export default config;
