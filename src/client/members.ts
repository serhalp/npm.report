// ---------------------------------------------------------------------------
// Org membership — npm org membership is NOT public (the registry returns {}
// unauthenticated). The `external` report therefore needs the user to run
//   npm org ls <org> --json
// locally (authenticated) and paste the output. This module parses that.
//
// `npm org ls <org> --json` prints an object mapping username -> role, e.g.
//   { "alice": "owner", "bob": "developer" }
//
// To be forgiving we also accept:
//   - several such JSON objects pasted back-to-back (one per org)
//   - newline-separated usernames with # comments
// Matching is case-insensitive, so members are lowercased + deduped.
// ---------------------------------------------------------------------------

const LINE_SPLIT_RE = /\r?\n/;

export function parseMembers(raw: string): string[] {
  const members = new Set<string>();
  const text = raw.trim();
  if (!text) return [];

  // 1) Try to extract every top-level JSON object via brace matching.
  let foundJson = false;
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0 && start >= 0) {
        const slice = text.slice(start, i + 1);
        try {
          const parsed: unknown = JSON.parse(slice);
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            for (const key of Object.keys(parsed)) {
              const u = key.trim().toLowerCase();
              if (u) members.add(u);
            }
            foundJson = true;
          }
        } catch {
          // ignore malformed slice
        }
        start = -1;
      }
    }
  }
  if (foundJson) return [...members].toSorted();

  // 2) Fall back to a plain username list (# comments allowed).
  for (const line of text.split(LINE_SPLIT_RE)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    members.add(trimmed.toLowerCase());
  }
  return [...members].toSorted();
}
