const express = require('express');
const path = require('path');
const cors = require('cors');
const fs = require('fs').promises;

const app = express();
app.use(cors());
app.use(express.json());

// Serve static files from parent folder (project root) and use `amezone.html` as index
const staticRoot = path.join(__dirname, '..');
app.use(express.static(staticRoot, { index: 'amezone.html' }));

// Ensure root path serves the main page explicitly (helps when index resolution fails)
app.get('/', (req, res) => {
  res.sendFile(path.join(staticRoot, 'amezone.html'));
});

const DB_DIR = path.join(__dirname, 'data');
const PRODUCTS_FILE = path.join(DB_DIR, 'products.json');
const CONTACTS_FILE = path.join(DB_DIR, 'contacts.json');
const USERS_FILE = path.join(DB_DIR, 'users.json');
const CARTS_FILE = path.join(DB_DIR, 'carts.json');
const GIFTS_FILE = path.join(DB_DIR, 'gifts.json');

async function ensureDb() {
  try {
    await fs.mkdir(DB_DIR, { recursive: true });
    // create products.json if missing
    try {
      await fs.access(PRODUCTS_FILE);
    } catch (e) {
      // generate 500 products
      const baseCategories = ['Electronics', 'Home & Kitchen', 'Tools', 'Books', 'Fashion', 'Sports', 'Beauty'];
      const products = [];
      for (let i = 1; i <= 500; i++) {
        const cat = baseCategories[i % baseCategories.length];
        const id = 'p' + i;
        const title = `${cat} Product #${i}`;
        const price = Math.floor(100 + Math.random() * 5000);
        const img = `https://picsum.photos/seed/${encodeURIComponent(id)}/480/320`;
        const deal = Math.random() < 0.12; // ~12% deals
        products.push({ id, title, category: cat, price, img, deal });
      }
      await fs.writeFile(PRODUCTS_FILE, JSON.stringify(products, null, 2), 'utf8');
      console.log('Generated products.json with 500 items');
    }
    // ensure other files exist
    for (const f of [CONTACTS_FILE, USERS_FILE, CARTS_FILE]) {
      try { await fs.access(f); } catch { await fs.writeFile(f, '[]', 'utf8'); }
    }
    try { await fs.access(GIFTS_FILE); } catch { await fs.writeFile(GIFTS_FILE, '[]', 'utf8'); }
  } catch (err) {
    console.error('DB init error', err);
  }
}

// load products from file
async function readProducts() {
  const raw = await fs.readFile(PRODUCTS_FILE, 'utf8');
  return JSON.parse(raw);
}

// Persist contact
async function saveContact(c) {
  const all = JSON.parse(await fs.readFile(CONTACTS_FILE, 'utf8'));
  all.push(c);
  await fs.writeFile(CONTACTS_FILE, JSON.stringify(all, null, 2), 'utf8');
}

// Persist users (signin) - demo
async function saveUser(u) {
  const all = JSON.parse(await fs.readFile(USERS_FILE, 'utf8'));
  all.push(u);
  await fs.writeFile(USERS_FILE, JSON.stringify(all, null, 2), 'utf8');
}

// Persist carts
async function saveCartSnapshot(s) {
  const all = JSON.parse(await fs.readFile(CARTS_FILE, 'utf8'));
  all.push(s);
  await fs.writeFile(CARTS_FILE, JSON.stringify(all, null, 2), 'utf8');
}

async function saveGift(g) {
  const all = JSON.parse(await fs.readFile(GIFTS_FILE, 'utf8'));
  all.push(g);
  await fs.writeFile(GIFTS_FILE, JSON.stringify(all, null, 2), 'utf8');
}

app.post('/contact', async (req, res) => {
  const data = req.body || {};
  const entry = { ...data, receivedAt: new Date().toISOString() };
  try { await saveContact(entry); console.log('Contact received:', data); res.json({ ok: true, message: 'Contact received' }); }
  catch (err) { console.error(err); res.status(500).json({ ok:false }); }
});

app.post('/signin', async (req, res) => {
  const data = req.body || {};
  const entry = { ...data, signedAt: new Date().toISOString() };
  try { await saveUser(entry); res.json({ ok: true }); }
  catch (err) { console.error(err); res.status(500).json({ ok:false }); }
});

app.post('/location', async (req, res) => {
  const data = req.body || {};
  const entry = { type: 'location', value: data, at: new Date().toISOString() };
  try { await saveUser(entry); res.json({ ok:true }); }
  catch (err) { console.error(err); res.status(500).json({ ok:false }); }
});

app.post('/cart', async (req, res) => {
  const data = req.body || {};
  const snapshot = { items: data.items || [], updatedAt: new Date().toISOString() };
  try { await saveCartSnapshot(snapshot); console.log('Cart updated:', snapshot); res.json({ ok: true }); }
  catch (err) { console.error(err); res.status(500).json({ ok:false }); }
});

app.post('/gift', async (req, res) => {
  const data = req.body || {};
  const entry = { ...data, sentAt: new Date().toISOString() };
  try { await saveGift(entry); console.log('Gift sent', entry); res.json({ ok:true }); }
  catch (err) { console.error(err); res.status(500).json({ ok:false }); }
});

app.get('/cart', async (req, res) => {
  try { const all = JSON.parse(await fs.readFile(CARTS_FILE, 'utf8')); res.json({ ok:true, cart: all.slice(-1)[0] || { items: [] } }); }
  catch (err) { res.json({ ok:true, cart: { items: [] } }); }
});

app.get('/products', async (req, res) => {
  try {
    const q = (req.query.q || '').toLowerCase();
    const category = req.query.category || '';
    const deal = req.query.deal === 'true';
    const limit = parseInt(req.query.limit || '50', 10);
    const offset = parseInt(req.query.offset || '0', 10);
    const all = await readProducts();
    let filtered = all;
    if (q) filtered = filtered.filter(p => p.title.toLowerCase().includes(q) || p.category.toLowerCase().includes(q));
    if (category) filtered = filtered.filter(p => p.category === category);
    if (deal) filtered = filtered.filter(p => p.deal);
    const slice = filtered.slice(offset, offset + limit);
    res.json({ ok:true, total: filtered.length, offset, limit, results: slice });
  } catch (err) { console.error(err); res.status(500).json({ ok:false }); }
});

app.get('/products/:id', async (req, res) => {
  try { const all = await readProducts(); const p = all.find(x => x.id === req.params.id); if (!p) return res.status(404).json({ ok:false }); res.json({ ok:true, product: p }); }
  catch (err) { res.status(500).json({ ok:false }); }
});

app.get('/health', (req, res) => res.json({ ok:true }));

// initialize DB and start with port fallback when in use
const DEFAULT_PORT = parseInt(process.env.PORT || '3000', 10);

function tryListen(startPort, attempts = 5) {
  let port = startPort;
  const tryOne = () => {
    const server = app.listen(port);
    server.on('listening', () => console.log(`Amezon backend running on http://localhost:${port}`));
    server.on('error', (err) => {
      if (err && err.code === 'EADDRINUSE') {
        console.warn(`Port ${port} in use, trying next port...`);
        server.close?.();
        attempts -= 1;
        if (attempts > 0) { port += 1; setTimeout(tryOne, 200); }
        else {
          console.error('No available ports found after multiple attempts. Please free the port or set PORT env var.');
          process.exit(1);
        }
      } else {
        console.error('Server error', err);
        process.exit(1);
      }
    });
  };
  tryOne();
}

ensureDb().then(() => tryListen(DEFAULT_PORT));
