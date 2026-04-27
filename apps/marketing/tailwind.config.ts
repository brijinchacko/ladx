import { ladxPreset } from "@ladx/design-system/tailwind-preset";
import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx,md,mdx}",
    "./components/**/*.{ts,tsx}",
    "./content/**/*.{md,mdx}",
    "../../packages/ui/src/**/*.{ts,tsx}",
  ],
  presets: [ladxPreset as Config],
  darkMode: "class",
};

export default config;
