import { copyJson, downloadCsv, toCsv } from '../lib/export'

/** Copy-JSON + download-CSV controls shared by every report table. */
export function ExportButtons({
  json,
  csvRows,
  csvColumns,
  filenameBase,
  onToast,
}: {
  json: unknown
  csvRows: Record<string, unknown>[]
  csvColumns: { key: string; header: string }[]
  filenameBase: string
  onToast: (msg: string) => void
}) {
  return (
    <div className="group">
      <button
        className="btn btn--sm btn--ghost"
        onClick={async () => {
          try {
            await copyJson(json)
            onToast('Copied JSON to clipboard')
          } catch {
            onToast('Clipboard unavailable')
          }
        }}
      >
        Copy JSON
      </button>
      <button
        className="btn btn--sm btn--ghost"
        onClick={() => {
          const csv = toCsv(csvRows, csvColumns)
          downloadCsv(`${filenameBase}.csv`, csv)
          onToast(`Downloaded ${filenameBase}.csv`)
        }}
      >
        Download CSV
      </button>
    </div>
  )
}
