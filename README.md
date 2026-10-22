# Kainlee Invitations

Invitations, RSVP, guest rooms and gate check-in for Kainlee regimental events.
Built with Next.js + MySQL. Runs on Hostinger Node.js hosting. Installable as an app on phones and tablets.

**Going live? Read [DEPLOY.md](DEPLOY.md).**

## What it does

**Guests** (personal WhatsApp link + 4-digit PIN, English / हिन्दी / नेपाली)
- 3D invitation card that flips to their entry QR (works offline once opened)
- RSVP per function, add wife, children and extra guests (within a limit), meal preference
- Officers: guest room yes/no, number of rooms, ETA and ETD; see their allotted room
- See who is looking after them and call them; download the invitation PDF

**Organisers** (role-based, phone/tablet/desktop)
- Dashboard: invitations, headcount per function, categories, live attendance, guest rooms, who looks after whom
- Guest list with Offrs / guest room / allotment-pending / handler filters, call & WhatsApp buttons, inline room allotment and editable comment, PIN reset, bulk assign / transfer
- Guest rooms: inventory, allotted-to with call button, vacant, required, still needed, officers awaiting rooms
- WhatsApp send queue for invites and event-day reminders (click-to-chat, free)
- Gate check-in: camera QR scan or search, present / absent per person, walk-ins, ADMITTED stamp
- Catering sheet (no personal details)
- Exports: Summary, Guest list, Attendance, Catering, Guest rooms — PDF and Excel, stamped with date, time and user
- Custom HTML invitation card per event or per series of events
- Excel import with template, invitee directory across events
- Users & roles (Super Admin, Coordinator, Liaison Officer, Volunteer, Viewer, Catering), 2-step login for admins
- Notifications (in-app + phone push) when guests change anything
- Activity log of every change (who, what, when), exportable; full backup download

## Roles

| Role | Can |
|---|---|
| Super Admin | Everything, incl. users, settings, activity log, deleting events. 2-step login |
| Event Coordinator | Events, invitees, cards, sending, any guest, rooms, assigning handlers, exports, check-in. 2-step login |
| Liaison Officer | Sees all guests; edits, resets PIN, sends, marks attendance and exports **only for guests assigned to them**; can transfer them to another handler |
| Check-in Volunteer | Gate check-in only |
| Viewer | Read-only dashboard, guests, rooms |
| Catering / Admin Staff | Headcounts and catering sheet only |

## Local development

```bash
npm install
cp .env.example .env.local   # fill in a local MySQL/MariaDB database
npm run dev                  # http://localhost:3000 → /login (first visit creates the Super Admin)
```

The database tables are created automatically on first start (see `lib/schema.js`).
Rule for future changes: only **add** new migrations and keep them additive, so rolling the code back never breaks the database.

Crafted by Mak · makjal.com
