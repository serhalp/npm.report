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
    history.replaceState(null, "", "/#manual");
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

    await user.click(screen.getByRole("tab", { name: /recent 2/i }));

    expect(screen.getByRole("tab", { name: /recent 2/i })).toHaveAttribute("aria-selected", "true");
    expect(location.hash).toBe("#recent");
    expect(replace).toHaveBeenLastCalledWith(null, "", "#recent");
  });
});
