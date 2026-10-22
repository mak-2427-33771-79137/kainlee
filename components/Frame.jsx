// The regimental colour-band frame (green / red / green) with curved, nested corners.
export default function Frame({ children, id = 'paper' }) {
  return (
    <div className="kf">
      <div className="kf-red">
        <div className="kf-in">
          <div className="paper" id={id}>{children}</div>
        </div>
      </div>
    </div>
  );
}
