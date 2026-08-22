import { render, screen } from "@testing-library/svelte";
import { beforeEach, describe, expect, test, vi } from "vitest";
import RecentReports from "./RecentReports.svelte";
import type { RecentTrustReportsResponse } from "../lib/reportHistory";

function mockRecentReports(body: RecentTrustReportsResponse) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => body,
    }),
  );
}

describe("RecentReports", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  test("exposes its loading state", () => {
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => {})));

    render(RecentReports);

    expect(screen.getByRole("status")).toHaveTextContent("Loading recent reports…");
  });

  test("renders recent report links labeled by org set", async () => {
    mockRecentReports({
      reports: [
        {
          id: "netlify-gatsby-2026-06-27-abc12345",
          url: "/report/netlify-gatsby-2026-06-27-abc12345",
          orgs: ["gatsbyjs", "netlify"],
          capturedAt: "2026-06-27T12:00:00.000Z",
        },
        {
          id: "svelte-2026-06-26-def67890",
          url: "/report/svelte-2026-06-26-def67890",
          orgs: ["svelte"],
          capturedAt: "2026-06-26T12:00:00.000Z",
        },
      ],
    });

    render(RecentReports);

    expect(screen.getByText("Latest saved audits")).toBeInTheDocument();
    expect(
      await screen.findByRole("link", { name: "gatsbyjs, netlify report from 2026-06-27" }),
    ).toHaveAttribute("href", "/report/netlify-gatsby-2026-06-27-abc12345");
    expect(screen.getByRole("link", { name: "svelte report from 2026-06-26" })).toBeInTheDocument();
    expect(screen.getByText("2026-06-27")).toBeInTheDocument();
  });

  test("renders an empty state", async () => {
    mockRecentReports({ reports: [] });

    render(RecentReports);

    expect(await screen.findByText("No saved reports yet.")).toBeInTheDocument();
  });

  test("falls back to the empty state when recent reports cannot load", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        json: async () => ({}),
      }),
    );

    render(RecentReports);

    expect(await screen.findByText("No saved reports yet.")).toBeInTheDocument();
    expect(screen.queryByText(/Recent reports failed/)).not.toBeInTheDocument();
  });
});
