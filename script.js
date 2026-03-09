const fallbackProducts = [
  {
    id: 1,
    name: "Caderno Grid",
    description: "Papel 90g, capa rígida, 120 folhas.",
    price: 49.9,
    image: "linear-gradient(140deg, #ebe9e4, #d8d3ca)",
  },
  {
    id: 2,
    name: "Caneta Metal",
    description: "Traço fino, acabamento fosco.",
    price: 24.5,
    image: "linear-gradient(140deg, #e2e8eb, #cad4da)",
  },
  {
    id: 3,
    name: "Planner Semanal",
    description: "Organização simples para a semana.",
    price: 39,
    image: "linear-gradient(140deg, #e8e4da, #d7ceb9)",
  },
  {
    id: 4,
    name: "Desk Mat",
    description: "Base macia para teclado e mouse.",
    price: 89,
    image: "linear-gradient(140deg, #dfe4df, #cbd4c9)",
  },
  {
    id: 5,
    name: "Suporte Notebook",
    description: "Alumínio leve com ajuste de altura.",
    price: 119,
    image: "linear-gradient(140deg, #ececec, #d8d8d8)",
  },
  {
    id: 6,
    name: "Mochila Daily",
    description: "Compartimento para notebook 15\".",
    price: 199,
    image: "linear-gradient(140deg, #e6dfdb, #d1c6bf)",
  },
];

const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const selected = new Map();

const gallery = document.getElementById("gallery");
const selectedCount = document.getElementById("selected-count");
const selectedTotal = document.getElementById("selected-total");
const selectedList = document.getElementById("selected-list");
const sendButton = document.getElementById("send-whatsapp");
const customerName = document.getElementById("customer-name");
const notes = document.getElementById("notes");
const template = document.getElementById("product-card-template");
let products = [];
let WHATSAPP_LOJA = "5511999999999";

function renderGallery() {
  const fragment = document.createDocumentFragment();

  products.forEach((product) => {
    const node = template.content.cloneNode(true);
    const card = node.querySelector(".card");
    const selectBtn = node.querySelector(".select-btn");
    const image = node.querySelector(".image-wrap");

    node.querySelector("h3").textContent = product.name;
    node.querySelector(".description").textContent = product.description;
    node.querySelector(".price").textContent = brl.format(product.price);

    if (product.image && /^https?:\/\//i.test(product.image)) {
      image.style.background = "#efefef";
      image.style.backgroundImage = `url(${product.image})`;
      image.style.backgroundSize = "cover";
      image.style.backgroundPosition = "center";
    } else {
      image.style.background = product.image || "linear-gradient(145deg, #ebeae8, #d9d8d4)";
      image.style.backgroundImage = "none";
    }

    selectBtn.addEventListener("click", () => {
      toggleProduct(product, card);
    });

    fragment.appendChild(node);
  });

  gallery.innerHTML = "";
  gallery.appendChild(fragment);
}

function renderStatus(message) {
  let statusNode = document.getElementById("data-status");

  if (!statusNode) {
    statusNode = document.createElement("p");
    statusNode.id = "data-status";
    statusNode.style.margin = "0 0 12px";
    statusNode.style.color = "#616161";
    statusNode.style.fontSize = "0.9rem";
    gallery.parentElement.insertBefore(statusNode, gallery);
  }

  statusNode.textContent = message;
}

async function loadProducts() {
  try {
    const response = await fetch("/api/products");

    if (!response.ok) {
      throw new Error(`Falha HTTP ${response.status}`);
    }

    const payload = await response.json();

    if (!payload.configured) {
      products = [...fallbackProducts];
      if (payload.whatsapp) {
        WHATSAPP_LOJA = payload.whatsapp;
      }
      renderStatus("Notion nao configurado ainda. Exibindo produtos locais de exemplo.");
      return;
    }

    if (Array.isArray(payload.products) && payload.products.length > 0) {
      products = payload.products;
      if (payload.whatsapp) {
        WHATSAPP_LOJA = payload.whatsapp;
      }
      renderStatus("Produtos carregados do Notion.");
      return;
    }

    products = [...fallbackProducts];
    renderStatus("Nenhum produto ativo encontrado no Notion. Exibindo fallback local.");
  } catch (error) {
    console.error("Erro ao carregar produtos:", error);
    products = [...fallbackProducts];
    renderStatus("Erro ao carregar API. Exibindo produtos locais de exemplo.");
  }
}

function toggleProduct(product, cardElement) {
  if (selected.has(product.id)) {
    selected.delete(product.id);
    cardElement.classList.remove("is-selected");
  } else {
    selected.set(product.id, product);
    cardElement.classList.add("is-selected");
  }

  updateSummary();
}

function updateSummary() {
  const items = Array.from(selected.values());
  const total = items.reduce((sum, item) => sum + item.price, 0);

  selectedCount.textContent = `${items.length} ${items.length === 1 ? "item selecionado" : "itens selecionados"}`;
  selectedTotal.textContent = brl.format(total);

  selectedList.innerHTML = "";
  items.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = `${item.name} - ${brl.format(item.price)}`;
    selectedList.appendChild(li);
  });

  sendButton.disabled = items.length === 0;
}

function buildMessage() {
  const items = Array.from(selected.values());
  const total = items.reduce((sum, item) => sum + item.price, 0);
  const lines = [];

  lines.push("Oi! Quero fazer um pedido:");
  lines.push("");

  if (items.length > 0) {
    lines.push("Itens:");
    items.forEach((item, index) => {
      lines.push(`${index + 1}. ${item.name} - ${brl.format(item.price)}`);
    });
    lines.push("");
  }

  lines.push(`Total: ${brl.format(total)}`);
  lines.push("");

  if (customerName.value.trim()) {
    lines.push(`Nome: ${customerName.value.trim()}`);
  }

  if (notes.value.trim()) {
    lines.push(`Obs: ${notes.value.trim()}`);
  }

  return lines.join("\n");
}

sendButton.addEventListener("click", () => {
  if (selected.size === 0) {
    alert("Selecione pelo menos um item antes de enviar.");
    return;
  }

  const message = buildMessage();
  const url = `https://wa.me/${WHATSAPP_LOJA}?text=${encodeURIComponent(message)}`;
  window.open(url, "_blank", "noopener,noreferrer");
});

async function init() {
  await loadProducts();
  renderGallery();
  updateSummary();
}

init();
