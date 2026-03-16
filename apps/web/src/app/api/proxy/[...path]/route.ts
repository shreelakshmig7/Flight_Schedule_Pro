/**
 * apps/web/src/app/api/proxy/[...path]/route.ts
 * -----------------------------------------------
 * Runtime API proxy — forwards /api/proxy/:path* → API_BASE_URL/:path*
 *
 * WHY a Route Handler instead of next.config.js rewrites():
 *   next.config.js is evaluated during `next build` and the rewrite rules are
 *   serialised into routes-manifest.json at that point.  Any process.env reads
 *   inside rewrites() are therefore baked into the build artefact, not read at
 *   server startup.  Route Handlers, by contrast, run as ordinary Node.js code
 *   at request time, so process.env.API_BASE_URL is always the live value from
 *   the container's environment — no rebuild required when the env var changes.
 */

import { type NextRequest, NextResponse } from 'next/server';

// Always run dynamically — never cache at the CDN / ISR layer.
export const dynamic = 'force-dynamic';

/** Headers that must not be forwarded to (or from) the upstream service. */
const HOP_BY_HOP = new Set([
  'host',
  'connection',
  'keep-alive',
  'transfer-encoding',
  'te',
  'trailer',
  'upgrade',
  'proxy-authorization',
  'proxy-authenticate',
]);

/**
 * Read API_BASE_URL from the live process environment at call time.
 * Intentionally a function (not a module-level const) so it re-evaluates on
 * every request — avoids caching a stale value if the env var ever changes.
 */
function getApiBase(): string {
  return (process.env.API_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
}

async function proxy(request: NextRequest, path: string[]): Promise<NextResponse> {
  const { search } = new URL(request.url);
  const upstreamUrl = `${getApiBase()}/${path.join('/')}${search}`;

  // Forward all safe request headers.
  const forwardHeaders: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    if (!HOP_BY_HOP.has(key.toLowerCase())) {
      forwardHeaders[key] = value;
    }
  });

  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
  const body = hasBody ? await request.text() : undefined;

  const upstream = await fetch(upstreamUrl, {
    method: request.method,
    headers: forwardHeaders,
    body,
  });

  // Forward all safe response headers.
  const resHeaders: Record<string, string> = {};
  upstream.headers.forEach((value, key) => {
    if (!HOP_BY_HOP.has(key.toLowerCase())) {
      resHeaders[key] = value;
    }
  });

  return new NextResponse(await upstream.text(), {
    status: upstream.status,
    headers: resHeaders,
  });
}

export function GET(req: NextRequest, { params }: { params: { path: string[] } }) {
  return proxy(req, params.path);
}

export function POST(req: NextRequest, { params }: { params: { path: string[] } }) {
  return proxy(req, params.path);
}

export function PUT(req: NextRequest, { params }: { params: { path: string[] } }) {
  return proxy(req, params.path);
}

export function DELETE(req: NextRequest, { params }: { params: { path: string[] } }) {
  return proxy(req, params.path);
}

export function PATCH(req: NextRequest, { params }: { params: { path: string[] } }) {
  return proxy(req, params.path);
}
