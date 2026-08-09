/* eslint-disable no-underscore-dangle -- npm packuments expose publisher metadata as the documented `_npmUser` field. */
import { mapLimit } from "./concurrency.ts";
import { resolveMeta, listOrgPackages } from "./discovery.ts";
import { fetchWeeklyDownloads } from "./downloads.ts";
import { FailureLog, npmGetJson, pkgUrl, toEpoch, versionUrl } from "./npmClient.ts";
import { getTrustStatus } from "./trust.ts";
import type {
  AuditConfig,
  ExternalReport,
  ExternalRow,
  ManualReport,
  ManualRow,
  PkgMeta,
  TrustReport,
  TrustRow,
  TrustLevel,
  UserPublishReport,
  UserPublishRow,
} from "./types.ts";

export type LogFn = (msg: string) => void;

/** ISO-8601 cutoff `months` calendar-months before now (UTC). */
export function cutoffIso(months: number): string {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() - months);
  return d.toISOString();
}

/** ISO-8601 UTC sorts lexically, so a string compare against the cutoff works. */
function inScope(meta: PkgMeta[], config: AuditConfig): PkgMeta[] {
  if (config.all) return meta.filter((m) => m.version !== "");
  const cutoff = cutoffIso(config.months);
  return meta.filter((m) => m.version !== "" && m.publishedAt >= cutoff);
}

// ---------------------------------------------------------------------------
// trust: trust status of each in-scope package's `latest` release.
// ---------------------------------------------------------------------------

/**
 * Shared discovery step: org package list -> latest version + recency +
 * deprecated -> in-scope subset. Used by `trust` (which then adds trust +
 * downloads) and by `manual` (which only needs the package names — col1 of the
 * cache in the shell version).
 */
export async function discoverInScope(
  config: AuditConfig,
  failures: FailureLog,
  log: LogFn,
): Promise<PkgMeta[]> {
  log(`[trust] listing packages in: ${config.orgs.join(" ")}`);
  const pkgs = await listOrgPackages(config.orgs, failures);
  log(`[trust] ${pkgs.length} packages; checking latest release metadata...`);
  const meta = await resolveMeta(pkgs, failures, (d, t) => log(`[trust]   resolved ${d}/${t}`));
  const scope = inScope(meta, config);
  const scopeLabel = config.all ? "ALL org packages" : `last ${config.months} months`;
  log(`[trust] in scope (${scopeLabel}): ${scope.length} packages`);
  return scope;
}

export async function runTrust(
  config: AuditConfig,
  failures: FailureLog,
  log: LogFn,
  scope?: PkgMeta[],
): Promise<TrustReport> {
  const inScopeMeta = scope ?? (await discoverInScope(config, failures, log));
  log(`[trust] checking trust status (${inScopeMeta.length})...`);

  let done = 0;
  const rows: TrustRow[] = await mapLimit(inScopeMeta, config.jobs, async (m) => {
    const manifest = await npmGetJson<Record<string, unknown>>(
      versionUrl(m.name, m.version),
      failures,
      5,
    );
    if (!manifest) {
      // A missing per-version manifest (404 or exhausted retries) would make the
      // package read as trust "none" instead of "unknown" — a silently wrong
      // classification. Fail the whole report rather than assert a bad level.
      throw new Error(
        `Could not fetch the manifest for ${m.name}@${m.version}; the trust report would be incomplete.`,
      );
    }
    const trust = getTrustStatus(manifest);
    done++;
    if (done % 25 === 0 || done === inScopeMeta.length)
      log(`[trust]   trust ${done}/${inScopeMeta.length}`);
    return {
      pkg: m.name,
      latestPublish: m.publishedAt,
      version: m.version,
      level: trust.level,
      provenance: trust.provenance,
      trustedPublisher: trust.trustedPublisher,
      stagedPublish: trust.stagedPublish,
      publisher: trust.publisher,
      deprecated: m.deprecated,
      downloads: null,
    };
  });

  // Weekly downloads (the api.npmjs.org token bucket — bulk unscoped, paced scoped).
  const nScoped = rows.filter((r) => r.pkg.startsWith("@")).length;
  log(`[trust] fetching weekly downloads (${nScoped} scoped)...`);
  const dl = await fetchWeeklyDownloads(
    rows.map((r) => r.pkg),
    failures,
    (d, t) => {
      if (d % 20 === 0 || d === t) log(`[trust]   downloads ${d}/${t}`);
    },
  );
  for (const r of rows) {
    r.downloads = dl.has(r.pkg) ? dl.get(r.pkg)! : null;
  }

  // Sort newest-first (shell sorts the cache by col2 desc).
  rows.sort((a, b) => (a.latestPublish < b.latestPublish ? 1 : -1));

  const byLevel: Record<TrustLevel, number> = {
    stagedPublish: 0,
    trustedPublisher: 0,
    provenance: 0,
    none: 0,
  };
  for (const r of rows) byLevel[r.level]++;

  const summary = {
    scopeLabel: config.all ? "ALL org packages" : `last ${config.months} months`,
    orgs: config.orgs,
    total: rows.length,
    provenance: rows.filter((r) => r.provenance).length,
    trustedPublisher: rows.filter((r) => r.trustedPublisher).length,
    stagedPublish: rows.filter((r) => r.stagedPublish).length,
    deprecated: rows.filter((r) => r.deprecated).length,
    byLevel,
  };
  log(
    `[trust] provenance=${summary.provenance} trustedPublisher=${summary.trustedPublisher} stagedPublish=${summary.stagedPublish} deprecated=${summary.deprecated} of ${summary.total}`,
  );
  return { rows, summary };
}

// ---------------------------------------------------------------------------
// manual: who published manually (non-bot account) in the window.
// ---------------------------------------------------------------------------

interface Packument {
  name?: string;
  versions?: Record<string, { _npmUser?: { name?: string } }>;
  time?: Record<string, string>;
}

export async function runManual(
  config: AuditConfig,
  packages: string[],
  failures: FailureLog,
  log: LogFn,
): Promise<ManualReport> {
  const cutoff = toEpoch(cutoffIso(config.months))!;
  log(
    `[manual] scanning ${packages.length} packages for publishes in last ${config.months} months...`,
  );
  let done = 0;
  const nested: ManualRow[][] = await mapLimit(packages, config.jobs, async (pkg) => {
    const doc = await npmGetJson<Packument>(pkgUrl(pkg), failures, 5);
    done++;
    if (done % 25 === 0 || done === packages.length)
      log(`[manual]   scanned ${done}/${packages.length}`);
    if (!doc || !doc.versions) return [];
    const rows: ManualRow[] = [];
    for (const [ver, vMeta] of Object.entries(doc.versions)) {
      const iso = doc.time?.[ver];
      if (!iso) continue;
      const e = toEpoch(iso);
      if (e == null || e < cutoff) continue;
      rows.push({
        when: iso,
        who: vMeta._npmUser?.name ?? "?",
        ref: `${doc.name ?? pkg}@${ver}`,
      });
    }
    return rows;
  });

  const all = nested.flat().sort((a, b) => (a.when < b.when ? 1 : -1));
  const botSet = new Set(config.bots.map((b) => b.trim()).filter(Boolean));
  const human = all.filter((r) => !botSet.has(r.who));

  const counts = new Map<string, number>();
  for (const r of human) counts.set(r.who, (counts.get(r.who) ?? 0) + 1);
  const byPublisher = Array.from(counts.entries(), ([who, count]) => ({ who, count })).sort(
    (a, b) => b.count - a.count,
  );

  log(`[manual] ${human.length} manual publishes (of ${all.length} scanned)`);
  return {
    rows: human,
    totalScanned: all.length,
    bots: [...botSet],
    byPublisher,
  };
}

// ---------------------------------------------------------------------------
// external: users who can publish now but aren't org members.
// ---------------------------------------------------------------------------

interface MaintainerDoc {
  name?: string;
  maintainers?: { name?: string }[];
}

export async function runExternal(
  config: AuditConfig,
  members: string[],
  failures: FailureLog,
  log: LogFn,
): Promise<ExternalReport> {
  const memberSet = new Set(members.map((m) => m.toLowerCase()));
  log(`[external] listing all packages in: ${config.orgs.join(" ")}`);
  const pkgs = await listOrgPackages(config.orgs, failures);
  log(`[external] scanning ${pkgs.length} packages for current maintainers...`);
  let done = 0;
  const nested: ExternalRow[][] = await mapLimit(pkgs, config.jobs, async (pkg) => {
    const doc = await npmGetJson<MaintainerDoc>(pkgUrl(pkg), failures, 5);
    done++;
    if (done % 25 === 0 || done === pkgs.length) log(`[external]   scanned ${done}/${pkgs.length}`);
    if (!doc || !doc.maintainers) return [];
    const name = doc.name ?? pkg;
    return doc.maintainers
      .map((mt) => mt.name)
      .filter((n): n is string => !!n)
      .map((user) => ({ user, pkg: name }));
  });

  // Dedupe (user, pkg) pairs.
  const seen = new Set<string>();
  const pairs: ExternalRow[] = [];
  for (const p of nested.flat()) {
    const key = `${p.user}\t${p.pkg}`;
    if (seen.has(key)) continue;
    seen.add(key);
    pairs.push(p);
  }

  const external = pairs.filter((p) => !memberSet.has(p.user.toLowerCase()));
  external.sort((a, b) =>
    a.user === b.user ? (a.pkg < b.pkg ? -1 : 1) : a.user < b.user ? -1 : 1,
  );

  const counts = new Map<string, number>();
  for (const p of external) counts.set(p.user, (counts.get(p.user) ?? 0) + 1);
  const byUser = Array.from(counts.entries(), ([user, count]) => ({ user, count })).sort(
    (a, b) => b.count - a.count,
  );

  log(`[external] ${byUser.length} external maintainer account(s)`);
  return { rows: external, distinctUsers: byUser.length, byUser };
}

// ---------------------------------------------------------------------------
// user-publishes: versions a specific npm user personally published in the
// window (port of npm-user-publishes.sh). Universe = the user's own maintained
// packages plus an optional extra package set (e.g. an org's recent cache).
// ---------------------------------------------------------------------------

export async function runUserPublishes(
  username: string,
  months: number,
  jobs: number,
  extraPackages: string[],
  failures: FailureLog,
  log: LogFn,
): Promise<UserPublishReport> {
  const cutoff = toEpoch(cutoffIso(months))!;
  const universe = new Set<string>();

  const ownBody = await npmGetJson<Record<string, unknown>>(
    `https://registry.npmjs.org/-/user/${encodeURIComponent(username)}/package`,
    failures,
  );
  if (ownBody && typeof ownBody === "object") {
    for (const n of Object.keys(ownBody)) universe.add(n);
  }
  for (const n of extraPackages) universe.add(n);
  const all = [...universe].toSorted();

  log(
    `[user] scanning ${all.length} packages for versions published by '${username}' (last ${months} months)...`,
  );
  let done = 0;
  const nested: UserPublishRow[][] = await mapLimit(all, jobs, async (pkg) => {
    const doc = await npmGetJson<Packument>(pkgUrl(pkg), failures);
    done++;
    if (done % 25 === 0 || done === all.length) log(`[user]   scanned ${done}/${all.length}`);
    if (!doc || !doc.versions) return [];
    const rows: UserPublishRow[] = [];
    for (const [ver, vMeta] of Object.entries(doc.versions)) {
      if (vMeta._npmUser?.name !== username) continue;
      const iso = doc.time?.[ver];
      if (!iso) continue;
      const e = toEpoch(iso);
      if (e == null || e < cutoff) continue;
      rows.push({ when: iso, ref: `${doc.name ?? pkg}@${ver}` });
    }
    return rows;
  });

  const rows = nested.flat().sort((a, b) => (a.when < b.when ? 1 : -1));
  log(`[user] Done. ${rows.length} publishes by '${username}'.`);
  return { user: username, scanned: all.length, rows };
}
