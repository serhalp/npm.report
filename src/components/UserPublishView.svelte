<script lang="ts">
  import DataTable from "./DataTable.svelte";
  import type { Column } from "./dataTableTypes";
  import ExportButtons from "./ExportButtons.svelte";
  import Stat from "./Stat.svelte";
  import { formatDateTime } from "#client/dateFormatting";
  import type { UserPublishReport, UserPublishRow } from "#shared/types";

  interface Props {
    report: UserPublishReport;
    onToast: (message: string) => void;
  }

  let { report, onToast }: Props = $props();

  const columns: Column<UserPublishRow>[] = [
    {
      key: "when",
      header: "When",
      value: (row) => row.when,
      cell: (row) => formatDateTime(row.when),
    },
    { key: "ref", header: "Package@version" },
  ];

  let csvRows = $derived(report.rows as unknown as Record<string, unknown>[]);
</script>

<div>
  <div class="statgrid">
    <Stat k="Publishes" v={report.rows.length} variant="accent" />
    <Stat k="Packages scanned" v={report.scanned} />
    <Stat k="User" v={report.user} />
  </div>
  {#if report.rows.length === 0}
    <div class="empty">
      <div class="big">No publishes in window</div>
      {report.user} did not personally publish any version in the selected window across
      {report.scanned} scanned packages.
    </div>
  {:else}
    <div class="table-tools">
      <span class="table-meta">{report.rows.length} versions</span>
      <ExportButtons
        label={`Versions published by ${report.user} exports`}
        json={report.rows}
        {csvRows}
        csvColumns={[
          { key: "when", header: "when" },
          { key: "ref", header: "package_version" },
        ]}
        filenameBase={`publishes-${report.user}`}
        {onToast}
      />
    </div>
    <DataTable caption={`Versions published by ${report.user}`} {columns} rows={report.rows} />
  {/if}
</div>
