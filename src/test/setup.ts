// oxlint-disable-next-line import/no-unassigned-import -- registers Vitest DOM matchers.
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/svelte";
import { afterEach, beforeEach, vi } from "vitest";

beforeEach(() => {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: {
      writeText: vi.fn().mockResolvedValue(undefined),
    },
  });
});

afterEach(() => {
  cleanup();
});

vi.mock("ghostty-web", () => {
  class Terminal {
    lines: string[] = [];
    open = vi.fn();
    writeln = vi.fn((line: string) => {
      this.lines.push(line);
    });
    clear = vi.fn(() => {
      this.lines = [];
    });
    dispose = vi.fn();
    loadAddon = vi.fn();
  }

  class FitAddon {
    fit = vi.fn();
  }

  return {
    init: vi.fn().mockResolvedValue(undefined),
    Terminal,
    FitAddon,
  };
});
