<script lang="ts">
  const TERMS: { term: string; def: string; variant: string; href?: string }[] = [
    {
      term: "Staged publishing",
      def: "Published through npm's staged flow, prepared and reviewed before it goes live.",
      variant: "staged",
      href: "https://docs.npmjs.com/staged-publishing",
    },
    {
      term: "Trusted publisher",
      def: "Published from CI over OIDC, with no long-lived npm token to leak or steal.",
      variant: "trusted",
      href: "https://docs.npmjs.com/trusted-publishers",
    },
    {
      term: "Provenance",
      def: "A signed link from the published package back to the exact source commit and build.",
      variant: "provenance",
      href: "https://docs.npmjs.com/generating-provenance-statements",
    },
    {
      term: "None",
      def: "No verifiable signal. The release rests on the maintainer's account and token alone, so a compromise there can ship malware unnoticed.",
      variant: "none",
    },
  ];
</script>

<button
  type="button"
  class="glossary__btn"
  popovertarget="trust-glossary"
  aria-label="What are trust signals?"
>
  ?
</button>

<div id="trust-glossary" popover="auto" class="glossary__panel">
  <p class="glossary__lede">
    npm gives maintainers mechanisms to verifiably establish how a package was published.
  </p>
  <dl class="glossary__list">
    {#each TERMS as t (t.term)}
      <dt class={`glossary__term glossary__term--${t.variant}`}>{t.term}</dt>
      <dd>
        {t.def}
        {#if t.href}
          <a href={t.href} target="_blank" rel="noopener noreferrer">npm docs ↗</a>
        {/if}
      </dd>
    {/each}
  </dl>
  <p class="glossary__note">
    In the summary, <strong class="glossary__term--staged">staged publishing</strong> and
    <strong class="glossary__term--trusted">trusted publisher</strong>
    both count as <em class="glossary__term--strong">strong</em> trust;
    <span class="glossary__term--provenance">provenance</span> is a weaker positive;
    <em class="glossary__term--none">none</em> is the one to check.
  </p>
</div>
