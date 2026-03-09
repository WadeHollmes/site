const path = require("path");
const express = require("express");
const dotenv = require("dotenv");

dotenv.config();

const app = express();

const PORT = Number(process.env.PORT || 3000);
const NOTION_API_KEY = process.env.NOTION_API_KEY || "";
const NOTION_DATABASE_ID = (process.env.NOTION_DATABASE_ID || "").replace(/-/g, "");
const NOTION_VERSION = process.env.NOTION_VERSION || "2022-06-28";
const NOTION_TIMEOUT_MS = Number(process.env.NOTION_TIMEOUT_MS || 8000);
const PRODUCTS_CACHE_TTL_MS = Number(process.env.PRODUCTS_CACHE_TTL_MS || 60000);

let productsCache = {
  expiresAt: 0,
  data: null,
};

const PRODUCT_MAPPING_HELP = {
  title: "Name/title",
  price: "Price/number",
  description: "Description/rich_text",
  image: "Image/files.url ou Image/url",
  active: "Active/checkbox",
};

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

function mapNotionProduct(page) {
  const props = page.properties || {};
  const name = parseTitle(props.Name || props.name || props.Title || props.title);
  const price = parseNumber(props.Price || props.price || props.Valor || props.valor);
  const description = parseRichText(
    props.Description || props.description || props.Descricao || props.descricao,
  );
  const image = parseImage(props.Image || props.image || props.Foto || props.foto);
  const active = parseCheckbox(props.Active || props.active || props.Ativo || props.ativo);

  return {
    id: page.id,
    name,
    description,
    price,
    image,
    active,
  };
}

async function fetchNotionProducts() {
  if (!NOTION_API_KEY || !NOTION_DATABASE_ID) {
    return {
      configured: false,
      products: [],
      note: "Defina NOTION_API_KEY e NOTION_DATABASE_ID para habilitar a integracao.",
    };
  }

  if (productsCache.data && Date.now() < productsCache.expiresAt) {
    return productsCache.data;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), NOTION_TIMEOUT_MS);

  let response;

  try {
    response = await fetch(`https://api.notion.com/v1/databases/${NOTION_DATABASE_ID}/query`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${NOTION_API_KEY}`,
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ page_size: 100 }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Erro Notion ${response.status}: ${details}`);
  }

  const payload = await response.json();
  const products = (payload.results || [])
    .map(mapNotionProduct)
    .filter((p) => p.active && p.name && p.price > 0);

  const result = {
    configured: true,
    mappingHint: PRODUCT_MAPPING_HELP,
    products,
  };

  productsCache = {
    data: result,
    expiresAt: Date.now() + PRODUCTS_CACHE_TTL_MS,
  };

  return result;
}

app.disable("x-powered-by");
app.use((_, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  next();
});

app.get("/api/products", async (_, res) => {
  try {
    const data = await fetchNotionProducts();
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({
      configured: true,
      products: [],
      error: "Falha ao consultar o Notion.",
      details: String(error.message || error),
    });
  }
});

app.use(express.static(process.cwd()));

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
