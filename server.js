const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PIN = process.env.ADMIN_PIN || "1234"; // change this!
const DATA_FILE = path.join(__dirname, "data", "menu.json");
const RATINGS_FILE = path.join(__dirname, "data", "ratings.json");
const MODELS_DIR = path.join(__dirname, "public", "models");
const IMAGES_DIR = path.join(__dirname, "public", "images");
fs.mkdirSync(MODELS_DIR, { recursive: true });
fs.mkdirSync(IMAGES_DIR, { recursive: true });

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const load = () => JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
const save = (d) => fs.writeFileSync(DATA_FILE, JSON.stringify(d, null, 2));

const requirePin = (req, res, next) =>
  req.get("x-admin-pin") === ADMIN_PIN ? next() : res.status(401).json({ error: "Wrong PIN" });

// A model value must be empty or a .glb file inside public/models
const validModel = (m) => m === undefined || m === "" || /^models\/[A-Za-z0-9._-]+\.glb$/i.test(m);

// An image value must be empty or a file inside public/images
const IMG_RE = /^images\/[A-Za-z0-9._-]+\.(jpg|png|webp)$/i;
const validImage = (m) => m === undefined || m === "" || IMG_RE.test(m);

// A gallery is a list of up to 8 photo paths; the first one is the cover (also kept in item.image)
const validImages = (a) => a === undefined || (Array.isArray(a) && a.length <= 8 && a.every((x) => typeof x === "string" && IMG_RE.test(x)));

// Drink serving temperature must be empty (auto), "hot" or "cold"
// Reuse the spelling of an existing category when only the capitals differ ("drinks" -> "Drinks")
const canonCat = (data, c) => { const t = String(c).trim(); return data.categories.find((x) => x.toLowerCase() === t.toLowerCase()) || t; };

const validTemp = (t) => t === undefined || t === "" || t === "hot" || t === "cold";

// ---- Ratings: { itemId: { deviceId: stars } }, kept apart from menu.json ----
const loadRatings = () => { try { return JSON.parse(fs.readFileSync(RATINGS_FILE, "utf8")); } catch { return {}; } };
const saveRatings = (r) => fs.writeFileSync(RATINGS_FILE, JSON.stringify(r, null, 2));
const summary = (byDevice = {}) => {
  const v = Object.values(byDevice);
  return { avg: v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : 0, count: v.length };
};

// Public: read the menu (each item also carries its rating summary)
app.get("/api/menu", (_req, res) => {
  const d = load(), r = loadRatings();
  d.items = d.items.map((i) => ({ ...i, rating: summary(r[i.id]) }));
  res.json(d);
});

// Public: rate a dish 1-5 stars. One rating per device per dish (rating again replaces it).
const hits = new Map(); // simple per-visitor limit: 30 ratings per 10 minutes
app.post("/api/items/:id/rate", (req, res) => {
  const ip = req.get("cf-connecting-ip") || req.ip, now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < 600000);
  if (recent.length >= 30) return res.status(429).json({ error: "Too many ratings, try again later" });
  const stars = Number(req.body.stars), device = String(req.body.device || "");
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) return res.status(400).json({ error: "Stars must be 1 to 5" });
  if (!/^[A-Za-z0-9-]{8,64}$/.test(device)) return res.status(400).json({ error: "Invalid device" });
  if (!load().items.some((x) => x.id === req.params.id)) return res.status(404).json({ error: "Item not found" });
  recent.push(now); hits.set(ip, recent);
  const all = loadRatings();
  (all[req.params.id] = all[req.params.id] || {})[device] = stars;
  saveRatings(all);
  res.json(summary(all[req.params.id]));
});

// Admin: add, edit, delete items
app.post("/api/items", requirePin, (req, res) => {
  const data = load();
  const { name, price, category: rawCategory, description = "", ingredients = "", image = "", images, model = "", temp = "", available = true } = req.body;
  if (!name || price === undefined || !rawCategory || !String(rawCategory).trim())
    return res.status(400).json({ error: "Name, price and category are required" });
  if (!validModel(model)) return res.status(400).json({ error: "Invalid 3D model file" });
  if (!validImage(image) || !validImages(images)) return res.status(400).json({ error: "Invalid photos (up to 8 JPG, PNG or WebP)" });
  const category = canonCat(data, rawCategory);
  const gallery = Array.isArray(images) ? images : image ? [image] : [];
  if (!validTemp(temp)) return res.status(400).json({ error: "Serving must be hot or cold" });
  const item = { id: Date.now().toString(36), name, price: Number(price), category, description, ingredients, image: gallery[0] || "", images: gallery, model, temp, available };
  data.items.push(item);
  if (!data.categories.includes(category)) data.categories.push(category);
  save(data);
  res.status(201).json(item);
});

app.put("/api/items/:id", requirePin, (req, res) => {
  delete req.body.rating; // ratings come from customers only
  const data = load();
  const i = data.items.findIndex((x) => x.id === req.params.id);
  if (i < 0) return res.status(404).json({ error: "Item not found" });
  if (!validModel(req.body.model)) return res.status(400).json({ error: "Invalid 3D model file" });
  if (!validImage(req.body.image) || !validImages(req.body.images)) return res.status(400).json({ error: "Invalid photos (up to 8 JPG, PNG or WebP)" });
  if (!validTemp(req.body.temp)) return res.status(400).json({ error: "Serving must be hot or cold" });
  data.items[i] = { ...data.items[i], ...req.body, id: req.params.id, price: Number(req.body.price ?? data.items[i].price) };
  if (req.body.images !== undefined || req.body.image !== undefined) {
    const g = Array.isArray(req.body.images) ? req.body.images : req.body.image ? [req.body.image] : [];
    data.items[i].images = g; data.items[i].image = g[0] || "";
  }
  if (req.body.category !== undefined && !String(req.body.category).trim()) return res.status(400).json({ error: "Category is required" });
  data.items[i].category = canonCat(data, data.items[i].category);
  if (!data.categories.includes(data.items[i].category)) data.categories.push(data.items[i].category);
  save(data);
  res.json(data.items[i]);
});

// Admin: upload an item photo (raw file in the request body). Saved under a unique name.
app.post("/api/upload-image", requirePin, express.raw({ type: "*/*", limit: "10mb" }), (req, res) => {
  const b = req.body;
  const ok = Buffer.isBuffer(b) && b.length > 12;
  const ext = !ok ? null
    : b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff ? "jpg"
    : b.toString("ascii", 1, 4) === "PNG" && b[0] === 0x89 ? "png"
    : b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP" ? "webp" : null;
  if (!ext) return res.status(400).json({ error: "Please choose a JPG, PNG or WebP photo" });
  const name = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
  fs.writeFileSync(path.join(IMAGES_DIR, name), b);
  res.status(201).json({ image: `images/${name}` });
});

// Admin: upload a .glb 3D model (raw file in the request body, name in ?name=)
app.post("/api/upload-model", requirePin, express.raw({ type: "*/*", limit: "50mb" }), (req, res) => {
  const name = path.basename(String(req.query.name || "")).replace(/[^A-Za-z0-9._-]/g, "_");
  if (!/\.glb$/i.test(name)) return res.status(400).json({ error: "Only .glb files are allowed" });
  if (!Buffer.isBuffer(req.body) || req.body.length < 12 || req.body.toString("ascii", 0, 4) !== "glTF")
    return res.status(400).json({ error: "That file is not a valid .glb model" });
  fs.writeFileSync(path.join(MODELS_DIR, name), req.body);
  res.status(201).json({ model: `models/${name}` });
});

app.delete("/api/items/:id", requirePin, (req, res) => {
  const data = load();
  data.items = data.items.filter((x) => x.id !== req.params.id);
  save(data);
  const rt = loadRatings(); if (rt[req.params.id]) { delete rt[req.params.id]; saveRatings(rt); }
  res.status(204).end();
});

// Admin: rename a category. Typing the name of another category merges the two (fixes "Drinks" / "drinks").
app.put("/api/categories", requirePin, (req, res) => {
  const data = load(), from = String(req.body.from ?? ""), typed = String(req.body.to ?? "").trim();
  if (!data.categories.includes(from)) return res.status(404).json({ error: "Category not found" });
  if (!typed || typed.length > 40) return res.status(400).json({ error: "Name must be 1 to 40 characters" });
  const other = data.categories.find((x) => x !== from && x.toLowerCase() === typed.toLowerCase());
  const to = other || typed;
  data.items.forEach((i) => { if (i.category === from) i.category = to; });
  data.categories = other ? data.categories.filter((x) => x !== from) : data.categories.map((x) => (x === from ? to : x));
  save(data);
  res.json({ categories: data.categories, merged: !!other });
});

// Admin: delete a category, only when no dish uses it
app.delete("/api/categories", requirePin, (req, res) => {
  const data = load(), name = String(req.query.name ?? "");
  if (!data.categories.includes(name)) return res.status(404).json({ error: "Category not found" });
  const n = data.items.filter((i) => i.category === name).length;
  if (n) return res.status(409).json({ error: `${n} dish${n === 1 ? "" : "es"} still use "${name}". Move them to another category first, or rename this one to merge it.` });
  data.categories = data.categories.filter((x) => x !== name);
  save(data);
  res.status(204).end();
});

app.listen(PORT, () => console.log(`Menu app running at http://localhost:${PORT}`));
