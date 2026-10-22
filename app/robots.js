export default function robots() {
  return { rules: [{ userAgent: '*', allow: '/api/health', disallow: '/' }] };
}
