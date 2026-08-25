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
  transpilePackages: [
    "@ladx/hmi",
    "@ladx/ui",
    "@ladx/studio",
    "@ladx/design-system",
    "@ladx/types",
  ],

  /**
   * The application moved under one /studio prefix.
   *
   * These are permanent because the old flat paths were real URLs people may
   * have bookmarked, and a signed-in user landing on /projects should arrive at
   * their projects rather than at a 404. The public ladder editor moved the
   * other way, from /studio to /ladder, for the same reason.
   */
  async redirects() {
    return [
      { source: "/chat", destination: "/studio", permanent: true },
      { source: "/projects", destination: "/studio/projects", permanent: true },
      { source: "/projects/:id", destination: "/studio/projects/:id", permanent: true },
      { source: "/clients", destination: "/studio/clients", permanent: true },
      { source: "/clients/:path*", destination: "/studio/clients/:path*", permanent: true },
      { source: "/settings", destination: "/studio/settings", permanent: true },
      { source: "/knowledge", destination: "/studio/knowledge", permanent: true },
      { source: "/memory", destination: "/studio", permanent: true },
    ];
  },
};

export default config;
