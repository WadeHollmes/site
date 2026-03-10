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
let WHATSAPP_LOJA = "55119997635107";

function normalizeWhatsapp(value) {
  return String(value || "").replace(/\D/g, "");
}

function showSkeletons(count = 6) {
  gallery.innerHTML = "";
  for (let i = 0; i < count; i++) {
    const card = document.createElement("article");
    card.className = "card skeleton";
    const imageDiv = document.createElement("div");
    imageDiv.className = "image-wrap";
    const body = document.createElement("div");
    body.className = "card-body";
    const line1 = document.createElement("div");
    line1.className = "skeleton-line";
    line1.style.cssText = "width:70%;height:16px;margin-bottom:8px";
    const line2 = document.createElement("div");
    line2.className = "skeleton-line";
    line2.style.cssText = "width:90%;height:12px;margin-bottom:8px";
    const line3 = document.createElement("div");
    line3.className = "skeleton-line";
    line3.style.cssText = "width:40%;height:14px";
    body.append(line1, line2, line3);
    card.append(imageDiv, body);
    gallery.appendChild(card);
  }
}

function showToast(message) {
  let toast = document.getElementById("toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "toast";
    toast.className = "toast";
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add("toast-visible");
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove("toast-visible"), 2200);
}

function renderGallery() {
  const fragment = document.createDocumentFragment();

  products.forEach((product, index) => {
    const node = template.content.cloneNode(true);
    const card = node.querySelector(".card");
    const selectBtn = node.querySelector(".select-btn");
    const image = node.querySelector(".image-wrap");

    card.dataset.productId = product.id;
    card.style.animationDelay = `${index * 55}ms`;

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
    statusNode.className = "data-status";
    gallery.parentElement.insertBefore(statusNode, gallery);
  }

  statusNode.textContent = message;
}

async function loadProducts() {
  try {
    const response = await fetch("/api/products");
    const payload = await response.json().catch(() => ({}));

    if (payload.whatsapp) {
      WHATSAPP_LOJA = normalizeWhatsapp(payload.whatsapp) || WHATSAPP_LOJA;
    }

    if (!response.ok) {
      products = [...fallbackProducts];
      renderStatus("Erro ao carregar API. Exibindo produtos locais de exemplo.");
      return;
    }

    if (!payload.configured) {
      products = [...fallbackProducts];
      renderStatus("Notion nao configurado ainda. Exibindo produtos locais de exemplo.");
      return;
    }

    if (Array.isArray(payload.products) && payload.products.length > 0) {
      products = payload.products;
      renderStatus("Nossos produtos");
      return;
    }

    products = [...fallbackProducts];
    renderStatus("Nossos produtos");
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
    showToast(`${product.name} removido`);
  } else {
    selected.set(product.id, { product, qty: 1 });
    cardElement.classList.add("is-selected");
    showToast(`${product.name} adicionado`);
  }

  updateSummary();
}

function changeQty(productId, delta) {
  const entry = selected.get(productId);
  if (!entry) return;
  const newQty = entry.qty + delta;
  if (newQty <= 0) {
    selected.delete(productId);
    const card = gallery.querySelector(`[data-product-id="${productId}"]`);
    if (card) card.classList.remove("is-selected");
  } else {
    selected.set(productId, { ...entry, qty: newQty });
  }
  updateSummary();
}

function updateSummary() {
  const items = Array.from(selected.values());
  const totalQty = items.reduce((sum, { qty }) => sum + qty, 0);
  const total = items.reduce((sum, { product, qty }) => sum + product.price * qty, 0);

  selectedCount.textContent = `${totalQty} ${totalQty === 1 ? "item selecionado" : "itens selecionados"}`;
  selectedTotal.textContent = brl.format(total);

  selectedList.innerHTML = "";
  items.forEach(({ product, qty }) => {
    const li = document.createElement("li");
    li.className = "cart-item";

    const nameSpan = document.createElement("span");
    nameSpan.className = "cart-item-name";
    nameSpan.textContent = product.name;

    const controls = document.createElement("div");
    controls.className = "cart-item-controls";

    const minusBtn = document.createElement("button");
    minusBtn.className = "qty-btn";
    minusBtn.textContent = "−";
    minusBtn.type = "button";
    minusBtn.addEventListener("click", () => changeQty(product.id, -1));

    const qtySpan = document.createElement("span");
    qtySpan.className = "qty-value";
    qtySpan.textContent = qty;

    const plusBtn = document.createElement("button");
    plusBtn.className = "qty-btn";
    plusBtn.textContent = "+";
    plusBtn.type = "button";
    plusBtn.addEventListener("click", () => changeQty(product.id, 1));

    const priceSpan = document.createElement("span");
    priceSpan.className = "cart-item-price";
    priceSpan.textContent = brl.format(product.price * qty);

    controls.append(minusBtn, qtySpan, plusBtn, priceSpan);
    li.append(nameSpan, controls);
    selectedList.appendChild(li);
  });

  sendButton.disabled = items.length === 0;
}

function buildMessage() {
  const items = Array.from(selected.values());
  const total = items.reduce((sum, { product, qty }) => sum + product.price * qty, 0);
  const lines = [];

  lines.push("Oi! Quero fazer um pedido:");
  lines.push("");

  if (items.length > 0) {
    lines.push("Itens:");
    items.forEach(({ product, qty }, index) => {
      const subtotal = product.price * qty;
      lines.push(
        qty > 1
          ? `${index + 1}. ${product.name} x${qty} — ${brl.format(subtotal)}`
          : `${index + 1}. ${product.name} — ${brl.format(subtotal)}`
      );
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
  const whatsappDestino = normalizeWhatsapp(WHATSAPP_LOJA);
  const url = `https://wa.me/${whatsappDestino}?text=${encodeURIComponent(message)}`;
  window.open(url, "_blank", "noopener,noreferrer");
});

async function init() {
  showSkeletons();
  await loadProducts();
  renderGallery();
  updateSummary();
}

init();
