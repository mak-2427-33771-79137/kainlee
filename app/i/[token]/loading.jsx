import Frame from '@/components/Frame';
import March from '@/components/March';

// Shown instantly when a guest opens their link, while the invitation loads.
export default function Loading() {
  return (
    <Frame>
      <main className="gwrap" style={{ minHeight: '100%', justifyContent: 'center', alignItems: 'center', textAlign: 'center' }} aria-busy="true">
        <img className="coin" src="/api/logo/512" alt="" width={120} height={120} fetchPriority="high" />
        <March squads={2} men={3} height={36} duration={9} width="640px" />
        <div className="mu">Opening your invitation…</div>
      </main>
    </Frame>
  );
}
