<script lang="ts">
  import type { Snippet } from "svelte";
  import ThemeToggle from "./ThemeToggle.svelte";
  import TrustGlossary from "./TrustGlossary.svelte";
  import logo from "./logo.svg";

  interface Props {
    children?: Snippet;
    tracked?: boolean;
  }

  let { children, tracked = false }: Props = $props();
</script>

<header class="masthead">
  <div class="masthead__top">
    <h1 class="wordmark">
      <a href="/#" aria-label="npm.report"
        ><span>npm</span><img class="logo" src={logo} alt="" /><span>report</span></a
      >
    </h1>
    <div class="masthead__controls">
      <a class="masthead__tracked" href="/tracked" aria-current={tracked ? "page" : undefined}
        >Tracked orgs</a
      >
      <ThemeToggle />
      <TrustGlossary />
    </div>
  </div>
  {#if children}
    {@render children()}
  {/if}
</header>
