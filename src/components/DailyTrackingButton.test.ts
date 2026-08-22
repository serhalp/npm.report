import { render, screen } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import DailyTrackingButton from "./DailyTrackingButton.svelte";

afterEach(() => vi.unstubAllGlobals());

describe("DailyTrackingButton", () => {
  test("renders an existing schedule as a compact status without making a request", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(DailyTrackingButton, {
      props: {
        reportId: "report-id",
        alreadyTracked: true,
        nextRunAt: "2026-06-28T12:34:56.000Z",
      },
    });

    expect(screen.queryByRole("button", { name: "Tracking daily" })).not.toBeInTheDocument();
    expect(
      screen.getByRole("status", { name: "Tracking daily, next run 2026-06-28 12:34Z" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Tracking daily")).toBeInTheDocument();
    expect(screen.getByText("2026-06-28 12:34Z")).toHaveAttribute(
      "datetime",
      "2026-06-28T12:34:56.000Z",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("replaces the action with schedule status after enabling tracking", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
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
        name: "Tracking daily, next run 2026-06-28 12:00Z",
      }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Track daily" })).not.toBeInTheDocument();
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
    const onToast = vi.fn();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));

    render(DailyTrackingButton, {
      props: { reportId: "report/id", onToast },
    });
    await user.click(screen.getByRole("button", { name: "Track daily" }));

    expect(await screen.findByText(message)).toHaveClass("error");
    expect(screen.getByRole("button", { name: "Track daily" })).toBeEnabled();
    expect(fetch).toHaveBeenCalledWith("/api/reports/report%2Fid/schedule-daily", {
      method: "POST",
    });
    expect(onToast).not.toHaveBeenCalled();
  });
});
