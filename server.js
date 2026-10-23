const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PIN = process.env.ADMIN_PIN || "1234"; // change this!
const DATA_FILE = path.join(__dirname, "data", "menu.json");
const MODELS_DIR = path.join(__dirname, "public", "models");
fs.mkdirSync(MODELS_DIR, { recursive: true });

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const load = () => JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
const save = (d) => fs.writeFileSync(DATA_FILE, JSON.stringify(d, null, 2));

const requirePin = (req, res, next) =>
  req.get("x-admin-pin") === ADMIN_PIN ? next() : res.status(401).json({ error: "Wrong PIN" });

// A model value must be empty or a .glb file inside public/models
const validModel = (m) => m === undefined || m === "" || /^models\/[A-Za-z0-9._-]+\.glb$/i.test(m);

// Public: read the menu
app.get("/api/menu", (_req, res) => res.json(load()));

// Admin: add, edit, delete items
app.post("/api/items", requirePin, (req, res) => {
  const data = load();
  const { name, price, category, description = "", ingredients = "", model = "", available = true } = req.body;
  if (!name || price === undefined || !category)
    return res.status(400).json({ error: "Name, price and category are required" });
  if (!validModel(model)) return res.status(400).json({ error: "Invalid 3D model file" });
  const item = { id: Date.now().toString(36), name, price: Number(price), category, description, ingredients, model, available };
  data.items.push(item);
  if (!data.categories.includes(category)) data.categories.push(category);
  save(data);
  res.status(201).json(item);
});

app.put("/api/items/:id", requirePin, (req, res) => {
  const data = load();
  const i = data.items.findIndex((x) => x.id === req.params.id);
  if (i < 0) return res.status(404).json({ error: "Item not found" });
  if (!validModel(req.body.model)) return res.status(400).json({ error: "Invalid 3D model file" });
  data.items[i] = { ...data.items[i], ...req.body, id: req.params.id, price: Number(req.body.price ?? data.items[i].price) };
  if (!data.categories.includes(data.items[i].category)) data.categories.push(data.items[i].category);
  save(data);
  res.json(data.items[i]);
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
  res.status(204).end();
});

app.listen(PORT, () => console.log(`Menu app running at http://localhost:${PORT}`));
