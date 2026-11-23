# CupView

A digital restaurant menu that customers open from a QR code, with no app to install. Dishes and drinks can show photos and 3D models that customers can view in AR on their own phone. The owner manages everything from a local admin page.

## Features

**Customers**
- Book-style menu: one category per page. Swipe left or right (or use the buttons, dots or arrow keys) to turn the page. The header and search bar stay on top and the header tucks away as you scroll the dishes
- Photos (up to 8 per item), descriptions and ingredients on each dish card
- 3D view and AR for dishes with a 3D model (`.glb`): spin the dish on a floor grid, or see it on your own table (see "3D view and AR" below)
- Quick menu: questions made from the menu itself (type of dish, ingredients, tags, price) narrow the dishes to the customer's mood and what they want to avoid
- "My list": tap + on a dish to collect what you want, then show the list to staff (saved on the phone, no ordering happens in the app). With dishes in the list, the bottom bar's My list tab first opens a small panel (dishes with - / +, and the total) with an "Open My list" button for the full page
- QR codes: a settings gear (top right) holds the QR code for opening the menu on another phone, and every dish card has a QR button for that one dish
- Settings gear (top right) with a theme switch: Auto, Light or Dark. Auto uses the phone's clock: light from 6 AM to 6 PM, dark at night. Light is a soft cream, dark is warm charcoal with a muted golden-brown accent. The choice is saved on the phone
- 1 to 5 star ratings, one per device per dish
- Labels such as popular, new and hot, plus hot or cold serving for drinks
- iPhone-style rubber band scrolling on every scrolling area (see "Motion and feel" below)

**Owner (admin page)**
- Add, edit and delete items; rename, merge, reorder and delete categories (the first category is the first page of the customer menu)
- Upload photos (JPG, PNG, WebP) and 3D models
- 3D model fixer for textures, real size and effects
- Quick menu tab: the app writes the questions from your menu; you review, reword, reorder, switch off or add your own, and save
- QR code tab: a QR for the whole menu or for a single dish, PNG download, a printable table sign, and a master switch that turns every QR in the system off or on (for debugging)
- An "available" switch per item

## Run it

1. Install Node.js (v18 or newer): https://nodejs.org
2. In this folder:
   ```
   npm install
   ADMIN_PIN=yourpin npm start
   ```
   (Windows PowerShell: `$env:ADMIN_PIN="yourpin"; npm start`)
3. Open http://localhost:3000 for the menu and http://localhost:3000/admin.html to manage it.

If you skip `ADMIN_PIN`, the default PIN is `1111`. Change it before going live.

`npm run dev` restarts the server automatically when `server.js` changes.

### Settings

| Variable | Purpose | Default |
| --- | --- | --- |
| `ADMIN_PIN` | PIN for the admin page | `1111` |
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
- `public/css/style.css`: main styling; `public/css/mini-list.css`: the My list panel
- `public/js/`: browser scripts
  - Menu: `menu.js` (menu, settings menu, theme switch, ratings, dish QR), `pager.js` (book-style pages), `marquee.js` (moving names), `quick.js` (Quick menu screens and bottom bar), `quick-gen.js` (question maker shared by customer page, admin and server), `list.js` and `mini-list.js` (My list and its panel)
  - Motion: `spring.js` (spring motion and the bottom cards), `rubber.js` (rubber band scrolling)
  - 3D and AR: `viewer.js` (3D view screen), `viewer-add.js` (add a dish from the picker or the QR scanner), `ar-guide.js` (finds the table in AR), `virtual-table.js` (3D tables), `dish-drag.js` (move dishes on the floor), `floor-grid.js` (floor grid), `glb-tools.js` (read, merge and fix `.glb` files)
  - Admin: `admin.js`, `admin-quick.js` (Quick menu tab), `glb-fixer.js` (3D model fixer)
  - Libraries: `qrcode.min.js` (draws QR codes), `jsqr.min.js` (QR scanner for browsers without a built-in one; licence in `jsqr.LICENSE.txt`)
- `public/images/`: uploaded photos; `public/images/Tables/` holds the table preview pictures
- `public/models/`: uploaded 3D models and the three 3D tables (`table-brown.glb`, `table-round.glb`, `table-white.glb`)
- `.github/workflows/pages.yml`: publishes the customer menu to GitHub Pages
- `start-all.bat`, `start-menu.bat`, `start-tunnel.ps1`: Windows launch helpers

## API

Public:
- `GET /api/menu`: the menu, each item with its rating summary, plus the saved Quick menu questions (`quick`) and the QR switch (`qrEnabled`)
- `GET /api/quick`: the saved Quick menu questions and a fingerprint of the current menu
- `POST /api/items/:id/rate`: rate a dish (limited to 30 ratings per visitor per 10 minutes)
- `GET /api/qr-url`, `GET /qr.png`, `GET /qr.svg`: QR code link and images

Admin (send the PIN in the `x-admin-pin` header):
- `POST /api/items`, `PUT /api/items/:id`, `DELETE /api/items/:id`
- `PUT /api/categories` (rename or merge), `PUT /api/categories/order` (set the page order), `DELETE /api/categories?name=`
- `PUT /api/quick` (save reviewed Quick menu questions), `DELETE /api/quick` (back to automatic questions)
- `PUT /api/settings/qr` (send `{ "enabled": true }` or `false` to turn every QR in the system on or off)
- `POST /api/upload-image`, `POST /api/upload-model?name=`

## 3D view and AR

Dishes with a 3D model get a "View in 3D / AR" button. The 3D view is a screen inside `index.html`, so closing it brings the menu straight back.

- **3D view:** spin and zoom the dish on a floor grid. Up to 4 dishes fit in one scene. "Add another 3D model" opens a picker of dishes that have a model, or a camera scanner for a dish's QR code (the `?item=ID` link from the admin QR tab). With more than one dish, drag a dish to move it on the floor. Phones without a built-in QR reader download `jsqr.min.js` the first time someone scans.
- **AR table guide:** phones usually find the floor before the table, so during an AR session the dish stays hidden while the phone searches for a table-height surface, with a live status. "Place it here anyway" is offered after a while so nobody gets stuck. Add `?ardebug=1` to the page address to see the numbers the phone measures.
- **3D tables:** if no real table is found, customers can pick a 3D table (brown, round or white) and the dish stands on it on the floor in front of them. The table only lives for that AR session. Tables too small for the dishes in the scene are greyed out. "Try again" and "Change table" stay in the top-left corner afterwards.

**To add a table:** put its `.glb` (one buffer, bottom at y = 0, real size in meters, slimmed for phones to about 1 to 2 MB) in `public/models/`, put a preview picture in `public/images/Tables/`, then add a line to `LIST` in `public/js/virtual-table.js`.

## Quick menu questions

Customers who tap Quick menu answer a short list of questions. The app writes that list itself from the menu: what kind of item (food or drink), hot or cold, categories, ingredients such as chicken or coffee, things to avoid, tags and price. Questions that cannot narrow the current dishes are skipped, and it stops early when only a few dishes are left.

Open the **Quick menu** tab in the admin page. Each question is one card: tap it to open it, tap again to close it.

- The switch turns a question on or off. The arrows move it up or down.
- Inside a card you can reword the question, choose how customers answer (**Pick one**, **Pick many** or **Things to skip**), and edit the answers.
- Every answer says in plain words what it shows, with a live dish count (for example "Shows: Food only, with chicken · 5 dishes"). Press **Change** to pick categories or words, and see the matching dishes right away.
- **Save** appears at the bottom only when you have changed something. **Undo** throws the changes away.
- If you add dishes later, a banner offers **Add questions for new dishes**. **More options** has "Start over from my menu" and "Use automatic questions".

With nothing saved, customers get automatic questions built from the menu. After saving, push to GitHub so the live site gets the new `menu.json`.

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

## Checks

No lint, format, type-check or automated test commands are configured yet.

## Next steps

A permanent QR code link, a database (SQLite) instead of JSON, and real login for the admin page.

## Theme colors

The colors live at the top of `public/css/style.css`: dark under `:root`, light under `html[data-theme="light"]`. The theme is chosen by a small script at the top of `public/index.html`, which sets `data-theme` on the page before it paints so there is no flash. To change the Auto schedule, edit the hours in that script (`h>=6&&h<18` means light from 6 AM until 6 PM).
