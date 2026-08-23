<!-- Teeny tiny micro client router because this is just a simple two-page SPA -->
<script lang="ts">
  import { tick } from "svelte";
  import App from "./App.svelte";
  import SharedReport from "./SharedReport.svelte";

  type Route = { name: "app" } | { name: "report"; id: string };

  function reportIdFromPath(pathname: string): string | null {
    const match = pathname.match(/^\/report\/([^/]+)\/?$/);
    if (!match) return null;
    try {
      return decodeURIComponent(match[1]);
    } catch {
      return null;
    }
  }

  function routeFromUrl(url: URL): Route {
    const reportId = reportIdFromPath(url.pathname);
    return reportId === null ? { name: "app" } : { name: "report", id: reportId };
  }

  function isClientRoute(url: URL): boolean {
    return url.pathname === "/" || reportIdFromPath(url.pathname) !== null;
  }

  let currentUrl = $state(new URL(window.location.href));
  let route = $derived(routeFromUrl(currentUrl));

  async function focusMain(): Promise<void> {
    await tick();
    document.querySelector<HTMLElement>("main")?.focus({ preventScroll: true });
  }

  function showUrl(url: URL): void {
    currentUrl = url;
    void focusMain();
  }

  function handleClick(event: MouseEvent): void {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      !(event.target instanceof Element)
    ) {
      return;
    }

    const anchor = event.target.closest<HTMLAnchorElement>("a[href]");
    if (
      !anchor ||
      anchor.hasAttribute("download") ||
      (anchor.target && anchor.target !== "_self")
    ) {
      return;
    }

    const url = new URL(anchor.href, window.location.href);
    if (url.origin !== window.location.origin || !isClientRoute(url)) return;

    event.preventDefault();
    if (url.href === window.location.href) return;
    window.history.pushState(null, "", url);
    showUrl(url);
  }

  function handlePopstate(): void {
    showUrl(new URL(window.location.href));
  }
</script>

<svelte:window onclick={handleClick} onpopstate={handlePopstate} />

{#if route.name === "report"}
  <SharedReport id={route.id} />
{:else}
  <App />
{/if}
