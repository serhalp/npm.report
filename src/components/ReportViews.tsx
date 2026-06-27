import type {
  ExternalReport,
  ManualReport,
  RecentReport,
  TrustLevel,
  UserPublishReport,
} from '../lib/types'
import { DataTable, type Column } from './DataTable'
import { ExportButtons } from './ExportButtons'

const yn = (b: boolean) => (b ? 'yes' : 'no')

const LEVEL_ORDER: Record<TrustLevel, number> = {
  none: 0,
  provenance: 1,
  trustedPublisher: 2,
  stagedPublish: 3,
}

const LEVEL_LABEL: Record<TrustLevel, string> = {
  none: 'none',
  provenance: 'provenance',
  trustedPublisher: 'trusted publisher',
  stagedPublish: 'staged publish',
}

function fmtDate(iso: string): string {
  return iso ? iso.replace('T', ' ').replace(/\.\d+Z$/, 'Z') : '—'
}

function Stat({
  k,
  v,
  sub,
  variant,
}: {
  k: string
  v: string | number
  sub?: string
  variant?: 'accent' | 'risk'
}) {
  return (
    <div className={`stat${variant ? ` stat--${variant}` : ''}`}>
      <div className="k">{k}</div>
      <div className="v">
        {typeof v === 'number' ? v.toLocaleString() : v}
        {sub ? <small> {sub}</small> : null}
      </div>
    </div>
  )
}

// ---- recent ----------------------------------------------------------------

export function RecentView({
  report,
  onToast,
}: {
  report: RecentReport
  onToast: (m: string) => void
}) {
  const { rows, summary } = report
  const columns: Column<(typeof rows)[number]>[] = [
    { key: 'pkg', header: 'Package' },
    { key: 'version', header: 'Version' },
    {
      key: 'level',
      header: 'Trust level',
      value: (r) => LEVEL_ORDER[r.level],
      render: (r) => (
        <span className={`badge badge--${r.level}`}>{LEVEL_LABEL[r.level]}</span>
      ),
    },
    { key: 'publisher', header: 'Publisher' },
    {
      key: 'downloads',
      header: 'Downloads/wk',
      numeric: true,
      value: (r) => r.downloads,
      render: (r) =>
        r.downloads == null ? (
          <span className="muted">?</span>
        ) : (
          r.downloads.toLocaleString()
        ),
    },
    {
      key: 'latestPublish',
      header: 'Latest publish',
      value: (r) => r.latestPublish,
      render: (r) => fmtDate(r.latestPublish),
    },
    {
      key: 'deprecated',
      header: 'Deprecated',
      value: (r) => (r.deprecated ? 1 : 0),
      render: (r) =>
        r.deprecated ? <span className="flag">DEPRECATED</span> : <span className="muted">—</span>,
    },
  ]

  const csvColumns = [
    { key: 'pkg', header: 'package' },
    { key: 'latestPublish', header: 'latest_publish_iso' },
    { key: 'version', header: 'latest_version' },
    { key: 'level', header: 'trust_level' },
    { key: 'provenance', header: 'provenance' },
    { key: 'trustedPublisher', header: 'trustedPublisher' },
    { key: 'stagedPublish', header: 'stagedPublish' },
    { key: 'publisher', header: 'publisher' },
    { key: 'deprecated', header: 'deprecated' },
    { key: 'downloads', header: 'downloads_last_week' },
  ]
  const csvRows = rows.map((r) => ({
    ...r,
    provenance: yn(r.provenance),
    trustedPublisher: yn(r.trustedPublisher),
    stagedPublish: yn(r.stagedPublish),
    deprecated: yn(r.deprecated),
    downloads: r.downloads ?? '?',
  }))

  return (
    <div>
      <div className="statgrid">
        <Stat k="In scope" v={summary.total} sub={summary.scopeLabel} />
        <Stat k="Staged publish" v={summary.byLevel.stagedPublish} variant="accent" />
        <Stat k="Trusted publisher" v={summary.byLevel.trustedPublisher} variant="accent" />
        <Stat k="Provenance only" v={summary.byLevel.provenance} />
        <Stat k="No trust signal" v={summary.byLevel.none} variant="risk" />
        <Stat k="Deprecated latest" v={summary.deprecated} />
      </div>
      <div className="table-tools">
        <span className="table-meta">
          {rows.length} packages · click a column to sort · trust logic from
          packumeta (43081j)
        </span>
        <ExportButtons
          json={report}
          csvRows={csvRows}
          csvColumns={csvColumns}
          filenameBase="recent-packages"
          onToast={onToast}
        />
      </div>
      <DataTable columns={columns} rows={rows} />
    </div>
  )
}

// ---- manual ----------------------------------------------------------------

export function ManualView({
  report,
  onToast,
}: {
  report: ManualReport
  onToast: (m: string) => void
}) {
  const detailCols: Column<(typeof report.rows)[number]>[] = [
    { key: 'when', header: 'When', value: (r) => r.when, render: (r) => fmtDate(r.when) },
    { key: 'who', header: 'Publisher' },
    { key: 'ref', header: 'Package@version' },
  ]
  const byCols: Column<(typeof report.byPublisher)[number]>[] = [
    { key: 'who', header: 'Publisher' },
    { key: 'count', header: 'Publishes', numeric: true },
  ]

  return (
    <div>
      <div className="statgrid">
        <Stat k="Manual publishes" v={report.rows.length} variant="risk" />
        <Stat k="Total scanned" v={report.totalScanned} />
        <Stat k="Distinct publishers" v={report.byPublisher.length} />
        <Stat
          k="Excluded bots"
          v={report.bots.length}
          sub={report.bots.length ? report.bots.join(', ') : 'none'}
        />
      </div>

      {report.rows.length === 0 ? (
        <div className="empty">
          <div className="big">No manual publishes found</div>
          Every in-window publish came from an excluded CI/bot account.
        </div>
      ) : (
        <>
          <div className="table-tools">
            <span className="table-meta">By publisher</span>
            <ExportButtons
              json={report.byPublisher}
              csvRows={report.byPublisher as unknown as Record<string, unknown>[]}
              csvColumns={[
                { key: 'who', header: 'publisher' },
                { key: 'count', header: 'publishes' },
              ]}
              filenameBase="manual-by-publisher"
              onToast={onToast}
            />
          </div>
          <DataTable columns={byCols} rows={report.byPublisher} />

          <div className="table-tools" style={{ marginTop: 22 }}>
            <span className="table-meta">Detail — {report.rows.length} publishes</span>
            <ExportButtons
              json={report.rows}
              csvRows={report.rows as unknown as Record<string, unknown>[]}
              csvColumns={[
                { key: 'when', header: 'when' },
                { key: 'who', header: 'publisher' },
                { key: 'ref', header: 'package_version' },
              ]}
              filenameBase="manual-publishes"
              onToast={onToast}
            />
          </div>
          <DataTable columns={detailCols} rows={report.rows} />
        </>
      )}
    </div>
  )
}

// ---- external --------------------------------------------------------------

export function ExternalView({
  report,
  onToast,
}: {
  report: ExternalReport
  onToast: (m: string) => void
}) {
  const byCols: Column<(typeof report.byUser)[number]>[] = [
    { key: 'user', header: 'npm user' },
    { key: 'count', header: 'Packages', numeric: true },
  ]
  const detailCols: Column<(typeof report.rows)[number]>[] = [
    { key: 'user', header: 'npm user' },
    { key: 'pkg', header: 'Package (publish access)' },
  ]

  return (
    <div>
      <div className="statgrid">
        <Stat k="External maintainers" v={report.distinctUsers} variant="risk" />
        <Stat k="Access grants" v={report.rows.length} sub="user × package" />
      </div>

      {report.rows.length === 0 ? (
        <div className="empty">
          <div className="big">No external maintainers</div>
          Every current maintainer is in the supplied member list.
        </div>
      ) : (
        <>
          <div className="table-tools">
            <span className="table-meta">By user — non-members with live publish rights</span>
            <ExportButtons
              json={report.byUser}
              csvRows={report.byUser as unknown as Record<string, unknown>[]}
              csvColumns={[
                { key: 'user', header: 'user' },
                { key: 'count', header: 'package_count' },
              ]}
              filenameBase="external-by-user"
              onToast={onToast}
            />
          </div>
          <DataTable columns={byCols} rows={report.byUser} />

          <div className="table-tools" style={{ marginTop: 22 }}>
            <span className="table-meta">Detail — {report.rows.length} access grants</span>
            <ExportButtons
              json={report.rows}
              csvRows={report.rows as unknown as Record<string, unknown>[]}
              csvColumns={[
                { key: 'user', header: 'user' },
                { key: 'pkg', header: 'package' },
              ]}
              filenameBase="external-maintainers"
              onToast={onToast}
            />
          </div>
          <DataTable columns={detailCols} rows={report.rows} />
        </>
      )}
    </div>
  )
}

// ---- user publishes --------------------------------------------------------

export function UserPublishView({
  report,
  onToast,
}: {
  report: UserPublishReport
  onToast: (m: string) => void
}) {
  const cols: Column<(typeof report.rows)[number]>[] = [
    { key: 'when', header: 'When', value: (r) => r.when, render: (r) => fmtDate(r.when) },
    { key: 'ref', header: 'Package@version' },
  ]
  return (
    <div>
      <div className="statgrid">
        <Stat k="Publishes" v={report.rows.length} variant="accent" />
        <Stat k="Packages scanned" v={report.scanned} />
        <Stat k="User" v={report.user} />
      </div>
      {report.rows.length === 0 ? (
        <div className="empty">
          <div className="big">No publishes in window</div>
          {report.user} did not personally publish any version in the selected
          window across {report.scanned} scanned packages.
        </div>
      ) : (
        <>
          <div className="table-tools">
            <span className="table-meta">{report.rows.length} versions</span>
            <ExportButtons
              json={report.rows}
              csvRows={report.rows as unknown as Record<string, unknown>[]}
              csvColumns={[
                { key: 'when', header: 'when' },
                { key: 'ref', header: 'package_version' },
              ]}
              filenameBase={`publishes-${report.user}`}
              onToast={onToast}
            />
          </div>
          <DataTable columns={cols} rows={report.rows} />
        </>
      )}
    </div>
  )
}
