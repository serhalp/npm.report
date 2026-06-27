import { afterEach, describe, expect, it, vi } from "vitest";
import { chunk, mapLimit } from "./concurrency";

afterEach(() => {
  vi.useRealTimers();
});

describe("concurrency helpers", () => {
  it("chunks arrays at the requested size", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 2)).toEqual([]);
  });

  it("caps concurrency while preserving result order", async () => {
    vi.useFakeTimers();
    let active = 0;
    let maxActive = 0;

    const promise = mapLimit([1, 2, 3, 4], 2, async (n, i) => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 10));
      active--;
      return `${i}:${n * 2}`;
    });

    await vi.runAllTimersAsync();

    await expect(promise).resolves.toEqual(["0:2", "1:4", "2:6", "3:8"]);
    expect(maxActive).toBe(2);
  });
});
