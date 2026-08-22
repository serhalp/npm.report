import { render, screen, waitFor } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import SharedReport from "./SharedReport.svelte";
import { auditResult, trustReport } from "./test/fixtures";

afterEach(() => vi.unstubAllGlobals());

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
    const user = userEvent.setup();
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
                trust: {
                  ...trustReport,
                  summary: {
                    ...trustReport.summary,
                    scopeLabel: "ALL org packages",
                  },
                },
              },
              createdAt: "2026-06-27T12:34:56.000Z",
            }),
          };
        }
        if (String(input) === "/api/reports/report-id/schedule-daily") {
          return {
            ok: true,
            status: 201,
            json: async () => ({
              orgs: ["netlify"],
              enabled: true,
              nextRunAt: "2026-06-28T12:34:56.000Z",
              lastRunAt: null,
              lastReportId: "report-id",
              consecutiveFailures: 0,
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
                byLevel: trustReport.summary.byLevel,
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
    await user.click(screen.getByRole("button", { name: "Track daily" }));
    expect(await screen.findByRole("button", { name: "Tracking daily" })).toBeDisabled();
  });

  test("waits for trust history before rendering an all-scope report", async () => {
    let resolveHistory!: (value: {
      ok: boolean;
      status: number;
      json: () => Promise<unknown>;
    }) => void;
    const pendingHistory = new Promise<{
      ok: boolean;
      status: number;
      json: () => Promise<unknown>;
    }>((resolve) => {
      resolveHistory = resolve;
    });
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
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
              trust: {
                ...trustReport,
                summary: { ...trustReport.summary, scopeLabel: "ALL org packages" },
              },
            },
            createdAt: "2026-06-27T12:34:56.000Z",
          }),
        };
      }
      return pendingHistory;
    });
    vi.stubGlobal("fetch", fetchMock);

    render(SharedReport, { props: { id: "report-id" } });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/reports/history?org=netlify");
    });
    expect(screen.getByText("Loading report…")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Progress over time" })).not.toBeInTheDocument();

    resolveHistory({
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
            byLevel: trustReport.summary.byLevel,
            deprecated: 1,
            failureCount: 1,
          },
        ],
      }),
    });

    expect(await screen.findByRole("heading", { name: "Progress over time" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "2026-06-27" })).toHaveAttribute(
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

  test("rejects malformed stored report data at the client boundary", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ id: "report-id", payload: { failures: [] } }),
      }),
    );

    render(SharedReport, { props: { id: "report-id" } });

    expect(
      await screen.findByText("This report is in an unexpected format and can't be displayed."),
    ).toBeInTheDocument();
  });

  test("shows the upstream status when loading a report fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
      }),
    );

    render(SharedReport, { props: { id: "report-id" } });

    expect(await screen.findByText("Failed to load report (503).")).toBeInTheDocument();
  });
});
