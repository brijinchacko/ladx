import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@ladx/ui", "@ladx/studio", "@ladx/design-system", "@ladx/types"],
};

export default config;
