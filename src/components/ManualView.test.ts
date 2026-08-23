import { render, screen } from "@testing-library/svelte";
import { describe, expect, test, vi } from "vitest";
import ManualView from "./ManualView.svelte";

describe("ManualView", () => {
  test("names its summary and detail tables and export groups", () => {
    render(ManualView, {
      props: {
        report: {
          totalScanned: 2,
          bots: ["release-bot"],
          byPublisher: [{ who: "alice", count: 1 }],
          rows: [{ when: "2026-06-01T02:03:04.000Z", who: "alice", ref: "pkg@1.0.0" }],
        },
        onToast: vi.fn<(message: string) => void>(),
      },
    });

    expect(
      screen.getByRole("table", { name: "Manual publishes by publisher" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "Manual publish detail" })).toBeInTheDocument();
    expect(
      screen.getByRole("group", { name: "Manual publishes by publisher exports" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("group", { name: "Manual publish detail exports" }),
    ).toBeInTheDocument();
  });
});
