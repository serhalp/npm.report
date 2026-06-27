export type ThemeMode = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "npm-security-report:theme-mode";

const THEME_QUERY = "(prefers-color-scheme: dark)";

let mode = $state<ThemeMode>("system");
let systemTheme = $state<ResolvedTheme>("dark");
let initialized = false;
let storageRef: Storage | null = null;
let rootRef: HTMLElement | null = null;
let stopListening: (() => void) | null = null;

interface ThemeInitOptions {
  root?: HTMLElement;
  storage?: Storage | null;
  media?: MediaQueryList | null;
}

export const themeState = {
  get mode() {
    return mode;
  },
  get resolved() {
    return resolveTheme();
  },
};

function isThemeMode(value: unknown): value is ThemeMode {
  return value === "system" || value === "light" || value === "dark";
}

function getSafeStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function getSafeMedia(): MediaQueryList | null {
  if (typeof window.matchMedia !== "function") return null;
  return window.matchMedia(THEME_QUERY);
}

function readStoredMode(storage: Storage | null): ThemeMode {
  try {
    const stored = storage?.getItem(THEME_STORAGE_KEY);
    return isThemeMode(stored) ? stored : "system";
  } catch {
    return "system";
  }
}

function resolveTheme(): ResolvedTheme {
  return mode === "system" ? systemTheme : mode;
}

function applyTheme() {
  if (!rootRef) return;
  const resolved = resolveTheme();
  rootRef.dataset.theme = resolved;
  rootRef.dataset.themeMode = mode;
  rootRef.style.colorScheme = resolved;
}

export function initTheme(options: ThemeInitOptions = {}) {
  if (initialized) return;
  initialized = true;

  rootRef = options.root ?? document.documentElement;
  storageRef = options.storage === undefined ? getSafeStorage() : options.storage;
  const media = options.media === undefined ? getSafeMedia() : options.media;

  mode = readStoredMode(storageRef);
  systemTheme = media?.matches ? "dark" : "light";
  applyTheme();

  if (!media) return;

  const onChange = (event: MediaQueryListEvent) => {
    systemTheme = event.matches ? "dark" : "light";
    if (mode === "system") applyTheme();
  };

  media.addEventListener("change", onChange);
  stopListening = () => media.removeEventListener("change", onChange);
}

export function setThemeMode(next: ThemeMode) {
  mode = next;
  try {
    storageRef?.setItem(THEME_STORAGE_KEY, next);
  } catch {
    // Preference persistence should never block changing the current theme.
  }
  applyTheme();
}

export function resetThemeForTests() {
  stopListening?.();
  stopListening = null;
  initialized = false;
  storageRef = null;
  rootRef = null;
  mode = "system";
  systemTheme = "dark";
}
