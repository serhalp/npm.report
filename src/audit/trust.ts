/* eslint-disable no-underscore-dangle -- npm packuments expose publisher metadata as the documented `_npmUser` field. */
import {
  getTrustLevel,
  getTrustLevelName as getPackumetaTrustLevelName,
  getTrustStatus as getPackumetaTrustStatus,
  type TrustStatus as PackumetaTrustStatus,
} from "packumeta";
import type { TrustLevel, TrustStatus } from "#shared/types";

function publisherOf(manifest: unknown): string {
  if (typeof manifest !== "object" || manifest === null) return "?";
  if (!("_npmUser" in manifest)) return "?";
  const npmUser = manifest._npmUser;
  if (typeof npmUser !== "object" || npmUser === null) return "?";
  if (!("name" in npmUser)) return "?";
  return typeof npmUser.name === "string" ? npmUser.name : "?";
}

export function getTrustLevelName(status: PackumetaTrustStatus): TrustLevel {
  return getPackumetaTrustLevelName(status);
}

export function getTrustStatus(manifest: unknown): TrustStatus {
  const status = getPackumetaTrustStatus(manifest);
  const level = getTrustLevelName(status);
  return {
    provenance: status.provenance,
    trustedPublisher: status.trustedPublisher,
    stagedPublish: status.stagedPublish,
    level,
    order: getTrustLevel(status),
    publisher: publisherOf(manifest),
  };
}
