import './globals.css';
import SW from '@/components/SW';

export const metadata = {
  title: { default: 'Kainlee Invitations', template: '%s · Kainlee' },
  description: 'Invitations, RSVP and attendance for Kainlee regimental events.',
  robots: { index: false, follow: false },
  icons: { icon: '/api/logo/192', apple: '/apple-touch-icon.png' },
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Kainlee' },
  formatDetection: { telephone: false },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#00572D',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preload" href="/fonts/grenze-gotisch-latin-700-normal.woff2" as="font" type="font/woff2" crossOrigin="" />
        <link rel="preload" href="/fonts/mukta-latin-400-normal.woff2" as="font" type="font/woff2" crossOrigin="" />
      </head>
      <body>
        {children}
        <SW />
      </body>
    </html>
  );
}
