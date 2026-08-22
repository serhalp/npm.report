import { mount } from "svelte";
import AppRouter from "./AppRouter.svelte";
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

mount(AppRouter, { target });
