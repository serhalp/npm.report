import { render, screen } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import { formatDate, formatDateTime } from "#client/dateFormatting";
import ResultsView from "./ResultsView.svelte";
import { auditResult, trustReport } from "../test/fixtures";

describe("ResultsView", () => {
  afterEach(() => {
    history.replaceState(null, "", "/");
  });

  test("initializes from a valid hash and preserves the incomplete warning", () => {
    history.replaceState(null, "", "/#report=manual");
    render(ResultsView, {
      props: {
        result: auditResult,
        onToast: vi.fn<(message: string) => void>(),
        initialTab: "trust",
      },
    });

    expect(screen.getByRole("tab", { name: /manual 1/i })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText(/1 fetch\(es\) failed after retries/i)).toBeInTheDocument();
    expect(screen.getByText("Detail — 1 publishes")).toBeInTheDocument();
  });

  test("presents a single report as a tab attached to its report frame", () => {
    render(ResultsView, {
      props: {
        result: { trust: trustReport, failures: [] },
        onToast: vi.fn<(message: string) => void>(),
      },
    });

    expect(screen.getAllByRole("tab")).toHaveLength(1);
    expect(screen.getByRole("tab", { name: /package trust level 2/i })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.queryByText(/^reports$/i)).not.toBeInTheDocument();
    expect(screen.getByRole("tabpanel").parentElement).toHaveClass("report-frame");
    expect(screen.getByText(formatDate(trustReport.rows[0].latestPublish))).toHaveAttribute(
      "title",
      formatDateTime(trustReport.rows[0].latestPublish),
    );
  });

  test("tab clicks replace the hash without adding history entries", async () => {
    const user = userEvent.setup();
    const replace = vi.spyOn(history, "replaceState");
    history.replaceState(null, "", "/");

    render(ResultsView, {
      props: {
        result: auditResult,
        onToast: vi.fn<(message: string) => void>(),
        initialTab: "manual",
      },
    });

    await user.click(screen.getByRole("tab", { name: /package trust level 2/i }));

    expect(screen.getByRole("tab", { name: /package trust level 2/i })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(location.hash).toBe("#report=trust");
    expect(replace).toHaveBeenLastCalledWith(null, "", "#report=trust");
  });

  test("completes the tabs ARIA pattern with arrow-key navigation", async () => {
    const user = userEvent.setup();
    history.replaceState(null, "", "/");
    render(ResultsView, {
      props: {
        result: auditResult,
        onToast: vi.fn<(message: string) => void>(),
        initialTab: "trust",
      },
    });

    const trustTab = screen.getByRole("tab", { name: /package trust level 2/i });
    const manualTab = screen.getByRole("tab", { name: /manual 1/i });

    // The active panel is wired to its tab, and only the active tab is tabbable.
    const panel = screen.getByRole("tabpanel");
    expect(panel).toHaveAttribute("id", "panel-trust");
    expect(panel).toHaveAttribute("aria-labelledby", "tab-trust");
    expect(trustTab).toHaveAttribute("aria-controls", "panel-trust");
    expect(manualTab).toHaveAttribute("aria-controls", "panel-manual");
    expect(trustTab).toHaveAttribute("tabindex", "0");
    expect(manualTab).toHaveAttribute("tabindex", "-1");
    expect(document.getElementById("panel-trust")).not.toHaveAttribute("hidden");
    expect(document.getElementById("panel-manual")).toHaveAttribute("hidden");
    expect(screen.getAllByRole("tabpanel", { hidden: true })).toHaveLength(2);

    // ArrowRight moves focus + selection to the next tab.
    trustTab.focus();
    await user.keyboard("{ArrowRight}");
    expect(manualTab).toHaveAttribute("aria-selected", "true");
    expect(manualTab).toHaveFocus();
    expect(location.hash).toBe("#report=manual");
    expect(document.getElementById("panel-trust")).toHaveAttribute("hidden");
    expect(document.getElementById("panel-manual")).not.toHaveAttribute("hidden");
  });
});
