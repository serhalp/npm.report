import { afterEach, describe, expect, test } from "vitest";
import {
  initTheme,
  resetThemeForTests,
  setThemeMode,
  themeState,
  THEME_STORAGE_KEY,
} from "./theme.svelte";

class TestMediaQueryListEvent extends Event implements MediaQueryListEvent {
  constructor(
    readonly matches: boolean,
    readonly media: string,
  ) {
    super("change");
  }
}

class TestMediaQueryList extends EventTarget implements MediaQueryList {
  readonly media = "(prefers-color-scheme: dark)";
  onchange: MediaQueryList["onchange"] = null;
  readonly #legacyListeners = new Set<NonNullable<MediaQueryList["onchange"]>>();

  constructor(public matches: boolean) {
    super();
  }

  addListener(callback: MediaQueryList["onchange"]): void {
    if (callback) this.#legacyListeners.add(callback);
  }

  removeListener(callback: MediaQueryList["onchange"]): void {
    if (callback) this.#legacyListeners.delete(callback);
  }

  setMatches(next: boolean): void {
    this.matches = next;
    const event = new TestMediaQueryListEvent(next, this.media);
    this.dispatchEvent(event);
    this.onchange?.(event);
    for (const listener of this.#legacyListeners) listener.call(this, event);
  }
}

function createMedia(matches: boolean): TestMediaQueryList {
  return new TestMediaQueryList(matches);
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

  test("defaults to dark when there is no saved mode and no system preference", () => {
    initTheme({
      storage: window.localStorage,
      media: createMedia(false),
      lightMedia: createMedia(false),
    });

    expect(themeState.mode).toBe("system");
    expect(themeState.resolved).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.dataset.themeMode).toBe("system");
  });

  test("defaults to dark when system preference detection is unavailable", () => {
    initTheme({ storage: window.localStorage, media: null });

    expect(themeState.mode).toBe("system");
    expect(themeState.resolved).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
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
