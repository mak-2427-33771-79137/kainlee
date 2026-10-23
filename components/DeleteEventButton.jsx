'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@/components/Icon';
import { admin, toast } from '@/components/client';

// Delete an event (asks for the event name to be typed, like on the Event setup page)
export default function DeleteEventButton({ id, name }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button type="button" className="btn sm ghost" style={{ color: 'var(--red-text)', alignSelf: 'flex-start' }} disabled={busy} aria-label={`Delete ${name}`}
      onClick={async () => {
        const c = window.prompt(`This deletes "${name}" with all its functions, guests, RSVPs, rooms and attendance. Invitees stay in the directory.\n\nType the event name to confirm:`);
        if (!c) return;
        setBusy(true);
        try { await admin('event.delete', { id, confirm: c }); toast('Event deleted'); router.refresh(); } catch (e) { toast(e.message, true); } finally { setBusy(false); }
      }}><Icon n="x" size={15} />Delete event</button>
  );
}
