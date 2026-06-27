import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import SharedReport from "./SharedReport";
import "./styles.css";

// Tiny path-based router: /report/:id renders the read-only shared view, every
// other path renders the live audit app. (netlify.toml serves index.html for
// all client routes.)
const sharedMatch = window.location.pathname.match(/^\/report\/([^/]+)\/?$/);
const id = sharedMatch ? decodeURIComponent(sharedMatch[1]) : null;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>{id ? <SharedReport id={id} /> : <App />}</React.StrictMode>,
);
