/* eslint-disable no-underscore-dangle -- npm packuments expose publisher metadata as the documented `_npmUser` field. */
import type { TrustLevel, TrustStatus } from "./types";

// ---------------------------------------------------------------------------
// Trust logic — reimplemented VERBATIM from github.com/43081j/packumeta
// (getTrustStatus + getTrustLevelName), matching the jq block in npm-audit.sh
// 1:1. Operates on a single per-version registry manifest.
//
//   provenance       = dist.attestations.provenance truthy
//   trustedPublisher = _npmUser.trustedPublisher truthy (OIDC; publisher shows
//                      as "GitHub Actions")
//   stagedPublish    = _npmUser.approver truthy
//   level: stagedPublish(3) > trustedPublisher(2, = trustedPublisher && provenance)
//          > provenance(1) > none(0)
//
// Intentionally NOT ported (not needed here): didDecreaseInTrust,
// isSupportedArchitecture, getTrustOrder.
// ---------------------------------------------------------------------------

interface VersionManifest {
  _npmUser?: {
    name?: string;
    trustedPublisher?: unknown;
    approver?: unknown;
  };
  dist?: {
    attestations?: {
      provenance?: unknown;
    };
  };
}

// jq's `truthy` def: (. != null) and (. != false). Mirror it exactly so that
// e.g. an empty object or empty string counts as truthy, same as jq.
function truthy(v: unknown): boolean {
  return v != null && v !== false;
}

const LEVEL_ORDER: Record<TrustLevel, number> = {
  none: 0,
  provenance: 1,
  trustedPublisher: 2,
  stagedPublish: 3,
};

export function getTrustLevelName(s: {
  provenance: boolean;
  trustedPublisher: boolean;
  stagedPublish: boolean;
}): TrustLevel {
  if (s.stagedPublish) return "stagedPublish";
  if (s.trustedPublisher && s.provenance) return "trustedPublisher";
  if (s.provenance) return "provenance";
  return "none";
}

export function getTrustStatus(manifest: VersionManifest): TrustStatus {
  const provenance = truthy(manifest.dist?.attestations?.provenance);
  const trustedPublisher = truthy(manifest._npmUser?.trustedPublisher);
  const stagedPublish = truthy(manifest._npmUser?.approver);
  const level = getTrustLevelName({ provenance, trustedPublisher, stagedPublish });
  return {
    provenance,
    trustedPublisher,
    stagedPublish,
    level,
    order: LEVEL_ORDER[level],
    publisher: manifest._npmUser?.name ?? "?",
  };
}
