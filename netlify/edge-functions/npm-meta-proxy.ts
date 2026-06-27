import type { Config } from '@netlify/edge-functions'
import { proxyNpm } from '../lib/npm-proxy.ts'

// CORS-friendly cache for fast-npm-meta (npm.antfu.dev), the discovery step's
// batch latest-version/recency/deprecated resolver. The upstream host is pinned
// here and cannot be influenced by the request.
export default (req: Request) =>
  proxyNpm(req, 'npm.antfu.dev', '/api/npm-meta')

export const config: Config = {
  path: '/api/npm-meta/*',
  cache: 'manual',
  method: 'GET',
}
