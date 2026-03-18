const fs = require("fs");
const path = require("path");
const express = require("express");
const dotenv = require("dotenv");
const Database = require("better-sqlite3");

dotenv.config();

const app = express();
app.use(express.json({ limit: "1mb" }));

function normalizeNotionDatabaseId(value) {
  const raw = String(value || "").trim();

  const uuidLike = raw.match(
    /[a-fA-F0-9]{8}-?[a-fA-F0-9]{4}-?[a-fA-F0-9]{4}-?[a-fA-F0-9]{4}-?[a-fA-F0-9]{12}/,
  );

  const compactId = uuidLike
    ? uuidLike[0].replace(/-/g, "")
    : (raw.match(/[a-fA-F0-9]{32}/) || [""])[0];

  if (!compactId || compactId.length !== 32) return raw;

  return `${compactId.slice(0, 8)}-${compactId.slice(8, 12)}-${compactId.slice(12, 16)}-${compactId.slice(16, 20)}-${compactId.slice(20)}`;
}

function extractNotionDatabaseIds(value) {
  const raw = String(value || "").trim();
  const matches =
    raw.match(
      /[a-fA-F0-9]{32}|[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}/g,
    ) || [];
  const normalized = matches.map((id) => normalizeNotionDatabaseId(id)).filter(Boolean);
  return Array.from(new Set(normalized));
}

function slugify(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

const PORT = Number(process.env.PORT || 3000);
const NOTION_API_KEY = process.env.NOTION_API_KEY || "";
const NOTION_DATABASE_ID_RAW = process.env.NOTION_DATABASE_ID || "";
const NOTION_DATABASE_ID = normalizeNotionDatabaseId(NOTION_DATABASE_ID_RAW);
const NOTION_DATABASE_ID_CANDIDATES = extractNotionDatabaseIds(NOTION_DATABASE_ID_RAW);
const NOTION_VERSION = (process.env.NOTION_VERSION || "2025-09-03").trim();
const NOTION_TIMEOUT_MS = Number(process.env.NOTION_TIMEOUT_MS || 10000);
const PRODUCTS_SYNC_INTERVAL_MS = Number(process.env.PRODUCTS_SYNC_INTERVAL_MS || 300000);
const WHATSAPP_LOJA = String(process.env.WHATSAPP_LOJA || "55119997635107").replace(/\D/g, "");
const ENABLE_NOTION_DIAGNOSTICS = process.env.ENABLE_NOTION_DIAGNOSTICS === "true";
const ADMIN_REVIEW_KEY = String(process.env.ADMIN_REVIEW_KEY || "");

const PRODUCT_MAPPING_HELP = {
  title: "Name/title",
  price: "Price/number",
  description: "Description/rich_text",
  image: "Image/files.url ou Image/url",
  active: "Active/checkbox",
};

let lastSyncAt = 0;

const dataDir = path.resolve(process.cwd(), "data");
fs.mkdirSync(dataDir, { recursive: true });
const db = new Database(path.join(dataDir, "store.db"));
db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  price REAL NOT NULL DEFAULT 0,
  image TEXT DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS product_images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id TEXT NOT NULL,
  url TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE(product_id, url)
);

CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id TEXT NOT NULL,
  author_name TEXT NOT NULL,
  rating INTEGER NOT NULL,
  comment TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  approved_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_products_slug ON products(slug);
CREATE INDEX IF NOT EXISTS idx_products_active ON products(active);
CREATE INDEX IF NOT EXISTS idx_reviews_status ON reviews(status);
CREATE INDEX IF NOT EXISTS idx_reviews_product ON reviews(product_id);
`);

const findSlugStmt = db.prepare("SELECT id FROM products WHERE slug = ?");
const existingProductStmt = db.prepare("SELECT slug FROM products WHERE id = ?");
const upsertProductStmt = db.prepare(`
  INSERT INTO products (id, slug, name, description, price, image, active, updated_at)
  VALUES (@id, @slug, @name, @description, @price, @image, @active, unixepoch())
  ON CONFLICT(id) DO UPDATE SET
    slug = excluded.slug,
    name = excluded.name,
    description = excluded.description,
    price = excluded.price,
    image = excluded.image,
    active = excluded.active,
    updated_at = unixepoch()
`);
const deleteImagesStmt = db.prepare("DELETE FROM product_images WHERE product_id = ?");
const insertImageStmt = db.prepare(
  "INSERT OR IGNORE INTO product_images (product_id, url, sort_order) VALUES (?, ?, ?)",
);
const listProductsStmt = db.prepare(`
SELECT
  p.id,
  p.slug,
  p.name,
  p.price,
  p.description,
  COALESCE((SELECT url FROM product_images pi WHERE pi.product_id = p.id ORDER BY pi.sort_order ASC LIMIT 1), p.image) AS image,
  COALESCE(ROUND(AVG(CASE WHEN r.status = 'approved' THEN r.rating END), 1), 0) AS rating,
  COALESCE(SUM(CASE WHEN r.status = 'approved' THEN 1 ELSE 0 END), 0) AS reviewCount
FROM products p
LEFT JOIN reviews r ON r.product_id = p.id
WHERE p.active = 1
GROUP BY p.id
ORDER BY p.name COLLATE NOCASE ASC
`);
const getProductBySlugStmt = db.prepare(`
SELECT
  p.id,
  p.slug,
  p.name,
  p.description,
  p.price,
  p.image,
  p.active,
  COALESCE(ROUND(AVG(CASE WHEN r.status = 'approved' THEN r.rating END), 1), 0) AS rating,
  COALESCE(SUM(CASE WHEN r.status = 'approved' THEN 1 ELSE 0 END), 0) AS reviewCount
FROM products p
LEFT JOIN reviews r ON r.product_id = p.id
WHERE p.slug = ?
GROUP BY p.id
LIMIT 1
`);
const listProductImagesStmt = db.prepare(
  "SELECT url FROM product_images WHERE product_id = ? ORDER BY sort_order ASC, id ASC",
);
const listApprovedReviewsStmt = db.prepare(`
SELECT id, author_name AS authorName, rating, comment, created_at AS createdAt
FROM reviews
WHERE product_id = ? AND status = 'approved'
ORDER BY created_at DESC
LIMIT 100
`);
const countProductsStmt = db.prepare("SELECT COUNT(*) AS total FROM products WHERE active = 1");
const insertReviewStmt = db.prepare(`
  INSERT INTO reviews (product_id, author_name, rating, comment, status, created_at)
  VALUES (?, ?, ?, ?, 'pending', unixepoch())
`);
const listPendingReviewsStmt = db.prepare(`
SELECT r.id, r.product_id AS productId, p.name AS productName, r.author_name AS authorName, r.rating, r.comment, r.status, r.created_at AS createdAt
FROM reviews r
LEFT JOIN products p ON p.id = r.product_id
WHERE r.status = ?
ORDER BY r.created_at ASC
`);
const updateReviewStatusStmt = db.prepare(
  "UPDATE reviews SET status = ?, approved_at = CASE WHEN ? = 'approved' THEN unixepoch() ELSE approved_at END WHERE id = ?",
);

function buildUniqueSlug(baseSlug, productId) {
  const fallbackBase = baseSlug || slugify(productId) || "produto";
  let candidate = fallbackBase;
  let index = 2;

  while (true) {
    const row = findSlugStmt.get(candidate);
    if (!row || row.id === productId) return candidate;
    candidate = `${fallbackBase}-${index}`;
    index += 1;
  }
}

function getQueryEndpointCandidates() {
  if (NOTION_VERSION >= "2025-09-03") {
    return ["data_sources", "data-sources", "databases"];
  }

  return ["databases"];
}

function getSearchObjectFilterValue() {
  return NOTION_VERSION >= "2025-09-03" ? "data_source" : "database";
}

function parseTitle(prop) {
  if (!prop || prop.type !== "title" || !Array.isArray(prop.title)) return "";
  return prop.title.map((t) => t.plain_text).join("").trim();
}

function parseRichText(prop) {
  if (!prop || prop.type !== "rich_text" || !Array.isArray(prop.rich_text)) return "";
  return prop.rich_text.map((t) => t.plain_text).join("").trim();
}

function parseNumber(prop) {
  if (!prop || prop.type !== "number" || typeof prop.number !== "number") return 0;
  return prop.number;
}

function parseCheckbox(prop) {
  if (!prop || prop.type !== "checkbox") return true;
  return Boolean(prop.checkbox);
}

function parseImage(prop) {
  if (!prop) return "";

  if (prop.type === "files" && Array.isArray(prop.files) && prop.files.length > 0) {
    const firstFile = prop.files[0];
    if (firstFile.type === "file" && firstFile.file?.url) return firstFile.file.url;
    if (firstFile.type === "external" && firstFile.external?.url) return firstFile.external.url;
  }

  if (prop.type === "url" && typeof prop.url === "string") return prop.url;

  return "";
}

function parseImages(prop) {
  if (!prop) return [];

  if (prop.type === "files" && Array.isArray(prop.files)) {
    return prop.files
      .map((item) => {
        if (item.type === "file") return item.file?.url || "";
        if (item.type === "external") return item.external?.url || "";
        return "";
      })
      .filter(Boolean);
  }

  if (prop.type === "url" && typeof prop.url === "string") {
    return [prop.url];
  }

  return [];
}

function mapNotionProduct(page) {
  const props = page.properties || {};
  const name = parseTitle(props.Name || props.name || props.Title || props.title);
  const price = parseNumber(props.Price || props.price || props.Valor || props.valor);
  const description = parseRichText(
    props.Description || props.description || props.Descricao || props.descricao,
  );
  const image = parseImage(props.Image || props.image || props.Foto || props.foto);
  const images = parseImages(props.Image || props.image || props.Foto || props.foto);
  const active = parseCheckbox(props.Active || props.active || props.Ativo || props.ativo);

  return {
    id: page.id,
    name,
    description,
    price,
    image,
    images,
    active,
  };
}

async function queryNotion(url, notionVersion, bodyPayload = { page_size: 100 }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), NOTION_TIMEOUT_MS);

  let response;

  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${NOTION_API_KEY}`,
        "Notion-Version": notionVersion,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(bodyPayload),
      signal: controller.signal,
    });
  } catch (fetchError) {
    clearTimeout(timeout);
    return {
      ok: false,
      status: 0,
      details: `Falha de rede: ${fetchError.message}`,
    };
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const details = await response.text();
    return {
      ok: false,
      status: response.status,
      details,
    };
  }

  const payload = await response.json();
  return { ok: true, payload };
}

async function searchAccessibleDatabases() {
  const url = "https://api.notion.com/v1/search";
  const response = await queryNotion(url, NOTION_VERSION, {
    filter: { property: "object", value: getSearchObjectFilterValue() },
    page_size: 20,
  });

  if (!response.ok) {
    return [];
  }

  return (response.payload.results || []).map((item) => {
    const title = (item.title || []).map((t) => t.plain_text || "").join("").trim();
    return {
      id: item.id,
      title: title || "(sem titulo)",
    };
  });
}

async function fetchNotionProducts() {
  if (!NOTION_API_KEY || !NOTION_DATABASE_ID) {
    return {
      configured: false,
      products: [],
      whatsapp: WHATSAPP_LOJA,
      note: "Defina NOTION_API_KEY e NOTION_DATABASE_ID para habilitar a integracao.",
    };
  }

  const candidateIds = NOTION_DATABASE_ID_CANDIDATES.length
    ? NOTION_DATABASE_ID_CANDIDATES
    : [NOTION_DATABASE_ID];

  const endpointCandidates = getQueryEndpointCandidates();

  let payload = null;
  let lastError = {
    status: 0,
    details: "Falha desconhecida ao consultar Notion.",
    url: "",
    version: NOTION_VERSION,
  };

  for (const endpointBase of endpointCandidates) {
    for (const candidateId of candidateIds) {
      const queryUrl = `https://api.notion.com/v1/${endpointBase}/${candidateId}/query`;

      const attempt = await queryNotion(queryUrl, NOTION_VERSION);
      if (attempt.ok) {
        payload = attempt.payload;
        break;
      }

      lastError = {
        status: attempt.status,
        details: attempt.details,
        url: queryUrl,
        version: NOTION_VERSION,
      };
    }

    if (payload) break;
  }

  if (!payload) {
    const databases = await searchAccessibleDatabases();
    const accessibleHint = databases.length
      ? ` Databases acessiveis para este token: ${databases
          .map((d) => `${d.title} (${d.id})`)
          .join(" | ")}.`
      : " Nenhuma database acessivel foi encontrada via /v1/search para este token.";

    console.error("Erro Notion API:", lastError);
    throw new Error(
      `Erro Notion ${lastError.status} (${lastError.version}) em ${lastError.url}: ${lastError.details}.${accessibleHint}`,
    );
  }

  const products = (payload.results || [])
    .map(mapNotionProduct)
    .filter((p) => p.active && p.name && p.price > 0);

  return {
    configured: true,
    mappingHint: PRODUCT_MAPPING_HELP,
    products,
    whatsapp: WHATSAPP_LOJA,
  };
}

function syncProductsToDb(products) {
  const tx = db.transaction((items) => {
    for (const product of items) {
      const baseSlug = slugify(product.name || product.id);
      const existing = existingProductStmt.get(product.id);
      const slug = existing?.slug || buildUniqueSlug(baseSlug, product.id);

      upsertProductStmt.run({
        id: product.id,
        slug,
        name: product.name,
        description: product.description || "",
        price: product.price,
        image: product.image || "",
        active: product.active ? 1 : 0,
      });

      const imageSet = new Set([...(product.images || []), product.image || ""].filter(Boolean));
      deleteImagesStmt.run(product.id);
      Array.from(imageSet).forEach((url, idx) => {
        insertImageStmt.run(product.id, url, idx);
      });
    }
  });

  tx(products);
}

function readProductsFromDb() {
  return listProductsStmt.all().map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    price: row.price,
    image: row.image,
    rating: Number(row.rating || 0),
    reviewCount: Number(row.reviewCount || 0),
  }));
}

function readProductDetailsFromDb(slug) {
  const row = getProductBySlugStmt.get(slug);
  if (!row || !row.active) return null;

  const images = listProductImagesStmt.all(row.id).map((i) => i.url);
  const reviews = listApprovedReviewsStmt.all(row.id).map((review) => ({
    ...review,
    createdAt: new Date(Number(review.createdAt) * 1000).toISOString(),
  }));

  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    price: row.price,
    image: row.image,
    images: images.length ? images : [row.image].filter(Boolean),
    rating: Number(row.rating || 0),
    reviewCount: Number(row.reviewCount || 0),
    reviews,
  };
}

async function syncFromNotionIfNeeded(force = false) {
  if (!NOTION_API_KEY || !NOTION_DATABASE_ID) return false;

  if (!force && Date.now() - lastSyncAt < PRODUCTS_SYNC_INTERVAL_MS) {
    return false;
  }

  const fetched = await fetchNotionProducts();
  syncProductsToDb(fetched.products || []);
  lastSyncAt = Date.now();
  return true;
}

function ensureAdmin(req, res, next) {
  if (!ADMIN_REVIEW_KEY) {
    return res.status(503).json({
      error: "ADMIN_REVIEW_KEY nao configurada no servidor.",
    });
  }

  const key = req.header("x-admin-key");
  if (!key || key !== ADMIN_REVIEW_KEY) {
    return res.status(401).json({ error: "Nao autorizado." });
  }

  return next();
}

app.disable("x-powered-by");
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; connect-src 'self'; img-src 'self' https: data:; script-src 'self' https://unpkg.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
  );

  if (req.secure || req.headers["x-forwarded-proto"] === "https") {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  }

  next();
});

app.use("/api", (_, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});

app.get("/api/products", async (_, res) => {
  try {
    await syncFromNotionIfNeeded(false);

    let products = readProductsFromDb();

    if (!products.length && NOTION_API_KEY && NOTION_DATABASE_ID) {
      await syncFromNotionIfNeeded(true);
      products = readProductsFromDb();
    }

    res.status(200).json({
      configured: !!NOTION_API_KEY && !!NOTION_DATABASE_ID,
      source: products.length ? "sqlite" : "fallback",
      products,
      whatsapp: WHATSAPP_LOJA,
    });
  } catch (error) {
    console.error("Erro completo da API:", error);
    res.status(500).json({
      configured: true,
      products: [],
      whatsapp: WHATSAPP_LOJA,
      error: "Falha ao consultar o catalogo.",
      details: String(error.message || error),
    });
  }
});

app.get("/api/products/:slug", async (req, res) => {
  try {
    await syncFromNotionIfNeeded(false);
    const product = readProductDetailsFromDb(req.params.slug);

    if (!product) {
      return res.status(404).json({ error: "Produto nao encontrado." });
    }

    return res.status(200).json({ product, whatsapp: WHATSAPP_LOJA });
  } catch (error) {
    return res.status(500).json({ error: "Falha ao carregar detalhes do produto." });
  }
});

app.post("/api/reviews", (req, res) => {
  const productId = String(req.body?.productId || "").trim();
  const authorName = String(req.body?.authorName || "").trim().slice(0, 80);
  const rating = Number(req.body?.rating || 0);
  const comment = String(req.body?.comment || "").trim().slice(0, 400);

  if (!productId || !authorName || !comment || !Number.isInteger(rating) || rating < 1 || rating > 5) {
    return res.status(400).json({ error: "Dados invalidos para avaliacao." });
  }

  const product = db.prepare("SELECT id FROM products WHERE id = ? AND active = 1").get(productId);
  if (!product) {
    return res.status(404).json({ error: "Produto nao encontrado para avaliacao." });
  }

  insertReviewStmt.run(productId, authorName, rating, comment);
  return res.status(201).json({ ok: true, message: "Avaliacao recebida e aguardando aprovacao." });
});

app.get("/api/admin/reviews", ensureAdmin, (req, res) => {
  const status = String(req.query.status || "pending").toLowerCase();
  const allowed = new Set(["pending", "approved", "rejected"]);
  const finalStatus = allowed.has(status) ? status : "pending";
  const reviews = listPendingReviewsStmt.all(finalStatus);
  return res.status(200).json({ status: finalStatus, reviews });
});

app.patch("/api/admin/reviews/:id", ensureAdmin, (req, res) => {
  const id = Number(req.params.id);
  const status = String(req.body?.status || "").toLowerCase();

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "ID invalido." });
  }

  if (!["approved", "rejected"].includes(status)) {
    return res.status(400).json({ error: "Status invalido. Use approved ou rejected." });
  }

  const result = updateReviewStatusStmt.run(status, status, id);
  if (!result.changes) {
    return res.status(404).json({ error: "Avaliacao nao encontrada." });
  }

  return res.status(200).json({ ok: true, id, status });
});

app.post("/api/admin/sync", ensureAdmin, async (_, res) => {
  try {
    await syncFromNotionIfNeeded(true);
    return res.status(200).json({ ok: true, syncedAt: new Date().toISOString() });
  } catch (error) {
    return res.status(500).json({ error: "Falha ao sincronizar com Notion.", details: String(error.message || error) });
  }
});

app.get("/api/test-notion", async (_, res) => {
  if (!ENABLE_NOTION_DIAGNOSTICS) {
    return res.status(404).json({
      error: "Endpoint de diagnostico desabilitado.",
      hint: "Defina ENABLE_NOTION_DIAGNOSTICS=true para habilitar.",
    });
  }

  const urlUsersMe = "https://api.notion.com/v1/users/me";
  const urlSearch = "https://api.notion.com/v1/search";
  const endpointCandidates = getQueryEndpointCandidates();

  async function rawGet(url) {
    try {
      const r = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${NOTION_API_KEY}`,
          "Notion-Version": NOTION_VERSION,
        },
      });
      const body = await r.text();
      return { status: r.status, body };
    } catch (e) {
      return { status: 0, body: String(e.message) };
    }
  }

  async function rawPost(url, payload) {
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${NOTION_API_KEY}`,
          "Notion-Version": NOTION_VERSION,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const body = await r.text();
      return { status: r.status, body };
    } catch (e) {
      return { status: 0, body: String(e.message) };
    }
  }

  const [usersMe, search] = await Promise.all([
    rawGet(urlUsersMe),
    rawPost(urlSearch, {
      filter: { property: "object", value: getSearchObjectFilterValue() },
      page_size: 5,
    }),
  ]);

  const queryAttempts = [];
  let query = null;

  for (const endpointBase of endpointCandidates) {
    const urlQuery = `https://api.notion.com/v1/${endpointBase}/${NOTION_DATABASE_ID}/query`;
    const attempt = await rawPost(urlQuery, { page_size: 1 });
    const report = { endpointBase, url: urlQuery, ...attempt };
    queryAttempts.push(report);

    if (attempt.status >= 200 && attempt.status < 300) {
      query = report;
      break;
    }
  }

  if (!query && queryAttempts.length > 0) {
    query = queryAttempts[queryAttempts.length - 1];
  }

  res.status(200).json({
    notionVersion: NOTION_VERSION,
    databaseId: NOTION_DATABASE_ID,
    endpointCandidates,
    usersMe: { url: urlUsersMe, ...usersMe },
    search: { url: urlSearch, ...search },
    query,
    queryAttempts,
  });
});

app.get("/api/debug", async (_, res) => {
  const hasApiKey = !!NOTION_API_KEY && NOTION_API_KEY !== "";
  const hasDatabaseId = !!NOTION_DATABASE_ID && NOTION_DATABASE_ID !== "";
  const productCount = countProductsStmt.get()?.total || 0;

  const maskEnd = (str, keep = 4) =>
    str.length <= keep ? "*".repeat(str.length) : "*".repeat(str.length - keep) + str.slice(-keep);

  res.status(200).json({
    hasApiKey,
    apiKeyLength: NOTION_API_KEY ? NOTION_API_KEY.length : 0,
    hasDatabaseId,
    databaseIdLength: NOTION_DATABASE_ID ? NOTION_DATABASE_ID.length : 0,
    databaseIdNormalized: hasDatabaseId ? maskEnd(NOTION_DATABASE_ID.replace(/-/g, ""), 6) : "",
    notionVersion: NOTION_VERSION,
    whatsappConfigured: !!WHATSAPP_LOJA,
    whatsappMasked: WHATSAPP_LOJA ? maskEnd(WHATSAPP_LOJA, 4) : "",
    whatsappLength: WHATSAPP_LOJA.length,
    sqlitePath: path.join(dataDir, "store.db"),
    sqliteProducts: Number(productCount),
    lastSyncAt: lastSyncAt ? new Date(lastSyncAt).toISOString() : null,
    adminReviewConfigured: !!ADMIN_REVIEW_KEY,
  });
});

app.use(
  express.static(process.cwd(), {
    setHeaders: (res, filePath) => {
      if (/\.(css|js)$/i.test(filePath)) {
        res.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
        return;
      }

      if (/\.(woff2?|png|jpe?g|svg|webp|ico)$/i.test(filePath)) {
        res.setHeader("Cache-Control", "public, max-age=604800, immutable");
      }
    },
  }),
);

app.get("*", (req, res) => {
  const filePath = path.resolve(process.cwd(), `.${req.path}`);
  res.sendFile(filePath, (err) => {
    if (err) {
      res.sendFile(path.resolve(process.cwd(), "index.html"));
    }
  });
});

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
