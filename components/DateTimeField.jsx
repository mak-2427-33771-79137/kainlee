'use client';

// Date + time as two native pickers (reliable on iPhone, unlike datetime-local).
// value / onChange use "YYYY-MM-DDTHH:MM" (IST), same as before.
export default function DateTimeField({ id, label, value, onChange, disabled, dateLabel = 'Date', timeLabel = 'Time', hint }) {
  const [d = '', t = ''] = String(value || '').split('T');
  const set = (nd, nt) => onChange(nd ? `${nd}T${nt || '12:00'}` : '');
  return (
    <fieldset className="dtf" disabled={disabled}>
      <legend>{label}</legend>
      <div className="dtf-row">
        <label className="dtf-cell">
          <span>{dateLabel}</span>
          <input className="inp" id={`${id}-date`} type="date" value={d} onChange={(e) => set(e.target.value, t)} />
          {!d && <i aria-hidden="true">{hint || 'Tap to choose'}</i>}
        </label>
        <label className="dtf-cell">
          <span>{timeLabel}</span>
          <input className="inp" id={`${id}-time`} type="time" value={d ? t : ''} disabled={!d} onChange={(e) => set(d, e.target.value)} />
        </label>
      </div>
    </fieldset>
  );
}
