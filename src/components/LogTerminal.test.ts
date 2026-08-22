import { act, render, screen } from "@testing-library/svelte";
import { describe, expect, test } from "vitest";
import LogTerminal from "./LogTerminal.svelte";

describe("LogTerminal", () => {
  test("keeps a terminal-native activity line beneath streamed output", async () => {
    const { container, rerender } = render(LogTerminal, {
      props: { activity: "audit running" },
    });

    const label = screen.getByText("audit running");
    expect(label.closest(".term-line")).toBe(container.querySelector(".term-line:last-child"));
    const spinner = container.querySelector(".signal-spinner");
    expect(spinner).toHaveAttribute("aria-hidden", "true");
    expect(spinner?.querySelector(".signal-spinner__dot")).toHaveTextContent("•");
    const arcs = spinner?.querySelectorAll(".signal-spinner__arc");
    expect(arcs).toHaveLength(3);
    for (const arc of arcs ?? []) expect(arc).toHaveTextContent(")");

    await rerender({ activity: null });

    expect(screen.queryByText("audit running")).not.toBeInTheDocument();
  });

  test("color-codes only recognized report prefixes", async () => {
    const { component, container } = render(LogTerminal);

    await act(() => {
      component.clear();
      component.writeLine("[trust] listing packages");
      component.writeLine("[manual] scanning packages");
      component.writeLine("[external] checking maintainers");
      component.writeLine("[user] Done. 2 publishes by 'alice'.");
    });

    for (const kind of ["trust", "manual", "external", "user"]) {
      expect(container.querySelector(`.term-prefix--${kind}`)).toHaveTextContent(`[${kind}]`);
    }
    expect(container.querySelector(".term-line--done")).toHaveTextContent(
      "[user] Done. 2 publishes by 'alice'.",
    );
  });
});
