import { render, screen } from "@testing-library/svelte";
import { beforeEach, describe, expect, test, vi } from "vitest";
import HistoryPanel from "./HistoryPanel.svelte";
import type { ReportHistoryResponse } from "../lib/reportHistory";

function mockHistory(body: ReportHistoryResponse) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => body,
    }),
  );
}

describe("HistoryPanel", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  test("stays hidden when disabled", () => {
    mockHistory({ orgs: [], points: [] });

    render(HistoryPanel, { props: { orgs: ["netlify"], enabled: false } });

    expect(screen.queryByRole("heading", { name: "Progress over time" })).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  test("renders an empty history state", async () => {
    mockHistory({ orgs: ["netlify"], points: [] });

    render(HistoryPanel, { props: { orgs: ["netlify"] } });

    expect(await screen.findByText("No history yet")).toBeInTheDocument();
    expect(
      screen.getByText("Run an all-packages trust report for this org set to start the timeline."),
    ).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith("/api/reports/history?org=netlify");
  });

  test("falls back to the empty state when history cannot load", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        json: async () => ({}),
      }),
    );

    render(HistoryPanel, { props: { orgs: ["netlify"] } });

    expect(await screen.findByText("No history yet")).toBeInTheDocument();
    expect(screen.queryByText(/History failed/)).not.toBeInTheDocument();
  });

  test("renders aggregate trust history without payload data", async () => {
    mockHistory({
      orgs: ["netlify"],
      points: [
        {
          id: "netlify-2026-06-26-aaaaaaaa",
          url: "/report/netlify-2026-06-26-aaaaaaaa",
          capturedAt: "2026-06-26T10:00:00.000Z",
          total: 4,
          byLevel: {
            stagedPublish: 0,
            trustedPublisher: 1,
            provenance: 1,
            none: 2,
          },
          deprecated: 0,
          failureCount: 0,
        },
        {
          id: "netlify-2026-06-27-bbbbbbbb",
          url: "/report/netlify-2026-06-27-bbbbbbbb",
          capturedAt: "2026-06-27T10:00:00.000Z",
          total: 4,
          byLevel: {
            stagedPublish: 1,
            trustedPublisher: 1,
            provenance: 1,
            none: 1,
          },
          deprecated: 1,
          failureCount: 2,
        },
      ],
    });

    render(HistoryPanel, {
      props: { orgs: ["netlify"], currentReportId: "netlify-2026-06-27-bbbbbbbb" },
    });

    expect(await screen.findByText("50% (2)")).toBeInTheDocument(); // Strong trust: staged + trusted
    expect(screen.getByText("75% (3)")).toBeInTheDocument(); // Any trust: staged + trusted + provenance
    expect(screen.getByText("25% (1)")).toBeInTheDocument(); // No trust signal
    expect(screen.getByText("2")).toBeInTheDocument(); // latest failures
    expect(screen.getByRole("img", { name: /across 2 snapshots/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "2026-06-27" })).toHaveAttribute(
      "href",
      "/report/netlify-2026-06-27-bbbbbbbb",
    );
    expect(screen.getByLabelText(/2026-06-27 trust summary/i)).toBeInTheDocument();
  });

  test("hides the trend chart with a single snapshot", async () => {
    mockHistory({
      orgs: ["netlify"],
      points: [
        {
          id: "netlify-2026-06-27-bbbbbbbb",
          url: "/report/netlify-2026-06-27-bbbbbbbb",
          capturedAt: "2026-06-27T10:00:00.000Z",
          total: 4,
          byLevel: { stagedPublish: 1, trustedPublisher: 1, provenance: 1, none: 1 },
          deprecated: 0,
          failureCount: 0,
        },
      ],
    });

    render(HistoryPanel, { props: { orgs: ["netlify"] } });

    expect(await screen.findByText("50% (2)")).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /snapshots/i })).not.toBeInTheDocument();
  });
});
