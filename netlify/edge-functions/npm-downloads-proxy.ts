import type { Config } from '@netlify/edge-functions'
import { proxyNpm } from '../lib/npm-proxy.ts'

// CORS-friendly cache for the npm downloads API (api.npmjs.org). The upstream
// host is pinned here and cannot be influenced by the request.
export default (req: Request) =>
  proxyNpm(req, 'api.npmjs.org', '/api/npm-downloads')

export const config: Config = {
  path: '/api/npm-downloads/*',
  cache: 'manual',
  method: 'GET',
}
