import { render, screen } from "@testing-library/svelte";
import { describe, expect, test, vi } from "vitest";
import SharedReport from "./SharedReport.svelte";
import { auditResult } from "./test/fixtures";

describe("SharedReport", () => {
  test("loads and renders a read-only shared report", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          id: "report-id",
          orgs: "netlify",
          scopeLabel: "last 12 months",
          payload: auditResult,
          createdAt: "2026-06-27T12:34:56.000Z",
        }),
      }),
    );

    render(SharedReport, { props: { id: "report/id" } });

    expect(screen.getByText("Loading report…")).toBeInTheDocument();
    expect(await screen.findByText(/Audit of/)).toBeInTheDocument();
    expect(screen.getByText("netlify")).toBeInTheDocument();
    expect(screen.getByText(/generated 2026-06-27/)).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith("/api/reports/report%2Fid");
  });

  test("shows the specific not-found error for 404s", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
      }),
    );

    render(SharedReport, { props: { id: "missing" } });

    expect(await screen.findByText("This report could not be found.")).toBeInTheDocument();
    expect(screen.getByText(/Back to the audit tool/)).toBeInTheDocument();
  });
});
