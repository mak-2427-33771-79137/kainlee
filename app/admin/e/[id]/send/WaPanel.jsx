'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import Icon from '@/components/Icon';
import { admin, toast } from '@/components/client';

const KIND = { invite: 'Invitation', reminder: 'Reminder', confirm: 'Confirmation', eventday: 'Event-day pass' };
const STATUS = {
  queued: ['pen', 'Waiting'], sending: ['pen', 'Sending'], sent: ['att', 'Sent'], failed: ['dec', 'Failed'], skipped: ['gray', 'Skipped'],
};
const DELIVERY = { delivered: 'Delivered', read: 'Read', failed: 'Not delivered' };

// Send invitations / reminders through Xpressbot and watch every message's status.
export default function WaPanel({ eventId, canManage, canSettings }) {
  const [d, setD] = useState(null);
  const [busy, setBusy] = useState('');
  const [all, setAll] = useState(false);
  const load = useCallback(() => admin('wa.log', { event_id: eventId, limit: all ? 500 : 60 }).then(setD).catch(() => {}), [eventId, all]);
  useEffect(() => { load(); const t = setInterval(() => !document.hidden && load(), 8000); return () => clearInterval(t); }, [load]);
  if (!d) return null;

  const count = (kind, status) => d.counts.filter((c) => (!kind || c.kind === kind) && (!status || c.status === status)).reduce((a, c) => a + c.n, 0);
  const waiting = count(null, 'queued') + count(null, 'sending');
  const failed = count(null, 'failed');
  const go = async (kind) => {
    const label = kind === 'invite' ? 'invitations to every guest not yet invited' : 'reply reminders to every guest who has not replied';
    if (!window.confirm(`Send ${label} on WhatsApp now?`)) return;
    setBusy(kind);
    try {
      const r = await admin('wa.send', { event_id: eventId, kind });
      toast(r.added ? `${r.added} message(s) queued. They go out at about 17 a minute.` : 'No one to send to.');
      if (r.noMobile) toast(`${r.noMobile} guest(s) have no mobile number and were skipped.`, true);
      load();
    } catch (e) { toast(e.message, true); } finally { setBusy(''); }
  };
  const act = async (action, ok) => { setBusy(action); try { const r = await admin(action, { event_id: eventId }); toast(`${ok}: ${r.n}`); load(); } catch (e) { toast(e.message, true); } finally { setBusy(''); } };

  return (
    <section className="card3 band stack" style={{ padding: '18px 14px 14px', gap: 12 }} id="wa-auto">
      <div className="row" style={{ justifyContent: 'space-between', gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <h2 className="go" style={{ fontSize: 22, margin: 0 }}>Send automatically (WhatsApp API)</h2>
          <span className="mu" style={{ fontSize: 13.5 }}>Messages go from your WhatsApp Business number through Xpressbot. No phone needed.</span>
        </div>
        <span className={`chip ${d.enabled ? 'att' : 'gray'}`}>{d.enabled ? 'Connected' : 'Off'}</span>
      </div>

      {!d.enabled ? (
        <div className="ins-note">WhatsApp automation is off.{canSettings ? <> Set it up in <Link href="/admin/settings#whatsapp">Settings › WhatsApp automation</Link>.</> : ' Ask the Super Admin to set it up in Settings.'}</div>
      ) : (<>
        {canManage && (
          <div className="row" style={{ gap: 8 }}>
            <button type="button" className="btn pri" disabled={!!busy} onClick={() => go('invite')}><Icon n="send" size={16} />{busy === 'invite' ? 'Queuing…' : 'Send invitations to all not yet invited'}</button>
            <button type="button" className="btn" disabled={!!busy} onClick={() => go('reminder')}><Icon n="bell" size={16} />{busy === 'reminder' ? 'Queuing…' : 'Send reply reminders now'}</button>
          </div>
        )}
        <div className="row mu" style={{ gap: 6, fontSize: 13 }}>
          <span>Automatic for this event:</span>
          <span className={`chip ${d.switches.wa_reminders ? 'att' : 'gray'}`}>Reminders {d.switches.wa_reminders ? 'on' : 'off'}</span>
          <span className={`chip ${d.switches.wa_confirm ? 'att' : 'gray'}`}>Confirmation {d.switches.wa_confirm ? 'on' : 'off'}</span>
          <span className={`chip ${d.switches.wa_eventday ? 'att' : 'gray'}`}>Event-day pass {d.switches.wa_eventday ? 'on' : 'off'}</span>
          <Link href={`/admin/e/${eventId}/settings`} style={{ fontSize: 13 }}>Change</Link>
        </div>
      </>)}

      <div className="ins-stats">
        <div><span className="big go">{count(null, 'sent')}</span><span className="mu">sent</span></div>
        <div><span className="big go">{waiting}</span><span className="mu">waiting to send</span></div>
        <div><span className="big go" style={{ color: failed ? 'var(--red-text)' : 'inherit' }}>{failed}</span><span className="mu">failed</span></div>
      </div>
      {canManage && (failed > 0 || waiting > 0) && (
        <div className="row" style={{ gap: 8 }}>
          {failed > 0 && <button type="button" className="btn sm" disabled={!!busy} onClick={() => act('wa.retry', 'Queued again')}>Retry failed</button>}
          {waiting > 0 && <button type="button" className="btn sm ghost" style={{ color: 'var(--red-text)' }} disabled={!!busy} onClick={() => window.confirm('Stop all messages still waiting to be sent?') && act('wa.cancel', 'Cancelled')}>Stop waiting messages</button>}
        </div>
      )}

      {d.rows.length > 0 ? (
        <div className="ins-tablewrap" style={{ maxHeight: 420, overflowY: 'auto' }}>
          <table className="ins-t wa-log">
            <thead><tr><th>Guest</th><th>Message</th><th>Status</th><th>When</th></tr></thead>
            <tbody>{d.rows.map((r) => {
              const [cls, label] = STATUS[r.status] || ['gray', r.status];
              return (
                <tr key={r.id}>
                  <td>{r.invitation_id ? <Link href={`/admin/e/${eventId}/guests/${r.invitation_id}`} style={{ color: 'inherit' }}>{r.name}</Link> : r.name}</td>
                  <td>{KIND[r.kind] || r.kind}</td>
                  <td style={{ textAlign: 'left' }}>
                    <span className={`chip ${cls}`}>{r.status === 'sent' && DELIVERY[r.delivery] ? DELIVERY[r.delivery] : label}</span>
                    {r.error && <div className="mu" style={{ fontSize: 12, maxWidth: 280, whiteSpace: 'normal' }}>{r.error}</div>}
                  </td>
                  <td className="num">{r.sent_at || (r.status === 'queued' ? `after ${r.send_after}` : r.created_at)}</td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      ) : <p className="mu" style={{ margin: 0, fontSize: 14 }}>No WhatsApp API messages for this event yet.</p>}
      {d.rows.length >= 60 && !all && <button type="button" className="btn ghost sm" style={{ alignSelf: 'flex-start' }} onClick={() => setAll(true)}>Show more</button>}
    </section>
  );
}
