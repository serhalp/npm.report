<script lang="ts">
  import DataTable from "./DataTable.svelte";
  import type { Column } from "./dataTableTypes";
  import ExportButtons from "./ExportButtons.svelte";
  import Stat from "./Stat.svelte";
  import { formatDate, formatDateTime } from "#client/dateFormatting";
  import type { TrustReport, TrustRow } from "#shared/types";
  import { LEVEL_LABEL, LEVEL_ORDER, yn } from "./reportFormatting";

  interface Props {
    report: TrustReport;
    onToast: (message: string) => void;
  }

  let { report, onToast }: Props = $props();

  let rows = $derived(report.rows);
  let summary = $derived(report.summary);
  let scopeNote = $derived(
    summary.scopeLabel === "ALL org packages" ? undefined : summary.scopeLabel,
  );

  const columns: Column<TrustRow>[] = [
    { key: "pkg", header: "Package" },
    { key: "version", header: "Version" },
    {
      key: "level",
      header: "Trust level",
      value: (row) => LEVEL_ORDER[row.level],
      cell: (row) => ({
        text: LEVEL_LABEL[row.level],
        badgeClass: `badge--${row.level}`,
      }),
    },
    { key: "publisher", header: "Publisher" },
    {
      key: "downloads",
      header: "Downloads/wk",
      numeric: true,
      value: (row) => row.downloads,
      cell: (row) => row.downloads ?? { text: "?", muted: true },
    },
    {
      key: "latestPublish",
      header: "Latest publish",
      value: (row) => row.latestPublish,
      cell: (row) => ({
        text: formatDate(row.latestPublish),
        dateTime: row.latestPublish,
        title: formatDateTime(row.latestPublish),
      }),
    },
    {
      key: "deprecated",
      header: "Deprecated",
      value: (row) => (row.deprecated ? 1 : 0),
      cell: (row) =>
        row.deprecated ? { text: "DEPRECATED", flag: true } : { text: "—", muted: true },
    },
  ];

  const csvColumns = [
    { key: "pkg", header: "package" },
    { key: "latestPublish", header: "latest_publish_iso" },
    { key: "version", header: "latest_version" },
    { key: "level", header: "trust_level" },
    { key: "provenance", header: "provenance" },
    { key: "trustedPublisher", header: "trustedPublisher" },
    { key: "stagedPublish", header: "stagedPublish" },
    { key: "publisher", header: "publisher" },
    { key: "deprecated", header: "deprecated" },
    { key: "downloads", header: "downloads_last_week" },
  ];

  let csvRows = $derived(
    rows.map((row) => ({
      pkg: row.pkg,
      latestPublish: row.latestPublish,
      version: row.version,
      level: row.level,
      publisher: row.publisher,
      provenance: yn(row.provenance),
      trustedPublisher: yn(row.trustedPublisher),
      stagedPublish: yn(row.stagedPublish),
      deprecated: yn(row.deprecated),
      downloads: row.downloads ?? "?",
    })),
  );
</script>

<div>
  <div class="statgrid">
    <Stat k="In scope" v={summary.total} sub={scopeNote} />
    <Stat k="Staged publish" v={summary.byLevel.stagedPublish} variant="accent" />
    <Stat k="Trusted publisher" v={summary.byLevel.trustedPublisher} variant="accent" />
    <Stat k="Provenance only" v={summary.byLevel.provenance} />
    <Stat k="No trust signal" v={summary.byLevel.none} variant="risk" />
    <Stat k="Deprecated latest" v={summary.deprecated} />
  </div>
  <div class="table-tools">
    <span class="table-meta" role="status" aria-live="polite" aria-atomic="true">
      {rows.length} packages · click a column to sort
    </span>
    <ExportButtons
      json={report}
      {csvRows}
      {csvColumns}
      filenameBase="package-trust-level"
      label="Package trust level report exports"
      {onToast}
    />
  </div>
  <DataTable {columns} {rows} caption="Package trust level report" />
</div>
