import type { Config } from "tailwindcss";
import { fonts, radii } from "./tokens";

/**
 * Every colour resolves through a CSS variable, so the theme can change under
 * the markup without the markup knowing.
 *
 * `<alpha-value>` is Tailwind's placeholder: it keeps `bg-ink-900/40` and
 * `border-ink-100/60` working, which matters because the app uses fractional
 * opacities in a few hundred places and losing them would flatten every hover
 * state.
 */
const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const scale = (prefix: string) =>
  Object.fromEntries(
    [50, 100, 200, 300, 400, 500, 600, 700, 800, 900].map((step) => [step, v(`${prefix}-${step}`)]),
  );

export const ladxPreset: Partial<Config> = {
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: v("ink-900"), ...scale("ink") },
        teal: { DEFAULT: v("teal-500"), ...scale("teal") },
        /**
         * Not white in the dark theme, and deliberately so.
         *
         * `bg-white` is used for a raised panel and `text-white` for the label
         * on a dark primary button. In the dark theme both want the same
         * answer, a near-black, because the panel goes dark and the button goes
         * light. One token serves both, and overriding Tailwind's own `white`
         * is what makes the two hundred and seventy six existing `bg-white`
         * classes flip without being touched.
         *
         * `bg-page` is the ground behind everything, one step darker than a
         * raised panel so panels read as raised.
         */
        white: v("raised"),
        /** Text on a teal fill. Fixed in both themes; see globals.css. */
        "on-accent": v("on-accent"),
        /** A link or a bullet that is not the brand accent. */
        action: v("action"),
        /** Status surfaces, so a warning box follows the theme like everything else. */
        "danger-bg": v("danger-bg"),
        "danger-border": v("danger-border"),
        "warning-bg": v("warning-bg"),
        "warning-border": v("warning-border"),
        "success-bg": v("success-bg"),
        "success-border": v("success-border"),
        page: v("page"),
        success: v("success"),
        warning: v("warning"),
        danger: v("danger"),
        info: v("teal-500"),
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
