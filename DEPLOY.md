# Going live — step by step (site: forefirst.org, formerly momopasal.in)

(Moving to lali-guras.in later? See Part 9 — no code change needed.)

Time needed: about 45 minutes. You need: your Hostinger login, a GitHub account, and your phone (for Google Authenticator).

How it fits together:

```
You (or Claude) change code ──push──▶ GitHub "main"
                                        │  (automatic: a numbered version is tagged)
                                        ▼
                                  GitHub "live" branch ──auto-deploy──▶ Hostinger ──▶ momopasal.in  (later lali-guras.in)
                                        ▲
                     "Roll back live site" button puts any old version back here
```

---

## Part 1 — Put the code on GitHub

1. Sign in at github.com → **+** (top right) → **New repository**.
   - Name: `kainlee-invitations` · **Private** · do *not* add a README → **Create repository**.
2. Upload the code (choose one):
   - **Easiest:** tell Claude the repository name (e.g. `yourname/kainlee-invitations`) after connecting GitHub to Claude, and Claude pushes it for you.
   - **By hand:** unzip `kainlee-invitations.zip`. On the new repository page click **uploading an existing file**, drag in **everything inside** the unzipped folder (including the `.github` folder — on a Mac press `Cmd + Shift + .` in Finder to see it) → **Commit changes**.
3. Allow the release robot to publish: repository → **Settings** → **Actions** → **General** → *Workflow permissions* → **Read and write permissions** → **Save**.
4. Repository → **Actions** tab → if asked, **enable workflows**. Open **Release to live site** → **Run workflow**. After about a minute a branch called **live** appears (Code tab → branch menu). Hostinger will deploy from this branch.

## Part 2 — Create the subdomain and the app on Hostinger

1. hPanel → **Websites** → **Add website** → **Node.js web app** → **Import Git repository** → **Connect with GitHub** and allow access to `kainlee-invitations`.
2. When asked for the domain, choose your existing domain **momopasal.in**.
   - If momopasal.in is registered or managed in this Hostinger account, it is connected for you.
   - If it is registered elsewhere, either point its nameservers to Hostinger’s (hPanel shows them) or add the **A** record Hostinger shows (name `@`, and `www`, pointing to your Hostinger server IP) at your registrar. Wait 15–60 minutes.
   - If momopasal.in already has a website on this plan, Hostinger asks you to remove that website first (the Node.js deploy needs a fresh slot for the domain).
3. Settings:
   - **Branch:** `live`
   - **Framework:** Next.js (auto-detected) · **Node.js version:** 22
   - **Build command:** `build` · **Output directory:** `.next`
   - **Entry file** (if asked): `server.js`
4. Click **Deploy**. The first deploy can fail because the database is not set yet — that is expected. Continue.

## Part 3 — Create the database

1. hPanel → **Websites** → momopasal.in → **Databases** → **Management**.
2. Database name `kainlee`, user `kainlee`, a strong password → **Create**. Hostinger adds a prefix, e.g. `u123456789_kainlee`. Write down the full names and the password.

## Part 4 — Environment variables (the app’s settings)

hPanel → your Node.js app → **Settings / Deployments** → **Environment variables**. Add:

| Name | Value |
|---|---|
| `DB_HOST` | `127.0.0.1` (not `localhost`) |
| `DB_PORT` | `3306` |
| `DB_NAME` | e.g. `u123456789_kainlee` |
| `DB_USER` | e.g. `u123456789_kainlee` |
| `DB_PASSWORD` | your database password |
| `SESSION_SECRET` | a random 40+ character string (e.g. from a password generator). Keep it secret. |

Then **Redeploy**. When it shows success, open **https://momopasal.in** — you should see the crest and the marching squad. Make sure the address has the padlock (SSL). If not, hPanel → **Security → SSL** → install the free certificate for the subdomain.

## Part 5 — First login (creates you as Super Admin)

1. Open **https://momopasal.in/login**. The first visit shows **First-time setup**.
2. Enter your name with rank, a username and a password (8+ characters).
3. Install **Google Authenticator** on your phone, scan the QR code shown, type the 6-digit code. Done — you are the Super Admin.
4. **Settings & activity**: check the crest, regiment name, and the credit line *“Crafted with pride by Mak · makjal.com”* (shown on every page and to every guest). Download a backup here any time.
5. **Users & roles**: add your team. Give Liaison Officers their mobile number — guests they look after can call them.

## Part 6 — Set up the event

1. **Events & series → New event** (name, venue, Google Maps link, RSVP closing time, extra guests allowed).
2. **Event setup & card**: add the functions (Barakhana, Ladies’ Dinner Night…), check the card wording, choose the standard card or paste your own HTML card (for this event or the whole series), and review the WhatsApp messages in English, Hindi and Nepali.
3. **Guest rooms**: add the rooms you have (paste many at once: `Room 1, Offrs Mess Annexe, AC`).
4. **Invitee directory → Download template**, fill one row per invitee, **Upload** and choose the event.
5. **All guests**: tick guests → **Assign to** a Liaison Officer.
6. **Send invites**: tap through the queue. Each tap opens WhatsApp with the personal link and PIN. On a phone you can also **Share PDF** to send the card as a file.

Test with your own number first: invite yourself, open the link, enter the PIN, RSVP, request a guest room.

## Part 7 — Phones and tablets

Each organiser, on their phone:
- **Android (Chrome):** open the site → log in → **My account → Install on this device** → **Turn on notifications**.
- **iPhone/iPad (Safari):** **Share → Add to Home Screen**, open it from the new icon, log in → **My account → Turn on notifications** (iOS 16.4 or later).

Gate tablets: log in as a Check-in Volunteer → **Check-in** → **Scan entry QR** (allow camera).

## Part 8 — Making changes later, and rolling back

- **New version:** change the code (or ask Claude) and push to `main`. The **Release to live site** action tags a version (e.g. `v2026.11.02-1830-ab12cd3`) and updates `live`; Hostinger deploys it automatically. If it does not start within a few minutes, hPanel → **Deployments → Redeploy**.
- **Something broke? Roll back:** GitHub → **Actions** → **Roll back live site** → **Run workflow** → paste the version from the **Tags** page (the one before the problem) → Run. Hostinger redeploys that version. Press **Redeploy** in hPanel if needed.
- **Your data is safe during rollbacks.** Database changes are only ever *added*, so older versions keep working on the newer database. Before any big change, download a backup (**Settings & activity → Download backup**); Hostinger also keeps its own backups.

## Part 9 — Moving to forefirst.org

1. hPanel → **Websites** → the Node.js app (now momopasal.in) → **Connect domain** / change domain → choose **forefirst.org** (registered in this account). SSL is installed automatically; check both forefirst.org and www.forefirst.org open with a padlock.
2. Node.js app → **Environment variables**: set `SITE_URL=https://forefirst.org` → **Redeploy**. WhatsApp messages, push notifications and links now use forefirst.org. (The app also forwards www.forefirst.org to forefirst.org.)
3. Keep old links working: momopasal.in is now free. hPanel → **Add website** → **momopasal.in** (empty PHP/HTML site) → **File manager** → in `public_html` upload the two files from `deploy/momopasal-forward/` (`.htaccess` and `index.html`). Every old link, e.g. `momopasal.in/i/rgt/9233002887`, then opens the same page on forefirst.org. Install SSL for momopasal.in too.
4. Tell the team to update the Kainlee app from TestFlight (the new build opens forefirst.org).
5. Privacy policy URL for the App Store becomes `https://forefirst.org/privacy`.

## If something goes wrong

| What you see | What to do |
|---|---|
| Site shows an error after deploy | hPanel → Deployments → open the latest → read the log. Check all six environment variables, then Redeploy. |
| “Access denied for user…” in the log | `DB_HOST` must be `127.0.0.1`; check DB name/user/password including the `u123…_` prefix. |
| Everyone got logged out | `SESSION_SECRET` changed. Set it back or just log in again. |
| Lost the Authenticator phone | Another Super Admin: **Users → Edit → Reset 2-step login**. |
| Camera does not open at the gate | The site must be on `https://`; allow camera for the site in the browser settings. |
| No phone notifications on iPhone | Open the app from the Home Screen icon (not Safari), then **My account → Turn on notifications**. |
| A guest is locked out | Guests’ page → key icon → **New PIN** (or **New PIN + new link** if the link leaked) → send on WhatsApp. |

## Keep the site fast (stop it "sleeping")

Hostinger can pause a Node.js app that nobody has visited for a while; the next visitor then waits
several seconds while it starts again. A cron job that visits the site every 5 minutes keeps it awake:

1. hPanel → **Advanced → Cron Jobs** → **Custom**.
2. Command: `curl -s https://momopasal.in/api/health > /dev/null`
3. Schedule: every 5 minutes (`*/5 * * * *`) → **Save**.

## iOS app (organisers)

The iPhone/iPad app lives in the `mobile/` folder. Building it, push-notification keys (`APNS_KEY_ID`,
`APNS_TEAM_ID`, `APNS_KEY`) and the App Store steps are in **mobile/README.md**.
Privacy policy for the App Store listing: `https://momopasal.in/privacy`.
