import { mount } from "svelte";
import App from "./App.svelte";
import SharedReport from "./SharedReport.svelte";
// Self-hosted fonts (bundled by Vite, no third-party runtime origin). IBM Plex
// Sans is variable; IBM Plex Mono is static, so we pull only the weights the UI uses.
import "@fontsource-variable/ibm-plex-sans/wght.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/400-italic.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/ibm-plex-mono/600.css";
import "@fontsource/ibm-plex-mono/700.css";
import "./styles.css";

const target = document.getElementById("root");
if (!target) throw new Error("Missing #root mount point");

const sharedMatch = window.location.pathname.match(/^\/report\/([^/]+)\/?$/);

if (sharedMatch) {
  mount(SharedReport, {
    target,
    props: { id: decodeURIComponent(sharedMatch[1]) },
  });
} else {
  mount(App, { target });
}
