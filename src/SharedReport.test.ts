import { render, screen } from "@testing-library/svelte";
import { describe, expect, test, vi } from "vitest";
import SharedReport from "./SharedReport.svelte";
import { auditResult, recentReport } from "./test/fixtures";

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

  test("shows trust history for all-scope shared reports", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input) === "/api/reports/report-id") {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              id: "report-id",
              orgs: "netlify",
              scopeLabel: "ALL org packages",
              payload: {
                ...auditResult,
                recent: {
                  ...recentReport,
                  summary: {
                    ...recentReport.summary,
                    scopeLabel: "ALL org packages",
                  },
                },
              },
              createdAt: "2026-06-27T12:34:56.000Z",
            }),
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            orgs: ["netlify"],
            points: [
              {
                id: "report-id",
                url: "/report/report-id",
                capturedAt: "2026-06-27T12:34:56.000Z",
                total: 2,
                byLevel: recentReport.summary.byLevel,
                deprecated: 1,
                failureCount: 1,
              },
            ],
          }),
        };
      }),
    );

    render(SharedReport, { props: { id: "report-id" } });

    expect(await screen.findByRole("heading", { name: "Progress over time" })).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: "2026-06-27" })).toHaveAttribute(
      "href",
      "/report/report-id",
    );
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
