import Link from 'next/link';
import Frame from '@/components/Frame';

export default function NotFound() {
  return (
    <Frame>
      <main style={{ minHeight: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24, textAlign: 'center' }}>
        <img className="coin" src="/api/logo/192" alt="" width={100} height={100} />
        <h1 className="go" style={{ fontSize: 40 }}>Page not found</h1>
        <p className="mu" style={{ maxWidth: 380, margin: 0 }}>This link is not valid. If it came in your invitation message, ask the organisers to send it again.</p>
        <Link className="btn" href="/">Home</Link>
      </main>
    </Frame>
  );
}
