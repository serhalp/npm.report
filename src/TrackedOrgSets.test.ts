import { render, screen } from "@testing-library/svelte";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { formatCompactDateTime, formatDate, formatDateTime } from "#client/dateFormatting";
import type { TrackedOrgSetsResponse } from "#shared/reportHistory";
import { mockFetch, mockResolvedFetch } from "./test/mock";
import TrackedOrgSets from "./TrackedOrgSets.svelte";

const response: TrackedOrgSetsResponse = {
  orgSets: [
    {
      orgs: ["acme", "example"],
      nextRunAt: "2026-08-24T12:00:00.000Z",
      latest: {
        id: "acme-latest",
        url: "/report/acme-latest",
        capturedAt: "2026-08-23T12:00:00.000Z",
        total: 60,
        byLevel: { stagedPublish: 8, trustedPublisher: 16, provenance: 15, none: 21 },
        deprecated: 3,
        failureCount: 0,
      },
    },
  ],
};

describe("TrackedOrgSets", () => {
  beforeEach(() => vi.unstubAllGlobals());

  test("shows a loading state", () => {
    vi.stubGlobal(
      "fetch",
      mockFetch(() => new Promise(() => {})),
    );

    render(TrackedOrgSets);

    expect(screen.getByRole("status")).toHaveTextContent("Loading tracked orgs…");
    expect(screen.getByRole("main")).toHaveAttribute("aria-busy", "true");
  });

  test("renders every tracked set with its latest report and trust breakdown", async () => {
    vi.stubGlobal(
      "fetch",
      mockResolvedFetch({ ok: true, status: 200, json: async () => response }),
    );

    const { container } = render(TrackedOrgSets);

    expect(await screen.findByText("1 set")).toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveAttribute("aria-busy", "false");
    expect(screen.getByRole("link", { name: "acme, example" })).toHaveAttribute(
      "href",
      "/orgs/acme,example",
    );
    expect(screen.getByRole("link", { name: /View latest/ })).toHaveAttribute(
      "href",
      "/orgs/acme,example",
    );
    expect(container.querySelector(".tracked-list__summary")).toHaveTextContent("24/60 strong");
    expect(container.querySelector(".tracked-list__summary")).toHaveTextContent("39/60 any trust");
    expect(screen.getByRole("button", { name: /trust summary/i })).toBeInTheDocument();
    expect(screen.getByText(formatDate(response.orgSets[0].latest.capturedAt))).toHaveAttribute(
      "title",
      formatDateTime(response.orgSets[0].latest.capturedAt),
    );
    expect(screen.getByText(formatCompactDateTime(response.orgSets[0].nextRunAt))).toHaveAttribute(
      "title",
      formatDateTime(response.orgSets[0].nextRunAt),
    );
    expect(fetch).toHaveBeenCalledWith("/api/reports/tracked");
  });

  test("renders the empty state", async () => {
    vi.stubGlobal(
      "fetch",
      mockResolvedFetch({ ok: true, status: 200, json: async () => ({ orgSets: [] }) }),
    );

    render(TrackedOrgSets);

    expect(await screen.findByText("No org sets are tracked yet.")).toBeInTheDocument();
  });

  test("reports invalid API data", async () => {
    vi.stubGlobal(
      "fetch",
      mockResolvedFetch({ ok: true, status: 200, json: async () => ({ orgSets: "bad" }) }),
    );

    render(TrackedOrgSets);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Tracked org data is in an unexpected format.",
    );
  });
});
