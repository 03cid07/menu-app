const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PIN = process.env.ADMIN_PIN || "1234"; // change this!
const DATA_FILE = path.join(__dirname, "data", "menu.json");
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
const validImage = (m) => m === undefined || m === "" || /^images\/[A-Za-z0-9._-]+\.(jpg|png|webp)$/i.test(m);

// AR size multiplier must be between 1% and 1000%
const validScale = (s) => s === undefined || (Number.isFinite(Number(s)) && Number(s) >= 0.01 && Number(s) <= 10);

// Return a copy of a .glb with a scale node wrapped around the scene (shape and textures untouched)
function scaleGlb(buf, factor) {
  const jsonLen = buf.readUInt32LE(12);
  const gltf = JSON.parse(buf.toString("utf8", 20, 20 + jsonLen).replace(/[\0 ]+$/, ""));
  const scene = gltf.scenes[gltf.scene || 0];
  gltf.nodes.push({ name: "SizeFix", scale: [factor, factor, factor], children: [...scene.nodes] });
  scene.nodes = [gltf.nodes.length - 1];
  let json = Buffer.from(JSON.stringify(gltf));
  json = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4, 0x20)]);
  const rest = buf.subarray(20 + jsonLen); // BIN chunk, kept as-is
  const head = Buffer.alloc(20);
  head.write("glTF", 0, "ascii");
  head.writeUInt32LE(2, 4);
  head.writeUInt32LE(20 + json.length + rest.length, 8);
  head.writeUInt32LE(json.length, 12);
  head.write("JSON", 16, "ascii");
  return Buffer.concat([head, json, rest]);
}

// Public: a model resized on the fly, e.g. /scaled/0.25/model.glb (name ends in .glb so AR apps accept it)
app.get("/scaled/:scale/:file", (req, res) => {
  const s = Number(req.params.scale);
  if (!/^[A-Za-z0-9._-]+\.glb$/i.test(req.params.file) || !(s >= 0.01 && s <= 10)) return res.status(400).end();
  const file = path.join(MODELS_DIR, req.params.file);
  if (!fs.existsSync(file)) return res.status(404).end();
  const buf = fs.readFileSync(file);
  res.type("model/gltf-binary").set("Cache-Control", "no-cache").send(s === 1 ? buf : scaleGlb(buf, s));
});

// Public: read the menu
app.get("/api/menu", (_req, res) => res.json(load()));

// Admin: add, edit, delete items
app.post("/api/items", requirePin, (req, res) => {
  const data = load();
  const { name, price, category, description = "", ingredients = "", image = "", model = "", modelScale = 1, available = true } = req.body;
  if (!name || price === undefined || !category)
    return res.status(400).json({ error: "Name, price and category are required" });
  if (!validModel(model)) return res.status(400).json({ error: "Invalid 3D model file" });
  if (!validImage(image)) return res.status(400).json({ error: "Invalid photo" });
  if (!validScale(modelScale)) return res.status(400).json({ error: "AR size must be between 1% and 1000%" });
  const item = { id: Date.now().toString(36), name, price: Number(price), category, description, ingredients, image, model, modelScale: Number(modelScale), available };
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
  if (!validImage(req.body.image)) return res.status(400).json({ error: "Invalid photo" });
  if (!validScale(req.body.modelScale)) return res.status(400).json({ error: "AR size must be between 1% and 1000%" });
  data.items[i] = { ...data.items[i], ...req.body, id: req.params.id, price: Number(req.body.price ?? data.items[i].price) };
  if (req.body.modelScale !== undefined) data.items[i].modelScale = Number(req.body.modelScale);
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
  res.status(204).end();
});

app.listen(PORT, () => console.log(`Menu app running at http://localhost:${PORT}`));
