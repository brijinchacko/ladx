import type { NextConfig } from "next";

const config: NextConfig = {
  // Tauri requires static export — no Node server in production. All
  // backend work is done via Rust via Tauri commands.
  output: "export",
  reactStrictMode: true,
  images: { unoptimized: true },
  transpilePackages: ["@ladx/ui", "@ladx/design-system", "@ladx/types"],
};

export default config;
