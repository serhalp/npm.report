/* eslint-disable no-underscore-dangle -- npm packuments expose publisher metadata as the documented `_npmUser` field. */
import {
  getTrustLevelName as getPackumetaTrustLevelName,
  getTrustStatus as getPackumetaTrustStatus,
  type TrustStatus as PackumetaTrustStatus,
} from "packumeta";
import type { TrustLevel, TrustStatus } from "#shared/types";

// The app groups packumeta's trusted-publishing-with/without-provenance levels
// into one "trusted publisher" bucket; provenance-only remains its own level.
const LEVEL_ORDER: Record<TrustLevel, number> = {
  stagedPublish: 3,
  trustedPublisher: 2,
  provenance: 1,
  none: 0,
};

function publisherOf(manifest: unknown): string {
  if (typeof manifest !== "object" || manifest === null) return "?";
  if (!("_npmUser" in manifest)) return "?";
  const npmUser = manifest._npmUser;
  if (typeof npmUser !== "object" || npmUser === null) return "?";
  if (!("name" in npmUser)) return "?";
  return typeof npmUser.name === "string" ? npmUser.name : "?";
}

export function getTrustLevelName(status: PackumetaTrustStatus): TrustLevel {
  const name = getPackumetaTrustLevelName(status);
  return name === "trustedPublisherWithProvenance" ? "trustedPublisher" : name;
}

export function getTrustStatus(manifest: unknown): TrustStatus {
  const status = getPackumetaTrustStatus(manifest);
  const level = getTrustLevelName(status);
  return {
    provenance: status.provenance,
    trustedPublisher: status.trustedPublisher,
    stagedPublish: status.stagedPublish,
    level,
    order: LEVEL_ORDER[level],
    publisher: publisherOf(manifest),
  };
}
