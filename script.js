/* global React, ReactDOM */

const fallbackProducts = [
  {
    id: "f-1",
    slug: "agenda-a5",
    name: "Agenda A5",
    description: "Agenda católica com opções de capa e folhas para planejamento diário.",
    price: 70,
    image: "linear-gradient(140deg, #f2b5ca, #e89ab6)",
    images: ["linear-gradient(140deg, #f2b5ca, #e89ab6)", "linear-gradient(140deg, #f3cad8, #ecb2c7)"],
    rating: 4.8,
    reviewCount: 12,
    reviews: [],
  },
  {
    id: "f-2",
    slug: "caderno-a5",
    name: "Caderno A5",
    description: "Caderno tamanho A5 com capa personalizada e miolo premium.",
    price: 40,
    image: "linear-gradient(140deg, #efadc4, #e392af)",
    images: ["linear-gradient(140deg, #efadc4, #e392af)", "linear-gradient(140deg, #f7d2df, #efafc5)"],
    rating: 4.6,
    reviewCount: 8,
    reviews: [],
  },
];

const e = React.createElement;
const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function normalizeWhatsapp(value) {
  return String(value || "").replace(/\D/g, "");
}

function normalizeProduct(raw) {
  const images = Array.isArray(raw.images)
    ? raw.images.filter(Boolean)
    : [raw.image].filter(Boolean);

  return {
    ...raw,
    images,
    image: raw.image || images[0] || "",
    reviews: Array.isArray(raw.reviews) ? raw.reviews : [],
    rating: Number(raw.rating || 0),
    reviewCount: Number(raw.reviewCount || 0),
    price: Number(raw.price || 0),
  };
}

function ProductCard({ product, selectedQty, onOpen, index }) {
  const hasRemoteImage = /^https?:\/\//i.test(product.image || "");
  const imagesCount = product.images?.length || 0;

  return e(
    "article",
    {
      className: `card card-clickable${selectedQty > 0 ? " is-selected" : ""}`,
      tabIndex: 0,
      role: "button",
      onClick: () => onOpen(product),
      onKeyDown: (ev) => {
        if (ev.key === "Enter" || ev.key === " ") {
          ev.preventDefault();
          onOpen(product);
        }
      },
      "aria-label": `Abrir detalhes de ${product.name}`,
    },
    selectedQty > 0
      ? e("span", { className: "selected-chip" }, `${selectedQty} no carrinho`)
      : null,
    e(
      "div",
      {
        className: "image-wrap img-loaded",
        style: hasRemoteImage ? undefined : { background: product.image || "linear-gradient(145deg, #f5aabf, #e88aa5)" },
      },
      hasRemoteImage ? e("img", { src: product.image, alt: product.name, loading: "lazy" }) : null,
    ),
    e(
      "div",
      { className: "card-body" },
      e("h3", null, product.name),
      imagesCount > 1 ? e("span", { className: "media-count" }, `${imagesCount} fotos`) : null,
      e("span", { className: "price" }, brl.format(product.price)),
    ),
  );
}

function ProductModal({
  product,
  activeImage,
  onImageSelect,
  onClose,
  onAdd,
  cartQty,
  reviewForm,
  onReviewForm,
  onReviewSubmit,
  reviewSending,
}) {
  if (!product) return null;

  const images = product.images?.length ? product.images : ["linear-gradient(140deg, #f2b5ca, #e89ab6)"];
  const mainImage = activeImage || images[0];
  const hasMainRemote = /^https?:\/\//i.test(mainImage || "");

  return e(
    "div",
    { className: "product-modal is-open", role: "dialog", "aria-modal": "true", "aria-hidden": "false" },
    e("div", { className: "product-modal__backdrop", onClick: onClose }),
    e(
      "article",
      { className: "product-modal__content" },
      e(
        "button",
        { className: "product-modal__close", type: "button", onClick: onClose, "aria-label": "Fechar detalhes" },
        "×",
      ),
      e(
        "div",
        { className: "product-modal__grid" },
        e(
          "section",
          { className: "product-gallery" },
          e(
            "div",
            {
              className: "product-gallery__main",
              style: hasMainRemote ? undefined : { background: mainImage },
            },
            hasMainRemote ? e("img", { src: mainImage, alt: product.name, loading: "lazy" }) : null,
          ),
          e(
            "div",
            { className: "product-gallery__thumbs" },
            images.map((src, idx) => {
              const isRemote = /^https?:\/\//i.test(src || "");
              const active = src === mainImage;
              return e(
                "button",
                {
                  key: `${product.id}-thumb-${idx}`,
                  className: `thumb-btn${active ? " is-active" : ""}`,
                  type: "button",
                  onClick: () => onImageSelect(src),
                  style: isRemote ? undefined : { background: src },
                },
                isRemote ? e("img", { src, alt: "Miniatura", loading: "lazy" }) : null,
              );
            }),
          ),
        ),
        e(
          "section",
          { className: "product-info" },
          e("h3", null, product.name),
          e("p", { className: "product-price" }, brl.format(product.price || 0)),
          e(
            "p",
            { className: "product-rating" },
            product.reviewCount > 0
              ? `Nota ${Number(product.rating || 0).toFixed(1)} (${product.reviewCount} avaliações)`
              : "Sem avaliações ainda",
          ),
          e("p", { className: "product-description" }, product.description || "Sem descrição."),
          e(
            "div",
            { className: "product-actions" },
            e(
              "button",
              {
                className: `whatsapp-btn${cartQty > 0 ? " is-in-cart" : ""}`,
                type: "button",
                onClick: () => onAdd(product),
              },
              cartQty > 0 ? `No carrinho (${cartQty}) · adicionar mais` : "Adicionar ao carrinho",
            ),
          ),
          e(
            "div",
            { className: "product-reviews" },
            e("h4", null, "Avaliações"),
            e(
              "ul",
              { className: "reviews-list" },
              product.reviews?.length
                ? product.reviews.map((review, idx) => {
                    const safeRating = Math.max(1, Math.min(5, Number(review.rating) || 0));
                    const stars = "★".repeat(safeRating) + "☆".repeat(5 - safeRating);
                    return e(
                      "li",
                      { className: "review-item", key: `${product.id}-review-${idx}` },
                      e("strong", null, review.authorName || "Cliente"),
                      e("span", null, ` ${stars}`),
                      e("p", null, review.comment || ""),
                    );
                  })
                : e("li", { className: "review-empty" }, "Ainda não há avaliações aprovadas."),
            ),
            e(
              "form",
              { className: "review-form", onSubmit: onReviewSubmit },
              e("label", { htmlFor: "review-name" }, "Seu nome"),
              e("input", {
                id: "review-name",
                type: "text",
                maxLength: 80,
                value: reviewForm.name,
                onChange: (ev) => onReviewForm("name", ev.target.value),
                required: true,
              }),
              e("label", { htmlFor: "review-rating" }, "Nota (1 a 5)"),
              e(
                "select",
                {
                  id: "review-rating",
                  value: reviewForm.rating,
                  onChange: (ev) => onReviewForm("rating", ev.target.value),
                  required: true,
                },
                e("option", { value: "5" }, "5"),
                e("option", { value: "4" }, "4"),
                e("option", { value: "3" }, "3"),
                e("option", { value: "2" }, "2"),
                e("option", { value: "1" }, "1"),
              ),
              e("label", { htmlFor: "review-comment" }, "Comentário"),
              e("textarea", {
                id: "review-comment",
                rows: 3,
                maxLength: 400,
                value: reviewForm.comment,
                onChange: (ev) => onReviewForm("comment", ev.target.value),
                required: true,
              }),
              e(
                "button",
                { className: "review-submit", type: "submit", disabled: reviewSending },
                reviewSending ? "Enviando..." : "Enviar avaliação",
              ),
            ),
          ),
        ),
      ),
    ),
  );
}

function App() {
  const [products, setProducts] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [statusText, setStatusText] = React.useState("Carregando catálogo...");
  const [toast, setToast] = React.useState("");
  const [cart, setCart] = React.useState({});
  const [customerName, setCustomerName] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [whatsapp, setWhatsapp] = React.useState("55119997635107");
  const [modalProduct, setModalProduct] = React.useState(null);
  const [activeImage, setActiveImage] = React.useState("");
  const [reviewSending, setReviewSending] = React.useState(false);
  const [reviewForm, setReviewForm] = React.useState({ name: "", rating: "5", comment: "" });
  const [sendingOrder, setSendingOrder] = React.useState(false);

  React.useEffect(() => {
    let alive = true;

    async function loadProducts() {
      setLoading(true);
      setStatusText("Carregando catálogo...");

      try {
        const response = await fetch("/api/products");
        const payload = await response.json().catch(() => ({}));

        if (!alive) return;

        if (payload.whatsapp) {
          setWhatsapp(normalizeWhatsapp(payload.whatsapp) || "55119997635107");
        }

        if (!response.ok || !Array.isArray(payload.products) || payload.products.length === 0) {
          setProducts(fallbackProducts.map(normalizeProduct));
          setStatusText("Usando catálogo local de exemplo.");
          return;
        }

        setProducts(payload.products.map(normalizeProduct));
        setStatusText("Nossos produtos");
      } catch (_) {
        if (!alive) return;
        setProducts(fallbackProducts.map(normalizeProduct));
        setStatusText("Erro ao carregar API. Exibindo produtos locais de exemplo.");
      } finally {
        if (alive) setLoading(false);
      }
    }

    loadProducts();
    return () => {
      alive = false;
    };
  }, []);

  React.useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(""), 2200);
    return () => clearTimeout(timer);
  }, [toast]);

  const selectedItems = React.useMemo(() => Object.values(cart), [cart]);
  const totalQty = React.useMemo(
    () => selectedItems.reduce((sum, item) => sum + item.qty, 0),
    [selectedItems],
  );
  const totalValue = React.useMemo(
    () => selectedItems.reduce((sum, item) => sum + item.product.price * item.qty, 0),
    [selectedItems],
  );

  const openProduct = async (product) => {
    let fullProduct = product;

    if (product.slug && !String(product.id || "").startsWith("f-")) {
      try {
        const response = await fetch(`/api/products/${encodeURIComponent(product.slug)}`);
        const payload = await response.json().catch(() => ({}));
        if (response.ok && payload.product) {
          fullProduct = normalizeProduct({ ...product, ...payload.product });
        }
      } catch (_) {
        // Mantem produto resumido em caso de falha de rede.
      }
    }

    setModalProduct(fullProduct);
    setActiveImage((fullProduct.images || [])[0] || "");
  };

  const addToCart = (product) => {
    setCart((prev) => {
      const existing = prev[product.id];
      const nextQty = existing ? existing.qty + 1 : 1;
      return {
        ...prev,
        [product.id]: {
          product,
          qty: nextQty,
        },
      };
    });
    setToast(`${product.name} adicionado ao pedido`);
  };

  const changeQty = (productId, delta) => {
    setCart((prev) => {
      const current = prev[productId];
      if (!current) return prev;

      const newQty = current.qty + delta;
      if (newQty <= 0) {
        const next = { ...prev };
        delete next[productId];
        return next;
      }

      return {
        ...prev,
        [productId]: {
          ...current,
          qty: newQty,
        },
      };
    });
  };

  const onReviewForm = (field, value) => {
    setReviewForm((prev) => ({ ...prev, [field]: value }));
  };

  const submitReview = async (ev) => {
    ev.preventDefault();
    if (!modalProduct) return;

    const authorName = reviewForm.name.trim();
    const rating = Number(reviewForm.rating || 0);
    const comment = reviewForm.comment.trim();

    if (!authorName || !comment || rating < 1 || rating > 5) {
      setToast("Preencha os campos da avaliação.");
      return;
    }

    setReviewSending(true);
    try {
      const response = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: modalProduct.id,
          authorName,
          rating,
          comment,
        }),
      });

      if (!response.ok) {
        throw new Error("Falha ao enviar avaliação");
      }

      setReviewForm({ name: "", rating: "5", comment: "" });
      setToast("Avaliação enviada para aprovação.");
    } catch (_) {
      setToast("Não foi possível enviar a avaliação.");
    } finally {
      setReviewSending(false);
    }
  };

  const sendWhatsapp = async () => {
    if (!selectedItems.length) return;

    const lines = ["Oi! Quero fazer um pedido:", "", "Itens:"];
    selectedItems.forEach(({ product, qty }, index) => {
      const subtotal = product.price * qty;
      lines.push(
        qty > 1
          ? `${index + 1}. ${product.name} x${qty} - ${brl.format(subtotal)}`
          : `${index + 1}. ${product.name} - ${brl.format(subtotal)}`,
      );
    });
    lines.push("", `Total: ${brl.format(totalValue)}`, "");

    if (customerName.trim()) lines.push(`Nome: ${customerName.trim()}`);
    if (notes.trim()) lines.push(`Obs: ${notes.trim()}`);

    const link = `https://wa.me/${normalizeWhatsapp(whatsapp)}?text=${encodeURIComponent(lines.join("\n"))}`;
    setSendingOrder(true);
    await new Promise((resolve) => setTimeout(resolve, 600));
    window.open(link, "_blank", "noopener,noreferrer");
    setSendingOrder(false);
    setToast("Pedido pronto. Abrindo WhatsApp...");
  };

  return e(
    React.Fragment,
    null,
    e(
      "header",
      { className: "topbar" },
      e(
        "div",
        { className: "brand-block" },
        e("h1", null, "Bibi Papelaria"),
        e("p", null, "Escolha seus favoritos e monte seu pedido com praticidade."),
      ),
      e("a", { className: "admin-link", href: "/admin/", "aria-label": "Abrir painel administrativo" }, "Área admin"),
    ),

    e(
      "main",
      null,
      e(
        "section",
        { className: "section-head", "aria-label": "Catálogo de produtos" },
        e("h2", null, "Nossos produtos"),
        e("p", null, "Entre nos detalhes para ver galeria completa e avaliações."),
      ),
      e("p", { id: "data-status", className: "data-status", role: "status", "aria-live": "polite" }, statusText),
      e(
        "section",
        { className: "gallery", "aria-live": "polite" },
        loading
          ? Array.from({ length: 6 }).map((_, idx) =>
              e(
                "article",
                { className: "card skeleton", key: `skeleton-${idx}` },
                e("div", { className: "image-wrap" }),
                e(
                  "div",
                  { className: "card-body" },
                  e("div", { className: "skeleton-line", style: { width: "70%", height: "16px", marginBottom: "8px" } }),
                  e("div", { className: "skeleton-line", style: { width: "55%", height: "14px" } }),
                ),
              ),
            )
          : products.map((product, index) =>
              e(ProductCard, {
                key: product.id,
                product,
                selectedQty: cart[product.id]?.qty || 0,
                onOpen: openProduct,
                index,
              }),
            ),
      ),
    ),

    e(
      "aside",
      { className: "checkout", "aria-labelledby": "checkout-title" },
      e("h2", { id: "checkout-title" }, "Seu pedido"),
      e("label", { htmlFor: "customer-name" }, "Seu nome"),
      e("input", {
        id: "customer-name",
        type: "text",
        placeholder: "Ex.: Maria",
        autoComplete: "name",
        value: customerName,
        onChange: (ev) => setCustomerName(ev.target.value),
      }),
      e("label", { htmlFor: "notes" }, "Observações"),
      e("textarea", {
        id: "notes",
        rows: 4,
        placeholder: "Ex.: Quero entrega para amanhã",
        value: notes,
        onChange: (ev) => setNotes(ev.target.value),
      }),
      e(
        "div",
        { className: "summary" },
        e("span", null, `${totalQty} ${totalQty === 1 ? "item selecionado" : "itens selecionados"}`),
        e("strong", null, brl.format(totalValue)),
      ),
      e(
        "ul",
        { className: "selected-list" },
        selectedItems.map(({ product, qty }) =>
          e(
            "li",
            { className: "cart-item", key: product.id },
            e("span", { className: "cart-item-name" }, product.name),
            e(
              "div",
              { className: "cart-item-controls" },
              e("button", { className: "qty-btn", type: "button", onClick: () => changeQty(product.id, -1) }, "-"),
              e("span", { className: "qty-value" }, qty),
              e("button", { className: "qty-btn", type: "button", onClick: () => changeQty(product.id, 1) }, "+"),
              e("span", { className: "cart-item-price" }, brl.format(product.price * qty)),
            ),
          ),
        ),
      ),
      e(
        "button",
        {
          className: `whatsapp-btn${sendingOrder ? " is-loading" : ""}`,
          type: "button",
          disabled: selectedItems.length === 0 || sendingOrder,
          onClick: sendWhatsapp,
        },
        sendingOrder ? "Preparando pedido..." : "Enviar pedido no WhatsApp",
      ),
    ),

    e(
      "footer",
      { className: "site-footer" },
      e("p", null, "© 2026 Bibi Papelaria · Feito com carinho"),
    ),

    modalProduct
      ? e(ProductModal, {
          product: modalProduct,
          activeImage,
          onImageSelect: setActiveImage,
          onClose: () => setModalProduct(null),
          onAdd: addToCart,
          cartQty: cart[modalProduct.id]?.qty || 0,
          reviewForm,
          onReviewForm,
          onReviewSubmit: submitReview,
          reviewSending,
        })
      : null,

    toast ? e("div", { className: "toast toast-visible", role: "status", "aria-live": "polite" }, toast) : null,
  );
}

const storeRoot = document.getElementById("store-root");
if (storeRoot) {
  const root = ReactDOM.createRoot(storeRoot);
  root.render(e(App));
}
