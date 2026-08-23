import { vi } from "vitest";

export function mockFetch<T>(implementation: (...args: Parameters<typeof fetch>) => Promise<T>) {
  return vi.fn<typeof implementation>(implementation);
}

export function mockResolvedFetch<T>(response: T) {
  return vi.fn<(...args: Parameters<typeof fetch>) => Promise<T>>().mockResolvedValue(response);
}
