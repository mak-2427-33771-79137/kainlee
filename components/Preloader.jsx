// "Muster" preloader: the crest breathes while red rings pulse outwards.
// Pure CSS, no extra downloads; the crest image is cached by the service worker, so it works offline.
export default function Preloader({ size = 120, label = 'Loading…', src = '/api/logo/512' }) {
  return (
    <div className="muster" style={{ '--mz': `${size}px` }} role="status" aria-live="polite">
      <div className="muster-stage">
        <span className="muster-ring" />
        <span className="muster-ring" />
        <span className="muster-ring" />
        <img className="muster-crest" src={src} alt="" width={size} height={size} fetchPriority="high" />
      </div>
      {label && <div className="muster-label">{label}</div>}
    </div>
  );
}
