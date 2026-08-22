import { render, screen, within } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import type { Component } from "svelte";
import { describe, expect, test } from "vitest";
import DataTable from "./DataTable.svelte";
import type { Column } from "./dataTableTypes";

interface Row {
  name: string;
  downloads: number | null;
}

const columns: Column<Row>[] = [
  { key: "name", header: "Package" },
  { key: "downloads", header: "Downloads/wk", numeric: true },
];
const TypedDataTable = DataTable as Component<{
  caption: string;
  columns: Column<Row>[];
  rows: Row[];
}>;

function dataRows() {
  return [
    { name: "alpha", downloads: 10 },
    { name: "beta", downloads: null },
    { name: "gamma", downloads: 2 },
  ];
}

function renderedPackageOrder() {
  return screen
    .getAllByRole("row")
    .slice(1)
    .map((row) => within(row).getAllByRole("cell")[0].textContent);
}

describe("DataTable", () => {
  test("sorts numeric columns descending first, toggles ascending, and sinks nulls", async () => {
    const user = userEvent.setup();
    render(TypedDataTable, {
      props: { caption: "Package downloads", columns, rows: dataRows() },
    });

    expect(screen.getByRole("table", { name: "Package downloads" })).toBeInTheDocument();

    expect(renderedPackageOrder()).toEqual(["alpha", "beta", "gamma"]);

    await user.click(screen.getByRole("button", { name: /downloads\/wk/i }));
    expect(renderedPackageOrder()).toEqual(["alpha", "gamma", "beta"]);
    expect(screen.getByRole("button", { name: "Downloads/wk" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /downloads\/wk/i }));
    expect(renderedPackageOrder()).toEqual(["gamma", "alpha", "beta"]);
  });
});
