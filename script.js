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
const STORE_DRAFT_KEY = "store_checkout_draft_v1";

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function readStoreDraft() {
  try {
    const raw = localStorage.getItem(STORE_DRAFT_KEY);
    if (!raw) {
      return { cart: {}, customerName: "", notes: "" };
    }

    const parsed = JSON.parse(raw);
    const inputCart = parsed && typeof parsed.cart === "object" ? parsed.cart : {};
    const safeCart = {};

    Object.entries(inputCart).forEach(([lineKey, item]) => {
      if (!item || typeof item !== "object") return;
      const product = item.product;
      const qty = Number(item.qty || 0);
      if (!product || typeof product !== "object" || !product.id || qty <= 0) return;

      safeCart[lineKey] = {
        product: normalizeProduct(product),
        qty: Math.max(1, Math.trunc(qty)),
        variantLabel: String(item.variantLabel || "").trim(),
      };
    });

    return {
      cart: safeCart,
      customerName: typeof parsed.customerName === "string" ? parsed.customerName : "",
      notes: typeof parsed.notes === "string" ? parsed.notes : "",
    };
  } catch (_) {
    return { cart: {}, customerName: "", notes: "" };
  }
}

function writeStoreDraft(draft) {
  try {
    const compactCart = {};
    Object.entries(draft?.cart || {}).forEach(([lineKey, item]) => {
      if (!item?.product) return;
      compactCart[lineKey] = {
        qty: Math.max(1, Math.trunc(Number(item.qty || 1))),
        variantLabel: String(item.variantLabel || "").trim(),
        product: {
          id: item.product.id,
          slug: item.product.slug,
          name: item.product.name,
          price: Number(item.product.price || 0),
          image: item.product.image || "",
          stockStatus: item.product.stockStatus || "in_stock",
          stockQty: Number.isInteger(item.product.stockQty) ? item.product.stockQty : null,
          variants: Array.isArray(item.product.variants) ? item.product.variants : [],
        },
      };
    });

    localStorage.setItem(
      STORE_DRAFT_KEY,
      JSON.stringify({
        cart: compactCart,
        customerName: String(draft?.customerName || ""),
        notes: String(draft?.notes || ""),
      }),
    );
  } catch (_) {
    // Ignora erros de quota/privacidade no armazenamento local.
  }
}

function normalizeWhatsapp(value) {
  return String(value || "").replace(/\D/g, "");
}

function normalizeProduct(raw) {
  const images = Array.isArray(raw.images)
    ? raw.images.filter(Boolean)
    : [raw.image].filter(Boolean);

  const variants = Array.isArray(raw.variants)
    ? Array.from(new Set(raw.variants.map((item) => String(item || "").trim()).filter(Boolean)))
    : [];

  const stockStatus = String(raw.stockStatus || "in_stock").toLowerCase();
  const allowedStock = ["in_stock", "low_stock", "out_of_stock", "pre_order"];
  const safeStockStatus = allowedStock.includes(stockStatus) ? stockStatus : "in_stock";
  const stockQty = Number.isInteger(raw.stockQty) ? Math.max(0, raw.stockQty) : null;

  return {
    ...raw,
    images,
    image: raw.image || images[0] || "",
    reviews: Array.isArray(raw.reviews) ? raw.reviews : [],
    rating: Number(raw.rating || 0),
    reviewCount: Number(raw.reviewCount || 0),
    price: Number(raw.price || 0),
    variants,
    stockStatus: safeStockStatus,
    stockQty,
  };
}

function stockStatusLabel(status) {
  if (status === "low_stock") return "Ultimas unidades";
  if (status === "out_of_stock") return "Sem estoque";
  if (status === "pre_order") return "Sob encomenda";
  return "Disponivel";
}

function buildCartLineKey(productId, variantLabel) {
  const variant = String(variantLabel || "").trim();
  return variant ? `${productId}::${variant}` : String(productId);
}

function FadeImage({ src, alt, loading = "lazy", className = "", onLoadStateChange, fetchPriority = "auto" }) {
  const [loaded, setLoaded] = React.useState(false);

  React.useEffect(() => {
    setLoaded(false);
  }, [src]);

  React.useEffect(() => {
    if (typeof onLoadStateChange === "function") {
      onLoadStateChange(loaded);
    }
  }, [loaded, onLoadStateChange]);

  return e("img", {
    src,
    alt,
    loading,
    fetchPriority,
    decoding: "async",
    className: `${className}${loaded ? " img-ready" : ""}`.trim(),
    onLoad: () => setLoaded(true),
    onError: () => setLoaded(true),
  });
}

function ProductCard({ product, selectedQty, onOpen, index }) {
  const hasRemoteImage = /^https?:\/\//i.test(product.image || "");
  const imagesCount = product.images?.length || 0;
  const [imageLoaded, setImageLoaded] = React.useState(false);

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
        className: `image-wrap${imageLoaded ? " img-loaded" : ""}`,
        style: hasRemoteImage ? undefined : { background: product.image || "linear-gradient(145deg, #f5aabf, #e88aa5)" },
      },
      hasRemoteImage
        ? e(FadeImage, {
            src: product.image,
            alt: product.name,
            loading: index < 2 ? "eager" : "lazy",
            fetchPriority: index < 2 ? "high" : "auto",
            onLoadStateChange: setImageLoaded,
          })
        : null,
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
  selectedVariant,
  onVariantChange,
  reviewForm,
  onReviewForm,
  onReviewSubmit,
  reviewSending,
  isMobile,
}) {
  if (!product) return null;

  const images = product.images?.length ? product.images : ["linear-gradient(140deg, #f2b5ca, #e89ab6)"];
  const mainImage = activeImage || images[0];
  const activeIndex = Math.max(0, images.findIndex((src) => src === mainImage));
  const hasMainRemote = /^https?:\/\//i.test(mainImage || "");
  const stockStatus = product.stockStatus || "in_stock";
  const isOutOfStock = stockStatus === "out_of_stock";
  const canAddToCart = stockStatus === "in_stock" || stockStatus === "low_stock" || stockStatus === "pre_order";
  const stockLabel = stockStatusLabel(stockStatus);
  const [mainLoaded, setMainLoaded] = React.useState(false);
  const [isImageFullscreen, setIsImageFullscreen] = React.useState(false);
  const [loadedThumbIndexes, setLoadedThumbIndexes] = React.useState(() => new Set([0, 1]));
  const [lightboxScale, setLightboxScale] = React.useState(1);
  const [lightboxOffset, setLightboxOffset] = React.useState({ x: 0, y: 0 });
  const pointersRef = React.useRef(new Map());
  const panStartRef = React.useRef(null);
  const pinchStartRef = React.useRef(null);

  const resetLightboxView = React.useCallback(() => {
    setLightboxScale(1);
    setLightboxOffset({ x: 0, y: 0 });
    pointersRef.current.clear();
    panStartRef.current = null;
    pinchStartRef.current = null;
  }, []);

  const closeFullscreen = React.useCallback(() => {
    setIsImageFullscreen(false);
    resetLightboxView();
  }, [resetLightboxView]);

  React.useEffect(() => {
    setLoadedThumbIndexes(new Set([activeIndex, Math.max(0, activeIndex - 1), activeIndex + 1]));
  }, [activeIndex, product?.id]);

  React.useEffect(() => {
    closeFullscreen();
  }, [product?.id, mainImage]);

  React.useEffect(() => {
    if (lightboxScale <= 1) {
      setLightboxOffset({ x: 0, y: 0 });
    }
  }, [lightboxScale]);

  React.useEffect(() => {
    if (!isImageFullscreen) return undefined;

    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        closeFullscreen();
      }

      if (event.key === "+" || event.key === "=") {
        setLightboxScale((prev) => clamp(prev + 0.25, 1, 4));
      }

      if (event.key === "-") {
        setLightboxScale((prev) => clamp(prev - 0.25, 1, 4));
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeFullscreen, isImageFullscreen]);

  const onLightboxPointerDown = React.useCallback(
    (event) => {
      pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

      if (pointersRef.current.size === 1) {
        panStartRef.current = {
          x: event.clientX,
          y: event.clientY,
          offsetX: lightboxOffset.x,
          offsetY: lightboxOffset.y,
        };
      }

      if (pointersRef.current.size === 2) {
        const points = Array.from(pointersRef.current.values());
        const distance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
        pinchStartRef.current = {
          distance,
          scale: lightboxScale,
        };
      }

      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [lightboxOffset.x, lightboxOffset.y, lightboxScale],
  );

  const onLightboxPointerMove = React.useCallback(
    (event) => {
      if (!pointersRef.current.has(event.pointerId)) return;
      pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

      if (pointersRef.current.size >= 2 && pinchStartRef.current) {
        const points = Array.from(pointersRef.current.values());
        const distance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
        const factor = pinchStartRef.current.distance > 0 ? distance / pinchStartRef.current.distance : 1;
        setLightboxScale(clamp(pinchStartRef.current.scale * factor, 1, 4));
        return;
      }

      if (pointersRef.current.size === 1 && panStartRef.current && lightboxScale > 1) {
        const deltaX = event.clientX - panStartRef.current.x;
        const deltaY = event.clientY - panStartRef.current.y;
        setLightboxOffset({
          x: panStartRef.current.offsetX + deltaX,
          y: panStartRef.current.offsetY + deltaY,
        });
      }
    },
    [lightboxScale],
  );

  const onLightboxPointerUp = React.useCallback((event) => {
    pointersRef.current.delete(event.pointerId);

    if (pointersRef.current.size < 2) {
      pinchStartRef.current = null;
    }

    if (pointersRef.current.size === 1) {
      const onlyPoint = Array.from(pointersRef.current.values())[0];
      panStartRef.current = {
        x: onlyPoint.x,
        y: onlyPoint.y,
        offsetX: lightboxOffset.x,
        offsetY: lightboxOffset.y,
      };
      return;
    }

    if (pointersRef.current.size === 0) {
      panStartRef.current = null;
    }
  }, [lightboxOffset.x, lightboxOffset.y]);

  const onLightboxDoubleClick = React.useCallback(() => {
    setLightboxScale((prev) => {
      const next = prev > 1 ? 1 : 2;
      if (next === 1) {
        setLightboxOffset({ x: 0, y: 0 });
      }
      return next;
    });
  }, []);

  return e(
    "div",
    { className: `product-modal is-open${isMobile ? " is-mobile" : ""}`, role: "dialog", "aria-modal": "true", "aria-hidden": "false" },
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
              className: `product-gallery__main${hasMainRemote && mainLoaded ? " is-loaded" : ""}`,
              style: hasMainRemote ? undefined : { background: mainImage },
              onClick: hasMainRemote ? () => setIsImageFullscreen(true) : undefined,
              onKeyDown: hasMainRemote
                ? (event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setIsImageFullscreen(true);
                    }
                  }
                : undefined,
              role: hasMainRemote ? "button" : undefined,
              tabIndex: hasMainRemote ? 0 : undefined,
              "aria-label": hasMainRemote ? `Abrir imagem de ${product.name} em tela cheia` : undefined,
            },
            hasMainRemote
              ? e(FadeImage, {
                  src: mainImage,
                  alt: product.name,
                  loading: "lazy",
                  onLoadStateChange: setMainLoaded,
                })
              : null,
          ),
          hasMainRemote
            ? e(
                "button",
                {
                  className: "gallery-fullscreen-btn",
                  type: "button",
                  onClick: () => setIsImageFullscreen(true),
                },
                "Ver em tela cheia",
              )
            : null,
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
                  onClick: () => {
                    setLoadedThumbIndexes((prev) => {
                      const next = new Set(prev);
                      next.add(idx);
                      next.add(Math.max(0, idx - 1));
                      next.add(idx + 1);
                      return next;
                    });
                    onImageSelect(src);
                  },
                  style: isRemote ? undefined : { background: src },
                },
                isRemote
                  ? loadedThumbIndexes.has(idx)
                    ? e(FadeImage, {
                        src,
                        alt: "Miniatura",
                        loading: "lazy",
                      })
                    : e("span", { className: "thumb-placeholder", "aria-hidden": "true" })
                  : null,
              );
            }),
          ),
          e(
            "p",
            { className: "product-gallery__hint" },
            "No celular, toque nas miniaturas para ver todos os detalhes do produto.",
          ),
        ),
        e(
          "section",
          { className: "product-info" },
          e("h3", null, product.name),
          e(
            "p",
            { className: `stock-pill stock-pill--${stockStatus}` },
            stockLabel,
            Number.isInteger(product.stockQty) ? ` · ${product.stockQty} un.` : "",
          ),
          e("p", { className: "product-price" }, brl.format(product.price || 0)),
          e(
            "p",
            { className: "product-rating" },
            product.reviewCount > 0
              ? `Nota ${Number(product.rating || 0).toFixed(1)} (${product.reviewCount} avaliações)`
              : "Sem avaliações ainda",
          ),
          e("p", { className: "product-description" }, product.description || "Sem descrição."),
          product.variants?.length
            ? e(
                "div",
                { className: "variant-block" },
                e("label", { htmlFor: "product-variant" }, "Variação"),
                e(
                  "select",
                  {
                    id: "product-variant",
                    value: selectedVariant,
                    onChange: (ev) => onVariantChange(ev.target.value),
                  },
                  product.variants.map((variant) =>
                    e(
                      "option",
                      { key: `${product.id}-variant-${variant}`, value: variant },
                      variant,
                    ),
                  ),
                ),
              )
            : null,
          e(
            "div",
            { className: "product-actions" },
            e(
              "button",
              {
                className: `whatsapp-btn${cartQty > 0 ? " is-in-cart" : ""}`,
                type: "button",
                onClick: () => onAdd(product, selectedVariant),
                disabled: !canAddToCart,
              },
              isOutOfStock
                ? "Indisponível no momento"
                : cartQty > 0
                  ? `No carrinho (${cartQty}) · adicionar mais`
                  : "Adicionar ao carrinho",
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
                : e("li", { className: "review-empty" }, "Este produto ainda não recebeu avaliações publicadas."),
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
    isImageFullscreen && hasMainRemote
      ? e(
          "div",
          {
            className: "image-lightbox is-open",
            role: "dialog",
            "aria-modal": "true",
            "aria-label": `Imagem ampliada de ${product.name}`,
          },
          e("button", {
            className: "image-lightbox__backdrop",
            type: "button",
            onClick: closeFullscreen,
            "aria-label": "Fechar visualização em tela cheia",
          }),
          e(
            "div",
            { className: "image-lightbox__content" },
            e(
              "button",
              {
                className: "image-lightbox__close",
                type: "button",
                onClick: closeFullscreen,
                "aria-label": "Fechar visualização em tela cheia",
              },
              "×",
            ),
            e(
              "div",
              {
                className: "image-lightbox__stage",
                onPointerDown: onLightboxPointerDown,
                onPointerMove: onLightboxPointerMove,
                onPointerUp: onLightboxPointerUp,
                onPointerCancel: onLightboxPointerUp,
                onDoubleClick: onLightboxDoubleClick,
              },
              e("img", {
                src: mainImage,
                alt: product.name,
                className: "image-lightbox__img",
                style: {
                  transform: `translate(${Math.round(lightboxOffset.x)}px, ${Math.round(lightboxOffset.y)}px) scale(${lightboxScale.toFixed(3)})`,
                },
              }),
            ),
            e(
              "div",
              { className: "image-lightbox__controls" },
              e(
                "button",
                {
                  type: "button",
                  className: "image-lightbox__control-btn",
                  onClick: () => setLightboxScale((prev) => clamp(prev - 0.25, 1, 4)),
                  "aria-label": "Diminuir zoom",
                },
                "-",
              ),
              e("strong", null, `${Math.round(lightboxScale * 100)}%`),
              e(
                "button",
                {
                  type: "button",
                  className: "image-lightbox__control-btn",
                  onClick: () => setLightboxScale((prev) => clamp(prev + 0.25, 1, 4)),
                  "aria-label": "Aumentar zoom",
                },
                "+",
              ),
              e(
                "button",
                {
                  type: "button",
                  className: "image-lightbox__control-btn",
                  onClick: resetLightboxView,
                },
                "Reset",
              ),
            ),
            e("p", { className: "image-lightbox__hint" }, "Use dois dedos para ampliar e arraste para explorar detalhes."),
          ),
        )
      : null,
  );
}

function App() {
  const initialDraft = React.useMemo(() => readStoreDraft(), []);
  const [products, setProducts] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [statusText, setStatusText] = React.useState("Carregando catálogo...");
  const [toast, setToast] = React.useState("");
  const [cart, setCart] = React.useState(initialDraft.cart);
  const [customerName, setCustomerName] = React.useState(initialDraft.customerName);
  const [notes, setNotes] = React.useState(initialDraft.notes);
  const [whatsapp, setWhatsapp] = React.useState("55119997635107");
  const [modalProduct, setModalProduct] = React.useState(null);
  const [activeImage, setActiveImage] = React.useState("");
  const [modalVariant, setModalVariant] = React.useState("");
  const [reviewSending, setReviewSending] = React.useState(false);
  const [reviewForm, setReviewForm] = React.useState({ name: "", rating: "5", comment: "" });
  const [sendingOrder, setSendingOrder] = React.useState(false);
  const [isMobile, setIsMobile] = React.useState(window.innerWidth <= 560);

  React.useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const previousTouchAction = document.body.style.touchAction;

    if (modalProduct) {
      document.body.style.overflow = "hidden";
      document.body.style.touchAction = "none";
    }

    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.touchAction = previousTouchAction;
    };
  }, [modalProduct]);

  React.useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 560);
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

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

        if (!response.ok || !Array.isArray(payload.products)) {
          setProducts(fallbackProducts.map(normalizeProduct));
          setStatusText("Usando catálogo local de exemplo.");
          return;
        }

        if (payload.products.length === 0) {
          setProducts([]);
          setStatusText("No momento estamos sem produtos disponíveis.");
          return;
        }

        setProducts(payload.products.map(normalizeProduct));
        setStatusText("");
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

  React.useEffect(() => {
    writeStoreDraft({ cart, customerName, notes });
  }, [cart, customerName, notes]);

  const selectedItems = React.useMemo(
    () => Object.entries(cart).map(([lineKey, item]) => ({ lineKey, ...item })),
    [cart],
  );
  const selectedQtyByProduct = React.useMemo(() => {
    const map = {};
    selectedItems.forEach((item) => {
      const id = item.product?.id;
      if (!id) return;
      map[id] = (map[id] || 0) + Number(item.qty || 0);
    });
    return map;
  }, [selectedItems]);
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
    setModalVariant(Array.isArray(fullProduct.variants) && fullProduct.variants.length ? fullProduct.variants[0] : "");
  };

  const addToCart = (product, variantLabel = "") => {
    const lineKey = buildCartLineKey(product.id, variantLabel);

    setCart((prev) => {
      const existing = prev[lineKey];
      const nextQty = existing ? existing.qty + 1 : 1;
      return {
        ...prev,
        [lineKey]: {
          product,
          variantLabel: String(variantLabel || "").trim(),
          qty: nextQty,
        },
      };
    });
    setToast(variantLabel ? `${product.name} (${variantLabel}) adicionado ao pedido` : `${product.name} adicionado ao pedido`);
  };

  const changeQty = (lineKey, delta) => {
    setCart((prev) => {
      const current = prev[lineKey];
      if (!current) return prev;

      const newQty = current.qty + delta;
      if (newQty <= 0) {
        const next = { ...prev };
        delete next[productId];
        return next;
      }

      return {
        ...prev,
        [lineKey]: {
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
    selectedItems.forEach(({ product, qty, variantLabel }, index) => {
      const subtotal = product.price * qty;
      const itemName = variantLabel ? `${product.name} (${variantLabel})` : product.name;
      lines.push(
        qty > 1
          ? `${index + 1}. ${itemName} x${qty} - ${brl.format(subtotal)}`
          : `${index + 1}. ${itemName} - ${brl.format(subtotal)}`,
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

  const goToCheckout = () => {
    const panel = document.getElementById("checkout-panel");
    if (!panel) return;
    panel.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return e(
    React.Fragment,
    null,
    e(
      "header",
      { className: "topbar" },
      e(
        "div",
        { className: "topbar-layout" },
        e(
          "div",
          { className: "brand-block" },
          e("p", { className: "eyebrow" }, "Papelaria autoral"),
          e("h1", null, "Bibi Papelaria"),
          e(
            "p",
            null,
            "Peças com acabamento delicado, visual elegante e carinho em cada detalhe para presentear ou usar no seu dia a dia.",
          ),
        ),
        e(
          "div",
          { className: "topbar-highlights" },
          e("span", { className: "highlight-pill" }, "Produção artesanal"),
          e("span", { className: "highlight-pill" }, "Atendimento via WhatsApp"),
          e("span", { className: "highlight-pill" }, "Personalização disponível"),
        ),
      ),
    ),

    e(
      "main",
      null,
      e(
        "section",
        { className: "section-head", "aria-label": "Catálogo de produtos" },
        e("h2", null, "Nossos produtos"),
        e("p", null, "Escolha sua peça favorita, veja fotos em detalhe e monte seu pedido de forma rápida."),
      ),
      statusText
        ? e("p", { id: "data-status", className: "data-status", role: "status", "aria-live": "polite" }, statusText)
        : null,
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
          : products.length === 0
            ? e(
                "article",
                { className: "gallery-empty" },
                e("h3", null, "Catálogo em atualização"),
                e(
                  "p",
                  null,
                  "Estamos preparando novos itens para a vitrine. Volte em breve para conferir novidades.",
                ),
              )
            : products.map((product, index) =>
                e(ProductCard, {
                  key: product.id,
                  product,
                  selectedQty: selectedQtyByProduct[product.id] || 0,
                  onOpen: openProduct,
                  index,
                }),
              ),
      ),
    ),

    e(
      "aside",
      { className: "checkout", id: "checkout-panel", tabIndex: -1, "aria-labelledby": "checkout-title" },
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
        selectedItems.map(({ lineKey, product, qty, variantLabel }) =>
          e(
            "li",
            { className: "cart-item", key: lineKey },
            e(
              "span",
              { className: "cart-item-name" },
              product.name,
              variantLabel ? e("small", { className: "cart-item-variant" }, `Variação: ${variantLabel}`) : null,
            ),
            e(
              "div",
              { className: "cart-item-controls" },
              e("button", { className: "qty-btn", type: "button", onClick: () => changeQty(lineKey, -1) }, "-"),
              e("span", { className: "qty-value" }, qty),
              e("button", { className: "qty-btn", type: "button", onClick: () => changeQty(lineKey, 1) }, "+"),
              e("span", { className: "cart-item-price" }, brl.format(product.price * qty)),
            ),
          ),
        ),
      ),
      e(
        "div",
        { className: "checkout-row-actions" },
        e(
          "button",
          {
            className: "clear-cart-btn",
            type: "button",
            disabled: selectedItems.length === 0,
            onClick: () => {
              setCart({});
              setToast("Carrinho limpo.");
            },
          },
          "Limpar carrinho",
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
      "button",
      {
        className: `mobile-cart-bar${totalQty > 0 ? " has-items" : ""}`,
        type: "button",
        onClick: goToCheckout,
        "aria-label": "Ir para o pedido",
      },
      e("span", { className: "mobile-cart-bar__label" }, "Seu pedido"),
      e(
        "strong",
        { className: "mobile-cart-bar__value" },
        totalQty > 0 ? `${totalQty} item${totalQty > 1 ? "s" : ""} · ${brl.format(totalValue)}` : "Toque para revisar",
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
          onClose: () => {
            setModalProduct(null);
            setModalVariant("");
          },
          onAdd: addToCart,
          cartQty: selectedQtyByProduct[modalProduct.id] || 0,
          selectedVariant: modalVariant,
          onVariantChange: setModalVariant,
          reviewForm,
          onReviewForm,
          onReviewSubmit: submitReview,
          reviewSending,
          isMobile,
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
