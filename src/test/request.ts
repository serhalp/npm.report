export function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if ("url" in input) return input.url;
  return input.href;
}
