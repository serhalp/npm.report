import { render, screen } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import ResultsView from "./ResultsView.svelte";
import { auditResult } from "../test/fixtures";

describe("ResultsView", () => {
  afterEach(() => {
    history.replaceState(null, "", "/");
  });

  test("initializes from a valid hash and preserves the incomplete warning", () => {
    history.replaceState(null, "", "/#report=manual");
    render(ResultsView, {
      props: {
        result: auditResult,
        onToast: vi.fn(),
        initialTab: "recent",
      },
    });

    expect(screen.getByRole("tab", { name: /manual 1/i })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText(/1 fetch\(es\) failed after retries/i)).toBeInTheDocument();
    expect(screen.getByText("Detail — 1 publishes")).toBeInTheDocument();
  });

  test("tab clicks replace the hash without adding history entries", async () => {
    const user = userEvent.setup();
    const replace = vi.spyOn(history, "replaceState");
    history.replaceState(null, "", "/");

    render(ResultsView, {
      props: {
        result: auditResult,
        onToast: vi.fn(),
        initialTab: "manual",
      },
    });

    await user.click(screen.getByRole("tab", { name: /package trust level 2/i }));

    expect(screen.getByRole("tab", { name: /package trust level 2/i })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(location.hash).toBe("#report=recent");
    expect(replace).toHaveBeenLastCalledWith(null, "", "#report=recent");
  });

  test("completes the tabs ARIA pattern with arrow-key navigation", async () => {
    const user = userEvent.setup();
    history.replaceState(null, "", "/");
    render(ResultsView, {
      props: { result: auditResult, onToast: vi.fn(), initialTab: "recent" },
    });

    const recentTab = screen.getByRole("tab", { name: /package trust level 2/i });
    const manualTab = screen.getByRole("tab", { name: /manual 1/i });

    // The active panel is wired to its tab, and only the active tab is tabbable.
    const panel = screen.getByRole("tabpanel");
    expect(panel).toHaveAttribute("id", "panel-recent");
    expect(panel).toHaveAttribute("aria-labelledby", "tab-recent");
    expect(recentTab).toHaveAttribute("aria-controls", "panel-recent");
    expect(recentTab).toHaveAttribute("tabindex", "0");
    expect(manualTab).toHaveAttribute("tabindex", "-1");

    // ArrowRight moves focus + selection to the next tab.
    recentTab.focus();
    await user.keyboard("{ArrowRight}");
    expect(manualTab).toHaveAttribute("aria-selected", "true");
    expect(manualTab).toHaveFocus();
    expect(location.hash).toBe("#report=manual");
  });
});
