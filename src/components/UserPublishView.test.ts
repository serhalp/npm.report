import { render, screen } from "@testing-library/svelte";
import { describe, expect, test, vi } from "vitest";
import { formatDateTime } from "#client/dateFormatting";
import UserPublishView from "./UserPublishView.svelte";

describe("UserPublishView", () => {
  test("renders the empty state with the scanned package count", () => {
    render(UserPublishView, {
      props: {
        report: { user: "alice", scanned: 4, rows: [] },
        onToast: vi.fn<(message: string) => void>(),
      },
    });

    expect(screen.getByText("No publishes in window")).toBeInTheDocument();
    expect(screen.getByText(/alice did not personally publish/)).toBeInTheDocument();
    expect(screen.getByText(/4 scanned packages/)).toBeInTheDocument();
  });

  test("renders publish rows with formatted dates", () => {
    render(UserPublishView, {
      props: {
        report: {
          user: "alice",
          scanned: 2,
          rows: [{ when: "2026-06-01T02:03:04.000Z", ref: "pkg@1.0.0" }],
        },
        onToast: vi.fn<(message: string) => void>(),
      },
    });

    expect(screen.getByText("1 versions")).toBeInTheDocument();
    expect(screen.getByText(formatDateTime("2026-06-01T02:03:04.000Z"))).toBeInTheDocument();
    expect(screen.getByText("pkg@1.0.0")).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "Versions published by alice" })).toBeInTheDocument();
    expect(
      screen.getByRole("group", { name: "Versions published by alice exports" }),
    ).toBeInTheDocument();
  });
});
