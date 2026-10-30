# CupView

A digital restaurant menu that customers open from a QR code, with no app to install. Dishes and drinks can show photos and 3D models that customers can view in AR on their own phone. The owner manages everything from a local admin page.

## Features

**Customers**
- Full menu with categories, photos (up to 8 per item), descriptions and ingredients
- 3D models (`.glb`) with an AR view on supported phones
- Quick menu: questions made from the menu itself (type of dish, ingredients, tags, price) narrow the dishes to the customer's mood and what they want to avoid
- "My list": tap + on a dish to collect what you want, then show the list to staff (saved on the phone, no ordering happens in the app). The button sits beside the search bar and floats at the top right while scrolling, next to a settings gear that holds the QR code for opening the menu on another phone
- Settings gear (top right) with a theme switch: Auto, Light or Dark. Auto uses the phone's clock: light from 6 AM to 6 PM, dark at night. Light is a soft cream, dark is warm charcoal with a muted golden-brown accent. The choice is saved on the phone
- 1 to 5 star ratings, one per device per dish
- Labels such as popular, new and hot, plus hot or cold serving for drinks
- iPhone-style rubber band scrolling on every scrolling area (see "Motion and feel" below)

**Owner (admin page)**
- Add, edit and delete items; rename, merge and delete categories
- Upload photos (JPG, PNG, WebP) and 3D models
- 3D model fixer for textures, real size and effects
- Quick menu tab: the app writes the questions from your menu; you review, reword, reorder, switch off or add your own, and save
- QR code page for printing, plus an "available" switch per item

## Run it

1. Install Node.js (v18 or newer): https://nodejs.org
2. In this folder:
   ```
   npm install
   ADMIN_PIN=yourpin npm start
   ```
   (Windows PowerShell: `$env:ADMIN_PIN="yourpin"; npm start`)
3. Open http://localhost:3000 for the menu and http://localhost:3000/admin.html to manage it.

If you skip `ADMIN_PIN`, the default PIN is `1234`. Change it before going live.

`npm run dev` restarts the server automatically when `server.js` changes.

### Settings

| Variable | Purpose | Default |
| --- | --- | --- |
| `ADMIN_PIN` | PIN for the admin page | `1234` |
| `PORT` | Port the server listens on | `3000` |
| `PUBLIC_URL` | Link the QR code points to | `https://03cid07.github.io/menu-app/` (GitHub Pages) |
| `USE_TUNNEL_QR` | Set to `1` to make the QR use the temporary tunnel link (AR testing only) | off |

## Sharing it with phones (Windows)

AR needs an https link, so phones cannot use `localhost`.

- `start-menu.bat` starts the app and opens the admin page.
- `start-all.bat` also starts a Cloudflare quick tunnel through `start-tunnel.ps1` and copies the public link to your clipboard. The QR code page ignores the tunnel unless `USE_TUNNEL_QR=1` is set, because the tunnel dies when the laptop closes. Install the tunnel tool once with `winget install --id Cloudflare.cloudflared`.

The tunnel link changes every time it starts, so a printed QR code will stop working. The QR code uses the permanent GitHub Pages link below by default, so printed QR codes keep working with the laptop off.

## Publishing the customer menu (GitHub Pages)

Pushing to `main` runs `.github/workflows/pages.yml`, which publishes the customer side as a static site and generates a QR code for it. The admin tools are not published because they need the Node server.

On the static site the menu is read from `menu.json`, ratings are read-only, and new ratings need the Node server. Edit the menu locally in the admin page, then push to update the site.

## Folder guide

- `server.js`: Express server and API
- `data/menu.json`: menu data (restaurant name, currency, categories, items)
- `data/ratings.json`: customer ratings, created automatically and not committed
- `public/index.html`: what customers see
- `public/admin.html`: where the owner manages the menu
- `public/qr-print.html`: printable QR code page
- `public/css/style.css`: all styling
- `public/js/`: browser scripts (`spring.js` spring motion and the bottom cards, `rubber.js` rubber band scrolling, `marquee.js` moving names, `menu.js` menu, settings menu, theme switch and ratings, `quick.js` quick menu screens, `quick-gen.js` question maker shared by customer page, admin and server, `admin-quick.js` Quick menu tab, `list.js` My list, `admin.js` admin, `glb-fixer.js` and `glb-tools.js` 3D model fixer)
- `public/images/` and `public/models/`: uploaded photos and 3D models
- `start-all.bat`, `start-menu.bat`, `start-tunnel.ps1`: Windows launch helpers
- `AGENTS.md` and `docs/`: project documentation templates (see below)

## API

Public:
- `GET /api/menu`: the menu, each item with its rating summary, plus the saved Quick menu questions (`quick`)
- `GET /api/quick`: the saved Quick menu questions and a fingerprint of the current menu
- `POST /api/items/:id/rate`: rate a dish (limited to 30 ratings per visitor per 10 minutes)
- `GET /api/qr-url`, `GET /qr.png`, `GET /qr.svg`: QR code link and images

Admin (send the PIN in the `x-admin-pin` header):
- `POST /api/items`, `PUT /api/items/:id`, `DELETE /api/items/:id`
- `PUT /api/categories`, `DELETE /api/categories?name=`
- `PUT /api/quick` (save reviewed Quick menu questions), `DELETE /api/quick` (back to automatic questions)
- `POST /api/upload-image`, `POST /api/upload-model?name=`

## Quick menu questions

Customers who tap Quick menu answer a short list of questions. The app writes that list itself from the menu: what kind of item (food or drink), hot or cold, categories, ingredients such as chicken or coffee, things to avoid, tags and price. Questions that cannot narrow the current dishes are skipped, and it stops early when only a few dishes are left.

Open the **Quick menu** tab in the admin page to review them. You can reword, reorder, switch off, delete or add questions, edit what each answer matches, and see how many dishes each answer finds. Press **Save questions** to keep your version. With nothing saved, customers get automatic questions built from the menu. After saving, push to GitHub so the live site gets the new `menu.json`.

## Motion and feel (applies to every new feature)

Scrolling should feel like an iPhone. Pull past the end of any list, card or page and the content follows your finger less and less, then springs back when you let go. A fast flick into an end gives a small bounce.

- The formula is Apple's, read from the iOS UIKit binary (source: https://blog.justinbuilds.mov/ios/): `overscroll = (1 - 1 / (c * x / d + 1)) * d`, where `x` is how far the finger went past the end, `d` is the size of the scroll area and `c = 0.55` for touch.
- `public/js/rubber.js` does this for **every** scrolling area by itself. It finds the area under the finger, so new screens, cards and lists need no extra code. The page, the Quick menu screen, the dish card, My list and the photo gallery all use it.
- `public/js/spring.js` has the spring (`Springs.spring`), the formula (`Springs.rubber`) and the bottom cards (`Springs.bottomCard`). Bottom cards stretch only at the bottom, because pulling down at the top closes them.
- It works on touch screens only. Mice and trackpads keep the browser's own behaviour. It is switched off for people who set "reduce motion" on their phone.

**Rules for anything new that scrolls or moves** (add these to every new feature):

1. Let the content scroll normally (`overflow-y: auto` or `overflow-x: auto`). `rubber.js` picks it up automatically.
2. Do not add your own bounce, overscroll or ease animation. Use `Springs.spring(...)` for motion and `Springs.rubber(...)` for any drag that should resist past a limit.
3. For a new bottom card, use `Springs.bottomCard(...)` as the dish card and My list do.
4. To leave one area alone, add `data-rb="off"` to it. To stretch only one end, add `data-rb-edges="start"` or `data-rb-edges="end"`.
5. Keep `<script src="js/spring.js">` and then `<script src="js/rubber.js">` on every page that scrolls, and raise the `?v=` number when either file changes.

Not measured on a physical phone yet: the numbers match Apple's, but check the feel on your own phone after pushing.

## Project documents

`AGENTS.md` and the seven files in `docs/` (PRD, design system, architecture, database, security, code style, testing) are blank templates for now. They will be filled in with approved decisions before further feature work. AI coding assistants are asked to read them first.

## Checks

No lint, format, type-check or automated test commands are configured yet.

## Next steps

A permanent QR code link, a database (SQLite) instead of JSON, and real login for the admin page.

## Theme colors

The colors live at the top of `public/css/style.css`: dark under `:root`, light under `html[data-theme="light"]`. The theme is chosen by a small script at the top of `public/index.html`, which sets `data-theme` on the page before it paints so there is no flash. To change the Auto schedule, edit the hours in that script (`h>=6&&h<18` means light from 6 AM until 6 PM).
