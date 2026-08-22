import { render, screen } from "@testing-library/svelte";
import { describe, expect, test, vi } from "vitest";
import ExternalView from "./ExternalView.svelte";

describe("ExternalView", () => {
  test("renders the empty state when every maintainer is a member", () => {
    render(ExternalView, {
      props: {
        report: { rows: [], distinctUsers: 0, byUser: [] },
        onToast: vi.fn(),
      },
    });

    expect(screen.getByText("No external maintainers")).toBeInTheDocument();
    expect(screen.getAllByText("0")).toHaveLength(2);
  });

  test("renders by-user and detail tables for non-member publish access", () => {
    render(ExternalView, {
      props: {
        report: {
          distinctUsers: 1,
          byUser: [{ user: "mallory", count: 2 }],
          rows: [
            { user: "mallory", pkg: "alpha" },
            { user: "mallory", pkg: "beta" },
          ],
        },
        onToast: vi.fn(),
      },
    });

    expect(screen.getByText("By user — non-members with live publish rights")).toBeInTheDocument();
    expect(screen.getByText("Detail — 2 access grants")).toBeInTheDocument();
    expect(screen.getAllByText("mallory")).toHaveLength(3);
    expect(screen.getByText("alpha")).toBeInTheDocument();
    expect(screen.getByText("beta")).toBeInTheDocument();
    expect(
      screen.getByRole("table", { name: "External maintainers by npm user" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("table", { name: "External maintainer package access" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("group", { name: "External maintainers by npm user exports" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("group", { name: "External maintainer package access exports" }),
    ).toBeInTheDocument();
  });
});
