#!/usr/bin/env bash
# List versions that a specific npm user PERSONALLY published (recorded as the
# version's _npmUser) within the last N months.
#
# Package universe = the user's own maintained packages (/-/user/<user>/package,
# the authoritative, uncapped source) UNION an optional cache file (-i) of org
# packages, so nothing the user can touch is missed.
#
# _npmUser is the account whose auth ran `npm publish` — INCLUDING that account's
# automation/CI tokens. npm does not distinguish interactive logins from tokens.
#
# Usage:
#   npm-user-publishes.sh [-m MONTHS] [-i CACHEFILE] [-j JOBS] USERNAME
#   -i CACHEFILE  optional TSV with a package name in column 1 (e.g. an
#                 npm-audit.sh recent-packages.tsv); merged into the scan set.
# Output TSV: "<iso>\t<package>@<version>"  (newest first).

set -euo pipefail

MONTHS=12; JOBS=12; CACHE=""
while getopts "m:i:j:" opt; do
  case "$opt" in
    m) MONTHS=$OPTARG ;;
    i) CACHE=$OPTARG ;;
    j) JOBS=$OPTARG ;;
    *) echo "usage: $0 [-m MONTHS] [-i CACHEFILE] [-j JOBS] USERNAME" >&2; exit 2 ;;
  esac
done
shift $((OPTIND - 1))

USERNAME=${1:-}
[ -z "$USERNAME" ] && { echo "error: USERNAME required" >&2; exit 2; }

FAILURES=$(mktemp); export FAILURES
UNIVERSE=$(mktemp)
trap 'rm -f "$UNIVERSE" "$FAILURES"' EXIT

# Fetch with retry + backoff. 2xx -> body; 404 -> empty (ok); 429/5xx/network ->
# retry up to 5x then record the URL in $FAILURES and fail (so partial runs are
# visible rather than silently empty).
npm_get() {
  local url="$1" tries=5 i=0 code tmp; tmp=$(mktemp)
  while :; do
    i=$((i + 1))
    code=$(curl -sS -m 60 -o "$tmp" -w '%{http_code}' "$url" 2>/dev/null) || code=000
    case "$code" in
      2*)  cat "$tmp"; rm -f "$tmp"; return 0 ;;
      404) rm -f "$tmp"; return 0 ;;
      429|5*|000)
        if [ "$i" -ge "$tries" ]; then printf '%s\t(http %s)\n' "$url" "$code" >> "$FAILURES"; rm -f "$tmp"; return 1; fi
        sleep $((i * i)) ;;
      *) printf '%s\t(http %s)\n' "$url" "$code" >> "$FAILURES"; rm -f "$tmp"; return 1 ;;
    esac
  done
}
export -f npm_get

to_epoch() {
  local iso="$1"
  if date -u -d "$iso" +%s 2>/dev/null; then return; fi
  date -u -j -f "%Y-%m-%dT%H:%M:%S" "${iso%%.*}" +%s 2>/dev/null
}
export -f to_epoch

CUTOFF=$( date -u -d "$MONTHS months ago" +%s 2>/dev/null || date -u -v-"${MONTHS}"m +%s )

{
  npm_get "https://registry.npmjs.org/-/user/${USERNAME}/package" | jq -r 'if type=="object" then keys[] else empty end' 2>/dev/null
  [ -n "$CACHE" ] && [ -f "$CACHE" ] && cut -f1 "$CACHE"
} | sort -u > "$UNIVERSE"

scan_pkg() {
  local pkg="$1" user="$2" cutoff="$3" url
  url="https://registry.npmjs.org/$(printf '%s' "$pkg" | sed 's:/:%2f:')"
  npm_get "$url" | jq -r --arg u "$user" '
    . as $d | (.versions // {}) | to_entries[]
    | select(.value._npmUser.name == $u)
    | ($d.time[.key]) as $t | select($t != null)
    | "\($t)\t\($d.name)@\(.key)"' 2>/dev/null \
  | while IFS=$'\t' read -r iso ref; do
      local e; e=$(to_epoch "$iso") || continue
      [ "$e" -ge "$cutoff" ] && printf '%s\t%s\n' "$iso" "$ref"
    done
  return 0
}
export -f scan_pkg

echo "Scanning $(wc -l < "$UNIVERSE" | tr -d ' ') packages (user's own + cache) for versions published by '$USERNAME' (last $MONTHS months)..." >&2
xargs -P "$JOBS" -I {} bash -c 'scan_pkg "$@"' _ {} "$USERNAME" "$CUTOFF" < "$UNIVERSE" | sort -r

n=$(grep -c . "$FAILURES" 2>/dev/null) || n=0
[ "$n" -gt 0 ] && { echo "WARNING: $n fetch(es) failed after retries — results may be INCOMPLETE:" >&2; cat "$FAILURES" >&2; }
echo "Done." >&2
