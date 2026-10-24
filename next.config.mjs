/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  // task attachments are up to 10 MB; requests pass through proxy.js, which buffers the body
  experimental: { proxyClientMaxBodySize: '12mb' },
  compress: true,
  // Server-only libraries: keep them out of the bundle (faster builds, no optional-driver warnings)
  serverExternalPackages: ['knex', 'mysql2', 'exceljs', 'pdf-lib', '@pdf-lib/fontkit', 'web-push', 'sanitize-html', 'qrcode', 'bcryptjs'],
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'same-origin' },
          { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=()' },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000' },
        ],
      },
      { source: '/fonts/:f*', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] },
      { source: '/sw.js', headers: [{ key: 'Cache-Control', value: 'no-cache' }, { key: 'Service-Worker-Allowed', value: '/' }] },
    ];
  },
};
export default nextConfig;
