// Search engines stay out (pages also send "noindex"), but link-preview crawlers
// (WhatsApp, Facebook, Telegram) may read invitation links to show the card image.
export default function robots() {
  return { rules: [{ userAgent: '*', allow: ['/api/health', '/i/', '/privacy'], disallow: '/' }] };
}
