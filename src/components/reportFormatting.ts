import type { TrustLevel } from "../lib/types";

export const LEVEL_ORDER: Record<TrustLevel, number> = {
  none: 0,
  provenance: 1,
  trustedPublisher: 2,
  stagedPublish: 3,
};

export const LEVEL_LABEL: Record<TrustLevel, string> = {
  none: "none",
  provenance: "provenance",
  trustedPublisher: "trusted publisher",
  stagedPublish: "staged publish",
};

export const yn = (value: boolean) => (value ? "yes" : "no");

const MS_SUFFIX_RE = /\.\d+Z$/;

export function fmtDate(iso: string): string {
  return iso ? iso.replace("T", " ").replace(MS_SUFFIX_RE, "Z") : "—";
}
