import { fireEvent, render, screen } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import App from "./App.svelte";
import { auditResult } from "./test/fixtures";
import { streamAudit } from "./lib/auditStream";
import { streamUserPublishes } from "./lib/userPublishStream";

// Both server-side workflows stream through these client adapters.
vi.mock("./lib/auditStream", () => ({ streamAudit: vi.fn() }));
vi.mock("./lib/userPublishStream", () => ({ streamUserPublishes: vi.fn() }));

const mockedStreamAudit = vi.mocked(streamAudit);
const mockedStreamUserPublishes = vi.mocked(streamUserPublishes);

/** Default streamAudit outcome: a completed, saved report. */
function savedOutcome(overrides = {}) {
  return {
    result: auditResult,
    reportId: "netlify-2026-06-27-abc12345",
    reportUrl: "/report/netlify-2026-06-27-abc12345",
    ...overrides,
  };
}

describe("App", () => {
  beforeEach(() => {
    mockedStreamAudit.mockReset();
    mockedStreamUserPublishes.mockReset();
    vi.unstubAllGlobals();
    vi.mocked(navigator.clipboard.writeText).mockClear();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ orgs: [], points: [] }),
      }),
    );
  });

  afterEach(() => vi.unstubAllGlobals());

  test("validates required organizations before running", async () => {
    const user = userEvent.setup();
    render(App);

    await user.click(screen.getByRole("button", { name: "Run audit" }));

    expect(screen.getByText("Add at least one npm organization.")).toBeInTheDocument();
    expect(mockedStreamAudit).not.toHaveBeenCalled();
  });

  test("defaults to all scope and shows history only for all-scope org sets", async () => {
    const user = userEvent.setup();
    render(App);

    const limitScope = screen.getByRole("checkbox", { name: "Limit to recent packages" });
    expect(limitScope).not.toBeChecked();
    expect(screen.queryByRole("spinbutton", { name: "Window (months)" })).not.toBeInTheDocument();

    await user.type(screen.getByPlaceholderText(/nuxt, vue/i), "netlify{Enter}");
    expect(await screen.findByText("No history yet")).toBeInTheDocument();

    await user.click(limitScope);
    expect(screen.getByRole("spinbutton", { name: "Window (months)" })).toBeEnabled();
    expect(screen.queryByRole("heading", { name: "Progress over time" })).not.toBeInTheDocument();
  });

  test("validates that at least one report is selected", async () => {
    const user = userEvent.setup();
    render(App);

    await user.type(screen.getByPlaceholderText(/nuxt, vue/i), "netlify{Enter}");
    await user.click(screen.getByRole("checkbox", { name: /^package trust level\b/i }));
    await user.click(screen.getByRole("checkbox", { name: /^manual\b/i }));
    await user.click(screen.getByRole("button", { name: "Run audit" }));

    expect(screen.getByText("Select at least one report.")).toBeInTheDocument();
    expect(mockedStreamAudit).not.toHaveBeenCalled();
  });

  test("validates that external reports require pasted members", async () => {
    const user = userEvent.setup();
    render(App);

    await user.type(screen.getByPlaceholderText(/nuxt, vue/i), "netlify{Enter}");
    await user.click(screen.getByRole("checkbox", { name: /^package trust level\b/i }));
    await user.click(screen.getByRole("checkbox", { name: /^manual\b/i }));
    await user.click(screen.getByRole("checkbox", { name: /^external\b/i }));
    await user.click(screen.getByRole("button", { name: "Run audit" }));

    expect(screen.getByText(/external report needs your npm org member list/i)).toBeInTheDocument();
    expect(mockedStreamAudit).not.toHaveBeenCalled();
  });

  test("passes parsed external members into the audit request", async () => {
    const user = userEvent.setup();
    mockedStreamAudit.mockResolvedValue(
      savedOutcome({
        result: { ...auditResult, external: { rows: [], distinctUsers: 0, byUser: [] } },
      }),
    );
    render(App);

    await user.type(screen.getByPlaceholderText(/nuxt, vue/i), "netlify{Enter}");
    await user.click(screen.getByRole("checkbox", { name: /^external\b/i }));
    await fireEvent.input(screen.getByLabelText(/org membership/i), {
      target: { value: '{"Alice": "owner", "bob": "developer"}' },
    });
    await user.click(screen.getByRole("button", { name: "Run audit" }));

    await screen.findByRole("heading", { name: "Audit results" });
    expect(mockedStreamAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        orgs: ["netlify"],
        kinds: ["trust", "manual", "external"],
        members: ["alice", "bob"],
      }),
      expect.any(Function),
    );
  });

  test("explains the privacy boundary for external membership input", async () => {
    const user = userEvent.setup();
    render(App);

    await user.click(screen.getByRole("checkbox", { name: /^external\b/i }));

    expect(
      screen.getByText(/member list is used only for this audit and is not persisted/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/derived external findings are included in the saved report/i),
    ).toBeInTheDocument();
  });

  test("streams an audit, renders results, shows the saved link, and copies it on request", async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === "/api/reports/netlify-2026-06-27-abc12345/schedule-daily") {
        return {
          ok: true,
          json: async () => ({
            orgs: ["netlify"],
            enabled: true,
            nextRunAt: "2026-06-28T12:00:00.000Z",
            lastRunAt: null,
            lastReportId: "netlify-2026-06-27-abc12345",
            consecutiveFailures: 0,
          }),
        };
      }
      return { ok: true, json: async () => ({ orgs: ["netlify"], points: [] }) };
    });
    const scrollIntoView = vi.fn();
    Object.defineProperty(window.HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });
    mockedStreamAudit.mockResolvedValue(savedOutcome());
    vi.stubGlobal("fetch", fetchMock);

    render(App);

    await user.type(screen.getByPlaceholderText(/nuxt, vue/i), "netlify{Enter}");
    await user.click(screen.getByRole("button", { name: "Run audit" }));

    const resultsHeading = await screen.findByRole("heading", { name: "Audit results" });
    expect(screen.getByText("Report ready")).toBeInTheDocument();
    expect(
      screen.getByText("2 package trust rows · 1 manual publish · 1 fetch warning"),
    ).toBeInTheDocument();
    expect(mockedStreamAudit).toHaveBeenCalledWith(
      {
        orgs: ["netlify"],
        kinds: ["trust", "manual"],
        months: 12,
        all: true,
        bots: ["GitHub Actions"],
        members: [],
      },
      expect.any(Function),
    );

    await user.click(screen.getByRole("button", { name: "View report" }));
    expect(scrollIntoView).toHaveBeenCalledWith(
      expect.objectContaining({ behavior: "smooth", block: "start" }),
    );
    expect(resultsHeading).toHaveFocus();

    expect(await screen.findByText(/netlify-2026-06-27-abc12345/)).toBeInTheDocument();
    expect(screen.getByText("Saved automatically after this run.")).toBeInTheDocument();
    expect(screen.getByText("Package trust only.")).toBeInTheDocument();
    expect(writeText).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Track daily" }));
    expect(fetch).toHaveBeenCalledWith("/api/reports/netlify-2026-06-27-abc12345/schedule-daily", {
      method: "POST",
    });
    expect(
      await screen.findByRole("status", {
        name: "Tracking daily, next run 2026-06-28 12:00Z",
      }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Tracking daily" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Copy link" }));
    expect(writeText).toHaveBeenCalledWith(
      "http://localhost:3000/report/netlify-2026-06-27-abc12345",
    );
    expect(await screen.findByText("Link copied")).toBeInTheDocument();
  });

  test("surfaces a server-side save failure inline", async () => {
    const user = userEvent.setup();
    mockedStreamAudit.mockResolvedValue(
      savedOutcome({
        reportId: undefined,
        reportUrl: undefined,
        saveError: "could not save report",
      }),
    );

    render(App);

    await user.type(screen.getByPlaceholderText(/nuxt, vue/i), "netlify{Enter}");
    await user.click(screen.getByRole("button", { name: "Run audit" }));
    await screen.findByRole("heading", { name: "Audit results" });

    expect(
      await screen.findByText("Report link unavailable: could not save report"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy link" })).toBeDisabled();
  });

  test("surfaces a streamed audit failure and leaves the form usable", async () => {
    const user = userEvent.setup();
    mockedStreamAudit.mockRejectedValue(new Error("registry unavailable"));

    render(App);

    await user.type(screen.getByPlaceholderText(/nuxt, vue/i), "netlify{Enter}");
    await user.click(screen.getByRole("button", { name: "Run audit" }));

    expect(await screen.findByText("registry unavailable")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run audit" })).toBeEnabled();
    expect(screen.queryByRole("heading", { name: "Audit results" })).not.toBeInTheDocument();
  });

  test("reports clipboard failures when copying a saved report link", async () => {
    const user = userEvent.setup();
    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockRejectedValue(new Error("denied"));
    mockedStreamAudit.mockResolvedValue(savedOutcome());

    render(App);

    await user.type(screen.getByPlaceholderText(/nuxt, vue/i), "netlify{Enter}");
    await user.click(screen.getByRole("button", { name: "Run audit" }));
    await screen.findByRole("heading", { name: "Audit results" });
    expect(await screen.findByText(/netlify-2026-06-27-abc12345/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Copy link" }));

    expect(await screen.findByText("Clipboard unavailable")).toBeInTheDocument();
    expect(writeText).toHaveBeenCalledWith(
      "http://localhost:3000/report/netlify-2026-06-27-abc12345",
    );
  });

  test("shows terminal activity for both streamed operations", async () => {
    const user = userEvent.setup();
    const audit = Promise.withResolvers<ReturnType<typeof savedOutcome>>();
    mockedStreamAudit.mockReturnValue(audit.promise);

    render(App);

    await user.type(screen.getByPlaceholderText(/nuxt, vue/i), "netlify{Enter}");
    await user.click(screen.getByRole("button", { name: "Run audit" }));

    expect(await screen.findByText("audit running")).toBeInTheDocument();

    audit.resolve(savedOutcome());
    await screen.findByRole("heading", { name: "Audit results" });
    expect(screen.queryByText("audit running")).not.toBeInTheDocument();

    const lookup = Promise.withResolvers<{
      user: string;
      scanned: number;
      rows: { when: string; ref: string }[];
    }>();
    mockedStreamUserPublishes.mockReturnValue(lookup.promise);
    await user.type(screen.getByLabelText("npm username"), "alice");
    await user.click(screen.getByRole("button", { name: "Look up" }));

    expect(await screen.findByText("user publish scan running")).toBeInTheDocument();

    lookup.resolve({
      user: "alice",
      scanned: 1,
      rows: [{ when: "2026-06-01T00:00:00.000Z", ref: "alpha@1.0.0" }],
    });
    expect(await screen.findByText("alpha@1.0.0")).toBeInTheDocument();
    expect(screen.queryByText("user publish scan running")).not.toBeInTheDocument();
  });

  test("runs user publish lookup with packages from the streamed result", async () => {
    const user = userEvent.setup();
    mockedStreamAudit.mockResolvedValue(savedOutcome());
    mockedStreamUserPublishes.mockResolvedValue({
      user: "alice",
      scanned: 2,
      rows: [{ when: "2026-06-01T00:00:00.000Z", ref: "alpha@1.0.0" }],
    });

    render(App);

    await user.type(screen.getByPlaceholderText(/nuxt, vue/i), "netlify{Enter}");
    await user.click(screen.getByRole("button", { name: "Run audit" }));
    await screen.findByRole("heading", { name: "Audit results" });
    await user.type(screen.getByLabelText("npm username"), "alice");
    await user.click(screen.getByRole("button", { name: "Look up" }));

    expect(mockedStreamUserPublishes).toHaveBeenCalledWith(
      { user: "alice", months: 12, useCachePackages: ["alpha", "beta"] },
      expect.any(Function),
    );
    expect(await screen.findByText("alpha@1.0.0")).toBeInTheDocument();
  });

  test("surfaces a streamed user-publish failure and leaves lookup usable", async () => {
    const user = userEvent.setup();
    mockedStreamUserPublishes.mockRejectedValue(new Error("npm unavailable"));

    render(App);

    await user.type(screen.getByLabelText("npm username"), "alice");
    await user.click(screen.getByRole("button", { name: "Look up" }));

    expect(await screen.findByText("npm unavailable")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Look up" })).toBeEnabled();
  });
});
