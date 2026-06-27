<script lang="ts">
  import { copyJson, downloadCsv, toCsv } from "../lib/export";

  interface Props {
    json: unknown;
    csvRows: Record<string, unknown>[];
    csvColumns: { key: string; header: string }[];
    filenameBase: string;
    onToast: (message: string) => void;
  }

  let { json, csvRows, csvColumns, filenameBase, onToast }: Props = $props();

  async function copy() {
    try {
      await copyJson(json);
      onToast("Copied JSON to clipboard");
    } catch {
      onToast("Clipboard unavailable");
    }
  }

  function download() {
    const csv = toCsv(csvRows, csvColumns);
    downloadCsv(`${filenameBase}.csv`, csv);
    onToast(`Downloaded ${filenameBase}.csv`);
  }
</script>

<div class="group">
  <button class="btn btn--sm btn--ghost" type="button" onclick={copy}>Copy JSON</button>
  <button class="btn btn--sm btn--ghost" type="button" onclick={download}>Download CSV</button>
</div>
