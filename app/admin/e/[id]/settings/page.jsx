import { pageUser, pageEvent, allowed } from '@/lib/page';
import { db } from '@/lib/db';
import { can } from '@/lib/rbac';
import { dateToIstInput } from '@/lib/util';
import { eventTemplates, PLACEHOLDERS } from '@/lib/templates';
import { DEFAULT_CARD_HTML, CARD_PLACEHOLDERS } from '@/lib/cards';
import NoAccess from '@/components/NoAccess';
import EventSetup from './EventSetup';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Event setup' };

export default async function SettingsPage({ params }) {
  const user = await pageUser();
  const ev = await pageEvent(params);
  if (!allowed(user, 'events.manage')) return <NoAccess what="event setup" />;
  const k = await db();
  const series = await k('series').orderBy('name');
  return (
    <EventSetup
      ev={{
        id: ev.id, name: ev.name, series_id: ev.series_id || '', status: ev.status, venue: ev.venue || '', map_url: ev.map_url || '',
        rsvp_deadline: dateToIstInput(ev.rsvp_deadline), default_extra_cap: ev.default_extra_cap,
        card_host: ev.card_host || '', card_unit: ev.card_unit || '', card_note: ev.card_note || '', guestroom_enabled: !!ev.guestroom_enabled, code: ev.code || '',
        card_mode: ev.card_mode, card_html: ev.card_html || '',
      }}
      functions={ev.functions.map((f) => ({ id: f.id, name: f.name, starts_at: dateToIstInput(f.starts_at), venue: f.venue || '', map_url: f.map_url || '', dress: f.dress || '' }))}
      series={series.map((s) => ({ id: s.id, name: s.name, card_html: s.card_html || '' }))}
      templates={eventTemplates(ev)}
      placeholders={PLACEHOLDERS}
      cardPlaceholders={CARD_PLACEHOLDERS}
      defaultCard={DEFAULT_CARD_HTML}
      canDelete={can(user.role, 'events.delete')}
    />
  );
}
