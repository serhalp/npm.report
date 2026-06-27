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
    vi.mocked(navigator.clipboard.writeText).mockClear();
    vi.unstubAllGlobals();
  });

  test("validates required organizations before running", async () => {
    const user = userEvent.setup();
    render(App);

    await user.click(screen.getByRole("button", { name: "Run audit" }));

    expect(screen.getByText("Add at least one npm organization.")).toBeInTheDocument();
    expect(mockedRunAudit).not.toHaveBeenCalled();
  });

  test("validates that at least one report is selected", async () => {
    const user = userEvent.setup();
    render(App);

    await user.type(screen.getByPlaceholderText(/netlify, gatsbyjs/i), "netlify{Enter}");
    await user.click(screen.getByRole("checkbox", { name: /recent/i }));
    await user.click(screen.getByRole("checkbox", { name: /manual/i }));
    await user.click(screen.getByRole("button", { name: "Run audit" }));

    expect(screen.getByText("Select at least one report.")).toBeInTheDocument();
    expect(mockedRunAudit).not.toHaveBeenCalled();
  });

  test("validates external-only reports require pasted members", async () => {
    const user = userEvent.setup();
    render(App);

    await user.type(screen.getByPlaceholderText(/netlify, gatsbyjs/i), "netlify{Enter}");
    await user.click(screen.getByRole("checkbox", { name: /recent/i }));
    await user.click(screen.getByRole("checkbox", { name: /manual/i }));
    await user.click(screen.getByRole("checkbox", { name: /external/i }));
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
    await user.click(screen.getByRole("checkbox", { name: /external/i }));
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

  test("runs an audit, renders results, and stores a share snapshot", async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
    const scrollIntoView = vi.fn();
    Object.defineProperty(window.HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });
    mockedRunAudit.mockResolvedValue(auditResult);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ id: "netlify-2026-06-27-abc12345" }),
      }),
    );

    render(App);

    await user.type(screen.getByPlaceholderText(/netlify, gatsbyjs/i), "netlify{Enter}");
    await user.click(screen.getByRole("button", { name: "Run audit" }));

    const resultsHeading = await screen.findByRole("heading", { name: "Audit results" });
    expect(screen.getByText("Report ready")).toBeInTheDocument();
    expect(
      screen.getByText("2 recent packages · 1 manual publish · 1 fetch warning"),
    ).toBeInTheDocument();
    expect(mockedRunAudit).toHaveBeenCalledWith(
      {
        orgs: ["netlify"],
        months: 12,
        all: false,
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

    await user.click(screen.getByRole("button", { name: "Share report" }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith("/api/reports", expect.any(Object));
    });
    expect(await screen.findByText(/netlify-2026-06-27-abc12345/)).toBeInTheDocument();
    expect(writeText).toHaveBeenCalledWith(
      "http://localhost:3000/report/netlify-2026-06-27-abc12345",
    );
  });

  test("surfaces share failures as a toast", async () => {
    const user = userEvent.setup();
    mockedRunAudit.mockResolvedValue(auditResult);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      }),
    );

    render(App);

    await user.type(screen.getByPlaceholderText(/netlify, gatsbyjs/i), "netlify{Enter}");
    await user.click(screen.getByRole("button", { name: "Run audit" }));
    await screen.findByRole("heading", { name: "Audit results" });
    await user.click(screen.getByRole("button", { name: "Share report" }));

    expect(await screen.findByText("Share failed (500)")).toBeInTheDocument();
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
