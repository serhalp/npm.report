import { render, screen } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { THEME_STORAGE_KEY } from "../lib/theme.svelte";
import ThemeToggle from "./ThemeToggle.svelte";

function stubMatchMedia(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn<typeof window.matchMedia>((query) => ({
      matches: query.includes("dark") ? matches : !matches,
      media: query,
      onchange: null,
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent: () => true,
    })),
  });
}

describe("ThemeToggle", () => {
  test("defaults to system mode with icon-only accessible controls", async () => {
    const user = userEvent.setup();
    stubMatchMedia(false);
    render(ThemeToggle);

    const system = screen.getByRole("button", { name: "Use system theme" });
    const light = screen.getByRole("button", { name: "Use light theme" });
    const dark = screen.getByRole("button", { name: "Use dark theme" });

    expect(system).toHaveAttribute("aria-pressed", "true");
    expect(light).toHaveAttribute("aria-pressed", "false");
    expect(dark).toHaveAttribute("aria-pressed", "false");
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(document.documentElement.dataset.themeMode).toBe("system");

    await user.click(dark);

    expect(dark).toHaveAttribute("aria-pressed", "true");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.dataset.themeMode).toBe("dark");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
  });

  test("restores the remembered mode", () => {
    stubMatchMedia(false);
    window.localStorage.setItem(THEME_STORAGE_KEY, "light");

    render(ThemeToggle);

    expect(screen.getByRole("button", { name: "Use light theme" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(document.documentElement.dataset.theme).toBe("light");
  });
});
