/**
 * The colour theme: Paper (light) or Coffee (dark). The theme itself is CSS:
 * `data-theme="coffee"` on the root swaps every colour token (`index.css`).
 * This file only decides which, remembers it, and tells React when it changes.
 *
 * By default the game follows the device's light or dark setting, live: when
 * the device switches (by hand, or at sunset), so does the game. Choosing the
 * other theme in the settings menu overrides it, and is remembered; choosing
 * the device's own theme again removes the override, so the game goes back to
 * following the device. `index.html` applies the same rule before the page
 * first paints, so a Coffee player never sees a flash of Paper; keep the two
 * in step.
 */
export type Theme = "paper" | "coffee";

const THEME_KEY = "uat:theme";
const darkQuery = matchMedia("(prefers-color-scheme: dark)");

/** The device's own theme. */
function systemTheme(): Theme {
  return darkQuery.matches ? "coffee" : "paper";
}

/** The override, if any. Remembered per browser: a UI convenience, so localStorage is the right place. */
function readOverride(): Theme | null {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === "paper" || saved === "coffee") return saved;
  } catch {
    // Private browsing and the like: follow the device.
  }
  return null;
}

let override = readOverride();
let theme: Theme = override ?? systemTheme();
const listeners = new Set<() => void>();

/**
 * The browser's own furniture follows the theme too: the tab's icon (the owl,
 * or the owl inverted for Coffee) and `theme-color`, which phone browsers use
 * for their address bar. The colour is read from the page's own Paper token,
 * so it never drifts from `index.css`.
 */
function brand(): void {
  const icon = document.querySelector<HTMLLinkElement>("link#favicon");
  if (icon) icon.href = theme === "coffee" ? "/favicon-dark.png" : "/favicon.png";
  const bar = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  const paper = getComputedStyle(document.documentElement).getPropertyValue("--color-paper").trim();
  if (bar && paper) bar.content = paper;
}

function apply(): void {
  theme = override ?? systemTheme();
  document.documentElement.dataset.theme = theme;
  brand();
  for (const listener of listeners) listener();
}
apply();
// The stylesheet may not have been applied yet when this first runs (Vite adds
// it with JavaScript in development), leaving no Paper to read: try again.
addEventListener("load", brand, { once: true });

// The device switched between light and dark; matters only with no override.
darkQuery.addEventListener("change", () => {
  if (!override) apply();
});

/** The theme on screen. */
export function currentTheme(): Theme {
  return theme;
}

/**
 * Shows `value` at once. If it is the device's own theme, the override goes
 * and the game follows the device again; otherwise it is remembered.
 */
export function setTheme(value: Theme): void {
  override = value === systemTheme() ? null : value;
  try {
    if (override) localStorage.setItem(THEME_KEY, override);
    else localStorage.removeItem(THEME_KEY);
  } catch {
    // The switch still works for this visit.
  }
  apply();
}

/** For React's useSyncExternalStore: call `listener` whenever the theme changes. */
export function subscribeTheme(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
