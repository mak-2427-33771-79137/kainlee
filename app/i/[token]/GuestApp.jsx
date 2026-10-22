'use client';
import { useEffect, useMemo, useState } from 'react';
import Icon from '@/components/Icon';
import March from '@/components/March';
import CardView from '@/components/CardView';
import DateTimeField from '@/components/DateTimeField';
import { api, toast, confetti } from '@/components/client';
import { dict, LANGS } from '@/lib/i18n';
import { RELATIONS, AGE_GROUPS, FAMILY_RELATIONS } from '@/lib/consts';

const TZ = 'Asia/Kolkata';
const dt = (d, lang) => new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : lang === 'hi' ? 'hi-IN' : 'ne-NP', { timeZone: TZ, day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(d));
const hrs = (d) => { const p = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(d)).replace(':', ''); return `${p} hrs`; };

function Lang({ lang, setLang }) {
  return (
    <div className="lang" role="group" aria-label="Language">
      {LANGS.map((l) => <button key={l.id} type="button" aria-pressed={lang === l.id} onClick={() => setLang(l.id)}>{l.short}</button>)}
    </div>
  );
}

export default function GuestApp({ token, initial, preview }) {
  const [data, setData] = useState(initial);
  const [lang, setLangS] = useState(initial?.invitee?.lang || preview.lang || 'en');
  useEffect(() => { try { const s = localStorage.getItem('kl_lang'); if (s) setLangS(s); } catch {} }, []);
  const setLang = (l) => { setLangS(l); try { localStorage.setItem('kl_lang', l); } catch {} };
  const t = dict(lang);
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  if (!data) return <Pin token={token} t={t} lang={lang} setLang={setLang} preview={preview} onOpen={setData} />;
  return <Invitation token={token} data={data} setData={setData} t={t} lang={lang} setLang={setLang} />;
}

function Pin({ token, t, lang, setLang, preview, onOpen }) {
  const [pin, setPin] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setErr(''); setBusy(true);
    try {
      await api(`/api/g/${token}`, { action: 'pin', pin });
      onOpen(await api(`/api/g/${token}`, { action: 'view' }));
    } catch (er) { setErr(er.status === 429 ? t.locked : t.wrongPin); setPin(''); } finally { setBusy(false); }
  };
  return (
    <main className="gwrap" style={{ minHeight: '100%', justifyContent: 'center' }}>
      <div className="row" style={{ justifyContent: 'flex-end' }}><Lang lang={lang} setLang={setLang} /></div>
      <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
        <img className="coin" src="/api/logo/512" alt="" width={120} height={120} />
        <div className="go" style={{ fontSize: 'clamp(36px,10vw,52px)', textShadow: '0 1px 0 #fff,0 4px 0 #d9d0bc' }}>{preview.regiment}</div>
        <div className="mu">{t.welcome}</div>
        <div className="go" style={{ fontSize: 26, color: 'var(--green)' }}>{preview.name}</div>
        <div className="mu" style={{ fontSize: 14 }}>{preview.event}</div>
      </div>
      <March squads={2} men={3} height={36} duration={13} width="640px" />
      <form onSubmit={submit} className="card3 band stack" style={{ padding: '22px 18px 18px' }}>
        <label className="field"><span>{t.enterPin}</span>
          <input className="inp num" id="pin" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))} inputMode="numeric" autoComplete="one-time-code" pattern="\d{4}" required
            style={{ fontSize: 34, letterSpacing: '.5em', textAlign: 'center', fontWeight: 700 }} aria-label={t.pin} autoFocus />
        </label>
        {err && <div className="err" role="alert">{err}</div>}
        <button className="btn pri" style={{ minHeight: 52, fontSize: 17 }} disabled={busy || pin.length !== 4}>{t.open}</button>
      </form>
      <p className="credit">{preview.credit}</p>
    </main>
  );
}

function Invitation({ token, data, setData, t, lang, setLang }) {
  const { event, invitee, invitation: inv } = data;
  const fns = event.functions;
  const fnIds = fns.map((f) => f.id);
  const closed = event.closed;
  const [flip, setFlip] = useState(false);
  // Not replied yet: everything is pre-ticked, so "Save" means attending
  const withDefaults = (d) => (d.invitation.rsvp_status === 'pending' ? d.members.map((m) => (m.attending.length ? m : { ...m, attending: [...fnIds] })) : d.members);
  const [members, setMembers] = useState(() => withDefaults(data));
  const [reply, setReply] = useState(inv.rsvp_status);
  const [gr, setGr] = useState({ required: inv.guestroom_required, rooms: inv.rooms_required || 1, eta: inv.eta, etd: inv.etd });
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [installEvt, setInstallEvt] = useState(null);

  useEffect(() => { setMembers(withDefaults(data)); setReply(data.invitation.rsvp_status); }, [data]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const h = (e) => { e.preventDefault(); setInstallEvt(e); };
    window.addEventListener('beforeinstallprompt', h);
    // refresh every minute while open (check-in status, room allotment)
    const iv = setInterval(async () => { if (!document.hidden && !dirty) try { setData(await api(`/api/g/${token}`, { action: 'view' })); } catch {} }, 60000);
    return () => { window.removeEventListener('beforeinstallprompt', h); clearInterval(iv); };
  }, [token, dirty, setData]);

  const extras = members.filter((m) => !FAMILY_RELATIONS.includes(m.relation) && !m.is_walkin).length;
  const upd = (i, patch) => { setMembers(members.map((m, j) => (j === i ? { ...m, ...patch } : m))); setDirty(true); setReply('attending'); };
  const toggleFn = (i, fid) => { const m = members[i]; upd(i, { attending: m.attending.includes(fid) ? m.attending.filter((x) => x !== fid) : [...m.attending, fid] }); };
  const add = () => {
    setMembers([...members, { name: '', relation: 'spouse', age_group: 'adult', meal: 'veg', meal_note: '', attending: [...fnIds] }]);
    setDirty(true); setReply('attending');
  };
  const daysTo = fns.length ? Math.ceil((new Date(fns[0].starts_at) - Date.now()) / 86400000) : null;
  const checkedIn = Object.keys(data.present || {}).length > 0;
  const nights = useMemo(() => { const ms = new Date(gr.etd) - new Date(gr.eta); return ms > 0 ? Math.max(1, Math.round(ms / 86400000)) : null; }, [gr]);

  async function save(decline) {
    setBusy(true);
    try {
      const next = await api(`/api/g/${token}`, {
        action: 'save', decline,
        members: members.map(({ id, name, relation, age_group, meal, meal_note, attending }) => ({ id, name, relation, age_group, meal, meal_note, attending: decline ? [] : attending })),
        guestroom: inv.guestroom_eligible && event.guestroom ? gr : undefined,
      });
      setData(next); setDirty(false);
      if (!decline) { confetti(); toast(`${t.saved} ${data.warCry || ''}`); } else toast(t.saved);
    } catch (e) { toast(e.message, true); } finally { setBusy(false); }
  }

  const relLabel = (r) => t[`rel_${r}`];
  const ageLabel = (a) => t[`age_${a}`];

  return (
    <main className="gwrap">
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
        <span className="mu" style={{ fontSize: 13.5, minWidth: 0 }}>{t.welcome}, <b style={{ color: 'var(--ink)' }}>{invitee.name}</b></span>
        <Lang lang={lang} setLang={setLang} />
      </div>

      {checkedIn && <div className="card3 band" style={{ padding: '18px 12px 12px', textAlign: 'center' }}><span className="stamp" style={{ fontSize: 'clamp(15px,4.6vw,20px)', lineHeight: 1.2, padding: '4px 10px', borderWidth: 3, maxWidth: '100%', transform: 'rotate(-3deg)' }}>✓ {t.checkedIn}</span></div>}

      <div className="scene">
        <div className="tiltc">
          <button type="button" className={`flip${flip ? ' on' : ''}`} onClick={() => { setFlip(!flip); if (!flip) api(`/api/g/${token}`, { action: 'qr' }).catch(() => {}); }} aria-label={flip ? t.tapBack : t.tapFront}>
            <div className="face" style={{ position: 'relative' }}><CardView html={data.cardHtml} /><div className="gloss" /></div>
            <div className="face back">
              <div className="go" style={{ fontSize: 22, color: 'var(--green)' }}>{t.yourQr}</div>
              <div dangerouslySetInnerHTML={{ __html: data.qrSvg }} style={{ width: 'min(46%,190px)' }} />
              <div className="go" style={{ fontSize: 18 }}>{invitee.name}</div>
              <div className="mu" style={{ fontSize: 13 }}>{t.showQr}</div>
            </div>
          </button>
        </div>
      </div>
      <div className="mu" style={{ fontSize: 12.5, textAlign: 'center', marginTop: -8 }}>{flip ? t.tapBack : t.tapFront}{daysTo > 0 ? ` · ${daysTo} ${t.countdown}` : ''}</div>

      <March squads={2} men={3} height={34} duration={13} width="640px" />

      {closed && <div className="err">{t.closed}</div>}

      <section className="card3 band stack" style={{ padding: '20px 14px 14px' }}>
        <h2 className="go" style={{ fontSize: 24 }}>{t.rsvp}</h2>
        <div className="grid2" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <button type="button" className={`btn${reply === 'attending' ? ' grn' : ''}`} disabled={closed} onClick={() => { setReply('attending'); setDirty(true); if (members.every((m) => !m.attending.length)) setMembers(members.map((m) => ({ ...m, attending: [...fnIds] }))); }}>✓ {t.attending}</button>
          <button type="button" className={`btn${reply === 'declined' ? ' pri' : ''}`} style={reply === 'declined' ? {} : { borderColor: 'var(--red)', color: '#a10d0d', boxShadow: '0 4px 0 var(--red)' }} disabled={closed || busy} onClick={() => { setReply('declined'); save(true); }}>{t.declined}</button>
        </div>
        {reply === 'declined' && !dirty && <div className="okmsg">{t.regretMsg}</div>}
      </section>

      {reply !== 'declined' && (
        <section className="card3 band stack" style={{ padding: '20px 14px 14px' }}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h2 className="go" style={{ fontSize: 24 }}>{t.yourParty}</h2>
            <span className="mu" style={{ fontSize: 12.5 }}>{t.whoAttends}</span>
          </div>
          {members.map((m, i) => (
            <div key={m.id || `n${i}`} style={{ borderBottom: '1px dashed var(--rule2)', paddingBottom: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {m.relation === 'self' || m.is_walkin ? (
                <div><b style={{ fontSize: 16 }}>{m.name}</b> <span className="mu" style={{ fontSize: 13 }}>· {relLabel(m.relation)}</span></div>
              ) : (
                <label className="field"><span>{t.name}</span><input className="inp" id={`g-name-${i}`} value={m.name} disabled={closed} onChange={(e) => upd(i, { name: e.target.value })} autoCapitalize="words" /></label>
              )}
              <div className="grid2" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,120px),1fr))', gap: 8 }}>
                {m.relation !== 'self' && !m.is_walkin && (
                  <label className="field"><span>{t.relation}</span><select className="inp" id={`g-rel-${i}`} value={m.relation} disabled={closed} onChange={(e) => upd(i, { relation: e.target.value })}>
                    {RELATIONS.filter((r) => r !== 'self').map((r) => <option key={r} value={r} disabled={!FAMILY_RELATIONS.includes(r) && FAMILY_RELATIONS.includes(m.relation) && extras >= inv.extra_cap}>{relLabel(r)}</option>)}
                  </select></label>
                )}
                <label className="field"><span>{t.age}</span><select className="inp" id={`g-age-${i}`} value={m.age_group} disabled={closed || m.is_walkin} onChange={(e) => upd(i, { age_group: e.target.value })}>{AGE_GROUPS.map((a) => <option key={a} value={a}>{ageLabel(a)}</option>)}</select></label>
                <label className="field"><span>{t.meal}</span><select className="inp" id={`g-meal-${i}`} value={m.meal} disabled={closed || m.is_walkin} onChange={(e) => upd(i, { meal: e.target.value })}><option value="veg">{t.veg}</option><option value="nonveg">{t.nonveg}</option></select></label>
              </div>
              {!m.is_walkin && <input className="inp" id={`g-note-${i}`} value={m.meal_note} disabled={closed} onChange={(e) => upd(i, { meal_note: e.target.value })} placeholder={t.mealNote} aria-label={t.mealNote} style={{ fontSize: 14 }} />}
              <div className="row" style={{ gap: 10 }}>
                {fns.map((f) => (
                  <label key={f.id} className="row" style={{ gap: 6, background: '#faf6ec', borderRadius: 8, padding: '4px 8px', fontSize: 13.5, fontWeight: 700 }}>
                    <button type="button" className="key" aria-pressed={m.attending.includes(f.id)} disabled={closed || m.is_walkin} onClick={() => toggleFn(i, f.id)} aria-label={`${m.name || t.name} – ${f.name}`}><Icon n="check" size={18} sw={3} /></button>{f.name}
                  </label>
                ))}
                {m.relation !== 'self' && !m.is_walkin && !closed && <button type="button" className="btn sm ghost" style={{ color: 'var(--red-text)', marginLeft: 'auto' }} onClick={() => { setMembers(members.filter((_, j) => j !== i)); setDirty(true); }}>{t.remove}</button>}
              </div>
            </div>
          ))}
          {!closed && <button type="button" className="btn" onClick={add}><Icon n="plus" />{t.addMember}</button>}
          <div className="mu" style={{ fontSize: 12.5 }}>{t.extrasLeft}: {Math.max(0, inv.extra_cap - extras)} / {inv.extra_cap} · {t.nameLatin}</div>
        </section>
      )}

      {inv.guestroom_eligible && event.guestroom && reply !== 'declined' && (
        <section className="card3 band stack" style={{ padding: '20px 14px 14px' }}>
          <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
            <div><h2 className="go" style={{ fontSize: 24 }}>{t.gr}</h2><div className="mu" style={{ fontSize: 13.5 }}>{t.grAsk}</div></div>
            <button type="button" className="tog" aria-pressed={!!gr.required} aria-label={t.grAsk} disabled={closed} onClick={() => { setGr({ ...gr, required: !gr.required }); setDirty(true); if (!gr.required && reply !== 'attending') { setReply('attending'); if (members.every((m) => !m.attending.length)) setMembers(members.map((m) => ({ ...m, attending: [...fnIds] }))); } }}><i /></button>
          </div>
          {gr.required && (
            <div className="stack" style={{ gap: 10, animation: 'toast .35s ease both' }}>
              <div className="field"><span>{t.rooms}</span>
                <div className="row" style={{ flexWrap: 'nowrap', gap: 8 }}>
                  <button type="button" className="btn sm" disabled={closed || gr.rooms <= 1} onClick={() => { setGr({ ...gr, rooms: gr.rooms - 1 }); setDirty(true); }} aria-label="−">−</button>
                  <b className="num" style={{ fontSize: 22, minWidth: 24, textAlign: 'center' }}>{gr.rooms}</b>
                  <button type="button" className="btn sm" disabled={closed || gr.rooms >= 4} onClick={() => { setGr({ ...gr, rooms: gr.rooms + 1 }); setDirty(true); }} aria-label="+">+</button>
                </div>
              </div>
              <DateTimeField id="g-eta" label={t.eta} value={gr.eta} disabled={closed} dateLabel={t.dateL} timeLabel={t.timeL} hint={t.tapChoose} onChange={(v) => { setGr({ ...gr, eta: v }); setDirty(true); }} />
              <DateTimeField id="g-etd" label={t.etd} value={gr.etd} disabled={closed} dateLabel={t.dateL} timeLabel={t.timeL} hint={t.tapChoose} onChange={(v) => { setGr({ ...gr, etd: v }); setDirty(true); }} />
              {gr.eta && gr.etd && <div className={nights ? 'okmsg' : 'err'} style={{ fontSize: 14 }}>{nights ? `${dt(gr.eta + ':00+05:30', lang)}, ${hrs(gr.eta + ':00+05:30')} → ${dt(gr.etd + ':00+05:30', lang)}, ${hrs(gr.etd + ':00+05:30')} · ${nights} ${t.nights}` : t.grBad}</div>}
              <div style={{ border: '2px dashed #d9a400', background: '#fff8e0', borderRadius: 8, padding: '9px 11px', fontSize: 14 }}>
                <b>{t.allotH}</b><br />
                {inv.rooms_allotted.length ? <>{t.allotted}: {inv.rooms_allotted.map((r) => `${r.name}${r.location ? `, ${r.location}` : ''}`).join(' · ')}</> : t.allotPending}
                {inv.note && <div style={{ marginTop: 4 }}>{inv.note}</div>}
              </div>
            </div>
          )}
        </section>
      )}

      {inv.handler && (
        <section className="card3 band row" style={{ padding: '18px 14px 14px', justifyContent: 'space-between' }}>
          <div><div className="lbl">{t.handler}</div><b style={{ fontSize: 17 }}>{inv.handler.name}</b></div>
          {inv.handler.phone && <a className="btn grn" href={`tel:+${inv.handler.phone}`}><Icon n="phone" />{t.call}</a>}
        </section>
      )}

      <section className="card3 band stack" style={{ padding: '20px 14px 14px', gap: 6 }}>
        <h2 className="go" style={{ fontSize: 24 }}>{t.prog}</h2>
        {fns.map((f) => (
          <div key={f.id} className="row" style={{ justifyContent: 'space-between', borderBottom: '1px dashed var(--rule2)', paddingBottom: 6 }}>
            <span><b>{f.name}</b>{f.dress ? <span className="mu"> · {t.dress}: {f.dress}</span> : null}</span>
            <span className="mu num">{dt(f.starts_at, lang)} · {hrs(f.starts_at)}</span>
          </div>
        ))}
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <span>{t.venue}: <b>{fns[0]?.venue || event.venue}</b></span>
          {(fns[0]?.map_url || event.map_url) && <a className="btn sm" href={fns[0]?.map_url || event.map_url} target="_blank" rel="noopener noreferrer">{t.directions}</a>}
        </div>
      </section>

      {!closed && reply !== 'declined' && (
        <button type="button" className="btn pri" style={{ minHeight: 56, fontSize: 17, position: 'sticky', bottom: 10, zIndex: 5 }} disabled={busy} onClick={() => save(false)}>{busy ? t.saving : t.save}</button>
      )}
      {event.rsvp_deadline && !closed && <div className="mu" style={{ textAlign: 'center', fontSize: 13 }}>{t.deadline}: {dt(event.rsvp_deadline, lang)}, {hrs(event.rsvp_deadline)}</div>}

      <div className="row" style={{ justifyContent: 'center' }}>
        <a className="btn" href={event.card_mode === 'builtin' ? `/i/${token}/invitation.pdf` : `/i/${token}/card`} target="_blank" rel="noopener"><Icon n="dl" />{t.downloadPdf}</a>
        {installEvt && <button type="button" className="btn" onClick={async () => { installEvt.prompt(); await installEvt.userChoice; setInstallEvt(null); }}><Icon n="plus" />{t.install}</button>}
      </div>
      {!installEvt && <p className="mu" style={{ textAlign: 'center', fontSize: 12.5, margin: 0 }}>{t.installHint}</p>}
      <p className="credit">{data.credit}</p>
    </main>
  );
}
