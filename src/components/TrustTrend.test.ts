import { fireEvent, render, screen } from "@testing-library/svelte";
import { describe, expect, test } from "vitest";
import { formatChartDate, formatDateTime } from "#client/dateFormatting";
import type { ReportTrustHistoryPoint } from "#shared/reportHistory";
import TrustTrend from "./TrustTrend.svelte";

const points: ReportTrustHistoryPoint[] = [
  {
    id: "one",
    url: "/report/one",
    capturedAt: "2026-07-01T12:00:00.000Z",
    total: 10,
    byLevel: { stagedPublish: 1, trustedPublisher: 2, provenance: 2, none: 5 },
    deprecated: 0,
    failureCount: 0,
  },
  {
    id: "two",
    url: "/report/two",
    capturedAt: "2026-07-03T12:00:00.000Z",
    total: 10,
    byLevel: { stagedPublish: 2, trustedPublisher: 2, provenance: 3, none: 3 },
    deprecated: 0,
    failureCount: 0,
  },
  {
    id: "three",
    url: "/report/three",
    capturedAt: "2026-07-09T12:00:00.000Z",
    total: 10,
    byLevel: { stagedPublish: 2, trustedPublisher: 2, provenance: 3, none: 3 },
    deprecated: 0,
    failureCount: 0,
  },
];

function reportLink(index: number): HTMLElement {
  const date = formatDateTime(points[index].capturedAt);
  return screen.getByRole("link", { name: (name) => name.startsWith(`${date} report`) });
}

describe("TrustTrend", () => {
  test("renders three color-independent series with labeled axes", () => {
    const { container } = render(TrustTrend, {
      props: { points, currentReportId: "two", linkReports: true },
    });

    expect(
      screen.getByRole("img", {
        name: /latest: 40% strong trust, 70% any trust, 30% no trust signal/i,
      }),
    ).toBeInTheDocument();
    expect(container.querySelectorAll("polyline")).toHaveLength(3);
    expect(container.querySelector(".trust-trend__line--strong")).toBeInTheDocument();
    expect(container.querySelector(".trust-trend__line--any")).toBeInTheDocument();
    expect(container.querySelector(".trust-trend__line--none")).toBeInTheDocument();
    expect(screen.getByText("100%")).toBeInTheDocument();
    expect(screen.getByText("50%")).toBeInTheDocument();
    expect(screen.getByText("0%")).toBeInTheDocument();
    expect(screen.getByText(formatChartDate(points[0].capturedAt))).toBeInTheDocument();
    expect(screen.getByText(formatChartDate(points[1].capturedAt))).toBeInTheDocument();
    expect(screen.getByText(formatChartDate(points[2].capturedAt))).toBeInTheDocument();
    expect(screen.getByText("Strong trust")).toHaveClass("trust-trend__key--strong");
    expect(screen.getByText("Any trust")).toHaveClass("trust-trend__key--any");
    expect(screen.getByText("No trust signal")).toHaveClass("trust-trend__key--none");
    expect(container.querySelectorAll(".trust-trend__tick")).toHaveLength(
      container.querySelectorAll(".trust-trend__axis-label--x").length,
    );
    expect(container.querySelector(".trust-trend > .trust-trend__legend")).toBeInTheDocument();
    expect(reportLink(1)).toHaveAttribute("aria-current", "page");
  });

  test("marks an older current report on the x-axis and labels it while active", async () => {
    const { container } = render(TrustTrend, {
      props: { points, currentReportId: "two", linkReports: true },
    });
    const current = reportLink(1);

    expect(screen.getByText(formatChartDate(points[1].capturedAt))).toHaveClass(
      "trust-trend__axis-label--current",
    );
    expect(container.querySelector(".trust-trend__tick--current")).toBeInTheDocument();

    await fireEvent.pointerEnter(current);

    expect(screen.getByText("[viewing]")).toHaveClass("trust-trend__current-label");
  });

  test("does not call out the current report when it is already latest", async () => {
    const { container } = render(TrustTrend, {
      props: { points, currentReportId: "three", linkReports: true },
    });

    await fireEvent.pointerEnter(reportLink(2));

    expect(screen.getByRole("tooltip")).toHaveTextContent(formatDateTime(points[2].capturedAt));
    expect(container.querySelector(".trust-trend__axis-label--current")).not.toBeInTheDocument();
    expect(container.querySelector(".trust-trend__tick--current")).not.toBeInTheDocument();
  });

  test("reveals exact values on hover and links each snapshot to its report", async () => {
    const { container } = render(TrustTrend, { props: { points, linkReports: true } });
    const first = reportLink(0);

    expect(first).toHaveAttribute("href", "/report/one");
    await fireEvent.pointerEnter(first);

    expect(screen.getByRole("tooltip")).toHaveTextContent(formatDateTime(points[0].capturedAt));
    expect(screen.getByRole("tooltip")).toHaveTextContent("Strong trust 3/10 · 30%");
    expect(screen.getByRole("tooltip")).toHaveTextContent("Any trust 5/10 · 50%");
    expect(screen.getByRole("tooltip")).toHaveTextContent("No trust signal 5/10 · 50%");
    expect(container.querySelectorAll(".trust-trend__dot")).toHaveLength(3);

    await fireEvent.pointerLeave(first);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  test("uses one roving tab stop and supports arrow, Home, End, and Escape keys", async () => {
    render(TrustTrend, {
      props: { points, currentReportId: "two", linkReports: true },
    });
    const links = screen.getAllByRole("link");

    expect(links.map((link) => link.tabIndex)).toEqual([-1, 0, -1]);

    await fireEvent.focus(links[1]);
    expect(screen.getByRole("tooltip")).toHaveTextContent(formatDateTime(points[1].capturedAt));

    await fireEvent.keyDown(links[1], { key: "ArrowRight" });
    expect(links[2]).toHaveFocus();
    expect(links.map((link) => link.tabIndex)).toEqual([-1, -1, 0]);
    expect(screen.getByRole("tooltip")).toHaveTextContent(formatDateTime(points[2].capturedAt));

    await fireEvent.keyDown(links[2], { key: "Home" });
    expect(links[0]).toHaveFocus();

    await fireEvent.keyDown(links[0], { key: "End" });
    expect(links[2]).toHaveFocus();

    await fireEvent.keyDown(links[2], { key: "Escape" });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });
});
