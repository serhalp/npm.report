<script lang="ts">
  interface Props {
    values: string[];
    onChange: (next: string[]) => void;
    placeholder?: string;
    lowercase?: boolean;
    id?: string;
    ariaInvalid?: boolean;
    ariaDescribedby?: string;
  }

  let {
    values,
    onChange,
    placeholder = "",
    lowercase = false,
    id,
    ariaInvalid = false,
    ariaDescribedby,
  }: Props = $props();

  let draft = $state("");
  let announcement = $state("");

  function commit(raw: string) {
    const parts = raw
      .split(/[,\n]+/)
      .map((value) => (lowercase ? value.trim().toLowerCase() : value.trim()))
      .filter(Boolean);

    if (parts.length === 0) return;

    const next = [...values];
    const added: string[] = [];
    for (const part of parts) {
      if (!next.includes(part)) {
        next.push(part);
        added.push(part);
      }
    }
    onChange(next);
    draft = "";
    if (added.length > 0) announcement = `Added ${added.join(", ")}.`;
  }

  function remove(value: string) {
    onChange(values.filter((item) => item !== value));
    announcement = `Removed ${value}.`;
  }
</script>

<div class="taginput">
  {#each values as value (value)}
    <span class="chip">
      {value}
      <button
        type="button"
        aria-label={`Remove ${value}`}
        onclick={(event) => {
          event.stopPropagation();
          remove(value);
        }}
      >
        ×
      </button>
    </span>
  {/each}
  <input
    type="text"
    {id}
    value={draft}
    aria-invalid={ariaInvalid}
    aria-describedby={ariaDescribedby}
    placeholder={values.length === 0 ? placeholder : ""}
    oninput={(event) => {
      const value = event.currentTarget.value;
      if (value.endsWith(",")) commit(value);
      else draft = value;
    }}
    onkeydown={(event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        commit(draft);
      } else if (event.key === "Backspace" && draft === "" && values.length > 0) {
        remove(values[values.length - 1]);
      }
    }}
    onblur={() => {
      if (draft.trim()) commit(draft);
    }}
  />
  <span class="sr-only" role="status" aria-live="polite" aria-atomic="true">
    {announcement}
  </span>
</div>
