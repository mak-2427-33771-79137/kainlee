import { BUILTIN_ROLES } from './rbac';

// Database schema, applied automatically in order on server start.
// Rule for future changes: only ADD new migrations (never edit a shipped one),
// and keep them additive so an older app version still runs on a newer database
// (this is what makes rolling back the code safe).
export const migrations = {
  '001_initial': {
    async up(k) {
      await k.schema.createTable('settings', (t) => {
        t.string('key', 64).primary();
        t.text('value', 'longtext');
      });

      await k.schema.createTable('users', (t) => {
        t.increments('id');
        t.string('name', 120).notNullable();
        t.string('username', 60).notNullable().unique();
        t.string('phone', 16);
        t.string('password_hash', 100).notNullable();
        t.string('role', 20).notNullable(); // super_admin|coordinator|liaison|volunteer|viewer|catering
        t.string('totp_secret', 64);
        t.boolean('totp_enabled').notNullable().defaultTo(false);
        t.boolean('active').notNullable().defaultTo(true);
        t.boolean('notify_all').notNullable().defaultTo(false); // receive every guest change, not only own guests
        t.integer('session_version').notNullable().defaultTo(1);
        t.integer('failed_logins').notNullable().defaultTo(0);
        t.dateTime('locked_until');
        t.dateTime('last_login_at');
        t.dateTime('created_at').notNullable().defaultTo(k.fn.now());
      });

      await k.schema.createTable('series', (t) => {
        t.increments('id');
        t.string('name', 160).notNullable();
        t.text('card_html', 'mediumtext');
        t.dateTime('created_at').notNullable().defaultTo(k.fn.now());
      });

      await k.schema.createTable('events', (t) => {
        t.increments('id');
        t.string('name', 160).notNullable();
        t.integer('series_id').unsigned().references('series.id').onDelete('SET NULL');
        t.string('status', 12).notNullable().defaultTo('active'); // draft|active|closed
        t.string('venue', 200);
        t.string('map_url', 500);
        t.dateTime('rsvp_deadline');
        t.integer('default_extra_cap').notNullable().defaultTo(2);
        t.string('card_host', 200);
        t.string('card_unit', 200);
        t.string('card_note', 200);
        t.string('card_mode', 10).notNullable().defaultTo('builtin'); // builtin|event|series
        t.text('card_html', 'mediumtext');
        t.text('templates', 'mediumtext'); // JSON: invite_en, reminder_hi, ...
        t.dateTime('created_at').notNullable().defaultTo(k.fn.now());
      });

      await k.schema.createTable('functions', (t) => {
        t.increments('id');
        t.integer('event_id').unsigned().notNullable().references('events.id').onDelete('CASCADE');
        t.string('name', 160).notNullable();
        t.dateTime('starts_at').notNullable();
        t.string('venue', 200);
        t.string('map_url', 500);
        t.string('dress', 120);
        t.integer('sort').notNullable().defaultTo(0);
      });

      await k.schema.createTable('invitees', (t) => {
        t.increments('id');
        t.string('category', 20).notNullable(); // officer|veteran|jco_or|veer_nari|civilian
        t.string('rank', 60);
        t.string('name', 160).notNullable();
        t.string('mobile', 16);
        t.string('city', 100);
        t.string('lang', 2).notNullable().defaultTo('en');
        t.string('notes', 300);
        t.dateTime('created_at').notNullable().defaultTo(k.fn.now());
        t.index(['mobile']);
        t.index(['name']);
      });

      await k.schema.createTable('invitations', (t) => {
        t.increments('id');
        t.integer('event_id').unsigned().notNullable().references('events.id').onDelete('CASCADE');
        t.integer('invitee_id').unsigned().notNullable().references('invitees.id').onDelete('CASCADE');
        t.string('token', 40).notNullable().unique();
        t.string('pin', 8).notNullable();
        t.string('checkin_code', 20).notNullable().unique();
        t.integer('extra_cap').notNullable().defaultTo(2);
        t.string('rsvp_status', 12).notNullable().defaultTo('pending');
        t.dateTime('responded_at');
        t.integer('handler_id').unsigned().references('users.id').onDelete('SET NULL');
        t.dateTime('invite_sent_at');
        t.integer('invite_sent_by').unsigned();
        t.integer('invite_send_count').notNullable().defaultTo(0);
        t.dateTime('reminder_sent_at');
        t.integer('reminder_sent_by').unsigned();
        t.integer('claimed_by').unsigned();
        t.dateTime('claimed_at');
        t.dateTime('guest_last_seen_at');
        t.dateTime('qr_viewed_at');
        t.integer('pin_failures').notNullable().defaultTo(0);
        t.dateTime('pin_locked_until');
        t.boolean('is_walkin').notNullable().defaultTo(false);
        t.boolean('guestroom_eligible').notNullable().defaultTo(false);
        t.boolean('guestroom_required').notNullable().defaultTo(false);
        t.integer('rooms_required').notNullable().defaultTo(1);
        t.dateTime('guestroom_eta');
        t.dateTime('guestroom_etd');
        t.string('guestroom_note', 500);
        t.boolean('guestroom_note_visible').notNullable().defaultTo(true);
        t.integer('guestroom_note_by').unsigned();
        t.dateTime('guestroom_note_at');
        t.dateTime('created_at').notNullable().defaultTo(k.fn.now());
        t.unique(['event_id', 'invitee_id']);
        t.index(['handler_id']);
      });

      await k.schema.createTable('members', (t) => {
        t.increments('id');
        t.integer('invitation_id').unsigned().notNullable().references('invitations.id').onDelete('CASCADE');
        t.string('name', 160).notNullable();
        t.string('relation', 20).notNullable();
        t.string('age_group', 10).notNullable().defaultTo('adult');
        t.string('meal', 8).notNullable().defaultTo('veg');
        t.string('meal_note', 200);
        t.boolean('is_walkin').notNullable().defaultTo(false);
        t.string('walkin_review', 10);
        t.integer('added_by_user').unsigned();
        t.integer('sort').notNullable().defaultTo(0);
      });

      await k.schema.createTable('member_functions', (t) => {
        t.integer('member_id').unsigned().notNullable().references('members.id').onDelete('CASCADE');
        t.integer('function_id').unsigned().notNullable().references('functions.id').onDelete('CASCADE');
        t.boolean('attending').notNullable().defaultTo(false);
        t.string('attendance', 8);
        t.dateTime('marked_at');
        t.integer('marked_by').unsigned();
        t.primary(['member_id', 'function_id']);
        t.index(['function_id']);
      });

      await k.schema.createTable('rooms', (t) => {
        t.increments('id');
        t.integer('event_id').unsigned().notNullable().references('events.id').onDelete('CASCADE');
        t.string('name', 80).notNullable();       // "Room 4"
        t.string('location', 160);                 // "Offrs Mess Annexe"
        t.string('notes', 300);                    // "Double bed, AC"
        t.integer('sort').notNullable().defaultTo(0);
        t.dateTime('created_at').notNullable().defaultTo(k.fn.now());
      });

      await k.schema.createTable('room_allotments', (t) => {
        t.increments('id');
        t.integer('room_id').unsigned().notNullable().unique().references('rooms.id').onDelete('CASCADE');
        t.integer('invitation_id').unsigned().notNullable().references('invitations.id').onDelete('CASCADE');
        t.integer('allotted_by').unsigned();
        t.dateTime('allotted_at').notNullable().defaultTo(k.fn.now());
        t.index(['invitation_id']);
      });

      await k.schema.createTable('notifications', (t) => {
        t.bigIncrements('id');
        t.integer('user_id').unsigned().notNullable().references('users.id').onDelete('CASCADE');
        t.integer('event_id').unsigned();
        t.integer('invitation_id').unsigned();
        t.string('title', 160).notNullable();
        t.string('body', 500);
        t.string('url', 300);
        t.dateTime('read_at');
        t.dateTime('created_at').notNullable().defaultTo(k.fn.now());
        t.index(['user_id', 'read_at']);
      });

      await k.schema.createTable('push_subscriptions', (t) => {
        t.increments('id');
        t.integer('user_id').unsigned().notNullable().references('users.id').onDelete('CASCADE');
        t.string('endpoint', 700).notNullable();
        t.string('p256dh', 200).notNullable();
        t.string('auth', 100).notNullable();
        t.string('device', 160);
        t.dateTime('created_at').notNullable().defaultTo(k.fn.now());
        t.index(['user_id']);
      });

      await k.schema.createTable('audit_log', (t) => {
        t.bigIncrements('id');
        t.integer('user_id').unsigned();
        t.string('actor', 160);
        t.integer('event_id').unsigned();
        t.integer('invitation_id').unsigned();
        t.string('action', 60).notNullable();
        t.string('details', 1000);
        t.string('ip', 64);
        t.dateTime('at').notNullable().defaultTo(k.fn.now());
        t.index(['at']);
        t.index(['event_id']);
        t.index(['user_id']);
      });
    },
    async down() {},
  },
  // Guest rooms can be switched on or off for each event (on by default).
  '002_event_guestroom_toggle': {
    async up(k) {
      if (!(await k.schema.hasColumn('events', 'guestroom_enabled'))) {
        await k.schema.alterTable('events', (t) => { t.boolean('guestroom_enabled').notNullable().defaultTo(true); });
      }
    },
    async down() {},
  },
  // Readable guest links: /i/<event code>/<mobile>. Also make all text columns utf8mb4 (emoji-safe).
  '003_readable_links': {
    async up(k) {
      if (!(await k.schema.hasColumn('events', 'code'))) {
        await k.schema.alterTable('events', (t) => { t.string('code', 24); });
        await k('events').update({ code: k.raw('CAST(id AS CHAR)') });
        await k.schema.alterTable('events', (t) => { t.unique(['code']); });
      }
      if (!(await k.schema.hasColumn('invitations', 'slug'))) {
        await k.schema.alterTable('invitations', (t) => { t.string('slug', 24); t.unique(['event_id', 'slug']); });
        const rows = await k('invitations as i').join('invitees as p', 'p.id', 'i.invitee_id').select('i.id', 'i.event_id', 'p.mobile').orderBy('i.id');
        const used = new Set();
        for (const r of rows) {
          const base = mobileSlugBase(r.mobile);
          if (!base) continue;
          let slug = base; let n = 2;
          while (used.has(`${r.event_id}:${slug}`)) slug = `${base}-${n++}`;
          used.add(`${r.event_id}:${slug}`);
          await k('invitations').where({ id: r.id }).update({ slug });
        }
      }
      const client = k.client.config.client;
      if (client === 'mysql2' || client === 'mysql') {
        for (const t of ['settings', 'users', 'series', 'events', 'functions', 'invitees', 'invitations', 'members', 'rooms', 'notifications', 'audit_log']) {
          try { await k.raw(`ALTER TABLE \`${t}\` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`); } catch { /* keep going */ }
        }
      }
    },
    async down() {},
  },
  // iOS app push notifications (Apple Push Notification service device tokens)
  '004_native_push': {
    async up(k) {
      if (!(await k.schema.hasTable('native_push_tokens'))) {
        await k.schema.createTable('native_push_tokens', (t) => {
          t.increments('id');
          t.integer('user_id').unsigned().notNullable().references('users.id').onDelete('CASCADE');
          t.string('token', 200).notNullable().unique();
          t.string('platform', 10).notNullable().defaultTo('ios');
          t.string('apns_env', 12);
          t.string('device', 160);
          t.dateTime('created_at').notNullable().defaultTo(k.fn.now());
          t.index(['user_id']);
        });
      }
    },
    async down() {},
  },
  // Roles made of modules (editable). Built-in roles are seeded with their usual modules.
  '005_roles': {
    async up(k) {
      if (!(await k.schema.hasTable('roles'))) {
        await k.schema.createTable('roles', (t) => {
          t.string('key', 40).primary();
          t.string('label', 80).notNullable();
          t.boolean('twofa').notNullable().defaultTo(false);
          t.boolean('builtin').notNullable().defaultTo(false);
          t.text('modules').notNullable();
          t.dateTime('created_at').notNullable().defaultTo(k.fn.now());
        });
        await k('roles').insert(Object.entries(BUILTIN_ROLES).map(([key, r]) => ({
          key, label: r.label, twofa: r.twofa, builtin: true, modules: JSON.stringify(r.modules), created_at: new Date(),
        })));
      }
    },
    async down() {},
  },
  '006_crest_1gr': {
    // The 1 GR crest (Logo A) is now built in. Remove any earlier uploaded crest once, so the
    // new one shows everywhere; a different crest can still be uploaded later in Settings.
    async up(k) {
      await k('settings').whereIn('key', ['logo_512', 'logo_192', 'logo_maskable']).del();
      await k('settings').where({ key: 'logo_version' }).del();
      await k('settings').insert({ key: 'logo_version', value: String(Date.now()) });
    },
    async down() {},
  },
  '007_diet_notes_toggle': {
    // Dietary notes are off unless switched on for the event.
    async up(k) {
      if (!(await k.schema.hasColumn('events', 'diet_notes_enabled'))) {
        await k.schema.alterTable('events', (t) => { t.boolean('diet_notes_enabled').notNullable().defaultTo(false); });
      }
    },
    async down() {},
  },
  '008_dashboard_tracking': {
    // VIP tick on invitees; when a guest first opened their link and first entered the PIN
    async up(k) {
      if (!(await k.schema.hasColumn('invitees', 'vip'))) {
        await k.schema.alterTable('invitees', (t) => { t.boolean('vip').notNullable().defaultTo(false); });
      }
      if (!(await k.schema.hasColumn('invitations', 'link_opened_at'))) {
        await k.schema.alterTable('invitations', (t) => { t.dateTime('link_opened_at'); t.dateTime('pin_ok_at'); });
        // guests who already got in have certainly opened the link
        await k('invitations').whereNotNull('guest_last_seen_at').update({ link_opened_at: k.ref('guest_last_seen_at'), pin_ok_at: k.ref('guest_last_seen_at') });
      }
    },
    async down() {},
  },
  '009_event_start': {
    // Date & time of the event itself (used on the card when the event has no separate functions)
    async up(k) {
      if (!(await k.schema.hasColumn('events', 'starts_at'))) {
        await k.schema.alterTable('events', (t) => { t.dateTime('starts_at'); });
      }
    },
    async down() {},
  },
  '010_events_edit_module': {
    // new "Edit events" module: roles that could manage events keep being able to edit them
    async up(k) {
      if (!(await k.schema.hasTable('roles'))) return;
      for (const r of await k('roles')) {
        let mods = [];
        try { mods = JSON.parse(r.modules || '[]'); } catch {}
        if (mods.includes('events') && !mods.includes('events_edit')) {
          mods.splice(mods.indexOf('events') + 1, 0, 'events_edit');
          await k('roles').where({ key: r.key }).update({ modules: JSON.stringify(mods) });
        }
      }
    },
    async down() {},
  },
  '011_whatsapp_xpressbot': {
    // Messages sent through Xpressbot (WhatsApp API) and the per-event automatic switches
    async up(k) {
      if (!(await k.schema.hasTable('wa_messages'))) {
        await k.schema.createTable('wa_messages', (t) => {
          t.increments('id');
          t.integer('event_id').unsigned().references('events.id').onDelete('CASCADE');
          t.integer('invitation_id').unsigned().references('invitations.id').onDelete('CASCADE');
          t.string('kind', 16).notNullable(); // invite | reminder | confirm | eventday | test
          t.string('dedupe', 80).notNullable().unique();
          t.string('params', 500);
          t.string('to', 24);
          t.string('template', 120);
          t.text('vars');
          t.string('status', 12).notNullable().defaultTo('queued'); // queued | sending | sent | failed | skipped
          t.string('delivery', 12); // sent | delivered | read | failed (from WhatsApp)
          t.string('wamid', 200);
          t.string('error', 500);
          t.integer('attempts').notNullable().defaultTo(0);
          t.dateTime('send_after').notNullable();
          t.dateTime('sent_at');
          t.dateTime('checked_at');
          t.integer('created_by').unsigned();
          t.dateTime('created_at').notNullable().defaultTo(k.fn.now());
          t.index(['status', 'send_after']);
          t.index(['event_id', 'id']);
        });
      }
      if (!(await k.schema.hasColumn('events', 'wa_reminders'))) {
        await k.schema.alterTable('events', (t) => {
          t.boolean('wa_reminders').notNullable().defaultTo(false);
          t.boolean('wa_confirm').notNullable().defaultTo(false);
          t.boolean('wa_eventday').notNullable().defaultTo(false);
        });
      }
    },
    async down() {},
  },
};

// 919233002887 -> 9233002887 (Indian numbers), other numbers: digits as stored
export function mobileSlugBase(mobile) {
  const d = String(mobile || '').replace(/\D/g, '');
  if (!d) return null;
  return d.length === 12 && d.startsWith('91') ? d.slice(2) : d.slice(-20);
}
