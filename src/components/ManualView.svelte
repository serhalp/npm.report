<script lang="ts">
  import DataTable from "./DataTable.svelte";
  import type { Column } from "./dataTableTypes";
  import ExportButtons from "./ExportButtons.svelte";
  import Stat from "./Stat.svelte";
  import { formatDateTime } from "../lib/dateFormatting";
  import type { ManualReport, ManualRow } from "../lib/types";

  interface Props {
    report: ManualReport;
    onToast: (message: string) => void;
  }

  let { report, onToast }: Props = $props();

  const detailCols: Column<ManualRow>[] = [
    {
      key: "when",
      header: "When",
      value: (row) => row.when,
      cell: (row) => formatDateTime(row.when),
    },
    { key: "who", header: "Publisher" },
    { key: "ref", header: "Package@version" },
  ];

  const byCols: Column<(typeof report.byPublisher)[number]>[] = [
    { key: "who", header: "Publisher" },
    { key: "count", header: "Publishes", numeric: true },
  ];

  let byPublisherCsvRows = $derived(report.byPublisher as unknown as Record<string, unknown>[]);
  let rowsCsvRows = $derived(report.rows as unknown as Record<string, unknown>[]);
</script>

<div>
  <div class="statgrid">
    <Stat k="Manual publishes" v={report.rows.length} variant="risk" />
    <Stat k="Total scanned" v={report.totalScanned} />
    <Stat k="Distinct publishers" v={report.byPublisher.length} />
    <Stat
      k="Excluded bots"
      v={report.bots.length}
      sub={report.bots.length ? report.bots.join(", ") : "none"}
    />
  </div>

  {#if report.rows.length === 0}
    <div class="empty">
      <div class="big">No manual publishes found</div>
      Every in-window publish came from an excluded CI/bot account.
    </div>
  {:else}
    <div class="table-tools">
      <span class="table-meta">By publisher</span>
      <ExportButtons
        label="Manual publishes by publisher exports"
        json={report.byPublisher}
        csvRows={byPublisherCsvRows}
        csvColumns={[
          { key: "who", header: "publisher" },
          { key: "count", header: "publishes" },
        ]}
        filenameBase="manual-by-publisher"
        {onToast}
      />
    </div>
    <DataTable caption="Manual publishes by publisher" columns={byCols} rows={report.byPublisher} />

    <div class="table-tools table-tools--spaced">
      <span class="table-meta">Detail — {report.rows.length} publishes</span>
      <ExportButtons
        label="Manual publish detail exports"
        json={report.rows}
        csvRows={rowsCsvRows}
        csvColumns={[
          { key: "when", header: "when" },
          { key: "who", header: "publisher" },
          { key: "ref", header: "package_version" },
        ]}
        filenameBase="manual-publishes"
        {onToast}
      />
    </div>
    <DataTable caption="Manual publish detail" columns={detailCols} rows={report.rows} />
  {/if}
</div>
