<script lang="ts">
  import DataTable from "./DataTable.svelte";
  import type { Column } from "./dataTableTypes";
  import ExportButtons from "./ExportButtons.svelte";
  import Stat from "./Stat.svelte";
  import type { ExternalReport } from "../lib/types";

  interface Props {
    report: ExternalReport;
    onToast: (message: string) => void;
  }

  let { report, onToast }: Props = $props();

  const byCols: Column<(typeof report.byUser)[number]>[] = [
    { key: "user", header: "npm user" },
    { key: "count", header: "Packages", numeric: true },
  ];

  const detailCols: Column<(typeof report.rows)[number]>[] = [
    { key: "user", header: "npm user" },
    { key: "pkg", header: "Package (publish access)" },
  ];

  let byUserCsvRows = $derived(report.byUser as unknown as Record<string, unknown>[]);
  let rowsCsvRows = $derived(report.rows as unknown as Record<string, unknown>[]);
</script>

<div>
  <div class="statgrid">
    <Stat k="External maintainers" v={report.distinctUsers} variant="risk" />
    <Stat k="Access grants" v={report.rows.length} sub="user × package" />
  </div>

  {#if report.rows.length === 0}
    <div class="empty">
      <div class="big">No external maintainers</div>
      Every current maintainer is in the supplied member list.
    </div>
  {:else}
    <div class="table-tools">
      <span class="table-meta">By user — non-members with live publish rights</span>
      <ExportButtons
        json={report.byUser}
        csvRows={byUserCsvRows}
        csvColumns={[
          { key: "user", header: "user" },
          { key: "count", header: "package_count" },
        ]}
        filenameBase="external-by-user"
        {onToast}
      />
    </div>
    <DataTable columns={byCols} rows={report.byUser} />

    <div class="table-tools table-tools--spaced">
      <span class="table-meta">Detail — {report.rows.length} access grants</span>
      <ExportButtons
        json={report.rows}
        csvRows={rowsCsvRows}
        csvColumns={[
          { key: "user", header: "user" },
          { key: "pkg", header: "package" },
        ]}
        filenameBase="external-maintainers"
        {onToast}
      />
    </div>
    <DataTable columns={detailCols} rows={report.rows} />
  {/if}
</div>
