// A squad of Gorkha soldiers (slouch hat, rifle at the slope) marching across a parade line.
function Soldier({ h }) {
  const w = Math.round(h * 0.625);
  return (
    <svg className="sol" viewBox="0 0 40 64" width={w} height={h} fill="#141414" aria-hidden="true">
      <g className="bob">
        <path d="M27.5 26 L33.5 2.5" stroke="#141414" strokeWidth="2.2" strokeLinecap="round" />
        <g className="armB"><path d="M18.6 21.5h3.3l-.5 12.5h-3.2z" /></g>
        <g className="legB"><path d="M18.4 36.5h3.8l.2 17h-3.8z" /><path d="M18 52.6h6.4v3.6H18z" /></g>
        <g className="legF"><path d="M19.6 36.5h3.8l.2 17h-3.8z" /><path d="M19.2 52.6h6.4v3.6h-6.4z" /></g>
        <path d="M16 21.2Q21 19 26 21.2L25.2 38H16.8z" />
        <path d="M16.5 32.6h9v1.8h-9z" fill="#3b3b3b" />
        <path d="M24.5 33.5l4.5 3.2-.8.9-4.4-2.6z" />
        <circle cx="21" cy="16" r="3.9" />
        <path d="M15.4 12.6Q16.8 6.4 21.4 6.6 25.8 6.9 26.2 11.6z" />
        <path d="M8.6 14.2Q21 9.4 34 10.9l-.4 1.6Q21.2 11.6 9.3 15.7z" />
        <path d="M24.2 21.6h3.2l2.6 8.4-2.8.9z" />
      </g>
    </svg>
  );
}

export default function March({ squads = 2, men = 3, height = 44, duration = 22, width = '100%' }) {
  const list = Array.from({ length: squads }, (_, i) => i);
  return (
    <div className="ground" aria-hidden="true" style={{ '--gh': `${height + 6}px`, '--md': `${duration}s`, '--mw': width === '100%' ? '100vw' : width }}>
      {list.map((i) => (
        <div key={i} className="squad" style={{ animationDelay: `${-(duration / squads) * i}s` }}>
          {Array.from({ length: men }, (_, j) => <Soldier key={j} h={height} />)}
        </div>
      ))}
    </div>
  );
}
