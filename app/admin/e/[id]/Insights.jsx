import Link from 'next/link';
import { fmtDate, fmtHrs, fmtShort } from '@/lib/util';
import { categoryLabel } from '@/lib/consts';

// Dashboard insights by phase. Server component: tabs are links (?phase=), the page refreshes itself.
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const dayLabel = (key) => fmtDate(new Date(`${key}T12:00:00+05:30`)).replace(/ \d{4}$/, '');
const weekday = (key) => new Date(`${key}T12:00:00+05:30`).toLocaleDateString('en-IN', { weekday: 'short', timeZone: 'Asia/Kolkata' });

function Panel({ title, hint, children, wide, action }) {
  return (
    <section className={`card3 band ins-panel${wide ? ' wide' : ''}`}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <h3 className="go" style={{ fontSize: 21, margin: 0 }}>{title}</h3>
        {action}
      </div>
      {hint && <p className="mu" style={{ margin: 0, fontSize: 13 }}>{hint}</p>}
      {children}
    </section>
  );
}

function HBar({ label, n, of, href, red, note, shown }) {
  const body = (
    <>
      <span className="ins-hl">{label}</span>
      <div className="bar"><i className={red ? 'r' : ''} style={{ width: `${pct(n, of)}%` }} /></div>
      <b className="num ins-hn">{shown ?? n}{note ? <span className="mu" style={{ fontWeight: 400 }}> {note}</span> : null}</b>
    </>
  );
  return href ? <Link href={href} className="ins-hrow">{body}</Link> : <div className="ins-hrow">{body}</div>;
}

function Empty({ children }) { return <p className="mu" style={{ margin: 0, fontSize: 14 }}>{children}</p>; }

// ---------------------------------------------------------------------------
function Before({ x, s, ev, g, guestUrl, canSend }) {
  const { funnel, pace, chase, scorecard } = x.before;
  const top = funnel[0].n || 1;
  const maxDaily = Math.max(1, ...pace.daily.map((d) => d.n));
  // biggest drop between two steps, to say where people are getting stuck
  let drop = null;
  for (let i = 1; i < funnel.length; i++) {
    const lost = funnel[i - 1].n - funnel[i].n;
    if (lost > 0 && (!drop || lost > drop.lost)) drop = { from: funnel[i - 1].label, to: funnel[i].label, lost };
  }
  const stuckHint = drop && {
    'Message sent': 'Send the remaining invitations first.',
    'Opened link': 'They got the message but have not opened it: a phone call or reminder helps.',
    'Entered PIN': 'They opened the link but did not enter the PIN: check they have the PIN from the message.',
    Replied: 'They are inside but have not answered: the liaison officer can help them fill it in.',
  }[drop.to];

  return (
    <div className="ins-grid">
      <Panel title="Reply funnel" hint="Where guests are on the way to a reply.">
        <div className="stack" style={{ gap: 6 }}>
          {funnel.map((f) => <HBar key={f.key} label={f.label} n={f.n} of={top} note={`(${pct(f.n, top)}%)`} red={f.key === 'replied'} />)}
        </div>
        {drop && <div className="ins-note"><b>{drop.lost}</b> stopped between “{drop.from}” and “{drop.to}”. {stuckHint}</div>}
      </Panel>

      <Panel title="Reply pace" hint={ev.rsvp_deadline ? `RSVP closes ${fmtDate(ev.rsvp_deadline)} at ${fmtHrs(ev.rsvp_deadline)}` : 'No RSVP deadline set.'}>
        <div className="ins-stats">
          <div><span className="big go">{pace.daysLeft == null ? '—' : pace.daysLeft > 0 ? pace.daysLeft : 0}</span><span className="mu">{pace.daysLeft != null && pace.daysLeft <= 0 ? 'RSVP closed' : 'days left'}</span></div>
          <div><span className="big go">{pace.last3}</span><span className="mu">replies in last 3 days</span></div>
          <div><span className="big go" style={{ color: pace.pending ? 'var(--red-text)' : 'inherit' }}>{pace.pending}</span><span className="mu">still to reply</span></div>
        </div>
        <div className="ins-spark" aria-label="Replies per day, last 14 days">
          {pace.daily.map((d) => <i key={d.day} title={`${dayLabel(d.day)}: ${d.n}`} style={{ height: `${Math.max(4, (d.n / maxDaily) * 100)}%`, opacity: d.n ? 1 : 0.35 }} />)}
        </div>
        <div className="row mu" style={{ justifyContent: 'space-between', fontSize: 11.5 }}><span>{dayLabel(pace.daily[0].day)}</span><span>Replies per day</span><span>Today</span></div>
        {pace.onTrack != null && pace.pending > 0 && (
          <div className={`ins-note${pace.onTrack ? ' ok' : ''}`}>
            {pace.onTrack ? 'On track: at this pace everyone replies before the deadline.' : `Behind: about ${pace.needPerDay} replies a day are needed to finish by the deadline. Send reminders.`}
          </div>
        )}
      </Panel>

      <Panel title="Chase list" hint="Invited, not replied yet. Longest wait first."
        action={chase.total ? <Link href={g({ status: 'pending' })} style={{ fontSize: 13.5 }}>All {chase.total} →</Link> : null}>
        {chase.list.length ? (
          <div className="stack" style={{ gap: 0 }}>
            {chase.list.map((c) => (
              <Link key={c.id} href={guestUrl(c.id)} className="ins-li">
                <span style={{ minWidth: 0 }}><b>{c.name}</b>{c.vip && <span className="chip att" style={{ marginLeft: 6 }}>VIP</span>}<br />
                  <span className="mu" style={{ fontSize: 12.5 }}>{categoryLabel(c.category)} · {c.handler || 'No liaison officer'}</span></span>
                <span style={{ textAlign: 'right', flex: 'none' }}><b className="num">{c.days}d</b><br />
                  <span className="mu" style={{ fontSize: 12 }}>{c.opened ? 'opened' : 'not opened'}{c.reminded ? ' · reminded' : ''}</span></span>
              </Link>
            ))}
          </div>
        ) : <Empty>{chase.total ? 'Everyone who has not replied is still waiting for their invitation message.' : 'Everyone has replied.'}</Empty>}
        {chase.notSent > 0 && <div className="ins-note">{chase.notSent} guest(s) have not been sent the invitation yet.{canSend && <> <Link href={`/admin/e/${ev.id}/send`}>Send invites →</Link></>}</div>}
      </Panel>

      <Panel title="Liaison officers" hint="Lowest reply rate first, so you know whom to nudge.">
        {scorecard.length ? (
          <div className="stack" style={{ gap: 2 }}>
            <div className="ins-sc ins-sch mu"><span>Officer</span><span>Replied</span><span>Yes</span><span>Silent</span></div>
            {scorecard.map((h) => (
              <Link key={h.id} href={g({ handler: h.id || 'none' })} className="ins-sc">
                <span style={{ minWidth: 0, color: h.id ? 'inherit' : 'var(--red-text)' }}><b>{h.name}</b><br /><span className="mu" style={{ fontSize: 12 }}>{h.guests} guests · {h.opened} opened</span></span>
                <span><div className="bar"><i style={{ width: `${h.rate}%` }} /></div><span className="mu num" style={{ fontSize: 12 }}>{h.rate}%</span></span>
                <b className="num">{h.attending}</b>
                <b className="num" style={{ color: h.silent ? 'var(--red-text)' : 'inherit' }}>{h.silent}</b>
              </Link>
            ))}
          </div>
        ) : <Empty>No guests yet.</Empty>}
      </Panel>

      <Plan x={x} s={s} ev={ev} guestUrl={guestUrl} />
    </div>
  );
}

// ---------------------------------------------------------------------------
function Plan({ x, s, ev, guestUrl }) {
  const { arrivals, nights, families } = x.plan;
  const maxNight = Math.max(1, ...nights.map((n) => Math.max(n.need, n.rooms)));
  const fns = ev.functions;
  const maxDist = Math.max(1, ...families.dist.map((d) => d.n));
  return (
    <>
      <h2 className="go ins-sub">Planning</h2>
      {!!ev.guestroom_enabled && (
        <Panel title="Arrivals & departures" hint="Guests staying in guest rooms, by day (IST).">
          {arrivals.length ? (
            <div className="stack" style={{ gap: 10 }}>
              {arrivals.map((d) => (
                <div key={d.day} className="ins-day">
                  <div className="ins-dayh"><b>{weekday(d.day)} {dayLabel(d.day)}</b><span className="mu">{d.arrive.length ? `${d.arrive.reduce((a, r) => a + r.rooms, 0)} room(s) in` : ''}{d.arrive.length && d.leave.length ? ' · ' : ''}{d.leave.length ? `${d.leave.reduce((a, r) => a + r.rooms, 0)} out` : ''}</span></div>
                  {d.arrive.map((r) => <Link key={`a${r.id}`} href={guestUrl(r.id)} className="ins-tl"><span className="chip att">In {fmtHrs(r.at).replace(' hrs', '')}</span><span>{r.name}</span><span className="mu num">{r.rooms} rm</span></Link>)}
                  {d.leave.map((r) => <Link key={`l${r.id}`} href={guestUrl(r.id)} className="ins-tl"><span className="chip gray">Out {fmtHrs(r.at).replace(' hrs', '')}</span><span>{r.name}</span><span className="mu num">{r.rooms} rm</span></Link>)}
                </div>
              ))}
            </div>
          ) : <Empty>No guest-room stays with an arrival time yet.</Empty>}
        </Panel>
      )}

      {!!ev.guestroom_enabled && (
        <Panel title="Rooms needed each night" hint={`Rooms needed against the ${s.guestroom.total_rooms} room(s) listed. A red bar means a shortage that night.`}>
          {nights.length ? (
            <div className="stack" style={{ gap: 6 }}>
              {nights.map((n) => (
                <div key={n.night} className="ins-hrow">
                  <span className="ins-hl">{weekday(n.night)} {dayLabel(n.night)}</span>
                  <div className="bar" style={{ position: 'relative' }}>
                    <i className={n.short ? 'r' : ''} style={{ width: `${pct(n.need, maxNight)}%` }} />
                    <span className="ins-cap" style={{ left: `${pct(n.rooms, maxNight)}%` }} title="Rooms available" />
                  </div>
                  <b className="num ins-hn" style={{ color: n.short ? 'var(--red-text)' : 'inherit' }}>{n.need}/{n.rooms}{n.short ? ` (−${n.short})` : ''}</b>
                </div>
              ))}
            </div>
          ) : <Empty>No overnight stays yet.</Empty>}
        </Panel>
      )}

      <Panel title="Meals & diet" hint="Confirmed people per function.">
        {fns.length ? (
          <div className="stack" style={{ gap: 10 }}>
            {fns.map((f) => {
              const F = s.functions[f.id];
              return (
                <div key={f.id} className="ins-day">
                  <div className="ins-dayh"><b>{f.name}</b><span className="mu num">{F.heads.total} people</span></div>
                  <div className="ins-split"><span style={{ width: `${pct(F.heads.veg, F.heads.total)}%` }}>Veg {F.heads.veg}</span><span style={{ width: `${pct(F.heads.nonveg, F.heads.total)}%` }}>Non-veg {F.heads.nonveg}</span></div>
                  {!!ev.diet_notes_enabled && (F.notes.length
                    ? <ul className="ins-notes">{F.notes.slice(0, 12).map((n, i) => <li key={i}><b>{n.name}</b>: {n.note}</li>)}{F.notes.length > 12 && <li className="mu">and {F.notes.length - 12} more in the catering sheet</li>}</ul>
                    : <span className="mu" style={{ fontSize: 13 }}>No dietary notes.</span>)}
                </div>
              );
            })}
          </div>
        ) : <Empty>Add functions to see meal counts.</Empty>}
      </Panel>

      <Panel title="Children" hint="For seating, menu and children’s arrangements.">
        {fns.length ? (
          <div className="ins-tablewrap"><table className="ins-t">
            <thead><tr><th>Function</th><th>Adults</th><th>5–12</th><th>Under 5</th></tr></thead>
            <tbody>{fns.map((f) => { const h = s.functions[f.id].heads; return <tr key={f.id}><td>{f.name}</td><td className="num">{h.adult}</td><td className="num">{h.child}</td><td className="num">{h.infant}</td></tr>; })}</tbody>
          </table></div>
        ) : <Empty>Add functions to see age groups.</Empty>}
      </Panel>

      <Panel title="Family size" hint={families.count ? `${families.count} families coming · ${families.people} people · ${families.avg} per family on average` : undefined}>
        {families.count ? (<>
          <div className="ins-cols">
            {families.dist.map((d) => (
              <div key={d.label}><b className="num">{d.n}</b><i style={{ height: `${Math.max(3, (d.n / maxDist) * 100)}%` }} /><span className="mu">{d.label}</span></div>
            ))}
          </div>
          <div className="mu" style={{ fontSize: 12, textAlign: 'center' }}>People per family</div>
          <div className="lbl" style={{ marginTop: 4 }}>Largest families</div>
          {families.largest.map((f) => <Link key={f.id} href={guestUrl(f.id)} className="ins-li"><span>{f.name}</span><b className="num">{f.n}</b></Link>)}
        </>) : <Empty>No confirmed families yet.</Empty>}
      </Panel>
    </>
  );
}

// ---------------------------------------------------------------------------
function Day({ x, s, ev, g, guestUrl, fnLinks }) {
  const L = x.day;
  if (!L) return <div className="ins-grid"><Panel title="Event day"><Empty>Add functions to use the event-day view.</Empty></Panel></div>;
  const maxB = Math.max(1, ...L.buckets.map((b) => b.n));
  return (
    <div className="ins-grid">
      <Panel title={`Live arrivals · ${L.fn.name}`} hint={`Starts ${fmtDate(L.fn.starts_at)} at ${fmtHrs(L.fn.starts_at)}. Updates every 30 seconds.`} wide action={fnLinks}>
        <div className="ins-stats">
          <div><span className="big go" style={{ color: 'var(--red)' }}>{L.present}</span><span className="mu">present of {L.expected} expected{L.walkins ? ` (incl. ${L.walkins} walk-in${L.walkins > 1 ? 's' : ''})` : ''}</span></div>
          <div><span className="big go">{Math.max(0, L.expected - (L.present - L.walkins))}</span><span className="mu">still to come</span></div>
          <div><span className="big go">{pct(L.present - L.walkins, L.expected)}%</span><span className="mu">arrived</span></div>
        </div>
        <div className="bar" style={{ height: 16 }}><i className="r" style={{ width: `${pct(L.present - L.walkins, L.expected)}%` }} /></div>
        {L.buckets.length ? (<>
          <div className="lbl" style={{ marginTop: 6 }}>Arrivals every 15 minutes</div>
          <div className="ins-cols ins-cols-t">
            {L.buckets.map((b) => <div key={b.t}><b className="num">{b.n || ''}</b><i style={{ height: `${Math.max(3, (b.n / maxB) * 100)}%` }} /><span className="mu">{b.label}</span></div>)}
          </div>
        </>) : <Empty>No one marked present yet.</Empty>}
      </Panel>

      <Panel title="VIPs still to arrive" hint="Guests ticked VIP in the directory who are expected and not yet in." action={<Link href="/admin/directory" style={{ fontSize: 13 }}>Mark VIPs →</Link>}>
        {L.vipsWaiting.length ? L.vipsWaiting.map((r) => (
          <div key={r.id} className="ins-li">
            <Link href={guestUrl(r.id)} style={{ minWidth: 0, color: 'inherit', textDecoration: 'none' }}><b>{r.name}</b><br /><span className="mu" style={{ fontSize: 12.5 }}>{r.people} expected · {r.handler || 'No liaison officer'}</span></Link>
            {r.mobile && <a className="btn sm" href={`tel:+${r.mobile}`}>Call</a>}
          </div>
        )) : <Empty>All VIPs are in, or no guest is ticked as VIP.</Empty>}
      </Panel>

      <Panel title="Walk-ins" hint="People let in at the gate who were not on the RSVP.">
        <div className="ins-stats">
          <div><span className="big go">{L.walkins}</span><span className="mu">walk-ins at {L.fn.name}</span></div>
          <div><span className="big go" style={{ color: s.walkins_pending ? 'var(--red-text)' : 'inherit' }}>{s.walkins_pending}</span><span className="mu">waiting for approval</span></div>
        </div>
        {s.walkins_pending > 0 && <Link className="btn sm" href={g({ walkin: 'pending' })} style={{ alignSelf: 'flex-start' }}>Review walk-ins</Link>}
      </Panel>

      <Panel title="Not arrived yet" hint={L.started ? 'Confirmed families with no one marked present.' : `Shown once ${L.fn.name} has started.`}
        action={L.noShows.length ? <Link href={g({ fn: L.fn.id, att: 'notyet' })} style={{ fontSize: 13 }}>All {L.noShows.length} →</Link> : null}>
        {L.started ? (L.noShows.length ? (<>
          <div className="mu" style={{ fontSize: 13 }}><b>{L.noShowPeople}</b> people in <b>{L.noShows.length}</b> families</div>
          {L.noShows.slice(0, 12).map((r) => (
            <div key={r.id} className="ins-li">
              <Link href={guestUrl(r.id)} style={{ minWidth: 0, color: 'inherit', textDecoration: 'none' }}><b>{r.name}</b>{r.vip && <span className="chip att" style={{ marginLeft: 6 }}>VIP</span>}<br /><span className="mu" style={{ fontSize: 12.5 }}>{r.people} expected · {r.handler || 'No liaison officer'}</span></Link>
              {r.mobile && <a className="btn sm" href={`tel:+${r.mobile}`}>Call</a>}
            </div>
          ))}
        </>) : <Empty>Every confirmed family has arrived.</Empty>) : <Empty>Not started yet.</Empty>}
      </Panel>

      <Plan x={x} s={s} ev={ev} guestUrl={guestUrl} />
    </div>
  );
}

// ---------------------------------------------------------------------------
function After({ x, ev, canExport }) {
  const A = x.after;
  const S = A.summary;
  return (
    <div className="ins-grid">
      <Panel title="Final summary" wide action={canExport ? <a href={`/api/admin/export?event=${ev.id}&report=summary&format=pdf`} style={{ fontSize: 13 }}>Summary report (PDF) →</a> : null}>
        <div className="ins-stats ins-stats6">
          <div><span className="big go">{S.invited}</span><span className="mu">invited</span></div>
          <div><span className="big go">{S.replied}</span><span className="mu">replied ({pct(S.replied, S.invited)}%)</span></div>
          <div><span className="big go">{S.attendingFamilies}</span><span className="mu">families said yes</span></div>
          <div><span className="big go" style={{ color: 'var(--red)' }}>{S.peopleCame}</span><span className="mu">people came</span></div>
          <div><span className="big go">{S.walkins}</span><span className="mu">walk-in places</span></div>
          <div><span className="big go">{S.roomsUsed}</span><span className="mu">rooms used · {S.familiesStayed} families</span></div>
        </div>
      </Panel>

      <Panel title="Turnout by function" hint="Confirmed people who came, plus walk-ins. Meals served = everyone marked present.">
        {A.functions.length ? (
          <div className="ins-tablewrap"><table className="ins-t">
            <thead><tr><th>Function</th><th>Confirmed</th><th>Came</th><th>Walk-ins</th><th>Meals</th></tr></thead>
            <tbody>{A.functions.map((f) => <tr key={f.id}><td>{f.name}</td><td className="num">{f.confirmed}</td><td className="num">{f.came}{f.rate != null ? <span className="mu"> ({f.rate}%)</span> : ''}</td><td className="num">{f.walkins}</td><td className="num"><b>{f.served}</b></td></tr>)}</tbody>
          </table></div>
        ) : <Empty>No functions.</Empty>}
      </Panel>

      <Panel title="Show-up rate by category" hint="Of the people confirmed in each category, how many came. Useful for catering margins next time.">
        {A.categories.length ? (
          <div className="stack" style={{ gap: 6 }}>
            {A.categories.map((c) => <HBar key={c.id} label={c.label} n={c.rate ?? 0} of={100} shown={`${c.rate ?? 0}%`} note={`(${c.came}/${c.confirmed})`} />)}
            <div className="ins-note">Families: {A.famCame} of {A.famConfirmed} confirmed families came ({A.famRate ?? 0}%).</div>
          </div>
        ) : <Empty>No confirmed guests.</Empty>}
      </Panel>
    </div>
  );
}

export default function Insights({ x, s, ev, phase, sp, canExport, canSend }) {
  const base = `/admin/e/${ev.id}`;
  const g = (q) => `${base}/guests?${new URLSearchParams(q)}`;
  const guestUrl = (id) => `${base}/guests/${id}`;
  const tab = (p, label) => {
    const q = new URLSearchParams({ ...(sp.fn ? { fn: sp.fn } : {}), phase: p });
    return <Link key={p} href={`?${q}`} className={`fchip${phase === p ? ' on' : ''}`} aria-current={phase === p ? 'page' : undefined}>{label}{x.phase === p && <span className="ins-now">now</span>}</Link>;
  };
  const fnLinks = ev.functions.length > 1 ? (
    <span className="row" style={{ gap: 4 }}>
      {ev.functions.map((f) => <Link key={f.id} href={`?${new URLSearchParams({ phase: 'day', fn: f.id })}`} className={`fchip${x.day?.fn.id === f.id ? ' on' : ''}`} style={{ padding: '2px 8px', fontSize: 12 }}>{f.name}</Link>)}
    </span>
  ) : null;
  return (
    <section className="stack" style={{ gap: 14 }} aria-label="Insights">
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        {tab('before', 'Before the event')}
        {tab('day', 'Event day')}
        {tab('after', 'After')}
      </div>
      {phase === 'before' && <Before x={x} s={s} ev={ev} g={g} guestUrl={guestUrl} canSend={canSend} />}
      {phase === 'day' && <Day x={x} s={s} ev={ev} g={g} guestUrl={guestUrl} fnLinks={fnLinks} />}
      {phase === 'after' && <After x={x} ev={ev} canExport={canExport} />}
    </section>
  );
}
