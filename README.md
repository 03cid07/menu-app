# CupView

A digital restaurant menu that customers open from a QR code, with no app to install. Dishes and drinks can show photos and 3D models that customers can view in AR on their own phone. The owner manages everything from a local admin page.

## Features

**Customers**
- Full menu with categories, photos (up to 8 per item), descriptions and ingredients
- 3D models (`.glb`) with an AR view on supported phones
- Quick menu: a few questions narrow the dishes to the customer's mood and what they want to avoid
- "My list": tap + on a dish to collect what you want, then show the list to staff (saved on the phone, no ordering happens in the app)
- 1 to 5 star ratings, one per device per dish
- Labels such as popular, new and hot, plus hot or cold serving for drinks

**Owner (admin page)**
- Add, edit and delete items; rename, merge and delete categories
- Upload photos (JPG, PNG, WebP) and 3D models
- 3D model fixer for textures, real size and effects
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
- `public/js/`: browser scripts (`menu.js` menu and ratings, `quick.js` quick menu, `list.js` My list, `admin.js` admin, `glb-fixer.js` and `glb-tools.js` 3D model fixer)
- `public/images/` and `public/models/`: uploaded photos and 3D models
- `start-all.bat`, `start-menu.bat`, `start-tunnel.ps1`: Windows launch helpers
- `AGENTS.md` and `docs/`: project documentation templates (see below)

## API

Public:
- `GET /api/menu`: the menu, each item with its rating summary
- `POST /api/items/:id/rate`: rate a dish (limited to 30 ratings per visitor per 10 minutes)
- `GET /api/qr-url`, `GET /qr.png`, `GET /qr.svg`: QR code link and images

Admin (send the PIN in the `x-admin-pin` header):
- `POST /api/items`, `PUT /api/items/:id`, `DELETE /api/items/:id`
- `PUT /api/categories`, `DELETE /api/categories?name=`
- `POST /api/upload-image`, `POST /api/upload-model?name=`

## Project documents

`AGENTS.md` and the seven files in `docs/` (PRD, design system, architecture, database, security, code style, testing) are blank templates for now. They will be filled in with approved decisions before further feature work. AI coding assistants are asked to read them first.

## Checks

No lint, format, type-check or automated test commands are configured yet.

## Next steps

A permanent QR code link, a database (SQLite) instead of JSON, and real login for the admin page.
