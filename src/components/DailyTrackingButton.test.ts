import { render, screen } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import DailyTrackingButton from "./DailyTrackingButton.svelte";

afterEach(() => vi.unstubAllGlobals());

describe("DailyTrackingButton", () => {
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
