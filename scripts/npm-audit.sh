#!/usr/bin/env bash
# npm-audit.sh — supply-chain audits over npm org packages (default: netlify gatsbyjs).
#
# Reports (comma-separated, or "all"):
#   recent    Packages whose latest release shipped within the window (or ALL of
#             them with -A), with the supply-chain trust status of each package's
#             `latest` release (logic ported from github.com/43081j/packumeta).
#             Discovery (latest version + recency + deprecated) uses fast-npm-meta
#             (npm.antfu.dev) in batch; trust fields come from the lightweight
#             per-version registry manifest. Cache other reports build on;
#             written to <outdir>/recent-packages.tsv (cols: pkg,
#             latest_publish_iso, latest_version, trust_level, provenance,
#             trustedPublisher, stagedPublish, publisher, deprecated,
#             downloads_last_week) plus a coverage summary in
#             <outdir>/trust-summary.txt. trust_level (packumeta): stagedPublish(3)
#             > trustedPublisher(2, =trustedPublisher+provenance) > provenance(1)
#             > none(0).
#   manual    Who published MANUALLY (non-CI/bot account) in the window, and what.
#   external  Users who can publish NOW (current maintainer) but aren't org members.
#             Requires -M members.txt (npm org membership is not public).
#
# Note: per-user publish history is a separate tool, npm-user-publishes.sh —
# it shares nothing with these reports.
#
# Usage:
#   npm-audit.sh -O OUTDIR [opts] REPORTS
# Options:
#   -O DIR    output directory (required)
#   -m N      window in months (default 12)
#   -A        analyze ALL org packages, ignoring the recency window
#   -M FILE   org members, one npm username per line (# comments ok) — for `external`
#   -b LIST   comma-separated CI/bot accounts to exclude in `manual` (default netlify-bot)
#   -g LIST   comma-separated orgs (default netlify,gatsbyjs)
#   -j N      parallel fetch jobs (default 12)
#   -f        force rebuild of the recent-packages cache
#   -h        this help
# Examples:
#   npm-audit.sh -O /tmp/out all -M /tmp/members.txt
#   npm-audit.sh -O /tmp/out manual,external -M /tmp/members.txt -m 6

set -euo pipefail
PROG=$(basename "$0")

usage() { sed -n '2,/^set -euo/{/^set -euo/d;s/^# \{0,1\}//;p;}' "$0"; exit "${1:-0}"; }
[ $# -eq 0 ] && usage 0

MONTHS=12; JOBS=12; BOTS="netlify-bot"; MEMBERS=""; OUTDIR=""; FORCE=0; ALL=0
ORGS_CSV="netlify,gatsbyjs"; REPORTS=""
# Hand-rolled parser so flags and the REPORTS positional may appear in any order
# (getopts stops at the first non-option, which bites with `... all -M file`).
while [ $# -gt 0 ]; do
  case "$1" in
    -O) OUTDIR=$2; shift 2 ;;
    -m) MONTHS=$2; shift 2 ;;
    -M) MEMBERS=$2; shift 2 ;;
    -b) BOTS=$2; shift 2 ;;
    -g) ORGS_CSV=$2; shift 2 ;;
    -j) JOBS=$2; shift 2 ;;
    -f) FORCE=1; shift ;;
    -A) ALL=1; shift ;;
    -h) usage 0 ;;
    -*) echo "error: unknown option $1" >&2; usage 2 ;;
    *)  REPORTS=$1; shift ;;
  esac
done
[ -z "$REPORTS" ] && { echo "error: no REPORTS given (recent,manual,external or all)" >&2; usage 2; }
[ -z "$OUTDIR" ] && { echo "error: -O OUTDIR is required" >&2; usage 2; }
mkdir -p "$OUTDIR"

[ "$REPORTS" = "all" ] && REPORTS="recent,manual,external"
IFS=',' read -r -a WANT <<<"$REPORTS"
IFS=',' read -r -a ORGS <<<"$ORGS_CSV"

# --- shared helpers -------------------------------------------------------

CACHE="$OUTDIR/recent-packages.tsv"
FAILURES="$OUTDIR/fetch-failures.log"
: > "$FAILURES"
export FAILURES

# epoch seconds for an ISO-8601 timestamp (GNU and BSD date).
to_epoch() {
  local iso="$1"
  if date -u -d "$iso" +%s 2>/dev/null; then return; fi
  date -u -j -f "%Y-%m-%dT%H:%M:%S" "${iso%%.*}" +%s 2>/dev/null
}
export -f to_epoch

# Fetch a URL with retry + backoff. 2xx -> body on stdout; 404 -> empty (ok);
# 429/5xx/network -> retry up to 5x, then record the URL in $FAILURES and fail.
npm_get() {
  local url="$1" tries=5 i=0 code tmp
  tmp=$(mktemp)
  while :; do
    i=$((i + 1))
    code=$(curl -sS -m 60 -o "$tmp" -w '%{http_code}' "$url" 2>/dev/null) || code=000
    case "$code" in
      2*)  cat "$tmp"; rm -f "$tmp"; return 0 ;;
      404) rm -f "$tmp"; return 0 ;;
      429|5*|000)
        if [ "$i" -ge "$tries" ]; then
          printf '%s\t(http %s)\n' "$url" "$code" >> "$FAILURES"; rm -f "$tmp"; return 1
        fi
        sleep $((i * i)) ;;   # 1,4,9,16s backoff
      *) printf '%s\t(http %s)\n' "$url" "$code" >> "$FAILURES"; rm -f "$tmp"; return 1 ;;
    esac
  done
}
export -f npm_get

# Registry doc URL for a package name (scoped names get '/' -> %2f).
pkg_url() { printf 'https://registry.npmjs.org/%s' "$(printf '%s' "$1" | sed 's:/:%2f:')"; }
export -f pkg_url

cutoff_epoch() {
  if date -u -d "$MONTHS months ago" +%s 2>/dev/null; then return; fi
  date -u -v-"${MONTHS}"m +%s
}
CUTOFF=$(cutoff_epoch); export CUTOFF
CUTOFF_ISO=$( date -u -d "$MONTHS months ago" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -v-"${MONTHS}"m +%Y-%m-%dT%H:%M:%SZ ); export CUTOFF_ISO

# All packages across the configured orgs (deduped). Caps at 250/org (registry
# limit); private/unlisted packages aren't visible unauthenticated.
list_org_packages() {
  local org
  for org in "${ORGS[@]}"; do
    npm_get "https://registry.npmjs.org/-/org/${org}/package" | jq -r 'if type=="object" then keys[] else empty end'
  done | sort -u
}

# Append a weekly-downloads column to $CACHE in place. The downloads point API
# (api.npmjs.org) is a strict token bucket — ~5 requests then 429, regardless of
# concurrency — but refills fine when paced. So: unscoped names use the BULK
# endpoint (100/request, no per-package cost); scoped names (bulk rejects them)
# go sequential, paced ~2/s. Missing/failed lookups become "?".
add_downloads() {
  local names map; names=$(cut -f1 "$CACHE"); map=$(mktemp)
  local n_scoped; n_scoped=$(echo "$names" | grep -c '^@' || true)
  echo "[recent] fetching weekly downloads (bulk unscoped + $n_scoped scoped paced ~2/s)..." >&2
  # Unscoped: bulk, 100 per request. Response is keyed by name (or flat for 1).
  echo "$names" | grep -v '^@' | xargs -n100 2>/dev/null | tr ' ' ',' | while read -r batch; do
    [ -z "$batch" ] && continue
    npm_get "https://api.npmjs.org/downloads/point/last-week/$batch" \
      | jq -r 'if has("downloads") then "\(.package)\t\(.downloads)" else (to_entries[] | "\(.key)\t\(.value.downloads // 0)") end' 2>/dev/null
  done >> "$map"
  # Scoped: sequential + paced to stay under the token bucket (bursting => 429s).
  echo "$names" | grep '^@' | while read -r p; do
    [ -z "$p" ] && continue
    local d; d=$(npm_get "https://api.npmjs.org/downloads/point/last-week/$p" | jq -r '.downloads // empty' 2>/dev/null)
    printf '%s\t%s\n' "$p" "${d:-?}"
    sleep 0.5
  done >> "$map"
  # Join the map onto the cache as the final column (default "?" if missing).
  local tmp; tmp=$(mktemp)
  awk -F'\t' 'FNR==NR{d[$1]=$2;next}{print $0"\t"(($1 in d)?d[$1]:"?")}' "$map" "$CACHE" > "$tmp"
  mv "$tmp" "$CACHE"; rm -f "$map"
}

warn_failures() {
  local n; n=$(grep -c . "$FAILURES" 2>/dev/null) || n=0
  if [ "$n" -gt 0 ]; then
    echo "WARNING: $n fetch(es) failed after retries — results may be INCOMPLETE." >&2
    echo "         see $FAILURES" >&2
  fi
}

# --- report: recent (build cache) -----------------------------------------

build_recent() {
  if [ -f "$CACHE" ] && [ "$FORCE" -ne 1 ]; then
    echo "[recent] using existing $CACHE ($(wc -l < "$CACHE" | tr -d ' ') pkgs); -f to rebuild" >&2
    return
  fi
  local scope_label; [ "$ALL" -eq 1 ] && scope_label="ALL org packages" || scope_label="last $MONTHS months"
  echo "[recent] listing packages in: ${ORGS[*]}" >&2
  local pkgs; pkgs=$(list_org_packages)
  echo "[recent] $(echo "$pkgs" | wc -l | tr -d ' ') packages; resolving latest version + recency + deprecated via fast-npm-meta..." >&2

  # Discovery via fast-npm-meta (npm.antfu.dev): batch-resolve latest version,
  # publishedAt and deprecated for every package without pulling heavy
  # packuments. Emits: name<TAB>version<TAB>publishedAt<TAB>deprecated(yes|no).
  local meta; meta=$(printf '%s\n' "$pkgs" | xargs -n100 2>/dev/null | while read -r grp; do
    [ -z "$grp" ] && continue
    npm_get "https://npm.antfu.dev/$(printf '%s' "$grp" | tr ' ' '+')?metadata=true" \
      | jq -r '(if type=="array" then .[] else . end)
               | [ .name, (.version // ""), (.publishedAt // ""),
                   (if .deprecated then "yes" else "no" end) ] | @tsv' 2>/dev/null
  done)

  # In-scope set: ALL packages, or only those whose latest release is within the
  # window. publishedAt is ISO-8601 UTC, so lexical compare against the cutoff
  # ISO works. Drop rows with no resolvable version.
  local inscope; inscope=$(mktemp)
  if [ "$ALL" -eq 1 ]; then
    awk -F'\t' '$2!=""' <<<"$meta" > "$inscope"
  else
    awk -F'\t' -v c="$CUTOFF_ISO" '$2!="" && $3>=c' <<<"$meta" > "$inscope"
  fi
  echo "[recent] in scope ($scope_label): $(wc -l < "$inscope" | tr -d ' ') packages; fetching per-version manifests for trust status..." >&2

  # Per package: pull the lightweight per-version manifest (has _npmUser +
  # dist.attestations; ~KBs vs MBs for the full packument) and compute trust.
  # Trust logic ported verbatim from github.com/43081j/packumeta:
  #   provenance=dist.attestations.provenance truthy; trustedPublisher=
  #   _npmUser.trustedPublisher truthy; stagedPublish=_npmUser.approver truthy;
  #   level: stagedPublish > (trustedPublisher && provenance) > provenance > none
  local ROWS; ROWS=$(mktemp); export ROWS
  trust_row() {
    local pkg="$1" ver="$2" pub="$3" dep="$4" doc
    [ -z "$ver" ] && return 0
    doc=$(npm_get "https://registry.npmjs.org/$(printf '%s' "$pkg" | sed 's:/:%2f:')/$ver") || return 0
    [ -z "$doc" ] && return 0
    local level prov tp staged who
    IFS=$'\t' read -r level prov tp staged who < <(printf '%s' "$doc" | jq -r '
      def truthy: (. != null) and (. != false);
      (.dist.attestations.provenance | truthy) as $prov
      | (._npmUser.trustedPublisher | truthy)  as $tp
      | (._npmUser.approver | truthy)          as $staged
      | (if $staged then "stagedPublish"
         elif ($tp and $prov) then "trustedPublisher"
         elif $prov then "provenance" else "none" end) as $level
      | [ $level,
          (if $prov then "yes" else "no" end),
          (if $tp then "yes" else "no" end),
          (if $staged then "yes" else "no" end),
          (._npmUser.name // "?") ] | @tsv')
    # Append to a shared file (atomic for short lines) rather than a pipe to sort,
    # which avoids EINTR-on-write under heavy parallelism.
    printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' "$pkg" "$pub" "$ver" "$level" "$prov" "$tp" "$staged" "$who" "$dep" >> "$ROWS"
    return 0
  }
  export -f trust_row
  # -L1: each line's tab/space-split fields become $1..$4 (names have no spaces).
  xargs -P "$JOBS" -L1 bash -c 'trust_row "$@"' _ < "$inscope"
  sort -t$'\t' -k2 -r "$ROWS" > "$CACHE"
  rm -f "$inscope" "$ROWS"

  # Append weekly downloads (col10). The downloads API (api.npmjs.org) rate-limits
  # HARD, unlike the registry — so fetch gently: one bulk request per ~100
  # unscoped names, and scoped names individually at low concurrency.
  add_downloads

  # Coverage by packumeta trust level (col4). Cols: 5=prov 6=tp 7=staged
  # 9=deprecated 10=downloads.
  local total prov_n tp_n staged_n dep_n
  total=$(wc -l < "$CACHE" | tr -d ' ')
  prov_n=$(awk -F'\t'   '$5=="yes"' "$CACHE" | wc -l | tr -d ' ')
  tp_n=$(awk -F'\t'     '$6=="yes"' "$CACHE" | wc -l | tr -d ' ')
  staged_n=$(awk -F'\t' '$7=="yes"' "$CACHE" | wc -l | tr -d ' ')
  dep_n=$(awk -F'\t'    '$9=="yes"' "$CACHE" | wc -l | tr -d ' ')
  {
    echo "=== Supply-chain trust coverage on latest release ($scope_label) ==="
    echo "orgs: ${ORGS[*]} | trust logic: github.com/43081j/packumeta"
    echo
    echo "Provenance attestation:    $prov_n / $total"
    echo "Trusted publisher (OIDC):  $tp_n / $total"
    echo "Staged publish (approver): $staged_n / $total"
    echo "Deprecated (latest):       $dep_n / $total"
    echo
    echo "--- Counts by trust level ---"
    awk -F'\t' 'NF{print $4}' "$CACHE" | sort | uniq -c | sort -rn
    echo
    # Within each level, most-downloaded first; flag deprecated packages.
    for lvl in stagedPublish trustedPublisher provenance none; do
      echo "--- $lvl (by weekly downloads) ---"
      awk -F'\t' -v L="$lvl" '$4==L{printf "%12s  %-45s %-12s (%s)%s\n", $10, $1, $3, $8, ($9=="yes"?"  [DEPRECATED]":"")}' "$CACHE" | sort -rn
      echo
    done
  } > "$OUTDIR/trust-summary.txt"
  echo "[recent] wrote $total packages to $CACHE" >&2
  echo "[recent] trust: provenance=$prov_n trustedPublisher=$tp_n stagedPublish=$staged_n deprecated=$dep_n of $total (see $OUTDIR/trust-summary.txt)" >&2
}

# --- report: manual --------------------------------------------------------

run_manual() {
  [ -f "$CACHE" ] || build_recent
  local out="$OUTDIR/manual-publishes.txt"
  echo "[manual] scanning $(wc -l < "$CACHE" | tr -d ' ') packages for publishes in last $MONTHS months..." >&2
  scan_manual() {
    local pkg="$1" cutoff="$2"
    npm_get "$(pkg_url "$pkg")" | jq -r '
      . as $d | (.versions // {}) | to_entries[]
      | ($d.time[.key]) as $t | select($t != null)
      | "\($t)\t\(.value._npmUser.name // "?")\t\($d.name)@\(.key)"' 2>/dev/null \
    | while IFS=$'\t' read -r iso who ref; do
        local e; e=$(to_epoch "$iso") || continue
        [ "$e" -ge "$cutoff" ] && printf '%s\t%s\t%s\n' "$iso" "$who" "$ref"
      done
    return 0
  }
  export -f scan_manual
  local rows; rows=$(mktemp)
  cut -f1 "$CACHE" | xargs -P "$JOBS" -I {} bash -c 'scan_manual "$@"' _ {} "$CUTOFF" | sort -r > "$rows"

  local botre human total hn
  botre=$(printf '%s' "$BOTS" | tr ',' '|')
  human=$(awk -F'\t' -v b="^($botre)$" '$2 !~ b' "$rows")
  total=$(wc -l < "$rows" | tr -d ' ')
  hn=$(printf '%s' "$human" | grep -c . || true)
  {
    echo "=== Manual (non-CI) publishes — last $MONTHS months ==="
    echo "Total publishes scanned: $total | excluded bots: $BOTS | manual: $hn"
    echo
    echo "--- By publisher (count) ---"
    printf '%s\n' "$human" | awk -F'\t' 'NF{print $2}' | sort | uniq -c | sort -rn
    echo
    echo "--- Detail: <when>  <who>  <package@version> ---"
    printf '%s\n' "$human" | awk -F'\t' 'NF{printf "%s  %-20s  %s\n", $1, $2, $3}'
  } > "$out"
  rm -f "$rows"
  echo "[manual] wrote $out ($hn manual publishes)" >&2
}

# --- report: external ------------------------------------------------------

run_external() {
  [ -n "$MEMBERS" ] || { echo "[external] SKIPPED: -M members.txt required (org membership isn't public)" >&2; return 1; }
  [ -f "$MEMBERS" ] || { echo "[external] error: members file not found: $MEMBERS" >&2; return 1; }
  local out="$OUTDIR/external-maintainers.txt"
  local mf; mf=$(mktemp)
  grep -vE '^[[:space:]]*(#|$)' "$MEMBERS" | tr '[:upper:]' '[:lower:]' \
    | sed 's/^[[:space:]]*//;s/[[:space:]]*$//' | sort -u > "$mf"

  echo "[external] listing all packages in: ${ORGS[*]}" >&2
  local pkgs; pkgs=$(list_org_packages)
  echo "[external] scanning $(echo "$pkgs" | wc -l | tr -d ' ') packages for current maintainers..." >&2
  scan_maint() {
    npm_get "$(pkg_url "$1")" | jq -r '.name as $n | (.maintainers // [])[] | "\(.name)\t\($n)"' 2>/dev/null
    return 0
  }
  export -f scan_maint
  local pairs; pairs=$(echo "$pkgs" | xargs -P "$JOBS" -I {} bash -c 'scan_maint "$@"' _ {} | sort -u)
  local external; external=$(awk -F'\t' 'FNR==NR{m[$1]=1;next}{if(!(tolower($1) in m))print}' "$mf" <(printf '%s\n' "$pairs"))
  local nu; nu=$(awk -F'\t' 'NF{print $1}' <<<"$external" | sort -u | grep -c . || true)
  {
    echo "=== External maintainers (publish access NOW, not an org member) ==="
    echo "$nu distinct external maintainer account(s)."
    echo
    echo "--- By user (package count) ---"
    awk -F'\t' 'NF{print $1}' <<<"$external" | sort | uniq -c | sort -rn
    echo
    echo "--- Detail: <user>  <package> ---"
    sort <<<"$external" | awk -F'\t' 'NF{printf "%-22s  %s\n", $1, $2}'
  } > "$out"
  rm -f "$mf"
  echo "[external] wrote $out ($nu external maintainers)" >&2
}

# --- dispatch --------------------------------------------------------------

for r in "${WANT[@]}"; do
  case "$r" in
    recent)   build_recent ;;
    manual)   run_manual ;;
    external) run_external || true ;;
    *) echo "error: unknown report '$r' (want: recent,manual,external,all)" >&2; exit 2 ;;
  esac
done
warn_failures
echo "Done. Output in $OUTDIR/" >&2
