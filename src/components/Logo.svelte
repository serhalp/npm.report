<script lang="ts">
  // The npm.report mark: a trust "signal" radiating from a gold source, its three
  // waves in the tier colors (inner staged → outer provenance). Uses the app's
  // theme tokens so it adapts to light/dark. The favicon (public/favicon.svg) is
  // the tiled, fixed-color twin for browser tabs.
</script>

<svg class="logo" width="28" height="28" viewBox="5 5 22 22" aria-hidden="true">
  <path
    d="M10 8 A14 14 0 0 1 24 22"
    fill="none"
    stroke="var(--t-provenance)"
    stroke-width="2.2"
    stroke-linecap="round"
  />
  <path
    d="M10 12 A10 10 0 0 1 20 22"
    fill="none"
    stroke="var(--t-trusted)"
    stroke-width="2.2"
    stroke-linecap="round"
  />
  <path
    d="M10 16 A6 6 0 0 1 16 22"
    fill="none"
    stroke="var(--t-staged)"
    stroke-width="2.2"
    stroke-linecap="round"
  />
  <circle cx="10" cy="22" r="2.8" fill="var(--gold)" />
</svg>
