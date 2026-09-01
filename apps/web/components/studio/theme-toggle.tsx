"use client";

import { THEME_KEY, type Theme, applyTheme, isTheme } from "@/lib/theme/theme";
import { Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

const OPTIONS: { value: Theme; label: string; icon: typeof Sun; about: string }[] = [
  { value: "light", label: "Light", icon: Sun, about: "Always light" },
  { value: "dark", label: "Dark", icon: Moon, about: "Always dark" },
  { value: "system", label: "System", icon: Monitor, about: "Follow this computer" },
];

/**
 * Which theme, chosen.
 *
 * Applied the moment it is pressed rather than on a save, because a colour
 * scheme is the one setting where the preview and the result are the same
 * thing: pressing Dark and then having to find a Save button to see it is a
 * worse answer than pressing Dark.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("system");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(THEME_KEY);
    } catch {
      // Blocked storage. The page still works; the choice just will not last.
    }
    setTheme(isTheme(stored) ? stored : "system");
    setReady(true);
  }, []);

  // Following the system means following it while the page is open, not only
  // at load. Somebody on a schedule that flips at sunset should see it flip.
  useEffect(() => {
    if (theme !== "system" || !window.matchMedia) return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [theme]);

  const choose = (next: Theme) => {
    setTheme(next);
    // Suppress every colour transition for one frame. Without this, each
    // component's own hover transition fires at once and the change reads as
    // the page breaking rather than as a setting taking effect.
    const root = document.documentElement;
    root.setAttribute("data-theme-switching", "");
    applyTheme(next, root);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => root.removeAttribute("data-theme-switching"));
    });
    try {
      window.localStorage.setItem(THEME_KEY, next);
    } catch {
      // Nothing to do. The theme is applied; it just will not be remembered.
    }
  };

  return (
    <div className="flex flex-wrap gap-1.5" aria-label="Colour theme">
      {OPTIONS.map((o) => {
        const Icon = o.icon;
        const on = ready && theme === o.value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            title={o.about}
            onClick={() => choose(o.value)}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] transition-colors ${
              on ? "bg-ink-900 text-white" : "text-ink-600 hover:bg-ink-100 hover:text-ink-900"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
