/**
 * Light, dark, or whatever the machine is set to.
 *
 * Three states rather than two. A two-state toggle forces a choice that most
 * people have already made once, at the operating system, and then leaves the
 * app disagreeing with everything else on the screen after sunset.
 */
export const THEMES = ["light", "dark", "system"] as const;
export type Theme = (typeof THEMES)[number];

export const THEME_KEY = "ladx.theme";

export function isTheme(value: unknown): value is Theme {
  return typeof value === "string" && (THEMES as readonly string[]).includes(value);
}

/**
 * Put a choice on the document.
 *
 * System sets no attribute at all, which is what lets the media query in the
 * stylesheet decide. Writing `data-theme="system"` would look tidier and would
 * match nothing: the CSS keys off light and dark, and a third value would
 * leave the page on its light defaults for ever.
 */
export function applyTheme(theme: Theme, root: HTMLElement = document.documentElement): void {
  if (theme === "system") {
    root.removeAttribute("data-theme");
  } else {
    root.setAttribute("data-theme", theme);
  }
}

/** What the page is actually showing, which is not the same as what was chosen. */
export function resolveTheme(theme: Theme): "light" | "dark" {
  if (theme !== "system") return theme;
  if (typeof window === "undefined" || !window.matchMedia) return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/**
 * The script that runs before the first paint.
 *
 * Without it the server renders light, the browser reads the stored choice
 * after hydration, and somebody who chose dark gets a white flash on every
 * single navigation. It has to be inline and synchronous in <head> for that
 * reason, and it is kept to one expression so there is little to go wrong
 * before React exists.
 *
 * Wrapped in try/catch because localStorage throws outright in a few real
 * situations, a private window with site data blocked among them, and a page
 * that fails to render at all is a much worse outcome than a page that renders
 * in the wrong theme.
 */
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(
  THEME_KEY,
)});if(t==="dark"||t==="light"){document.documentElement.setAttribute("data-theme",t)}}catch(e){}})()`;
