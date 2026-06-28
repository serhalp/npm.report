import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import App from "./App.svelte";
import { auditResult } from "./test/fixtures";
import { runAudit } from "./lib/runAudit";
import { runUserPublishes } from "./lib/reports";

vi.mock("./lib/runAudit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./lib/runAudit")>();
  return {
    ...actual,
    runAudit: vi.fn(),
  };
});

vi.mock("./lib/reports", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./lib/reports")>();
  return {
    ...actual,
    runUserPublishes: vi.fn(),
  };
});

const mockedRunAudit = vi.mocked(runAudit);
const mockedRunUserPublishes = vi.mocked(runUserPublishes);

describe("App", () => {
  beforeEach(() => {
    mockedRunAudit.mockReset();
    mockedRunUserPublishes.mockReset();
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

  test("validates required organizations before running", async () => {
    const user = userEvent.setup();
    render(App);

    await user.click(screen.getByRole("button", { name: "Run audit" }));

    expect(screen.getByText("Add at least one npm organization.")).toBeInTheDocument();
    expect(mockedRunAudit).not.toHaveBeenCalled();
  });

  test("defaults to all scope and shows history only for all-scope org sets", async () => {
    const user = userEvent.setup();
    render(App);

    const limitScope = screen.getByRole("checkbox", { name: "Limit to recent packages" });
    expect(limitScope).not.toBeChecked();
    expect(screen.queryByRole("spinbutton", { name: "Window (months)" })).not.toBeInTheDocument();

    await user.type(screen.getByPlaceholderText(/netlify, gatsbyjs/i), "netlify{Enter}");
    expect(await screen.findByText("No history yet")).toBeInTheDocument();

    await user.click(limitScope);
    expect(screen.getByRole("spinbutton", { name: "Window (months)" })).toBeEnabled();
    expect(screen.queryByRole("heading", { name: "Progress over time" })).not.toBeInTheDocument();
  });

  test("validates that at least one report is selected", async () => {
    const user = userEvent.setup();
    render(App);

    await user.type(screen.getByPlaceholderText(/netlify, gatsbyjs/i), "netlify{Enter}");
    await user.click(screen.getByRole("checkbox", { name: /^package trust level\b/i }));
    await user.click(screen.getByRole("checkbox", { name: /^manual\b/i }));
    await user.click(screen.getByRole("button", { name: "Run audit" }));

    expect(screen.getByText("Select at least one report.")).toBeInTheDocument();
    expect(mockedRunAudit).not.toHaveBeenCalled();
  });

  test("validates external-only reports require pasted members", async () => {
    const user = userEvent.setup();
    render(App);

    await user.type(screen.getByPlaceholderText(/netlify, gatsbyjs/i), "netlify{Enter}");
    await user.click(screen.getByRole("checkbox", { name: /^package trust level\b/i }));
    await user.click(screen.getByRole("checkbox", { name: /^manual\b/i }));
    await user.click(screen.getByRole("checkbox", { name: /^external\b/i }));
    await user.click(screen.getByRole("button", { name: "Run audit" }));

    expect(screen.getByText(/external report needs your npm org member list/i)).toBeInTheDocument();
    expect(mockedRunAudit).not.toHaveBeenCalled();
  });

  test("passes parsed external members into audit runs", async () => {
    const user = userEvent.setup();
    mockedRunAudit.mockResolvedValue({
      ...auditResult,
      external: { rows: [], distinctUsers: 0, byUser: [] },
    });
    render(App);

    await user.type(screen.getByPlaceholderText(/netlify, gatsbyjs/i), "netlify{Enter}");
    await user.click(screen.getByRole("checkbox", { name: /^external\b/i }));
    await fireEvent.input(screen.getByLabelText(/org membership/i), {
      target: { value: '{"Alice": "owner", "bob": "developer"}' },
    });
    await user.click(screen.getByRole("button", { name: "Run audit" }));

    await screen.findByRole("heading", { name: "Audit results" });
    expect(mockedRunAudit).toHaveBeenCalledWith(
      expect.objectContaining({ orgs: ["netlify"] }),
      ["recent", "manual", "external"],
      ["alice", "bob"],
      expect.any(Function),
    );
  });

  test("runs an audit, renders results, saves a report link, and copies it on request", async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      if (String(input) === "/api/reports") {
        return {
          ok: true,
          json: async () => ({ id: "netlify-2026-06-27-abc12345" }),
        };
      }
      return {
        ok: true,
        json: async () => ({ orgs: ["netlify"], points: [] }),
      };
    });
    const scrollIntoView = vi.fn();
    Object.defineProperty(window.HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });
    mockedRunAudit.mockResolvedValue(auditResult);
    vi.stubGlobal("fetch", fetchMock);

    render(App);

    await user.type(screen.getByPlaceholderText(/netlify, gatsbyjs/i), "netlify{Enter}");
    await user.click(screen.getByRole("button", { name: "Run audit" }));

    const resultsHeading = await screen.findByRole("heading", { name: "Audit results" });
    expect(screen.getByText("Report ready")).toBeInTheDocument();
    expect(
      screen.getByText("2 package trust rows · 1 manual publish · 1 fetch warning"),
    ).toBeInTheDocument();
    expect(mockedRunAudit).toHaveBeenCalledWith(
      {
        orgs: ["netlify"],
        months: 12,
        all: true,
        bots: ["GitHub Actions"],
        jobs: 12,
      },
      ["recent", "manual"],
      [],
      expect.any(Function),
    );

    await user.click(screen.getByRole("button", { name: "View report" }));
    expect(scrollIntoView).toHaveBeenCalledWith(
      expect.objectContaining({ behavior: "smooth", block: "start" }),
    );
    expect(resultsHeading).toHaveFocus();

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith("/api/reports", expect.any(Object));
    });
    const shareCall = fetchMock.mock.calls.find(([input]) => String(input) === "/api/reports");
    expect(shareCall).toBeDefined();
    const shareBody = JSON.parse(String((shareCall![1] as RequestInit).body));
    expect(shareBody).toMatchObject({
      orgs: ["netlify"],
      scope: "all",
      scopeLabel: "ALL org packages",
      payload: auditResult,
    });
    expect(typeof shareBody.capturedAt).toBe("string");
    expect(await screen.findByText(/netlify-2026-06-27-abc12345/)).toBeInTheDocument();
    expect(screen.getByText("Saved automatically after this run.")).toBeInTheDocument();
    expect(writeText).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Copy link" }));

    expect(writeText).toHaveBeenCalledWith(
      "http://localhost:3000/report/netlify-2026-06-27-abc12345",
    );
    expect(await screen.findByText("Link copied")).toBeInTheDocument();
  });

  test("surfaces automatic report save failures inline", async () => {
    const user = userEvent.setup();
    mockedRunAudit.mockResolvedValue(auditResult);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input) === "/api/reports") {
          return {
            ok: false,
            status: 500,
          };
        }
        return {
          ok: true,
          json: async () => ({ orgs: ["netlify"], points: [] }),
        };
      }),
    );

    render(App);

    await user.type(screen.getByPlaceholderText(/netlify, gatsbyjs/i), "netlify{Enter}");
    await user.click(screen.getByRole("button", { name: "Run audit" }));
    await screen.findByRole("heading", { name: "Audit results" });

    expect(
      await screen.findByText("Report link unavailable: Save failed (500)"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy link" })).toBeDisabled();
  });

  test("reports clipboard failures when copying a saved report link", async () => {
    const user = userEvent.setup();
    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockRejectedValue(new Error("denied"));
    mockedRunAudit.mockResolvedValue(auditResult);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input) === "/api/reports") {
          return {
            ok: true,
            json: async () => ({ id: "netlify-2026-06-27-abc12345" }),
          };
        }
        return {
          ok: true,
          json: async () => ({ orgs: ["netlify"], points: [] }),
        };
      }),
    );

    render(App);

    await user.type(screen.getByPlaceholderText(/netlify, gatsbyjs/i), "netlify{Enter}");
    await user.click(screen.getByRole("button", { name: "Run audit" }));
    await screen.findByRole("heading", { name: "Audit results" });
    expect(await screen.findByText(/netlify-2026-06-27-abc12345/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Copy link" }));

    expect(await screen.findByText("Clipboard unavailable")).toBeInTheDocument();
    expect(writeText).toHaveBeenCalledWith(
      "http://localhost:3000/report/netlify-2026-06-27-abc12345",
    );
  });

  test("runs user publish lookup with packages from the recent cache", async () => {
    const user = userEvent.setup();
    mockedRunAudit.mockResolvedValue(auditResult);
    mockedRunUserPublishes.mockResolvedValue({
      user: "alice",
      scanned: 2,
      rows: [{ when: "2026-06-01T00:00:00.000Z", ref: "alpha@1.0.0" }],
    });

    render(App);

    await user.type(screen.getByPlaceholderText(/netlify, gatsbyjs/i), "netlify{Enter}");
    await user.click(screen.getByRole("button", { name: "Run audit" }));
    await screen.findByRole("heading", { name: "Audit results" });
    await user.type(screen.getByLabelText("npm username"), "alice");
    await user.click(screen.getByRole("button", { name: "Look up" }));

    expect(mockedRunUserPublishes).toHaveBeenCalledWith(
      "alice",
      12,
      12,
      ["alpha", "beta"],
      expect.anything(),
      expect.any(Function),
    );
    expect(await screen.findByText("alpha@1.0.0")).toBeInTheDocument();
  });
});
