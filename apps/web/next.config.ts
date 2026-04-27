import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@ladx/ui", "@ladx/design-system", "@ladx/types"],
};

export default config;
