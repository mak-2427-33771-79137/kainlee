export default function NoAccess({ what = 'this page' }) {
  return (
    <div className="card3 band" style={{ padding: '26px 20px', maxWidth: 520 }}>
      <h2 className="go" style={{ fontSize: 26 }}>No access</h2>
      <p className="mu">Your role does not include {what}. Ask the Super Admin if you need it.</p>
    </div>
  );
}
