import type { Config } from "@netlify/edge-functions";
import { proxyNpm } from "../lib/npm-proxy.ts";

// CORS-friendly cache for the npm registry (manifests, packuments, org package
// listings). The upstream host is pinned here and cannot be influenced by the
// request — see ../lib/npm-proxy.ts for the security rationale.
export default (req: Request) => proxyNpm(req, "registry.npmjs.org", "/api/npm-registry");

export const config: Config = {
  path: "/api/npm-registry/*",
  cache: "manual",
  method: "GET",
};
