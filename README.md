# Menu App

A starter web app for a digital restaurant menu.

## Run it
1. Install Node.js (v18 or newer): https://nodejs.org
2. In this folder:
   ```
   npm install
   ADMIN_PIN=yourpin npm start
   ```
   (Windows PowerShell: `$env:ADMIN_PIN="yourpin"; npm start`)
3. Open http://localhost:3000 for the menu and http://localhost:3000/admin.html to manage it.

If you skip ADMIN_PIN, the default PIN is `1234`. Change it before going live.

## Folder guide
- `server.js`: Express server and API (`GET /api/menu`, `POST/PUT/DELETE /api/items`)
- `data/menu.json`: your menu data (edit the restaurant name and currency here)
- `public/index.html`: what customers see
- `public/admin.html`: where you add, edit, and remove items
- `public/js/glb-fixer.js` and `public/js/glb-tools.js`: the 3D model fixer that opens from the admin page when you choose a .glb (textures, real size, effects)
- `public/css/style.css`: all styling
- `public/js/`: browser scripts for each page

## Next steps
Photos per item, a QR code that links to the menu, a database (SQLite) instead of JSON, and real login for the admin page.
