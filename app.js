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

function extractNotionDatabaseIds(value) {
  const raw = String(value || "").trim();
  const matches = raw.match(/[a-fA-F0-9]{32}|[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}/g) || [];
  const normalized = matches.map((id) => normalizeNotionDatabaseId(id)).filter(Boolean);
  return Array.from(new Set(normalized));
}

const PORT = Number(process.env.PORT || 3000);
const NOTION_API_KEY = process.env.NOTION_API_KEY || "";
const NOTION_DATABASE_ID_RAW = process.env.NOTION_DATABASE_ID || "";
const NOTION_DATABASE_ID = normalizeNotionDatabaseId(NOTION_DATABASE_ID_RAW);
const NOTION_DATABASE_ID_CANDIDATES = extractNotionDatabaseIds(NOTION_DATABASE_ID_RAW);
const NOTION_VERSION = (process.env.NOTION_VERSION || "2025-09-03").trim();
const NOTION_TIMEOUT_MS = Number(process.env.NOTION_TIMEOUT_MS || 10000);
const PRODUCTS_CACHE_TTL_MS = Number(process.env.PRODUCTS_CACHE_TTL_MS || 60000);
const WHATSAPP_LOJA = String(process.env.WHATSAPP_LOJA || "55119997635107").replace(/\D/g, "");
const ENABLE_NOTION_DIAGNOSTICS = process.env.ENABLE_NOTION_DIAGNOSTICS === "true";

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

  if (productsCache.data && Date.now() < productsCache.expiresAt) {
    return productsCache.data;
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
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; connect-src 'self'; img-src 'self' https: data:; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
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
    rawPost(urlSearch, { filter: { property: "object", value: getSearchObjectFilterValue() }, page_size: 5 }),
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
