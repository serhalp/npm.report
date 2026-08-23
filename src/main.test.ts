import { afterEach, describe, expect, test, vi } from "vitest";

afterEach(() => {
  vi.resetModules();
  vi.doUnmock("svelte");
  vi.doUnmock("./AppRouter.svelte");
  document.body.innerHTML = "";
  history.replaceState(null, "", "/");
});

async function importMain() {
  document.body.innerHTML = '<div id="root"></div>';
  const mount = vi.fn<(component: unknown, options: { target: Element | null }) => unknown>();
  const AppRouter = { name: "AppRouter" };
  vi.doMock("svelte", () => ({ mount }));
  vi.doMock("./AppRouter.svelte", () => ({ default: AppRouter }));

  await import("./main");

  return { mount, AppRouter, target: document.getElementById("root") };
}

describe("main entry", () => {
  test("mounts the client router", async () => {
    const { mount, AppRouter, target } = await importMain();

    expect(mount).toHaveBeenCalledWith(AppRouter, { target });
  });

  test("throws when the root element is missing", async () => {
    vi.doMock("svelte", () => ({ mount: vi.fn<() => void>() }));
    vi.doMock("./AppRouter.svelte", () => ({ default: {} }));

    await expect(import("./main")).rejects.toThrow("Missing #root mount point");
  });
});
