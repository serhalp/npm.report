export type ThemeMode = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "npm-security-report:theme-mode";

const DARK_THEME_QUERY = "(prefers-color-scheme: dark)";
const LIGHT_THEME_QUERY = "(prefers-color-scheme: light)";

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
  lightMedia?: MediaQueryList | null;
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

function getSafeMedia(query: string): MediaQueryList | null {
  if (typeof window.matchMedia !== "function") return null;
  return window.matchMedia(query);
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

function resolveSystemTheme(
  darkMedia: MediaQueryList | null,
  lightMedia?: MediaQueryList | null,
): ResolvedTheme {
  if (darkMedia?.matches) return "dark";
  if (lightMedia === undefined) return darkMedia ? "light" : "dark";
  if (lightMedia?.matches) return "light";
  return "dark";
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
  const media = options.media === undefined ? getSafeMedia(DARK_THEME_QUERY) : options.media;
  const lightMedia =
    options.lightMedia === undefined && options.media === undefined
      ? getSafeMedia(LIGHT_THEME_QUERY)
      : options.lightMedia;

  mode = readStoredMode(storageRef);
  systemTheme = resolveSystemTheme(media, lightMedia);
  applyTheme();

  if (!media && !lightMedia) return;

  const onChange = () => {
    systemTheme = resolveSystemTheme(media, lightMedia);
    if (mode === "system") applyTheme();
  };

  media?.addEventListener("change", onChange);
  if (lightMedia !== media) lightMedia?.addEventListener("change", onChange);
  stopListening = () => {
    media?.removeEventListener("change", onChange);
    if (lightMedia !== media) lightMedia?.removeEventListener("change", onChange);
  };
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
