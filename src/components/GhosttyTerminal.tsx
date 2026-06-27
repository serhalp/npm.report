import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { init, Terminal, FitAddon } from "ghostty-web";

export interface TerminalHandle {
  writeLine: (line: string) => void;
  clear: () => void;
}

// ANSI colorizer — ghostty-web is a real VT100 emulator, so the progress lines
// get the same coloring the scripts' stderr would in a terminal: tags cyan,
// WARNING red, "Done." green, counters dim.
const RESET = "\x1b[0m";
function colorize(line: string): string {
  if (/^WARNING/.test(line)) return `\x1b[31m${line}${RESET}`;
  if (/^Done\./.test(line)) return `\x1b[32m${line}${RESET}`;
  if (/^Error/i.test(line)) return `\x1b[31m${line}${RESET}`;
  const m = line.match(/^(\s*)(\[[a-z]+\])(.*)$/);
  if (m) {
    const rest = /\d+\/\d+/.test(m[3]) ? `\x1b[2m${m[3]}${RESET}` : m[3];
    return `${m[1]}\x1b[36m${m[2]}${RESET}${rest}`;
  }
  return line;
}

/**
 * Live progress display backed by coder/ghostty-web (Ghostty's VT100 parser
 * compiled to WASM, drop-in xterm.js API). The WASM is inlined in the ESM
 * build, so init() needs no arguments and no asset wiring.
 *
 * Degrades gracefully: if WASM init fails, falls back to a styled <pre> mirror
 * so the audit log is never lost.
 */
export const GhosttyTerminal = forwardRef<TerminalHandle>((_props, ref) => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const fallbackRef = useRef<HTMLPreElement | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let disposed = false;
    let term: Terminal | null = null;
    (async () => {
      try {
        await init();
        if (disposed || !hostRef.current) return;
        term = new Terminal({
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
        term.open(hostRef.current);
        try {
          const fit = new FitAddon();
          term.loadAddon(fit);
          fit.fit();
        } catch {
          /* FitAddon is best-effort */
        }
        term.writeln("\x1b[2mnpm supply-chain audit — ready.\x1b[0m");
        term.writeln("\x1b[2mConfigure orgs and reports, then Run audit.\x1b[0m");
        termRef.current = term;
      } catch {
        setFailed(true);
      }
    })();
    return () => {
      disposed = true;
      try {
        term?.dispose();
      } catch {
        /* ignore */
      }
      termRef.current = null;
    };
  }, []);

  useImperativeHandle(ref, () => ({
    writeLine(line: string) {
      const t = termRef.current;
      if (t) {
        try {
          t.writeln(colorize(line));
          return;
        } catch {
          /* fall through to mirror */
        }
      }
      const pre = fallbackRef.current;
      if (pre) {
        pre.textContent += `${line}\n`;
        pre.scrollTop = pre.scrollHeight;
      }
    },
    clear() {
      try {
        termRef.current?.clear();
      } catch {
        /* ignore */
      }
      if (fallbackRef.current) fallbackRef.current.textContent = "";
    },
  }));

  return (
    <div className="term-wrap">
      <div className="term-bar">
        <span className="dot" />
        <span className="dot" />
        <span className="dot" />
        <span className="label">audit · stream</span>
      </div>
      {failed ? (
        <pre ref={fallbackRef} className="term-fallback" />
      ) : (
        <div ref={hostRef} className="term-host" />
      )}
    </div>
  );
});

GhosttyTerminal.displayName = "GhosttyTerminal";
