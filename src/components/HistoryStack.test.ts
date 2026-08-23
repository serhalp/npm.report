import { fireEvent, render, screen } from "@testing-library/svelte";
import { describe, expect, test } from "vitest";
import { formatDate } from "../lib/dateFormatting";
import type { ReportTrustHistoryPoint } from "../lib/reportHistory";
import HistoryStack from "./HistoryStack.svelte";

const point: ReportTrustHistoryPoint = {
  id: "one",
  url: "/report/one",
  capturedAt: "2026-07-01T12:00:00.000Z",
  total: 10,
  byLevel: { stagedPublish: 1, trustedPublisher: 2, provenance: 3, none: 4 },
  deprecated: 0,
  failureCount: 0,
};

describe("HistoryStack", () => {
  test("exposes each segment through focus and dismisses the tooltip with Escape", async () => {
    render(HistoryStack, { props: { point } });
    const stack = screen.getByRole("button", {
      name: new RegExp(`${formatDate(point.capturedAt)} trust summary`, "i"),
    });

    await fireEvent.focus(stack);
    expect(screen.getByRole("tooltip")).toHaveTextContent("Staged publish 1 (10%)");

    await fireEvent.keyDown(stack, { key: "ArrowRight" });
    expect(screen.getByRole("tooltip")).toHaveTextContent("Trusted publisher 2 (20%)");

    await fireEvent.keyDown(stack, { key: "ArrowLeft" });
    expect(screen.getByRole("tooltip")).toHaveTextContent("Staged publish 1 (10%)");

    await fireEvent.keyDown(stack, { key: "Escape" });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  test("keeps pointer disclosure active until the stack and tooltip region is left", async () => {
    const { container } = render(HistoryStack, { props: { point } });
    const provenance = screen.getByRole("img", { name: "Provenance only: 3 (30%)" });

    await fireEvent.pointerEnter(provenance);
    expect(screen.getByRole("tooltip")).toHaveTextContent("Provenance only 3 (30%)");

    await fireEvent.pointerLeave(container.querySelector(".history-stack-wrap")!);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });
});
