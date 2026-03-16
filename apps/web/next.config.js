/** @type {import('next').NextConfig} */
const nextConfig = {
  // App Router is the default in Next.js 14 — Pages Router is not used
  reactStrictMode: true,
  // Required for Docker multi-stage build (copies standalone output to runner)
  output: 'standalone',
  // Transpile shared workspace packages
  transpilePackages: ['@fsp-scheduler/shared-types'],
  // Proxy /api-proxy/* → API_BASE_URL/* at runtime (server-side rewrite).
  // This avoids baking the API URL into the JS bundle at build time.
  // Client code uses the relative path /api-proxy; the server reads API_BASE_URL
  // from the environment at startup, so it can be changed via container env vars.
  async rewrites() {
    const apiBase = process.env.API_BASE_URL || 'http://localhost:3000';
    return [
      {
        source: '/api-proxy/:path*',
        destination: `${apiBase}/:path*`,
      },
    ];
  },
  // Security headers
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
