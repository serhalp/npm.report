import { render, screen } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import ExportButtons from "./ExportButtons.svelte";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ExportButtons", () => {
  test("copies JSON and reports success or clipboard failure", async () => {
    const user = userEvent.setup();
    const onToast = vi.fn<(message: string) => void>();
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
    render(ExportButtons, {
      props: {
        label: "Recent package exports",
        json: { pkg: "alpha" },
        csvRows: [],
        csvColumns: [],
        filenameBase: "recent",
        onToast,
      },
    });

    expect(screen.getByRole("group", { name: "Recent package exports" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Copy JSON" }));

    expect(writeText).toHaveBeenCalledWith('{\n  "pkg": "alpha"\n}');
    expect(onToast).toHaveBeenCalledWith("Copied JSON to clipboard");

    writeText.mockRejectedValueOnce(new Error("denied"));
    await user.click(screen.getByRole("button", { name: "Copy JSON" }));

    expect(onToast).toHaveBeenLastCalledWith("Clipboard unavailable");
  });

  test("downloads CSV and reports the generated filename", async () => {
    const user = userEvent.setup();
    const onToast = vi.fn<(message: string) => void>();
    const createObjectURL = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test");
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    render(ExportButtons, {
      props: {
        label: "Recent package exports",
        json: {},
        csvRows: [{ pkg: "alpha", downloads: 10 }],
        csvColumns: [
          { key: "pkg", header: "package" },
          { key: "downloads", header: "downloads" },
        ],
        filenameBase: "recent-packages",
        onToast,
      },
    });

    await user.click(screen.getByRole("button", { name: "Download CSV" }));

    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(click).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:test");
    expect(onToast).toHaveBeenCalledWith("Downloaded recent-packages.csv");
  });
});
