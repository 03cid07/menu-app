const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PIN = process.env.ADMIN_PIN || "1234"; // change this!
const DATA_FILE = path.join(__dirname, "data", "menu.json");

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const load = () => JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
const save = (d) => fs.writeFileSync(DATA_FILE, JSON.stringify(d, null, 2));

const requirePin = (req, res, next) =>
  req.get("x-admin-pin") === ADMIN_PIN ? next() : res.status(401).json({ error: "Wrong PIN" });

// Public: read the menu
app.get("/api/menu", (_req, res) => res.json(load()));

// Admin: add, edit, delete items
app.post("/api/items", requirePin, (req, res) => {
  const data = load();
  const { name, price, category, description = "", available = true } = req.body;
  if (!name || price === undefined || !category)
    return res.status(400).json({ error: "Name, price and category are required" });
  const item = { id: Date.now().toString(36), name, price: Number(price), category, description, available };
  data.items.push(item);
  if (!data.categories.includes(category)) data.categories.push(category);
  save(data);
  res.status(201).json(item);
});

app.put("/api/items/:id", requirePin, (req, res) => {
  const data = load();
  const i = data.items.findIndex((x) => x.id === req.params.id);
  if (i < 0) return res.status(404).json({ error: "Item not found" });
  data.items[i] = { ...data.items[i], ...req.body, id: req.params.id, price: Number(req.body.price ?? data.items[i].price) };
  if (!data.categories.includes(data.items[i].category)) data.categories.push(data.items[i].category);
  save(data);
  res.json(data.items[i]);
});

app.delete("/api/items/:id", requirePin, (req, res) => {
  const data = load();
  data.items = data.items.filter((x) => x.id !== req.params.id);
  save(data);
  res.status(204).end();
});

app.listen(PORT, () => console.log(`Menu app running at http://localhost:${PORT}`));
