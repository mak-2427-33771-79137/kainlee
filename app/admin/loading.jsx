import March from '@/components/March';

// Shown instantly on every tap while the next admin page is prepared.
export default function Loading() {
  return (
    <div className="stack" aria-busy="true" aria-live="polite">
      <div className="skel" style={{ height: 22, width: 120 }} />
      <div className="skel" style={{ height: 38, width: 'min(320px,80%)' }} />
      <March squads={2} men={3} height={34} duration={9} />
      <div className="kpis">
        {[0, 1, 2].map((i) => <div key={i} className="card3 band skelcard" />)}
      </div>
    </div>
  );
}
