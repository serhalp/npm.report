import { afterEach, describe, expect, test } from "vitest";
import {
  initTheme,
  resetThemeForTests,
  setThemeMode,
  themeState,
  THEME_STORAGE_KEY,
} from "./theme.svelte";

function createMedia(matches: boolean) {
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const media = {
    matches,
    media: "(prefers-color-scheme: dark)",
    addEventListener: (_event: "change", listener: (event: MediaQueryListEvent) => void) => {
      listeners.add(listener);
    },
    removeEventListener: (_event: "change", listener: (event: MediaQueryListEvent) => void) => {
      listeners.delete(listener);
    },
    setMatches(next: boolean) {
      this.matches = next;
      const event = { matches: next } as MediaQueryListEvent;
      for (const listener of listeners) listener(event);
    },
  };
  return media as MediaQueryList & { setMatches: (next: boolean) => void };
}

afterEach(() => {
  resetThemeForTests();
  window.localStorage.removeItem(THEME_STORAGE_KEY);
});

describe("theme state", () => {
  test("defaults to system mode and resolves from the OS preference", () => {
    initTheme({ storage: window.localStorage, media: createMedia(false) });

    expect(themeState.mode).toBe("system");
    expect(themeState.resolved).toBe("light");
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(document.documentElement.dataset.themeMode).toBe("system");
  });

  test("uses and persists explicit user selections", () => {
    initTheme({ storage: window.localStorage, media: createMedia(false) });

    setThemeMode("dark");

    expect(themeState.mode).toBe("dark");
    expect(themeState.resolved).toBe("dark");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.style.colorScheme).toBe("dark");
  });

  test("updates system mode when the OS preference changes", () => {
    const media = createMedia(false);
    initTheme({ storage: window.localStorage, media });

    media.setMatches(true);

    expect(themeState.mode).toBe("system");
    expect(themeState.resolved).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");

    setThemeMode("light");
    media.setMatches(false);

    expect(themeState.mode).toBe("light");
    expect(themeState.resolved).toBe("light");
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  test("restores a remembered mode on init", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "dark");

    initTheme({ storage: window.localStorage, media: createMedia(false) });

    expect(themeState.mode).toBe("dark");
    expect(themeState.resolved).toBe("dark");
    expect(document.documentElement.dataset.themeMode).toBe("dark");
  });
});
