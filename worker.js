/**
 * OrderJaa - Cloudflare Worker Backend
 * Self-service food ordering kiosk + Admin CMS with Cloudflare D1
 */

let dbReady = false;
let dbInitPromise = null;

const SEED_CATEGORIES = [
  { name: 'Makanan Utama', emoji: '🍛', sort_order: 1 },
  { name: 'Mi & Sup', emoji: '🍜', sort_order: 2 },
  { name: 'Snek & Kuih', emoji: '🥟', sort_order: 3 },
  { name: 'Minuman', emoji: '🧋', sort_order: 4 },
];

const SEED_MENU_ITEMS = [
  // Makanan Utama (4)
  {
    categoryIndex: 0,
    name: 'Nasi Lemak Ayam Berempah',
    description: 'Nasi santan wangi bersama ayam goreng berempah rangup, sambal tumis, telur rebus, kacang & ikan bilis.',
    price_cents: 1290,
    emoji: '🍛',
    sort_order: 1,
  },
  {
    categoryIndex: 0,
    name: 'Nasi Goreng Kampung',
    description: 'Nasi goreng klasik dengan ikan bilis rangup, kangkung segar, cili padi dan telur mata.',
    price_cents: 950,
    emoji: '🍚',
    sort_order: 2,
  },
  {
    categoryIndex: 0,
    name: 'Nasi Ayam Hainan',
    description: 'Nasi ayam beraroma halia bersama ayam panggang madu, sup jernih dan sos cili istimewa.',
    price_cents: 1090,
    emoji: '🍗',
    sort_order: 3,
  },
  {
    categoryIndex: 0,
    name: 'Rendang Daging & Nasi Putih',
    description: 'Daging lembu empuk dimasak perlahan dengan rempah ratus dan kerisik bersama nasi putih panas.',
    price_cents: 1450,
    emoji: '🥩',
    sort_order: 4,
  },
  // Mi & Sup (4)
  {
    categoryIndex: 1,
    name: 'Char Kuey Teow Udang',
    description: 'Kuey teow goreng kuali panas dengan udang segar, taugeh, kucai dan telur itik.',
    price_cents: 1150,
    emoji: '🍜',
    sort_order: 5,
  },
  {
    categoryIndex: 1,
    name: 'Laksa Penang Asli',
    description: 'Kuah ikan kembung masam pedas pekat dengan mi laksa, timun, bawang, nanas dan daun kesum.',
    price_cents: 990,
    emoji: '🥣',
    sort_order: 6,
  },
  {
    categoryIndex: 1,
    name: 'Mee Kari Nyonya',
    description: 'Mi kuning dalam kuah kari santan berlemak bersama tauhu pok, kerang, fishcake dan telur.',
    price_cents: 1050,
    emoji: '🍲',
    sort_order: 7,
  },
  {
    categoryIndex: 1,
    name: 'Bihun Sup Utara',
    description: 'Bihun lembut dengan sup tulang berempah, daging hiris, sambal kicap dan bawang goreng.',
    price_cents: 890,
    emoji: '🥢',
    sort_order: 8,
  },
  // Snek & Kuih (3)
  {
    categoryIndex: 2,
    name: 'Karipap Ayam Rangup (3 pcs)',
    description: 'Karipap pastri rapuh berinti kentang dan ayam berempah yang digoreng panas-panas.',
    price_cents: 450,
    emoji: '🥟',
    sort_order: 9,
  },
  {
    categoryIndex: 2,
    name: 'Pisang Goreng Cheese',
    description: 'Pisang nipah goreng rangup ditaburi keju parut dan susu pekat manis.',
    price_cents: 650,
    emoji: '🍌',
    sort_order: 10,
  },
  {
    categoryIndex: 2,
    name: 'Roti Bakar Kaya & Mentega',
    description: 'Roti benggali bakar garing disapu kaya pandan buatan sendiri dan mentega sejuk.',
    price_cents: 490,
    emoji: '🍞',
    sort_order: 11,
  },
  // Minuman (4)
  {
    categoryIndex: 3,
    name: 'Teh Tarik Kaw',
    description: 'Teh hitam pekat ditarik berbuih bersama susu pekat dan susu sejat.',
    price_cents: 350,
    emoji: '🧋',
    sort_order: 12,
  },
  {
    categoryIndex: 3,
    name: 'Kopi O Ais',
    description: 'Kopi kampung panggang gelap bersama gula perang dan ketulan ais.',
    price_cents: 320,
    emoji: '☕',
    sort_order: 13,
  },
  {
    categoryIndex: 3,
    name: 'Sirap Bandung Cincau',
    description: 'Minuman ros bersusu sejuk lengkap dengan hirisan cincau hitam kenyal.',
    price_cents: 450,
    emoji: '🥤',
    sort_order: 14,
  },
  {
    categoryIndex: 3,
    name: 'Air Limau Ais',
    description: 'Jus limau nipis segar yang menyegarkan dengan sedikit kemanisan.',
    price_cents: 300,
    emoji: '🍋',
    sort_order: 15,
  },
];

/**
 * Auto-setup D1 tables + 15 sample menu items once per worker isolate.
 * Cached via `dbReady` so CREATE TABLE does not repeat on every request.
 */
async function ensureDb(db) {
  if (dbReady) return;
  if (dbInitPromise) {
    await dbInitPromise;
    return;
  }

  dbInitPromise = (async () => {
    await db.batch([
      db.prepare(`
        CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        )
      `),
      db.prepare(`
        CREATE TABLE IF NOT EXISTS categories (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          emoji TEXT NOT NULL DEFAULT '🍽️',
          sort_order INTEGER NOT NULL DEFAULT 0,
          is_active INTEGER NOT NULL DEFAULT 1
        )
      `),
      db.prepare(`
        CREATE TABLE IF NOT EXISTS images (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          mime_type TEXT NOT NULL DEFAULT 'image/jpeg',
          data BLOB NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
      `),
      db.prepare(`
        CREATE TABLE IF NOT EXISTS menu_items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          category_id INTEGER NOT NULL,
          name TEXT NOT NULL,
          description TEXT NOT NULL DEFAULT '',
          price_cents INTEGER NOT NULL,
          emoji TEXT NOT NULL DEFAULT '🍽️',
          image_id INTEGER,
          is_active INTEGER NOT NULL DEFAULT 1,
          sort_order INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
      `),
      db.prepare(`
        CREATE TABLE IF NOT EXISTS orders (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          queue_number TEXT NOT NULL DEFAULT '',
          order_type TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending',
          total_cents INTEGER NOT NULL,
          notes TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
      `),
      db.prepare(`
        CREATE TABLE IF NOT EXISTS order_items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          order_id INTEGER NOT NULL,
          menu_item_id INTEGER NOT NULL,
          item_name TEXT NOT NULL,
          unit_price_cents INTEGER NOT NULL,
          quantity INTEGER NOT NULL,
          subtotal_cents INTEGER NOT NULL
        )
      `),
    ]);

    // Seed default store settings
    await db.batch([
      db.prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES ('store_name', 'OrderJaa Kopitiam')`),
      db.prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES ('banner_text', 'Selamat Datang! Sentuh menu untuk mula membuat pesanan anda.')`),
      db.prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES ('is_open', '1')`),
    ]);

    // Seed categories + 15 sample menu items only if categories table is empty
    const catCountRow = await db.prepare('SELECT COUNT(*) AS cnt FROM categories').first();
    if (!catCountRow || Number(catCountRow.cnt) === 0) {
      const catIds = [];
      for (const cat of SEED_CATEGORIES) {
        const res = await db
          .prepare('INSERT INTO categories (name, emoji, sort_order, is_active) VALUES (?, ?, ?, 1)')
          .bind(cat.name, cat.emoji, cat.sort_order)
          .run();
        catIds.push(res.meta.last_row_id);
      }

      const itemStmts = SEED_MENU_ITEMS.map((item) =>
        db
          .prepare(
            'INSERT INTO menu_items (category_id, name, description, price_cents, emoji, image_id, is_active, sort_order) VALUES (?, ?, ?, ?, ?, NULL, 1, ?)'
          )
          .bind(
            catIds[item.categoryIndex],
            item.name,
            item.description,
            item.price_cents,
            item.emoji,
            item.sort_order
          )
      );
      await db.batch(itemStmts);
    }

    dbReady = true;
  })();

  try {
    await dbInitPromise;
  } catch (err) {
    dbInitPromise = null;
    throw err;
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

function formatQueueNumber(orderId) {
  return `A${String(orderId).padStart(3, '0')}`;
}

async function getSettingsMap(db) {
  const { results } = await db.prepare('SELECT key, value FROM settings').all();
  const map = {
    store_name: 'OrderJaa Kopitiam',
    banner_text: 'Selamat Datang!',
    is_open: '1',
  };
  for (const row of results || []) {
    map[row.key] = row.value;
  }
  return {
    store_name: map.store_name,
    banner_text: map.banner_text,
    is_open: map.is_open === '1',
  };
}

// --- Admin Auth Helpers (HMAC-SHA256 stateless token) ---

async function hmacSign(secret, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

async function createAdminToken(secret) {
  const exp = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
  const payload = String(exp);
  const sig = await hmacSign(secret, payload);
  return `${payload}.${sig}`;
}

async function verifyAdminToken(secret, token) {
  if (!token || typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [payload, sig] = parts;
  const exp = Number(payload);
  if (!Number.isFinite(exp) || Date.now() > exp) return false;
  const expectedSig = await hmacSign(secret, payload);
  return timingSafeEqual(sig, expectedSig);
}

async function requireAdmin(request, env) {
  if (!env.ADMIN_PASSWORD || String(env.ADMIN_PASSWORD).trim() === '') {
    return json(
      { error: 'ADMIN_PASSWORD belum diset pada persekitaran server.' },
      503
    );
  }
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const valid = await verifyAdminToken(env.ADMIN_PASSWORD, token);
  if (!valid) {
    return json({ error: 'Sesi admin tidak sah atau telah tamat. Sila log masuk semula.' }, 401);
  }
  return null;
}

// --- Route Handlers ---

async function handlePublicBootstrap(env) {
  const settings = await getSettingsMap(env.DB);
  const categoriesRes = await env.DB.prepare(
    'SELECT id, name, emoji, sort_order FROM categories WHERE is_active = 1 ORDER BY sort_order ASC, id ASC'
  ).all();
  const itemsRes = await env.DB.prepare(
    `SELECT m.id, m.category_id, m.name, m.description, m.price_cents, m.emoji, m.image_id, m.sort_order
     FROM menu_items m
     INNER JOIN categories c ON c.id = m.category_id
     WHERE m.is_active = 1 AND c.is_active = 1
     ORDER BY m.sort_order ASC, m.id ASC`
  ).all();

  return json({
    settings,
    categories: categoriesRes.results || [],
    items: (itemsRes.results || []).map((item) => ({
      ...item,
      image_url: item.image_id ? `/api/images/${item.image_id}` : null,
    })),
  });
}

async function handleGetImage(env, idParam) {
  const id = Number(idParam);
  if (!Number.isInteger(id) || id <= 0) {
    return new Response('Not Found', { status: 404 });
  }
  const row = await env.DB.prepare('SELECT mime_type, data FROM images WHERE id = ?')
    .bind(id)
    .first();
  if (!row || !row.data) {
    return new Response('Not Found', { status: 404 });
  }
  const bytes = Uint8Array.from(row.data || []);
  return new Response(bytes, {
    status: 200,
    headers: {
      'Content-Type': row.mime_type || 'image/jpeg',
      'Cache-Control': 'public, max-age=86400',
    },
  });
}

async function handleCreateOrder(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Format JSON tidak sah.' }, 400);
  }

  // 1. Check store open status on server
  const settings = await getSettingsMap(env.DB);
  if (!settings.is_open) {
    return json({ error: 'Maaf, kedai sedang ditutup buat sementara waktu.' }, 403);
  }

  const orderType = body?.order_type;
  if (orderType !== 'dine_in' && orderType !== 'takeaway') {
    return json({ error: 'Sila pilih jenis pesanan: Makan Sini atau Bungkus.' }, 400);
  }

  const rawItems = Array.isArray(body?.items) ? body.items : [];
  if (rawItems.length === 0) {
    return json({ error: 'Troli kosong. Sila pilih sekurang-kurangnya satu menu.' }, 400);
  }

  // Merge duplicate menu_item_id entries and validate quantities
  const qtyById = new Map();
  for (const entry of rawItems) {
    const itemId = Number(entry?.menu_item_id);
    const qty = Number(entry?.quantity);
    if (!Number.isInteger(itemId) || itemId <= 0 || !Number.isInteger(qty) || qty <= 0 || qty > 99) {
      return json({ error: 'Item atau kuantiti pesanan tidak sah.' }, 400);
    }
    qtyById.set(itemId, (qtyById.get(itemId) || 0) + qty);
  }

  const itemIds = Array.from(qtyById.keys());
  const placeholders = itemIds.map(() => '?').join(', ');
  const { results: dbItems } = await env.DB.prepare(
    `SELECT m.id, m.name, m.price_cents, m.is_active, c.is_active AS cat_active
     FROM menu_items m
     INNER JOIN categories c ON c.id = m.category_id
     WHERE m.id IN (${placeholders})`
  )
    .bind(...itemIds)
    .all();

  const dbItemMap = new Map();
  for (const row of dbItems || []) {
    dbItemMap.set(row.id, row);
  }

  // 2. Calculate total price on server
  let totalCents = 0;
  const lineItems = [];
  for (const [itemId, qty] of qtyById.entries()) {
    const dbItem = dbItemMap.get(itemId);
    if (!dbItem || dbItem.is_active !== 1 || dbItem.cat_active !== 1) {
      return json({ error: `Item menu #${itemId} tidak tersedia buat masa ini.` }, 400);
    }
    const subtotal = dbItem.price_cents * qty;
    totalCents += subtotal;
    lineItems.push({
      menu_item_id: dbItem.id,
      item_name: dbItem.name,
      unit_price_cents: dbItem.price_cents,
      quantity: qty,
      subtotal_cents: subtotal,
    });
  }

  const notes = typeof body?.notes === 'string' ? body.notes.trim().slice(0, 200) : '';

  // 3. Insert order to get orderId, then derive queue_number from orderId
  const orderRes = await env.DB.prepare(
    `INSERT INTO orders (queue_number, order_type, status, total_cents, notes)
     VALUES ('', ?, 'pending', ?, ?)`
  )
    .bind(orderType, totalCents, notes)
    .run();

  const orderId = orderRes.meta.last_row_id;
  const queueNumber = formatQueueNumber(orderId);

  // 4. Save queue_number and all order_items using db.batch()
  const batchStmts = [
    env.DB.prepare('UPDATE orders SET queue_number = ? WHERE id = ?').bind(queueNumber, orderId),
    ...lineItems.map((li) =>
      env.DB.prepare(
        `INSERT INTO order_items (order_id, menu_item_id, item_name, unit_price_cents, quantity, subtotal_cents)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).bind(orderId, li.menu_item_id, li.item_name, li.unit_price_cents, li.quantity, li.subtotal_cents)
    ),
  ];
  await env.DB.batch(batchStmts);

  return json(
    {
      id: orderId,
      queue_number: queueNumber,
      order_type: orderType,
      status: 'pending',
      total_cents: totalCents,
      notes,
      items: lineItems,
    },
    201
  );
}

async function handleGetOrderStatus(env, idParam) {
  const id = Number(idParam);
  if (!Number.isInteger(id) || id <= 0) {
    return json({ error: 'ID pesanan tidak sah.' }, 400);
  }
  const order = await env.DB.prepare(
    'SELECT id, queue_number, order_type, status, total_cents, notes, created_at, updated_at FROM orders WHERE id = ?'
  )
    .bind(id)
    .first();
  if (!order) {
    return json({ error: 'Pesanan tidak dijumpai.' }, 404);
  }
  const { results: items } = await env.DB.prepare(
    'SELECT menu_item_id, item_name, unit_price_cents, quantity, subtotal_cents FROM order_items WHERE order_id = ? ORDER BY id ASC'
  )
    .bind(id)
    .all();

  return json({ ...order, items: items || [] });
}

async function handleGetLiveQueue(env) {
  const { results } = await env.DB.prepare(
    `SELECT id, queue_number, order_type, status, updated_at
     FROM orders
     WHERE status IN ('pending', 'preparing', 'ready')
     ORDER BY id DESC
     LIMIT 30`
  ).all();
  return json({ orders: results || [] });
}

// --- Admin Handlers ---

async function handleAdminLogin(request, env) {
  if (!env.ADMIN_PASSWORD || String(env.ADMIN_PASSWORD).trim() === '') {
    return json(
      { error: 'ADMIN_PASSWORD belum diset pada persekitaran server.' },
      503
    );
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Format JSON tidak sah.' }, 400);
  }
  const password = typeof body?.password === 'string' ? body.password : '';
  if (!timingSafeEqual(password, String(env.ADMIN_PASSWORD))) {
    return json({ error: 'Kata laluan salah.' }, 401);
  }
  const token = await createAdminToken(String(env.ADMIN_PASSWORD));
  return json({ token });
}

async function handleAdminDashboard(env) {
  const settings = await getSettingsMap(env.DB);
  const { results: categories } = await env.DB.prepare(
    `SELECT c.id, c.name, c.emoji, c.sort_order, c.is_active,
            COUNT(m.id) AS item_count
     FROM categories c
     LEFT JOIN menu_items m ON m.category_id = c.id
     GROUP BY c.id
     ORDER BY c.sort_order ASC, c.id ASC`
  ).all();

  const { results: items } = await env.DB.prepare(
    `SELECT id, category_id, name, description, price_cents, emoji, image_id, is_active, sort_order, created_at
     FROM menu_items
     ORDER BY sort_order ASC, id ASC`
  ).all();

  const { results: orders } = await env.DB.prepare(
    `SELECT id, queue_number, order_type, status, total_cents, notes, created_at, updated_at
     FROM orders
     ORDER BY id DESC
     LIMIT 60`
  ).all();

  const orderIds = (orders || []).map((o) => o.id);
  const itemsByOrder = new Map();
  if (orderIds.length > 0) {
    const ph = orderIds.map(() => '?').join(', ');
    const { results: orderItems } = await env.DB.prepare(
      `SELECT order_id, menu_item_id, item_name, unit_price_cents, quantity, subtotal_cents
       FROM order_items
       WHERE order_id IN (${ph})
       ORDER BY id ASC`
    )
      .bind(...orderIds)
      .all();
    for (const oi of orderItems || []) {
      if (!itemsByOrder.has(oi.order_id)) itemsByOrder.set(oi.order_id, []);
      itemsByOrder.get(oi.order_id).push(oi);
    }
  }

  return json({
    settings,
    categories: categories || [],
    items: (items || []).map((item) => ({
      ...item,
      image_url: item.image_id ? `/api/images/${item.image_id}` : null,
    })),
    orders: (orders || []).map((o) => ({
      ...o,
      items: itemsByOrder.get(o.id) || [],
    })),
  });
}

async function handleUpdateSettings(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Format JSON tidak sah.' }, 400);
  }
  const storeName = typeof body?.store_name === 'string' ? body.store_name.trim().slice(0, 80) : '';
  const bannerText = typeof body?.banner_text === 'string' ? body.banner_text.trim().slice(0, 200) : '';
  const isOpen = body?.is_open === true || body?.is_open === 1 || body?.is_open === '1' ? '1' : '0';

  if (!storeName) {
    return json({ error: 'Nama kedai tidak boleh kosong.' }, 400);
  }

  await env.DB.batch([
    env.DB.prepare(`INSERT INTO settings (key, value) VALUES ('store_name', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).bind(storeName),
    env.DB.prepare(`INSERT INTO settings (key, value) VALUES ('banner_text', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).bind(bannerText),
    env.DB.prepare(`INSERT INTO settings (key, value) VALUES ('is_open', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).bind(isOpen),
  ]);

  return json({ settings: await getSettingsMap(env.DB) });
}

async function handleUpdateOrderStatus(request, env, idParam) {
  const id = Number(idParam);
  if (!Number.isInteger(id) || id <= 0) {
    return json({ error: 'ID pesanan tidak sah.' }, 400);
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Format JSON tidak sah.' }, 400);
  }
  const allowed = ['pending', 'preparing', 'ready', 'completed', 'cancelled'];
  if (!allowed.includes(body?.status)) {
    return json({ error: 'Status pesanan tidak sah.' }, 400);
  }
  const res = await env.DB.prepare(
    `UPDATE orders SET status = ?, updated_at = datetime('now') WHERE id = ?`
  )
    .bind(body.status, id)
    .run();

  if (res.meta.changes === 0) {
    return json({ error: 'Pesanan tidak dijumpai.' }, 404);
  }
  return json({ ok: true, id, status: body.status });
}

async function handleCreateCategory(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Format JSON tidak sah.' }, 400);
  }
  const name = typeof body?.name === 'string' ? body.name.trim().slice(0, 60) : '';
  const emoji = typeof body?.emoji === 'string' && body.emoji.trim() ? body.emoji.trim().slice(0, 8) : '🍽️';
  const sortOrder = Number.isFinite(Number(body?.sort_order)) ? Number(body.sort_order) : 0;
  const isActive = body?.is_active === false || body?.is_active === 0 ? 0 : 1;

  if (!name) {
    return json({ error: 'Nama kategori diperlukan.' }, 400);
  }

  const res = await env.DB.prepare(
    'INSERT INTO categories (name, emoji, sort_order, is_active) VALUES (?, ?, ?, ?)'
  )
    .bind(name, emoji, sortOrder, isActive)
    .run();

  return json({ id: res.meta.last_row_id, name, emoji, sort_order: sortOrder, is_active: isActive }, 201);
}

async function handleUpdateCategory(request, env, idParam) {
  const id = Number(idParam);
  if (!Number.isInteger(id) || id <= 0) {
    return json({ error: 'ID kategori tidak sah.' }, 400);
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Format JSON tidak sah.' }, 400);
  }

  const existing = await env.DB.prepare('SELECT * FROM categories WHERE id = ?').bind(id).first();
  if (!existing) {
    return json({ error: 'Kategori tidak dijumpai.' }, 404);
  }

  const name = typeof body?.name === 'string' ? body.name.trim().slice(0, 60) : existing.name;
  const emoji = typeof body?.emoji === 'string' && body.emoji.trim() ? body.emoji.trim().slice(0, 8) : existing.emoji;
  const sortOrder = body?.sort_order !== undefined ? Number(body.sort_order) : existing.sort_order;
  const isActive = body?.is_active !== undefined ? (body.is_active ? 1 : 0) : existing.is_active;

  if (!name) {
    return json({ error: 'Nama kategori tidak boleh kosong.' }, 400);
  }

  await env.DB.prepare(
    'UPDATE categories SET name = ?, emoji = ?, sort_order = ?, is_active = ? WHERE id = ?'
  )
    .bind(name, emoji, sortOrder, isActive, id)
    .run();

  return json({ id, name, emoji, sort_order: sortOrder, is_active: isActive });
}

async function handleDeleteCategory(env, idParam) {
  const id = Number(idParam);
  if (!Number.isInteger(id) || id <= 0) {
    return json({ error: 'ID kategori tidak sah.' }, 400);
  }
  const existing = await env.DB.prepare('SELECT id FROM categories WHERE id = ?').bind(id).first();
  if (!existing) {
    return json({ error: 'Kategori tidak dijumpai.' }, 404);
  }

  // Block deletion with 409 if any menu items still belong to this category
  const countRow = await env.DB.prepare(
    'SELECT COUNT(*) AS cnt FROM menu_items WHERE category_id = ?'
  )
    .bind(id)
    .first();

  if (countRow && Number(countRow.cnt) > 0) {
    return json(
      {
        error: `Kategori tidak boleh dipadam kerana masih mempunyai ${countRow.cnt} item menu. Sila pindah atau padam item tersebut dahulu.`,
      },
      409
    );
  }

  await env.DB.prepare('DELETE FROM categories WHERE id = ?').bind(id).run();
  return json({ ok: true, id });
}

async function handleCreateItem(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Format JSON tidak sah.' }, 400);
  }

  const categoryId = Number(body?.category_id);
  const name = typeof body?.name === 'string' ? body.name.trim().slice(0, 80) : '';
  const description = typeof body?.description === 'string' ? body.description.trim().slice(0, 300) : '';
  const priceCents = Math.round(Number(body?.price_cents));
  const emoji = typeof body?.emoji === 'string' && body.emoji.trim() ? body.emoji.trim().slice(0, 8) : '🍽️';
  const imageId = body?.image_id ? Number(body.image_id) : null;
  const isActive = body?.is_active === false || body?.is_active === 0 ? 0 : 1;
  const sortOrder = Number.isFinite(Number(body?.sort_order)) ? Number(body.sort_order) : 0;

  if (!Number.isInteger(categoryId) || categoryId <= 0) {
    return json({ error: 'Kategori tidak sah.' }, 400);
  }
  if (!name) {
    return json({ error: 'Nama item diperlukan.' }, 400);
  }
  if (!Number.isInteger(priceCents) || priceCents < 0) {
    return json({ error: 'Harga tidak sah.' }, 400);
  }

  const res = await env.DB.prepare(
    `INSERT INTO menu_items (category_id, name, description, price_cents, emoji, image_id, is_active, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(categoryId, name, description, priceCents, emoji, imageId, isActive, sortOrder)
    .run();

  return json(
    {
      id: res.meta.last_row_id,
      category_id: categoryId,
      name,
      description,
      price_cents: priceCents,
      emoji,
      image_id: imageId,
      image_url: imageId ? `/api/images/${imageId}` : null,
      is_active: isActive,
      sort_order: sortOrder,
    },
    201
  );
}

async function handleUpdateItem(request, env, idParam) {
  const id = Number(idParam);
  if (!Number.isInteger(id) || id <= 0) {
    return json({ error: 'ID item tidak sah.' }, 400);
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Format JSON tidak sah.' }, 400);
  }

  const existing = await env.DB.prepare('SELECT * FROM menu_items WHERE id = ?').bind(id).first();
  if (!existing) {
    return json({ error: 'Item tidak dijumpai.' }, 404);
  }

  const categoryId = body?.category_id !== undefined ? Number(body.category_id) : existing.category_id;
  const name = typeof body?.name === 'string' ? body.name.trim().slice(0, 80) : existing.name;
  const description = typeof body?.description === 'string' ? body.description.trim().slice(0, 300) : existing.description;
  const priceCents = body?.price_cents !== undefined ? Math.round(Number(body.price_cents)) : existing.price_cents;
  const emoji = typeof body?.emoji === 'string' && body.emoji.trim() ? body.emoji.trim().slice(0, 8) : existing.emoji;
  const imageId = body?.image_id !== undefined ? (body.image_id ? Number(body.image_id) : null) : existing.image_id;
  const isActive = body?.is_active !== undefined ? (body.is_active ? 1 : 0) : existing.is_active;
  const sortOrder = body?.sort_order !== undefined ? Number(body.sort_order) : existing.sort_order;

  if (!name || !Number.isInteger(priceCents) || priceCents < 0 || !Number.isInteger(categoryId) || categoryId <= 0) {
    return json({ error: 'Data item tidak sah.' }, 400);
  }

  await env.DB.prepare(
    `UPDATE menu_items
     SET category_id = ?, name = ?, description = ?, price_cents = ?, emoji = ?, image_id = ?, is_active = ?, sort_order = ?
     WHERE id = ?`
  )
    .bind(categoryId, name, description, priceCents, emoji, imageId, isActive, sortOrder, id)
    .run();

  return json({
    id,
    category_id: categoryId,
    name,
    description,
    price_cents: priceCents,
    emoji,
    image_id: imageId,
    image_url: imageId ? `/api/images/${imageId}` : null,
    is_active: isActive,
    sort_order: sortOrder,
  });
}

async function handleDuplicateItem(env, idParam) {
  const id = Number(idParam);
  if (!Number.isInteger(id) || id <= 0) {
    return json({ error: 'ID item tidak sah.' }, 400);
  }
  const existing = await env.DB.prepare('SELECT * FROM menu_items WHERE id = ?').bind(id).first();
  if (!existing) {
    return json({ error: 'Item tidak dijumpai.' }, 404);
  }
  const newName = `${existing.name} (Salinan)`.slice(0, 80);
  const res = await env.DB.prepare(
    `INSERT INTO menu_items (category_id, name, description, price_cents, emoji, image_id, is_active, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      existing.category_id,
      newName,
      existing.description,
      existing.price_cents,
      existing.emoji,
      existing.image_id,
      existing.is_active,
      existing.sort_order + 1
    )
    .run();

  return json({ id: res.meta.last_row_id, name: newName }, 201);
}

async function handleDeleteItem(env, idParam) {
  const id = Number(idParam);
  if (!Number.isInteger(id) || id <= 0) {
    return json({ error: 'ID item tidak sah.' }, 400);
  }
  const res = await env.DB.prepare('DELETE FROM menu_items WHERE id = ?').bind(id).run();
  if (res.meta.changes === 0) {
    return json({ error: 'Item tidak dijumpai.' }, 404);
  }
  return json({ ok: true, id });
}

async function handleUploadImage(request, env) {
  const contentType = request.headers.get('Content-Type') || '';
  let bytes;
  let mimeType = 'image/jpeg';

  if (contentType.includes('multipart/form-data')) {
    const form = await request.formData();
    const file = form.get('image');
    if (!file || typeof file === 'string') {
      return json({ error: 'Fail gambar tidak ditemui.' }, 400);
    }
    mimeType = file.type || 'image/jpeg';
    bytes = new Uint8Array(await file.arrayBuffer());
  } else {
    mimeType = contentType.split(';')[0].trim() || 'image/jpeg';
    bytes = new Uint8Array(await request.arrayBuffer());
  }

  if (!bytes || bytes.byteLength === 0) {
    return json({ error: 'Gambar kosong.' }, 400);
  }
  if (bytes.byteLength > 98 * 1024) {
    return json({ error: 'Saiz gambar melebihi had 95 KB selepas mampatan.' }, 413);
  }

  const res = await env.DB.prepare('INSERT INTO images (mime_type, data) VALUES (?, ?)')
    .bind(mimeType, bytes.buffer)
    .run();

  const imageId = res.meta.last_row_id;
  return json({ id: imageId, url: `/api/images/${imageId}` }, 201);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method.toUpperCase();

    try {
      if (path.startsWith('/api/')) {
        await ensureDb(env.DB);

        // Public API routes
        if (method === 'GET' && (path === '/api/bootstrap' || path === '/api/menu')) {
          return await handlePublicBootstrap(env);
        }

        const imgMatch = path.match(/^\/api\/images\/(\d+)$/);
        if (method === 'GET' && imgMatch) {
          return await handleGetImage(env, imgMatch[1]);
        }

        if (method === 'POST' && path === '/api/orders') {
          return await handleCreateOrder(request, env);
        }

        if (method === 'GET' && path === '/api/orders/queue/live') {
          return await handleGetLiveQueue(env);
        }

        const orderStatusMatch = path.match(/^\/api\/orders\/(\d+)$/);
        if (method === 'GET' && orderStatusMatch) {
          return await handleGetOrderStatus(env, orderStatusMatch[1]);
        }

        // Admin Login
        if (method === 'POST' && path === '/api/admin/login') {
          return await handleAdminLogin(request, env);
        }

        // Protected Admin Routes
        if (path.startsWith('/api/admin/')) {
          const authErr = await requireAdmin(request, env);
          if (authErr) return authErr;

          if (method === 'GET' && path === '/api/admin/dashboard') {
            return await handleAdminDashboard(env);
          }

          if (method === 'PUT' && path === '/api/admin/settings') {
            return await handleUpdateSettings(request, env);
          }

          const adminOrderMatch = path.match(/^\/api\/admin\/orders\/(\d+)$/);
          if (method === 'PATCH' && adminOrderMatch) {
            return await handleUpdateOrderStatus(request, env, adminOrderMatch[1]);
          }

          if (method === 'POST' && path === '/api/admin/categories') {
            return await handleCreateCategory(request, env);
          }

          const adminCatMatch = path.match(/^\/api\/admin\/categories\/(\d+)$/);
          if (adminCatMatch) {
            if (method === 'PUT') return await handleUpdateCategory(request, env, adminCatMatch[1]);
            if (method === 'DELETE') return await handleDeleteCategory(env, adminCatMatch[1]);
          }

          if (method === 'POST' && path === '/api/admin/items') {
            return await handleCreateItem(request, env);
          }

          const adminItemDupMatch = path.match(/^\/api\/admin\/items\/(\d+)\/duplicate$/);
          if (method === 'POST' && adminItemDupMatch) {
            return await handleDuplicateItem(env, adminItemDupMatch[1]);
          }

          const adminItemMatch = path.match(/^\/api\/admin\/items\/(\d+)$/);
          if (adminItemMatch) {
            if (method === 'PUT') return await handleUpdateItem(request, env, adminItemMatch[1]);
            if (method === 'DELETE') return await handleDeleteItem(env, adminItemMatch[1]);
          }

          if (method === 'POST' && path === '/api/admin/images') {
            return await handleUploadImage(request, env);
          }
        }

        return json({ error: 'Endpoint tidak ditemui.' }, 404);
      }

      // Fallback to static assets
      if (env.ASSETS) {
        return await env.ASSETS.fetch(request);
      }
      return new Response('Not Found', { status: 404 });
    } catch (err) {
      return json({ error: err?.message || 'Ralat pelayan dalaman.' }, 500);
    }
  },
};
