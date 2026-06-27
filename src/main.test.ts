import { afterEach, describe, expect, test, vi } from "vitest";

afterEach(() => {
  vi.resetModules();
  vi.doUnmock("svelte");
  vi.doUnmock("./App.svelte");
  vi.doUnmock("./SharedReport.svelte");
  document.body.innerHTML = "";
  history.replaceState(null, "", "/");
});

async function importMainAt(path: string) {
  document.body.innerHTML = '<div id="root"></div>';
  history.replaceState(null, "", path);
  const mount = vi.fn();
  const App = { name: "App" };
  const SharedReport = { name: "SharedReport" };
  vi.doMock("svelte", () => ({ mount }));
  vi.doMock("./App.svelte", () => ({ default: App }));
  vi.doMock("./SharedReport.svelte", () => ({ default: SharedReport }));

  await import("./main");

  return { mount, App, SharedReport, target: document.getElementById("root") };
}

describe("main entry", () => {
  test("mounts the live app outside shared report routes", async () => {
    const { mount, App, target } = await importMainAt("/");

    expect(mount).toHaveBeenCalledWith(App, { target });
  });

  test("mounts decoded shared report ids on /report/:id", async () => {
    const { mount, SharedReport, target } = await importMainAt("/report/netlify%20report/");

    expect(mount).toHaveBeenCalledWith(SharedReport, {
      target,
      props: { id: "netlify report" },
    });
  });

  test("throws when the root element is missing", async () => {
    vi.doMock("svelte", () => ({ mount: vi.fn() }));
    vi.doMock("./App.svelte", () => ({ default: {} }));
    vi.doMock("./SharedReport.svelte", () => ({ default: {} }));

    await expect(import("./main")).rejects.toThrow("Missing #root mount point");
  });
});
