<script lang="ts">
  import { init, Terminal, FitAddon } from "ghostty-web";

  const RESET = "\x1b[0m";

  let host: HTMLDivElement | null = $state(null);
  let failed = $state(false);
  let fallbackLog = $state("");
  let term: Terminal | null = null;

  function colorize(line: string): string {
    if (/^WARNING/.test(line)) return `\x1b[31m${line}${RESET}`;
    if (/^Done\./.test(line)) return `\x1b[32m${line}${RESET}`;
    if (/^Error/i.test(line)) return `\x1b[31m${line}${RESET}`;
    const match = line.match(/^(\s*)(\[[a-z]+\])(.*)$/);
    if (match) {
      const rest = /\d+\/\d+/.test(match[3]) ? `\x1b[2m${match[3]}${RESET}` : match[3];
      return `${match[1]}\x1b[36m${match[2]}${RESET}${rest}`;
    }
    return line;
  }

  $effect(() => {
    if (!host || failed) return;

    let disposed = false;
    let localTerm: Terminal | null = null;

    (async () => {
      try {
        await init();
        if (disposed || !host) return;
        localTerm = new Terminal({
          fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
          fontSize: 12,
          theme: {
            background: "#0b0f15",
            foreground: "#d7dde5",
            cursor: "#d8a657",
          },
          cursorBlink: true,
          scrollback: 5000,
        } as ConstructorParameters<typeof Terminal>[0]);
        localTerm.open(host);
        try {
          const fit = new FitAddon();
          localTerm.loadAddon(fit);
          fit.fit();
        } catch {
          // FitAddon is best-effort.
        }
        localTerm.writeln("\x1b[2mnpm supply-chain audit — ready.\x1b[0m");
        localTerm.writeln("\x1b[2mConfigure orgs and reports, then Run audit.\x1b[0m");
        term = localTerm;
      } catch {
        failed = true;
      }
    })();

    return () => {
      disposed = true;
      try {
        localTerm?.dispose();
      } catch {
        // ignore dispose errors
      }
      term = null;
    };
  });

  export function writeLine(line: string) {
    if (term) {
      try {
        term.writeln(colorize(line));
        return;
      } catch {
        // fall through to fallback mirror
      }
    }

    fallbackLog += `${line}\n`;
  }

  export function clear() {
    try {
      term?.clear();
    } catch {
      // ignore clear errors
    }
    fallbackLog = "";
  }
</script>

<div class="term-wrap">
  <div class="term-bar">
    <span class="dot"></span>
    <span class="dot"></span>
    <span class="dot"></span>
    <span class="label">audit · stream</span>
  </div>
  {#if failed}
    <pre class="term-fallback">{fallbackLog}</pre>
  {:else}
    <div bind:this={host} class="term-host"></div>
  {/if}
</div>
