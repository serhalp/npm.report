<script lang="ts" generics="T">
  import type { Column, SortValue } from "./dataTableTypes";

  type Dir = "asc" | "desc";

  let { caption, columns, rows }: { caption: string; columns: Column<T>[]; rows: T[] } = $props();

  let sortKey: string | null = $state(null);
  let dir: Dir = $state("desc");

  function defaultValue(row: T, key: string): SortValue {
    const value = (row as Record<string, unknown>)[key];
    if (value == null) return null;
    if (typeof value === "number" || typeof value === "string") return value;
    if (typeof value === "boolean") return value ? 1 : 0;
    return String(value);
  }

  function getSortValue(row: T, column: Column<T>): SortValue {
    return column.value ? column.value(row) : defaultValue(row, column.key);
  }

  let sorted = $derived.by(() => {
    if (!sortKey) return rows;
    const column = columns.find((item) => item.key === sortKey);
    if (!column) return rows;

    const direction = dir === "asc" ? 1 : -1;
    return rows.toSorted((a, b) => {
      if (column.compare) return column.compare(a, b) * direction;
      const av = getSortValue(a, column);
      const bv = getSortValue(b, column);

      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number") {
        return (av - bv) * direction;
      }
      return String(av).localeCompare(String(bv)) * direction;
    });
  });

  function sort(column: Column<T>) {
    if (sortKey === column.key) {
      dir = dir === "asc" ? "desc" : "asc";
      return;
    }
    sortKey = column.key;
    dir = "desc";
  }

  function cellFor(row: T, column: Column<T>) {
    const raw = column.cell ? column.cell(row) : getSortValue(row, column);
    if (raw && typeof raw === "object") return raw;
    return { text: raw };
  }

  function textFor(value: string | number | null): string {
    if (value == null) return "—";
    if (typeof value === "number") return value.toLocaleString();
    return value;
  }
</script>

<div class="table-scroll">
  <table class="data">
    <caption class="sr-only">{caption}</caption>
    <thead>
      <tr>
        {#each columns as column (column.key)}
          <th
            class:num={column.numeric}
            aria-sort={sortKey === column.key
              ? dir === "asc"
                ? "ascending"
                : "descending"
              : "none"}
          >
            <button type="button" class="sort-button" title="Sort" onclick={() => sort(column)}>
              {column.header}
              {#if sortKey === column.key}
                <span class="arrow" aria-hidden="true">{dir === "asc" ? "↑" : "↓"}</span>
              {/if}
            </button>
          </th>
        {/each}
      </tr>
    </thead>
    <tbody>
      {#each sorted as row, rowIndex (rowIndex)}
        <tr>
          {#each columns as column (column.key)}
            {@const cell = cellFor(row, column)}
            <td class:num={column.numeric}>
              {#if cell.dateTime}
                <time datetime={cell.dateTime} title={cell.title} class={cell.className}
                  >{textFor(cell.text)}</time
                >
              {:else if cell.badgeClass}
                <span class={`badge ${cell.badgeClass}`}>{textFor(cell.text)}</span>
              {:else if cell.flag}
                <span class="flag">{textFor(cell.text)}</span>
              {:else if cell.muted || cell.text == null}
                <span class="muted">{textFor(cell.text)}</span>
              {:else}
                <span class={cell.className}>{textFor(cell.text)}</span>
              {/if}
            </td>
          {/each}
        </tr>
      {/each}
    </tbody>
  </table>
</div>
