import { render, screen, waitFor } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import App from "./App.svelte";
import { auditResult } from "./test/fixtures";
import { runAudit } from "./lib/runAudit";

vi.mock("./lib/runAudit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./lib/runAudit")>();
  return {
    ...actual,
    runAudit: vi.fn(),
  };
});

const mockedRunAudit = vi.mocked(runAudit);

describe("App", () => {
  beforeEach(() => {
    mockedRunAudit.mockReset();
    vi.mocked(navigator.clipboard.writeText).mockClear();
  });

  test("validates required organizations before running", async () => {
    const user = userEvent.setup();
    render(App);

    await user.click(screen.getByRole("button", { name: "Run audit" }));

    expect(screen.getByText("Add at least one npm organization.")).toBeInTheDocument();
    expect(mockedRunAudit).not.toHaveBeenCalled();
  });

  test("runs an audit, renders results, and stores a share snapshot", async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
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

    await screen.findByRole("heading", { name: "Audit results" });
    expect(mockedRunAudit).toHaveBeenCalledWith(
      {
        orgs: ["netlify"],
        months: 12,
        all: false,
        bots: [],
        jobs: 12,
      },
      ["recent"],
      [],
      expect.any(Function),
    );

    await user.click(screen.getByRole("button", { name: "Share report" }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith("/api/reports", expect.any(Object));
    });
    expect(await screen.findByText(/netlify-2026-06-27-abc12345/)).toBeInTheDocument();
    expect(writeText).toHaveBeenCalledWith(
      "http://localhost:3000/report/netlify-2026-06-27-abc12345",
    );
  });
});
