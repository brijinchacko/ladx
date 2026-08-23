import type { Config } from "tailwindcss";
import { colors, fonts, radii } from "./tokens";

export const ladxPreset: Partial<Config> = {
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: colors.ink,
          50: colors.ink50,
          100: colors.ink100,
          200: colors.ink200,
          300: colors.ink300,
          400: colors.ink400,
          500: colors.ink500,
          600: colors.ink600,
          700: colors.ink700,
          800: colors.ink800,
          900: colors.ink900,
        },
        teal: {
          DEFAULT: colors.teal,
          50: colors.teal50,
          100: colors.teal100,
          200: colors.teal200,
          300: colors.teal300,
          400: colors.teal400,
          500: colors.teal500,
          600: colors.teal600,
          700: colors.teal700,
          800: colors.teal800,
          900: colors.teal900,
        },
        success: colors.success,
        warning: colors.warning,
        danger: colors.danger,
        info: colors.info,
      },
      fontFamily: {
        sans: fonts.sans.split(", "),
        display: fonts.display.split(", "),
        mono: fonts.mono.split(", "),
      },
      borderRadius: {
        sm: radii.sm,
        md: radii.md,
        lg: radii.lg,
        xl: radii.xl,
      },
    },
  },
};

export default ladxPreset;
