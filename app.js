const path = require("path");
const express = require("express");
const dotenv = require("dotenv");

dotenv.config();

const app = express();

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

const PORT = Number(process.env.PORT || 3000);
const NOTION_API_KEY = process.env.NOTION_API_KEY || "";
const NOTION_DATABASE_ID = normalizeNotionDatabaseId(process.env.NOTION_DATABASE_ID || "");
const NOTION_VERSION = (process.env.NOTION_VERSION || "2025-09-03").trim();
const NOTION_TIMEOUT_MS = Number(process.env.NOTION_TIMEOUT_MS || 10000);
const PRODUCTS_CACHE_TTL_MS = Number(process.env.PRODUCTS_CACHE_TTL_MS || 60000);
const WHATSAPP_LOJA = String(process.env.WHATSAPP_LOJA || "55119997635107").replace(/\D/g, "");

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

function shouldTryDataSourceFallback(status, details) {
  const text = String(details || "");
  const invalidUrl = status === 400 && /invalid_request_url/i.test(text);
  const objectNotFound = status === 404 && /object_not_found/i.test(text);
  return invalidUrl || objectNotFound;
}

async function queryNotion(url, notionVersion) {
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
      body: JSON.stringify({ page_size: 100 }),
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

async function fetchNotionProducts() {
  if (!NOTION_API_KEY || !NOTION_DATABASE_ID) {
    return {
      configured: false,
      products: [],
      whatsapp: WHATSAPP_LOJA,
      note: "Defina NOTION_API_KEY e NOTION_DATABASE_ID para habilitar a integracao.",
    };
  }

  if (productsCache.data && Date.now() < productsCache.expiresAt) {
    return productsCache.data;
  }

  const databaseUrl = `https://api.notion.com/v1/databases/${NOTION_DATABASE_ID}/query`;
  const dataSourceUrl = `https://api.notion.com/v1/data-sources/${NOTION_DATABASE_ID}/query`;
  const versionsToTry = [NOTION_VERSION];

  let payload = null;
  let lastError = {
    status: 0,
    details: "Falha desconhecida ao consultar Notion.",
    url: databaseUrl,
    version: NOTION_VERSION,
  };

  for (const version of versionsToTry) {
    console.log("Tentando Notion API (database):", {
      url: databaseUrl,
      databaseIdLength: NOTION_DATABASE_ID.length,
      version,
    });

    const databaseAttempt = await queryNotion(databaseUrl, version);
    if (databaseAttempt.ok) {
      payload = databaseAttempt.payload;
      break;
    }

    lastError = {
      status: databaseAttempt.status,
      details: databaseAttempt.details,
      url: databaseUrl,
      version,
    };

    if (shouldTryDataSourceFallback(databaseAttempt.status, databaseAttempt.details)) {
      console.log("Tentando Notion API (data-source fallback):", {
        url: dataSourceUrl,
        databaseIdLength: NOTION_DATABASE_ID.length,
        version,
      });

      const dataSourceAttempt = await queryNotion(dataSourceUrl, version);
      if (dataSourceAttempt.ok) {
        payload = dataSourceAttempt.payload;
        break;
      }

      lastError = {
        status: dataSourceAttempt.status,
        details: dataSourceAttempt.details,
        url: dataSourceUrl,
        version,
      };
    }
  }

  if (!payload) {
    console.error("Erro Notion API:", lastError);
    throw new Error(
      `Erro Notion ${lastError.status} (${lastError.version}) em ${lastError.url}: ${lastError.details}`,
    );
  }

  const products = (payload.results || [])
    .map(mapNotionProduct)
    .filter((p) => p.active && p.name && p.price > 0);

  const result = {
    configured: true,
    mappingHint: PRODUCT_MAPPING_HELP,
    products,
    whatsapp: WHATSAPP_LOJA,
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
    console.error("Erro completo da API:", error);
    res.status(500).json({
      configured: true,
      products: [],
      whatsapp: WHATSAPP_LOJA,
      error: "Falha ao consultar o Notion.",
      details: String(error.message || error),
    });
  }
});

app.get("/api/debug", async (_, res) => {
  const hasApiKey = !!NOTION_API_KEY && NOTION_API_KEY !== "";
  const hasDatabaseId = !!NOTION_DATABASE_ID && NOTION_DATABASE_ID !== "";
  
  // Log para diagnosticar o problema
  console.log("DEBUG - Environment variables:", {
    WHATSAPP_LOJA: WHATSAPP_LOJA,
    WHATSAPP_LOJA_LENGTH: WHATSAPP_LOJA.length,
    NOTION_API_KEY_LENGTH: NOTION_API_KEY.length,
    NOTION_DATABASE_ID_LENGTH: NOTION_DATABASE_ID.length,
  });
  
  res.status(200).json({
    hasApiKey,
    apiKeyLength: NOTION_API_KEY ? NOTION_API_KEY.length : 0,
    hasDatabaseId,
    databaseIdLength: NOTION_DATABASE_ID ? NOTION_DATABASE_ID.length : 0,
    databaseIdNormalized: NOTION_DATABASE_ID,
    notionVersion: NOTION_VERSION,
    whatsappConfigured: !!WHATSAPP_LOJA,
    whatsappNumber: WHATSAPP_LOJA,
    whatsappLength: WHATSAPP_LOJA.length,
  });
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
