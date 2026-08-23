import { ladxPreset } from "@ladx/design-system/tailwind-preset";
import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "../../packages/ui/src/**/*.{ts,tsx}",
    "../../packages/studio/src/**/*.{ts,tsx}",
  ],
  presets: [ladxPreset as Config],
  darkMode: "class",
};

export default config;
