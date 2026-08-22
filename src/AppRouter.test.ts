import { render, screen, waitFor } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import AppRouter from "./AppRouter.svelte";
import { auditResult, trustReport } from "./test/fixtures";

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
    const fetchMock = vi.fn().mockResolvedValue({
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
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
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

    expect(await screen.findByRole("heading", { name: "Audit of first" })).toBeInTheDocument();
    const masthead = container.querySelector(".masthead");

    await user.click(screen.getByRole("link", { name: /2026-07-02 report/ }));

    expect(window.location.pathname).toBe("/report/two");
    expect(screen.getByRole("heading", { name: "Audit of first" })).toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveAttribute("aria-busy", "true");

    resolveSecond({
      ok: true,
      status: 200,
      json: async () => reportRecord("two", "second"),
    });

    expect(await screen.findByRole("heading", { name: "Audit of second" })).toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveAttribute("aria-busy", "false");
    expect(container.querySelector(".masthead")).toBe(masthead);
    expect(fetchMock).toHaveBeenCalledWith("/api/reports/two");
    expect(screen.getByRole("main")).toHaveFocus();
  });

  test("updates app state for browser history navigation", async () => {
    window.history.replaceState(null, "", "/report/one");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => ({
        ok: true,
        status: 200,
        json: async () =>
          String(input).startsWith("/api/reports/history")
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
});
