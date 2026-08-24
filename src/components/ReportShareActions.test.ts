import { render, screen } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import ReportShareActions from "./ReportShareActions.svelte";

describe("ReportShareActions", () => {
  test("copies the canonical report URL and builds a Bluesky intent", async () => {
    const user = userEvent.setup();
    const onToast = vi.fn<(message: string) => void>();
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
    const url = "https://npm.report/report/acme-2026-08-23-abc";

    render(ReportShareActions, {
      props: {
        url,
        orgs: ["acme"],
        latestUrl: "https://npm.report/orgs/acme",
        onToast,
      },
    });

    await user.click(screen.getByRole("button", { name: "Copy link" }));
    expect(writeText).toHaveBeenCalledWith(url);
    expect(onToast).toHaveBeenCalledWith("Link copied");

    const share = screen.getByRole("link", { name: "Share to Bluesky" });
    const intent = new URL(share.getAttribute("href")!);
    expect(intent.origin).toBe("https://bsky.app");
    expect(intent.pathname).toBe("/intent/compose");
    expect(intent.searchParams.get("text")).toBe(`npm supply-chain audit for acme: ${url}`);
    expect(share).toHaveAttribute("target", "_blank");
    expect(share).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByRole("link", { name: /View latest report/ })).toHaveAttribute(
      "href",
      "https://npm.report/orgs/acme",
    );
  });

  test("disables both actions until a saved report URL exists", () => {
    render(ReportShareActions, {
      props: { url: null, orgs: ["acme"], onToast: vi.fn<(message: string) => void>() },
    });

    expect(screen.getByRole("button", { name: "Copy link" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Share to Bluesky" })).toBeDisabled();
  });
});
