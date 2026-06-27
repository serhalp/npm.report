import { mount } from "svelte";
import App from "./App.svelte";
import SharedReport from "./SharedReport.svelte";
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
