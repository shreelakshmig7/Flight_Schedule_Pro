/** @type {import('next').NextConfig} */
const nextConfig = {
  // App Router is the default in Next.js 14 — Pages Router is not used
  reactStrictMode: true,
  // Transpile shared workspace packages
  transpilePackages: ['@fsp-scheduler/shared-types'],
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
