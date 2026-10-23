import Frame from '@/components/Frame';
import Preloader from '@/components/Preloader';

// Shown instantly when a guest opens their link, while the invitation loads.
export default function Loading() {
  return (
    <Frame>
      <main className="gwrap" style={{ minHeight: '100%', justifyContent: 'center', alignItems: 'center', textAlign: 'center' }} aria-busy="true">
        <Preloader size={120} label="Opening your invitation…" />
      </main>
    </Frame>
  );
}
