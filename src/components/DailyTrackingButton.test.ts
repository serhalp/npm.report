import { render, screen } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import { formatCompactDateTime, formatDateTime } from "#client/dateFormatting";
import { mockFetch, mockResolvedFetch } from "../test/mock";
import DailyTrackingButton from "./DailyTrackingButton.svelte";

afterEach(() => vi.unstubAllGlobals());

describe("DailyTrackingButton", () => {
  test("renders an existing schedule as a compact status without making a request", () => {
    const nextRunAt = "2026-06-28T12:34:56.000Z";
    const nextRun = formatCompactDateTime(nextRunAt);
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);

    render(DailyTrackingButton, {
      props: {
        reportId: "report-id",
        alreadyTracked: true,
        nextRunAt,
      },
    });

    expect(screen.queryByRole("button", { name: "Tracking daily" })).not.toBeInTheDocument();
    expect(
      screen.getByRole("status", { name: `Tracking daily, next run ${nextRun}` }),
    ).toBeInTheDocument();
    expect(screen.getByText("Tracking daily")).toBeInTheDocument();
    expect(screen.getByText(nextRun)).toHaveAttribute("datetime", nextRunAt);
    expect(screen.getByText(nextRun)).toHaveAttribute("title", formatDateTime(nextRunAt));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("replaces the action with schedule status after enabling tracking", async () => {
    const user = userEvent.setup();
    const trackingChanged = vi.fn<() => void>();
    window.addEventListener("npm.report:tracked-orgs-changed", trackingChanged, { once: true });
    vi.stubGlobal(
      "fetch",
      mockResolvedFetch({
        ok: true,
        json: async () => ({
          orgs: ["netlify"],
          enabled: true,
          nextRunAt: "2026-06-28T12:00:00.000Z",
          lastRunAt: null,
          lastReportId: "report-id",
          consecutiveFailures: 0,
        }),
      }),
    );

    render(DailyTrackingButton, { props: { reportId: "report-id" } });
    await user.click(screen.getByRole("button", { name: "Track daily" }));

    expect(
      await screen.findByRole("status", {
        name: `Tracking daily, next run ${formatCompactDateTime("2026-06-28T12:00:00.000Z")}`,
      }),
    ).toBeInTheDocument();
    expect(trackingChanged).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button", { name: "Track daily" })).not.toBeInTheDocument();
  });

  test("announces scheduling progress", async () => {
    const user = userEvent.setup();
    const request = Promise.withResolvers<{
      ok: boolean;
      json: () => Promise<unknown>;
    }>();
    vi.stubGlobal(
      "fetch",
      mockFetch(() => request.promise),
    );

    render(DailyTrackingButton, { props: { reportId: "report-id" } });
    await user.click(screen.getByRole("button", { name: "Track daily" }));

    expect(screen.getByRole("status")).toHaveTextContent("Enabling daily tracking…");
    expect(screen.getByRole("button", { name: "Track daily" })).toBeDisabled();

    request.resolve({
      ok: true,
      json: async () => ({
        orgs: ["netlify"],
        enabled: true,
        nextRunAt: "2026-06-28T12:00:00.000Z",
        lastRunAt: null,
        lastReportId: "report-id",
        consecutiveFailures: 0,
      }),
    });

    expect(await screen.findByText("Tracking daily")).toBeInTheDocument();
  });

  test.each([
    [
      "an HTTP failure",
      { ok: false, status: 503, json: async () => ({}) },
      "Tracking failed (503)",
    ],
    [
      "a malformed success response",
      { ok: true, status: 201, json: async () => ({ enabled: true }) },
      "Tracking failed (unexpected response)",
    ],
  ])("shows %s and permits a retry", async (_name, response, message) => {
    const user = userEvent.setup();
    const onToast = vi.fn<(message: string) => void>();
    vi.stubGlobal("fetch", mockResolvedFetch(response));

    render(DailyTrackingButton, {
      props: { reportId: "report/id", onToast },
    });
    await user.click(screen.getByRole("button", { name: "Track daily" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(screen.getByRole("alert")).toHaveClass("error");
    expect(screen.getByRole("button", { name: "Track daily" })).toBeEnabled();
    expect(fetch).toHaveBeenCalledWith("/api/reports/report%2Fid/schedule-daily", {
      method: "POST",
    });
    expect(onToast).not.toHaveBeenCalled();
  });
});
