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
};
