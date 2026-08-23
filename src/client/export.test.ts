import { describe, expect, test, vi } from "vitest";
import { downloadCsv, toCsv } from "./export";

describe("export helpers", () => {
  test("quotes CSV cells and uses CRLF rows", () => {
    const csv = toCsv(
      [
        { name: "alpha", note: "plain" },
        { name: " beta ", note: 'comma, quote " and\nnewline' },
      ],
      [
        { key: "name", header: "name" },
        { key: "note", header: "note" },
      ],
    );

    expect(csv).toBe('name,note\r\nalpha,plain\r\n" beta ","comma, quote "" and\nnewline"');
  });

  test("downloads CSV through a temporary blob URL", () => {
    const createObjectURL = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test");
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    downloadCsv("report.csv", "a,b");

    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(click).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:test");
  });
});
