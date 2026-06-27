import { useState } from "react";

/** Chip-style multi-value input. Commit on Enter, comma, or blur. */
export function TagInput({
  values,
  onChange,
  placeholder,
  lowercase,
}: {
  values: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  lowercase?: boolean;
}) {
  const [draft, setDraft] = useState("");

  const commit = (raw: string) => {
    const parts = raw
      .split(/[,\n]+/)
      .map((s) => (lowercase ? s.trim().toLowerCase() : s.trim()))
      .filter(Boolean);
    if (parts.length === 0) return;
    const next = [...values];
    for (const p of parts) if (!next.includes(p)) next.push(p);
    onChange(next);
    setDraft("");
  };

  const remove = (v: string) => onChange(values.filter((x) => x !== v));

  return (
    <div
      className="taginput"
      onClick={(e) => {
        const input = (e.currentTarget as HTMLElement).querySelector("input");
        input?.focus();
      }}
    >
      {values.map((v) => (
        <span className="chip" key={v}>
          {v}
          <button type="button" aria-label={`Remove ${v}`} onClick={() => remove(v)}>
            ×
          </button>
        </span>
      ))}
      <input
        type="text"
        value={draft}
        placeholder={values.length === 0 ? placeholder : ""}
        onChange={(e) => {
          const val = e.target.value;
          if (val.endsWith(",")) commit(val);
          else setDraft(val);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit(draft);
          } else if (e.key === "Backspace" && draft === "" && values.length) {
            remove(values[values.length - 1]);
          }
        }}
        onBlur={() => draft.trim() && commit(draft)}
      />
    </div>
  );
}
