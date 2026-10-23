import Preloader from '@/components/Preloader';

// Shown instantly on every tap while the next admin page is prepared.
export default function Loading() {
  return (
    <div className="stack" aria-busy="true" style={{ alignItems: 'center', justifyContent: 'center', minHeight: '50vh' }}>
      <Preloader size={84} />
    </div>
  );
}
