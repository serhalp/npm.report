import { render, screen, waitFor } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import AppRouter from "./AppRouter.svelte";
import { formatDateTime } from "#client/dateFormatting";
import { auditResult, trustReport } from "./test/fixtures";
import { mockFetch, mockResolvedFetch } from "./test/mock";
import { requestUrl } from "./test/request";

const points = [
  {
    id: "one",
    url: "/report/one",
    capturedAt: "2026-07-01T12:00:00.000Z",
    total: 2,
    byLevel: trustReport.summary.byLevel,
    deprecated: 1,
    failureCount: 0,
  },
  {
    id: "two",
    url: "/report/two",
    capturedAt: "2026-07-02T12:00:00.000Z",
    total: 2,
    byLevel: trustReport.summary.byLevel,
    deprecated: 1,
    failureCount: 0,
  },
];

function reportRecord(id: string, org: string) {
  return {
    id,
    orgs: org,
    scopeLabel: "ALL org packages",
    payload: {
      ...auditResult,
      trust: {
        ...trustReport,
        summary: {
          ...trustReport.summary,
          orgs: [org],
          scopeLabel: "ALL org packages",
        },
      },
    },
    createdAt: `2026-07-0${id === "one" ? "1" : "2"}T12:00:00.000Z`,
    dailyTrackingEnabled: false,
    dailyTrackingNextRunAt: null,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

describe("AppRouter", () => {
  test("decodes report ids from direct permalink loads", async () => {
    window.history.replaceState(null, "", "/report/netlify%20report/");
    const fetchMock = mockResolvedFetch({
      ok: true,
      status: 200,
      json: async () => ({
        ...reportRecord("netlify report", "netlify"),
        scopeLabel: "last 12 months",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(AppRouter);

    expect(await screen.findByRole("heading", { name: "Audit of netlify" })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/reports/netlify%20report");
  });

  test("resolves stable normalized org-set URLs without replacing the browser URL", async () => {
    window.history.replaceState(null, "", "/orgs/Netlify,gatsbyjs");
    const record = {
      ...reportRecord("two", "gatsbyjs, netlify"),
      payload: {
        ...auditResult,
        trust: {
          ...trustReport,
          summary: { ...trustReport.summary, orgs: ["gatsbyjs", "netlify"] },
        },
      },
    };
    const fetchMock = mockFetch(async (input) =>
      requestUrl(input).startsWith("/api/reports/history")
        ? {
            ok: true,
            status: 200,
            json: async () => ({ orgs: record.payload.trust.summary.orgs, points }),
          }
        : { ok: true, status: 200, json: async () => record },
    );
    vi.stubGlobal("fetch", fetchMock);

    render(AppRouter);

    expect(
      await screen.findByRole("heading", { name: "Audit of gatsbyjs, netlify" }),
    ).toBeInTheDocument();
    expect(window.location.pathname).toBe("/orgs/Netlify,gatsbyjs");
    expect(fetchMock).toHaveBeenCalledWith("/api/reports/latest?org=gatsbyjs&org=netlify");
  });

  test("navigates between reports without remounting their shared shell", async () => {
    window.history.replaceState(null, "", "/report/one");
    let resolveSecond!: (value: {
      ok: boolean;
      status: number;
      json: () => Promise<ReturnType<typeof reportRecord>>;
    }) => void;
    const secondReport = new Promise<{
      ok: boolean;
      status: number;
      json: () => Promise<ReturnType<typeof reportRecord>>;
    }>((resolve) => {
      resolveSecond = resolve;
    });
    const fetchMock = mockFetch(async (input) => {
      const url = requestUrl(input);
      if (url === "/api/reports/one") {
        return { ok: true, status: 200, json: async () => reportRecord("one", "first") };
      }
      if (url === "/api/reports/two") {
        return secondReport;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ orgs: [url.includes("second") ? "second" : "first"], points }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    const { container } = render(AppRouter);

    const firstHeading = await screen.findByRole("heading", { name: "Audit of first" });
    const reportContent = firstHeading.closest(".shared-report-content");
    const masthead = container.querySelector(".masthead");

    await user.click(
      screen.getByRole("link", {
        name: new RegExp(`${formatDateTime(points[1].capturedAt)} report`),
      }),
    );

    expect(window.location.pathname).toBe("/report/two");
    expect(firstHeading).toBeInTheDocument();
    await waitFor(() => {
      expect(reportContent).toHaveProperty("inert", true);
      expect(screen.getByRole("main")).toHaveAttribute("aria-busy", "true");
    });
    expect(screen.getByText("Loading selected report.").closest('[role="status"]')).not.toBeNull();
    expect(
      screen.getByText("Loading selected report…").closest(".shared-route-loading"),
    ).not.toBeNull();

    resolveSecond({
      ok: true,
      status: 200,
      json: async () => reportRecord("two", "second"),
    });

    expect(await screen.findByRole("heading", { name: "Audit of second" })).toBeInTheDocument();
    expect(reportContent).toHaveProperty("inert", false);
    expect(screen.getByRole("main")).toHaveAttribute("aria-busy", "false");
    expect(screen.queryByText("Loading selected report…")).not.toBeInTheDocument();
    expect(container.querySelector(".masthead")).toBe(masthead);
    expect(fetchMock).toHaveBeenCalledWith("/api/reports/two");
    expect(screen.getByRole("main")).toHaveFocus();
  });

  test("updates app state for browser history navigation", async () => {
    window.history.replaceState(null, "", "/report/one");
    vi.stubGlobal(
      "fetch",
      mockFetch(async (input) => ({
        ok: true,
        status: 200,
        json: async () =>
          requestUrl(input).startsWith("/api/reports/history")
            ? { orgs: ["first"], points }
            : reportRecord("one", "first"),
      })),
    );

    render(AppRouter);
    expect(await screen.findByRole("heading", { name: "Audit of first" })).toBeInTheDocument();

    window.history.replaceState(null, "", "/");
    window.dispatchEvent(new PopStateEvent("popstate"));

    await waitFor(() => expect(screen.getByRole("button", { name: "Run audit" })).toBeVisible());
  });

  test("navigates to the tracked org sets page without a document reload", async () => {
    vi.stubGlobal(
      "fetch",
      mockResolvedFetch({ ok: true, status: 200, json: async () => ({ orgSets: [] }) }),
    );
    const user = userEvent.setup();

    render(AppRouter);
    await user.click(await screen.findByRole("link", { name: "Tracking 0 orgs" }));

    expect(window.location.pathname).toBe("/tracked");
    expect(await screen.findByRole("heading", { name: "Tracked org sets" })).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: "Tracking 0 orgs" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("main")).toHaveFocus();
  });
});
