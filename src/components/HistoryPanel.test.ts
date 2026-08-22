import { fireEvent, render, screen, within } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import HistoryPanel from "./HistoryPanel.svelte";
import type { ReportHistoryResponse, ReportTrustHistoryPoint } from "../lib/reportHistory";

function mockHistory(body: ReportHistoryResponse) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => body,
    }),
  );
}

function historyPoint(
  day: number,
  overrides: Partial<Omit<ReportTrustHistoryPoint, "byLevel">> & {
    byLevel?: Partial<ReportTrustHistoryPoint["byLevel"]>;
  } = {},
): ReportTrustHistoryPoint {
  const { byLevel, ...rest } = overrides;
  const date = `2026-06-${String(day).padStart(2, "0")}`;
  return {
    id: `${date}-report`,
    url: `/report/${date}-report`,
    capturedAt: `${date}T10:00:00.000Z`,
    total: 4,
    byLevel: { stagedPublish: 1, trustedPublisher: 1, provenance: 1, none: 1, ...byLevel },
    deprecated: 0,
    failureCount: 0,
    ...rest,
  };
}

describe("HistoryPanel", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  test("exposes its loading state", () => {
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => {})));

    render(HistoryPanel, { props: { orgs: ["netlify"] } });

    expect(screen.getByRole("status")).toHaveTextContent("Loading history…");
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

  test("renders preloaded history without starting another request", () => {
    mockHistory({ orgs: [], points: [] });

    render(HistoryPanel, {
      props: {
        orgs: ["netlify"],
        preloadedHistory: { orgs: ["netlify"], points: [] },
      },
    });

    expect(screen.getByText("No history yet")).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
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

    const { container } = render(HistoryPanel, {
      props: { orgs: ["netlify"], currentReportId: "netlify-2026-06-27-bbbbbbbb" },
    });

    expect(await screen.findByText("50% (2)")).toBeInTheDocument(); // Strong trust: staged + trusted
    expect(screen.getByText("75% (3)")).toBeInTheDocument(); // Any trust: staged + trusted + provenance
    expect(screen.getByText("25% (1)")).toBeInTheDocument(); // No trust signal
    expect(container.querySelectorAll(".trust-summary .stat")).toHaveLength(3);
    expect(container.querySelector(".sparkline")).not.toBeInTheDocument();
    expect(screen.queryByText("Latest failures")).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Latest report had 2 fetch failures; results may be incomplete.",
    );
    expect(
      screen.getByRole("img", { name: /trust coverage across 2 snapshots/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "2026-06-27" })).toHaveAttribute(
      "href",
      "/report/netlify-2026-06-27-bbbbbbbb",
    );
    expect(screen.getByLabelText(/2026-06-27 trust summary/i)).toBeInTheDocument();

    await fireEvent.pointerEnter(container.querySelector(".history-segment--provenance")!);
    expect(screen.getByRole("tooltip")).toHaveTextContent("Provenance only 1 (25%)");
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
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  test("only alerts when the latest report has failures", async () => {
    mockHistory({
      orgs: ["netlify"],
      points: [historyPoint(26, { failureCount: 1 }), historyPoint(27)],
    });

    render(HistoryPanel, { props: { orgs: ["netlify"] } });

    expect(await screen.findByText("75% (3)")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  test("collapses consecutive unchanged reports into an expandable date range", async () => {
    const user = userEvent.setup();
    const points = [
      historyPoint(24),
      historyPoint(25),
      historyPoint(26),
      historyPoint(27, {
        byLevel: { stagedPublish: 2, trustedPublisher: 1, provenance: 1, none: 0 },
      }),
    ];
    mockHistory({ orgs: ["netlify"], points });

    const { container } = render(HistoryPanel, { props: { orgs: ["netlify"] } });

    expect(await screen.findByText("2026-06-24...2026-06-26")).toBeInTheDocument();
    expect(screen.queryByText(/unchanged reports/)).not.toBeInTheDocument();
    const details = container.querySelector("details");
    expect(details).not.toHaveAttribute("open");

    await user.click(container.querySelector("summary")!);

    expect(details).toHaveAttribute("open");
    expect(screen.getByRole("link", { name: "2026-06-24" })).toHaveAttribute(
      "href",
      "/report/2026-06-24-report",
    );
    expect(screen.getByRole("link", { name: "2026-06-26" })).toHaveAttribute(
      "href",
      "/report/2026-06-26-report",
    );
    expect(
      [...container.querySelectorAll("a.history-date")].map((link) => link.textContent),
    ).toEqual(["2026-06-27", "2026-06-26", "2026-06-25", "2026-06-24"]);
    expect(screen.queryByText("Open report")).not.toBeInTheDocument();
  });

  test("marks but does not open an unchanged range that contains the current report", async () => {
    const user = userEvent.setup();
    const points = [historyPoint(24), historyPoint(25), historyPoint(26)];
    mockHistory({ orgs: ["netlify"], points });

    const { container } = render(HistoryPanel, {
      props: { orgs: ["netlify"], currentReportId: points[1].id },
    });

    expect(await screen.findByText("2026-06-24...2026-06-26")).toBeInTheDocument();
    const details = container.querySelector("details")!;
    const summary = container.querySelector("summary")!;
    expect(details).not.toHaveAttribute("open");
    expect(within(summary).getByText("[viewing]")).toBeInTheDocument();

    await user.click(summary);

    expect(details).toHaveAttribute("open");
    expect(screen.getByRole("link", { name: "2026-06-25" }).closest("li")).toHaveClass("current");
    expect(screen.getByRole("link", { name: "2026-06-25" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });
});
