<script lang="ts">
  // Display-only progress log for streamed audit output. This replaced a
  // ghostty-web WASM terminal that inlined ~413 KB of base64 WASM into the
  // bundle just to print append-only log lines. Same public API (writeLine /
  // clear); the visible log is itself the screen-reader live region, so progress
  // and the "results may be INCOMPLETE" warning are announced.
  const INTRO = ["Add npm orgs, choose reports, and Run. Progress streams here."];
  // Cap retained lines so a very long audit can't grow the DOM without bound
  // (mirrors the old terminal's 5000-line scrollback).
  const SCROLLBACK = 5000;

  type LineKind = "warn" | "err" | "done" | "info";
  type ReportPrefix = "trust" | "manual" | "external" | "user";

  interface Props {
    activity?: string | null;
  }

  let { activity = null }: Props = $props();

  let lines = $state<string[]>([...INTRO]);
  let scroller: HTMLDivElement | null = $state(null);

  function prefixOf(line: string): { kind: ReportPrefix; label: string; rest: string } | null {
    const match = /^\[(trust|manual|external|user)\]/.exec(line);
    if (!match) return null;
    return {
      kind: match[1] as ReportPrefix,
      label: match[0],
      rest: line.slice(match[0].length),
    };
  }

  // Emphasize the lines that matter (mirrors the old ANSI colorizer): the
  // incomplete-results warning, errors, and the terminal "Done." line.
  function kindOf(line: string): LineKind {
    const message = prefixOf(line)?.rest.trimStart() ?? line;
    if (/^WARNING/.test(message)) return "warn";
    if (/^Error/i.test(message)) return "err";
    if (/^Done\./.test(message)) return "done";
    return "info";
  }

  // Keep the newest line in view as the log streams in. Reading the line count
  // registers the reactive dependency, so this re-pins to the bottom per line.
  $effect(() => {
    const count = lines.length;
    const active = activity !== null;
    if (scroller && (count || active)) scroller.scrollTop = scroller.scrollHeight;
  });

  export function writeLine(line: string) {
    lines.push(line);
    if (lines.length > SCROLLBACK) lines = lines.slice(-SCROLLBACK);
  }

  export function clear() {
    lines = [];
  }
</script>

<div class="term-wrap">
  <div class="term-bar">
    <span class="dot"></span>
    <span class="dot"></span>
    <span class="dot"></span>
    <span class="label">audit · stream</span>
  </div>
  <div
    bind:this={scroller}
    class="term-log"
    role="log"
    aria-live="polite"
    aria-label="Audit progress log"
  >
    {#each lines as line, index (index)}
      {@const prefix = prefixOf(line)}
      <div class="term-line term-line--{kindOf(line)}">
        {#if prefix}
          <span class="term-prefix term-prefix--{prefix.kind}">{prefix.label}</span>{prefix.rest}
        {:else}
          {line}
        {/if}
      </div>
    {/each}
    {#if activity}
      <div class="term-line term-line--activity">
        <span class="term-spinner" aria-hidden="true">
          <span class="term-spinner__frame term-spinner__frame--one">|</span>
          <span class="term-spinner__frame term-spinner__frame--two">/</span>
          <span class="term-spinner__frame term-spinner__frame--three">-</span>
          <span class="term-spinner__frame term-spinner__frame--four">&#92;</span>
        </span>
        <span class="term-activity__label">{activity}</span>
      </div>
    {/if}
  </div>
</div>
