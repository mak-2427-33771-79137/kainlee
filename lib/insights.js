// Dashboard insights, grouped by phase of the event (before / event day / after).
// Pure functions over loadEventData() output so they can be tested without a database.
import { CATEGORIES } from './consts';
import { roomsNeeded } from './stats';

const DAY = 86400000;
const IST = 330 * 60000;
/** IST calendar day "YYYY-MM-DD" */
export const dayKey = (d) => new Date(new Date(d).getTime() + IST).toISOString().slice(0, 10);
const addDays = (key, n) => new Date(Date.parse(`${key}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
/** IST minutes since midnight */
const istMinutes = (d) => { const x = new Date(new Date(d).getTime() + IST); return x.getUTCHours() * 60 + x.getUTCMinutes(); };
const who = (inv) => [inv.rank, inv.name].filter(Boolean).join(' ');
const real = (invs) => invs.filter((i) => !i.is_walkin);

export function phaseOf(functions, now = new Date()) {
  if (!functions.length) return 'before';
  const days = functions.map((f) => dayKey(f.starts_at)).sort();
  const today = dayKey(now);
  if (today < days[0]) return 'before';
  if (today > days[days.length - 1]) return 'after';
  return 'day';
}

/** The function to watch today: the next one not yet over (3 h after start), else the last of today. */
export function currentFunction(functions, now = new Date()) {
  if (!functions.length) return null;
  const today = dayKey(now);
  const todays = functions.filter((f) => dayKey(f.starts_at) === today).sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
  if (!todays.length) return functions[0];
  return todays.find((f) => new Date(f.starts_at).getTime() + 3 * 3600000 > now.getTime()) || todays[todays.length - 1];
}

// ---------- before the event ----------

function funnel(invs) {
  const r = real(invs);
  return [
    { key: 'invited', label: 'Invited', n: r.length },
    { key: 'sent', label: 'Message sent', n: r.filter((i) => i.invite_sent_at).length },
    { key: 'opened', label: 'Opened link', n: r.filter((i) => i.link_opened_at || i.pin_ok_at || i.rsvp_status !== 'pending').length },
    { key: 'pin', label: 'Entered PIN', n: r.filter((i) => i.pin_ok_at || i.rsvp_status !== 'pending').length },
    { key: 'replied', label: 'Replied', n: r.filter((i) => i.rsvp_status !== 'pending').length },
  ];
}

function pace(invs, ev, now) {
  const r = real(invs);
  const pending = r.filter((i) => i.rsvp_status === 'pending').length;
  const today = dayKey(now);
  const daily = [];
  for (let n = 13; n >= 0; n--) daily.push({ day: addDays(today, -n), n: 0 });
  const idx = new Map(daily.map((d, i) => [d.day, i]));
  let last3 = 0;
  for (const i of r) {
    if (!i.responded_at || i.rsvp_status === 'pending') continue;
    const k = dayKey(i.responded_at);
    if (idx.has(k)) daily[idx.get(k)].n++;
    if (now.getTime() - new Date(i.responded_at).getTime() <= 3 * DAY) last3++;
  }
  const deadline = ev.rsvp_deadline ? new Date(ev.rsvp_deadline) : null;
  const daysLeft = deadline ? Math.ceil((deadline.getTime() - now.getTime()) / DAY) : null;
  const perDay = last3 / 3;
  const needPerDay = daysLeft && daysLeft > 0 ? pending / daysLeft : null;
  return {
    pending, last3, daily, daysLeft, deadline,
    // on track if the recent pace would clear the pending replies before the deadline
    onTrack: needPerDay == null ? null : perDay >= needPerDay,
    needPerDay: needPerDay == null ? null : Math.ceil(needPerDay * 10) / 10,
  };
}

function chase(invs, now) {
  const r = real(invs).filter((i) => i.rsvp_status === 'pending');
  const sent = r.filter((i) => i.invite_sent_at).sort((a, b) => new Date(a.invite_sent_at) - new Date(b.invite_sent_at));
  return {
    total: r.length,
    notSent: r.length - sent.length,
    list: sent.slice(0, 10).map((i) => ({
      id: i.id, name: who(i), category: i.category, handler: i.handler_name || null, vip: !!i.vip,
      days: Math.floor((now.getTime() - new Date(i.invite_sent_at).getTime()) / DAY),
      reminded: !!i.reminder_sent_at,
      opened: !!(i.link_opened_at || i.pin_ok_at),
    })),
  };
}

function scorecard(invs) {
  const by = new Map();
  for (const i of real(invs)) {
    const key = i.handler_id || 0;
    if (!by.has(key)) by.set(key, { id: key, name: i.handler_name || 'Unassigned', guests: 0, replied: 0, attending: 0, declined: 0, silent: 0, opened: 0 });
    const h = by.get(key);
    h.guests++;
    if (i.rsvp_status === 'pending') h.silent++; else h.replied++;
    if (i.rsvp_status === 'attending') h.attending++;
    if (i.rsvp_status === 'declined') h.declined++;
    if (i.link_opened_at || i.pin_ok_at) h.opened++;
  }
  return [...by.values()].map((h) => ({ ...h, rate: h.guests ? Math.round((h.replied / h.guests) * 100) : 0 }))
    .sort((a, b) => (a.id === 0) - (b.id === 0) || a.rate - b.rate || b.guests - a.guests);
}

// ---------- planning ----------

function stays(invs) {
  return real(invs).filter((i) => roomsNeeded(i) > 0 && i.guestroom_eta).map((i) => ({
    id: i.id, name: who(i), rooms: roomsNeeded(i), eta: new Date(i.guestroom_eta), etd: i.guestroom_etd ? new Date(i.guestroom_etd) : null,
  }));
}

function arrivals(list) {
  const days = new Map();
  const get = (k) => { if (!days.has(k)) days.set(k, { day: k, arrive: [], leave: [] }); return days.get(k); };
  for (const s of list) {
    get(dayKey(s.eta)).arrive.push({ id: s.id, name: s.name, at: s.eta, rooms: s.rooms });
    if (s.etd) get(dayKey(s.etd)).leave.push({ id: s.id, name: s.name, at: s.etd, rooms: s.rooms });
  }
  const out = [...days.values()].sort((a, b) => a.day.localeCompare(b.day));
  for (const d of out) { d.arrive.sort((a, b) => a.at - b.at); d.leave.sort((a, b) => a.at - b.at); }
  return out;
}

function roomNights(list, totalRooms) {
  if (!list.length) return [];
  const first = list.map((s) => dayKey(s.eta)).sort()[0];
  const last = list.map((s) => (s.etd ? dayKey(s.etd) : addDays(dayKey(s.eta), 1))).sort().pop();
  const out = [];
  for (let d = first; d < last && out.length < 31; d = addDays(d, 1)) {
    let need = 0, families = 0;
    for (const s of list) {
      const a = dayKey(s.eta);
      const b = s.etd ? dayKey(s.etd) : addDays(a, 1);
      if (a <= d && d < b) { need += s.rooms; families++; }
    }
    out.push({ night: d, need, families, rooms: totalRooms, short: Math.max(0, need - totalRooms) });
  }
  return out;
}

function families(invs) {
  const sizes = [];
  for (const i of real(invs)) {
    if (i.rsvp_status !== 'attending') continue;
    const n = i.members.filter((m) => !m.is_walkin && Object.values(m.functions).some((f) => f.attending)).length;
    if (n) sizes.push({ id: i.id, name: who(i), n });
  }
  const dist = [1, 2, 3, 4, 5].map((n) => ({ label: n === 5 ? '5+' : String(n), n: sizes.filter((s) => (n === 5 ? s.n >= 5 : s.n === n)).length }));
  const total = sizes.reduce((a, s) => a + s.n, 0);
  return {
    count: sizes.length, people: total, avg: sizes.length ? Math.round((total / sizes.length) * 10) / 10 : 0,
    dist, largest: [...sizes].sort((a, b) => b.n - a.n).slice(0, 5),
  };
}

// ---------- event day ----------

function live(invs, fn, now) {
  if (!fn) return null;
  const start = new Date(fn.starts_at);
  const marks = [];
  let expected = 0, present = 0, walkins = 0;
  const vipsWaiting = [], noShows = [];
  for (const i of invs) {
    let famExpected = 0, famPresent = 0;
    for (const m of i.members) {
      const f = m.functions[fn.id];
      if (f?.attending && !m.is_walkin) famExpected++;
      if (f?.attendance === 'present') {
        famPresent++; present++;
        if (m.is_walkin || !f.attending) walkins++;
        if (f.marked_at) marks.push(new Date(f.marked_at));
      }
    }
    expected += famExpected;
    if (famExpected && !famPresent) {
      const row = { id: i.id, name: who(i), people: famExpected, handler: i.handler_name || null, mobile: i.mobile || null, vip: !!i.vip };
      if (i.vip) vipsWaiting.push(row);
      noShows.push(row);
    }
  }
  // arrivals per 15 minutes (IST), from the first mark to the last
  let buckets = [];
  if (marks.some((d) => dayKey(d) === dayKey(start))) {
    const fnDay = dayKey(start);
    const mins = marks.filter((d) => dayKey(d) === fnDay).map(istMinutes); // marks on the function's day
    const lo = Math.floor(Math.min(...mins) / 15) * 15, hi = Math.floor(Math.max(...mins) / 15) * 15;
    for (let t = lo; t <= hi && buckets.length < 96; t += 15) buckets.push({ t, n: 0 });
    for (const m of mins) { const b = buckets[Math.floor((Math.floor(m / 15) * 15 - lo) / 15)]; if (b) b.n++; }
    let run = 0; buckets = buckets.map((b) => ({ ...b, label: `${String(Math.floor(b.t / 60)).padStart(2, '0')}${String(b.t % 60).padStart(2, '0')}`, total: (run += b.n) }));
  }
  const started = now >= start;
  return {
    fn: { id: fn.id, name: fn.name, starts_at: fn.starts_at }, started,
    expected, present, walkins,
    buckets,
    vipsWaiting: vipsWaiting.sort((a, b) => b.people - a.people),
    // only call them no-shows once the function has started
    noShows: started ? noShows.sort((a, b) => b.people - a.people) : [],
    noShowPeople: started ? noShows.reduce((a, r) => a + r.people, 0) : 0,
  };
}

// ---------- after the event ----------

function turnout(invs, functions) {
  const cats = Object.fromEntries(CATEGORIES.map((c) => [c.id, { id: c.id, label: c.short, confirmed: 0, came: 0, famConfirmed: 0, famCame: 0 }]));
  const perFn = functions.map((f) => ({ id: f.id, name: f.name, confirmed: 0, came: 0, walkins: 0, served: 0 }));
  const fi = new Map(functions.map((f, n) => [f.id, n]));
  let peopleCame = 0, famCame = 0, famConfirmed = 0;
  for (const i of invs) {
    const c = cats[i.category];
    let conf = false, came = false;
    for (const m of i.members) {
      let mCame = false;
      for (const [fid, f] of Object.entries(m.functions)) {
        const F = perFn[fi.get(Number(fid))];
        if (!F) continue;
        const confirmed = f.attending && !m.is_walkin;
        const present = f.attendance === 'present';
        if (confirmed) { F.confirmed++; if (c) c.confirmed++; conf = true; }
        if (present) { F.served++; mCame = true; came = true; if (confirmed) { F.came++; if (c) c.came++; } else F.walkins++; }
      }
      if (mCame) peopleCame++;
    }
    if (conf) { famConfirmed++; if (c) c.famConfirmed++; }
    if (came) { famCame++; if (c) c.famCame++; }
  }
  const rate = (a, b) => (b ? Math.round((a / b) * 100) : null);
  return {
    categories: Object.values(cats).filter((c) => c.confirmed).map((c) => ({ ...c, rate: rate(c.came, c.confirmed) })),
    functions: perFn.map((f) => ({ ...f, rate: rate(f.came, f.confirmed) })),
    peopleCame, famCame, famConfirmed, famRate: rate(famCame, famConfirmed),
  };
}

export function computeInsights(invs, ev, { totalRooms = 0, now = new Date(), fnId = null } = {}) {
  const fns = [...ev.functions].sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
  const st = stays(invs);
  const r = real(invs);
  const roomsUsed = invs.reduce((a, i) => a + (i.rooms?.length || 0), 0);
  const turn = turnout(invs, fns);
  return {
    phase: phaseOf(fns.length ? fns : ev.starts_at ? [{ starts_at: ev.starts_at }] : [], now),
    before: { funnel: funnel(invs), pace: pace(invs, ev, now), chase: chase(invs, now), scorecard: scorecard(invs) },
    plan: { arrivals: arrivals(st), nights: roomNights(st, totalRooms), families: families(invs) },
    day: live(invs, (fnId && fns.find((f) => f.id === fnId)) || currentFunction(fns, now), now),
    after: {
      ...turn,
      summary: {
        invited: r.length,
        replied: r.filter((i) => i.rsvp_status !== 'pending').length,
        attendingFamilies: r.filter((i) => i.rsvp_status === 'attending').length,
        peopleCame: turn.peopleCame,
        walkins: turn.functions.reduce((a, f) => a + f.walkins, 0),
        roomsUsed,
        familiesStayed: invs.filter((i) => i.rooms?.length).length,
      },
    },
  };
}
