# Kainlee — iOS app (organisers)

The app is a native iPhone/iPad shell that opens **https://momopasal.in/admin** and adds native features:

| Feature | How it works in the app |
|---|---|
| Push notifications | Apple push (APNs) when guests reply, change family or guest-room details, or are assigned to you |
| Gate QR scanning | Native camera scanner (Check-in › Scan entry QR) with a vibration on success / error |
| Send card + message | Native share sheet: the guest's card image + message → WhatsApp |
| Reports, Excel, backup | Saved through the share sheet (Save to Files, AirDrop, WhatsApp…) |
| No internet | A "No connection · Try again" screen instead of a blank page |

Because the app loads the live site, **website updates reach the app immediately**; you only resubmit to the App Store when this `mobile/` folder changes (icon, name, plugins, domain).

- App name: **Kainlee** · Bundle ID: **com.makjal.kainlee** · iPhone and iPad · iOS 15+

---

## 1. One-time setup on your Mac

1. Install **Xcode** from the Mac App Store and open it once (accept the licence).
2. Install **Node.js 22** from nodejs.org (if `node -v` doesn't already show v20 or newer).
3. Get the code:
   ```bash
   git clone https://github.com/mak-2427-33771-79137/kainlee.git
   cd kainlee/mobile
   npm install
   npx cap sync ios
   npx cap open ios
   ```
   Xcode opens the **App** project. (Later, after `git pull`, run `npm install && npx cap sync ios` again.)

## 2. Apple Developer website (developer.apple.com › Account)

1. **Certificates, Identifiers & Profiles › Identifiers › +** → App IDs → App → Bundle ID **com.makjal.kainlee**, description "Kainlee". Tick **Push Notifications**. Register.
2. **Keys › +** → name "Kainlee push" → tick **Apple Push Notifications service (APNs)** → Continue → Register → **Download** the `.p8` file (you can download it only once — keep it safe). Note the **Key ID**. Your **Team ID** is at the top right of the page (or under Membership).

## 3. Turn on push for the website (Hostinger)

hPanel › your Node.js app › **Environment variables** → add:

| Name | Value |
|---|---|
| `APNS_KEY_ID` | the Key ID from step 2.2 (10 characters) |
| `APNS_TEAM_ID` | your Team ID (10 characters) |
| `APNS_KEY` | open the `.p8` file in TextEdit and paste **all** of it, including the BEGIN/END lines |

**Redeploy**, then open `https://momopasal.in/api/health` → it should show `"iosPush":"configured"`.

## 4. Signing in Xcode

1. Left panel: click **App** (blue icon) → target **App** → **Signing & Capabilities**.
2. Tick **Automatically manage signing**, choose your **Team**. Bundle Identifier: `com.makjal.kainlee`.
3. Click **+ Capability** → add **Push Notifications**.
4. **General** tab: Version `1.0.0`, Build `1`. Under Supported Destinations keep iPhone and iPad.

## 5. Try it on your iPhone

Connect the iPhone by cable (or same Wi-Fi), pick it at the top of Xcode, press **▶ Run**. Log in, allow notifications, then on the website change a guest's RSVP — the alert should arrive. Test **Check-in › Scan entry QR** and **Send card + message**.

## 6. Upload to App Store Connect

1. In Xcode choose **Any iOS Device (arm64)** at the top → menu **Product › Archive**.
2. When the Organizer opens: **Distribute App › App Store Connect › Upload** → keep the defaults → Upload.
3. On **appstoreconnect.apple.com › Apps › +** → New App: Platform iOS, Name **Kainlee** (if taken, e.g. "Kainlee Organiser"), language English, Bundle ID com.makjal.kainlee, SKU `kainlee-ios`.
4. After ~15 minutes the build appears under **TestFlight** — install it on your phone through the TestFlight app and check once more.

## 7. Fill in the App Store listing

- **Category:** Productivity (secondary: Business).
- **Privacy Policy URL:** `https://momopasal.in/privacy`
- **Support URL:** `https://makjal.com`
- **Subtitle:** Regimental event invitations
- **Description (example):** *Kainlee is the organisers' app for regimental get-togethers: track invitations and RSVPs, manage family headcounts, meal preferences and guest rooms, see who looks after which guest, send personalised invitation cards on WhatsApp, and admit guests at the gate by scanning their entry QR. For authorised event organisers only.*
- **Keywords:** regiment, invitation, RSVP, event, check-in, guest list, army
- **Screenshots:** take them on your iPhone (6.7"/6.9") and iPad (13") while logged in — dashboard, guest list, check-in, guest detail. Use sample guests, not real people's numbers.
- **App Privacy** (data collection): choose *Contact Info › Name* and *Phone Number*, and *User Content › Other User Content* — purpose **App Functionality**, **linked to the user**, **not used for tracking**. Everything else (location, identifiers, usage data, diagnostics, purchases): **not collected**.
- **Age rating:** 4+ (no objectionable content).
- **Pricing:** Free. **Availability:** India (or all countries).

### App Review sign-in (required — the app is login-only)

Apple's reviewer must be able to log in **without 2-step login**:

1. On the website: **Users & roles › Add user** → name "App Review", username `appreview`, role **Liaison Officer** (no 2-step login needed), a strong password.
2. Make sure there is an event with a few **sample guests** (e.g. the test Excel file), some assigned to `appreview`.
3. In App Store Connect › **App Review Information**: tick *Sign-in required*, enter the username and password, and add a note:
   > *This app is for the organisers of Kainlee regimental events. Log in with the account above. Try Dashboard, My guests, a guest's detail page, Send card + message, and Check-in › Scan entry QR (any QR code can be scanned; an invitation's QR opens that guest).*
4. A Liaison can see the whole guest list including mobile numbers. **Submit while the site holds only sample guests, or deactivate `appreview` (Users & roles) as soon as the app is approved.**

### Private organisation app?

Apple sometimes rejects apps meant for one organisation from the public App Store. If that happens, reply asking for **Unlisted App Distribution** (developer.apple.com/support/unlisted-app-distribution): the app is approved the same way but can only be found through its direct link, which you share with organisers. You can also request it up front.

## 8. Submit

App Store Connect › your app › select the build › **Add for Review** › **Submit**. Review usually takes 1–2 days.

---

## When the domain moves to lali-guras.in

1. In `capacitor.config.json` change `server.url` to `https://lali-guras.in/admin`.
2. In `www/offline.html` change the address in the **Try again** button.
3. `npx cap sync ios`, raise the Build number in Xcode, Archive and upload again.

(Keep momopasal.in pointing to the site until everyone has updated.)

## Updating the icon or splash

Replace `assets/icon-only.png` (1024×1024, no transparency) and/or `assets/splash.png` (2732×2732), then `npm run icons` and `npx cap sync ios`.
