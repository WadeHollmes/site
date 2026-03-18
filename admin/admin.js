/* global React, ReactDOM */

const SESSION_KEY = "admin_review_key";
const e = React.createElement;

function getStoredKey() {
  return sessionStorage.getItem(SESSION_KEY) || "";
}

function setStoredKey(value) {
  if (value) {
    sessionStorage.setItem(SESSION_KEY, value);
    return;
  }
  sessionStorage.removeItem(SESSION_KEY);
}

function statusLabel(status) {
  if (status === "approved") return "aprovadas";
  if (status === "rejected") return "rejeitadas";
  return "pendentes";
}

function stars(rating) {
  const n = Math.max(1, Math.min(5, Number(rating) || 0));
  return "★".repeat(n) + "☆".repeat(5 - n);
}

function ReviewItem({ item, status, onModerate, disabled }) {
  const date = item.createdAt ? new Date(Number(item.createdAt) * 1000) : null;
  const dateText = date && !Number.isNaN(date.getTime()) ? date.toLocaleString("pt-BR") : "data desconhecida";

  return e(
    "li",
    { className: "review-item" },
    e(
      "div",
      { className: "review-head" },
      e(
        "div",
        null,
        e("p", { className: "review-title" }, `${item.productName || "Produto"} - ${item.authorName || "Cliente"}`),
        e("p", { className: "review-meta" }, `${stars(item.rating)} - ${dateText}`),
      ),
    ),
    e("p", { className: "review-comment" }, item.comment || ""),
    status === "pending"
      ? e(
          "div",
          { className: "review-actions" },
          e(
            "button",
            {
              type: "button",
              className: "review-action approve",
              disabled,
              onClick: () => onModerate(item.id, "approved"),
            },
            "Aprovar",
          ),
          e(
            "button",
            {
              type: "button",
              className: "review-action reject",
              disabled,
              onClick: () => onModerate(item.id, "rejected"),
            },
            "Rejeitar",
          ),
        )
      : null,
  );
}

function App() {
  const [adminKey, setAdminKey] = React.useState(getStoredKey());
  const [loginInput, setLoginInput] = React.useState("");
  const [isAuthenticated, setAuthenticated] = React.useState(Boolean(getStoredKey()));
  const [status, setStatus] = React.useState("pending");
  const [reviews, setReviews] = React.useState([]);
  const [query, setQuery] = React.useState("");
  const [minRating, setMinRating] = React.useState("0");
  const [subtitle, setSubtitle] = React.useState("Digite sua chave para entrar.");
  const [globalError, setGlobalError] = React.useState("");
  const [stats, setStats] = React.useState({ pending: 0, approved: 0, rejected: 0 });
  const [isLoading, setIsLoading] = React.useState(false);
  const [isSyncing, setIsSyncing] = React.useState(false);
  const [bulkBusy, setBulkBusy] = React.useState(false);

  const authHeaders = React.useCallback(
    () => ({
      "Content-Type": "application/json",
      "x-admin-key": adminKey,
    }),
    [adminKey],
  );

  const loadStats = React.useCallback(async () => {
    if (!adminKey) return;

    try {
      const [pendingRes, approvedRes, rejectedRes] = await Promise.all([
        fetch("/api/admin/reviews?status=pending", { headers: authHeaders() }),
        fetch("/api/admin/reviews?status=approved", { headers: authHeaders() }),
        fetch("/api/admin/reviews?status=rejected", { headers: authHeaders() }),
      ]);

      const [pendingJson, approvedJson, rejectedJson] = await Promise.all([
        pendingRes.json().catch(() => ({})),
        approvedRes.json().catch(() => ({})),
        rejectedRes.json().catch(() => ({})),
      ]);

      setStats({
        pending: Array.isArray(pendingJson.reviews) ? pendingJson.reviews.length : 0,
        approved: Array.isArray(approvedJson.reviews) ? approvedJson.reviews.length : 0,
        rejected: Array.isArray(rejectedJson.reviews) ? rejectedJson.reviews.length : 0,
      });
    } catch (_) {
      // Mantem estatisticas anteriores em caso de erro de rede.
    }
  }, [adminKey, authHeaders]);

  const loadReviews = React.useCallback(
    async (targetStatus = status) => {
      if (!adminKey) return;

      setIsLoading(true);
      setGlobalError("");
      setSubtitle("Carregando...");

      try {
        const response = await fetch(`/api/admin/reviews?status=${encodeURIComponent(targetStatus)}`, {
          method: "GET",
          headers: authHeaders(),
        });

        if (response.status === 401) {
          setStoredKey("");
          setAdminKey("");
          setAuthenticated(false);
          setReviews([]);
          setSubtitle("Sessao expirada. Entre novamente.");
          return;
        }

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload.error || "Falha ao listar avaliacoes");
        }

        const items = Array.isArray(payload.reviews) ? payload.reviews : [];
        setReviews(items);
        setSubtitle(`${items.length} item(ns) encontrado(s).`);
      } catch (error) {
        setGlobalError(error.message || "Erro ao carregar lista.");
        setReviews([]);
        setSubtitle("Falha ao carregar.");
      } finally {
        setIsLoading(false);
      }
    },
    [adminKey, authHeaders, status],
  );

  const tryLogin = React.useCallback(async (key) => {
    const trimmed = String(key || "").trim();
    if (!trimmed) return;

    setGlobalError("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/admin/reviews?status=pending", {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "x-admin-key": trimmed,
        },
      });

      if (!response.ok) {
        throw new Error("Chave invalida.");
      }

      setStoredKey(trimmed);
      setAdminKey(trimmed);
      setAuthenticated(true);
      setSubtitle("Acesso liberado.");
    } catch (error) {
      setStoredKey("");
      setAdminKey("");
      setAuthenticated(false);
      setGlobalError(error.message || "Falha de autenticacao.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const moderateReview = React.useCallback(
    async (id, nextStatus) => {
      setGlobalError("");
      setIsLoading(true);

      try {
        const response = await fetch(`/api/admin/reviews/${id}`, {
          method: "PATCH",
          headers: authHeaders(),
          body: JSON.stringify({ status: nextStatus }),
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload.error || "Falha ao atualizar avaliacao");
        }

        await Promise.all([loadReviews(status), loadStats()]);
      } catch (error) {
        setGlobalError(error.message || "Falha ao atualizar.");
      } finally {
        setIsLoading(false);
      }
    },
    [authHeaders, loadReviews, loadStats, status],
  );

  const bulkModerate = React.useCallback(
    async (nextStatus, ids) => {
      if (!ids.length) return;

      setBulkBusy(true);
      setGlobalError("");

      try {
        const results = await Promise.allSettled(
          ids.map((id) =>
            fetch(`/api/admin/reviews/${id}`, {
              method: "PATCH",
              headers: authHeaders(),
              body: JSON.stringify({ status: nextStatus }),
            }).then((response) => {
              if (!response.ok) {
                throw new Error(`Falha ao atualizar avaliacao ${id}`);
              }
              return response;
            }),
          ),
        );

        const failed = results.filter((r) => r.status === "rejected").length;
        if (failed > 0) {
          setGlobalError(`${failed} item(ns) falharam na operacao em lote.`);
        }

        await Promise.all([loadReviews(status), loadStats()]);
      } catch (error) {
        setGlobalError(error.message || "Falha na operacao em lote.");
      } finally {
        setBulkBusy(false);
      }
    },
    [authHeaders, loadReviews, loadStats, status],
  );

  const syncNotion = React.useCallback(async () => {
    setIsSyncing(true);
    setGlobalError("");

    try {
      const response = await fetch("/api/admin/sync", {
        method: "POST",
        headers: authHeaders(),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || "Falha ao sincronizar");
      }

      await Promise.all([loadReviews(status), loadStats()]);
    } catch (error) {
      setGlobalError(error.message || "Falha na sincronizacao.");
    } finally {
      setIsSyncing(false);
    }
  }, [authHeaders, loadReviews, loadStats, status]);

  const logout = React.useCallback(() => {
    setStoredKey("");
    setAdminKey("");
    setAuthenticated(false);
    setReviews([]);
    setStats({ pending: 0, approved: 0, rejected: 0 });
    setGlobalError("");
    setSubtitle("Sessao encerrada.");
  }, []);

  React.useEffect(() => {
    if (!isAuthenticated || !adminKey) return;
    loadReviews(status);
    loadStats();
  }, [adminKey, isAuthenticated, loadReviews, loadStats, status]);

  const filteredReviews = React.useMemo(() => {
    const term = query.trim().toLowerCase();
    const minimum = Number(minRating || 0);

    return reviews.filter((item) => {
      const haystack = `${item.productName || ""} ${item.authorName || ""} ${item.comment || ""}`.toLowerCase();
      const matchText = term ? haystack.includes(term) : true;
      const matchRating = Number(item.rating || 0) >= minimum;
      return matchText && matchRating;
    });
  }, [minRating, query, reviews]);

  const onSubmitLogin = async (event) => {
    event.preventDefault();
    await tryLogin(loginInput);
    setLoginInput("");
  };

  const idsInView = filteredReviews.map((item) => item.id);
  const totalReviews = stats.pending + stats.approved + stats.rejected;

  const chartRows = [
    { key: "pending", label: "Pendentes", value: stats.pending, tone: "pending" },
    { key: "approved", label: "Aprovadas", value: stats.approved, tone: "approved" },
    { key: "rejected", label: "Rejeitadas", value: stats.rejected, tone: "rejected" },
  ].map((row) => {
    const percentage = totalReviews > 0 ? Math.round((row.value / totalReviews) * 100) : 0;
    return { ...row, percentage };
  });

  return e(
    "main",
    { className: "admin-shell" },
    e(
      "header",
      { className: "admin-header" },
      e(
        "div",
        null,
        e("h1", null, "Painel de Aprovacao"),
        e("p", null, "Gerencie avaliacoes e sincronizacao com Notion."),
      ),
      isAuthenticated ? e("button", { type: "button", className: "ghost-btn", onClick: logout }, "Sair") : null,
    ),

    !isAuthenticated
      ? e(
          "section",
          { className: "card login-card" },
          e("h2", null, "Acesso Admin"),
          e("p", null, "Digite a chave de administracao para abrir o painel."),
          e(
            "form",
            { className: "stack", onSubmit: onSubmitLogin },
            e("label", { htmlFor: "admin-key" }, "Senha / Chave"),
            e("input", {
              id: "admin-key",
              type: "password",
              placeholder: "ADMIN_REVIEW_KEY",
              required: true,
              value: loginInput,
              onChange: (ev) => setLoginInput(ev.target.value),
            }),
            e("button", { className: "primary-btn", type: "submit", disabled: isLoading }, isLoading ? "Entrando..." : "Entrar"),
            globalError ? e("p", { className: "status-error", role: "alert" }, globalError) : null,
          ),
        )
      : e(
          React.Fragment,
          null,
          e(
            "section",
            { className: "stats-grid" },
            e("article", { className: "card stat-card" }, e("small", null, "Pendentes"), e("strong", null, String(stats.pending))),
            e("article", { className: "card stat-card" }, e("small", null, "Aprovadas"), e("strong", null, String(stats.approved))),
            e("article", { className: "card stat-card" }, e("small", null, "Rejeitadas"), e("strong", null, String(stats.rejected))),
          ),

          e(
            "section",
            { className: "card chart-card" },
            e("h3", null, "Distribuicao de status"),
            e("p", { className: "muted" }, `${totalReviews} avaliacao(oes) registradas.`),
            e(
              "ul",
              { className: "chart-list" },
              chartRows.map((row) =>
                e(
                  "li",
                  { className: "chart-item", key: row.key },
                  e(
                    "div",
                    { className: "chart-item__head" },
                    e("span", null, row.label),
                    e("strong", null, `${row.value} (${row.percentage}%)`),
                  ),
                  e(
                    "div",
                    { className: "chart-track", role: "img", "aria-label": `${row.label}: ${row.percentage}%` },
                    e("span", {
                      className: `chart-fill ${row.tone}`,
                      style: { width: `${row.percentage}%` },
                    }),
                  ),
                ),
              ),
            ),
          ),

          e(
            "div",
            { className: "toolbar card" },
            e(
              "div",
              { className: "toolbar-left" },
              e(
                "button",
                {
                  type: "button",
                  className: `tab-btn${status === "pending" ? " is-active" : ""}`,
                  onClick: () => setStatus("pending"),
                  disabled: isLoading,
                },
                "Pendentes",
              ),
              e(
                "button",
                {
                  type: "button",
                  className: `tab-btn${status === "approved" ? " is-active" : ""}`,
                  onClick: () => setStatus("approved"),
                  disabled: isLoading,
                },
                "Aprovadas",
              ),
              e(
                "button",
                {
                  type: "button",
                  className: `tab-btn${status === "rejected" ? " is-active" : ""}`,
                  onClick: () => setStatus("rejected"),
                  disabled: isLoading,
                },
                "Rejeitadas",
              ),
            ),
            e(
              "div",
              { className: "toolbar-right" },
              e("button", { className: "primary-btn", type: "button", disabled: isSyncing, onClick: syncNotion }, isSyncing ? "Sincronizando..." : "Sincronizar Notion"),
              e("button", { className: "ghost-btn", type: "button", disabled: isLoading, onClick: () => loadReviews(status) }, "Atualizar lista"),
            ),
          ),

          e(
            "section",
            { className: "card filters-row" },
            e(
              "div",
              { className: "filter-field" },
              e("label", { htmlFor: "review-search" }, "Buscar"),
              e("input", {
                id: "review-search",
                type: "search",
                placeholder: "Produto, autor ou comentario",
                value: query,
                onChange: (ev) => setQuery(ev.target.value),
              }),
            ),
            e(
              "div",
              { className: "filter-field" },
              e("label", { htmlFor: "rating-min" }, "Nota minima"),
              e(
                "select",
                {
                  id: "rating-min",
                  value: minRating,
                  onChange: (ev) => setMinRating(ev.target.value),
                },
                e("option", { value: "0" }, "Todas"),
                e("option", { value: "5" }, "5"),
                e("option", { value: "4" }, "4+"),
                e("option", { value: "3" }, "3+"),
                e("option", { value: "2" }, "2+"),
                e("option", { value: "1" }, "1+"),
              ),
            ),
            status === "pending"
              ? e(
                  "div",
                  { className: "bulk-actions" },
                  e(
                    "button",
                    {
                      type: "button",
                      className: "review-action approve",
                      disabled: bulkBusy || idsInView.length === 0,
                      onClick: () => bulkModerate("approved", idsInView),
                    },
                    bulkBusy ? "Processando..." : "Aprovar visiveis",
                  ),
                  e(
                    "button",
                    {
                      type: "button",
                      className: "review-action reject",
                      disabled: bulkBusy || idsInView.length === 0,
                      onClick: () => bulkModerate("rejected", idsInView),
                    },
                    bulkBusy ? "Processando..." : "Rejeitar visiveis",
                  ),
                )
              : null,
          ),

          e(
            "section",
            { className: "card list-card" },
            e("h3", null, `Avaliacoes ${statusLabel(status)}`),
            e("p", { className: "muted" }, `${subtitle} Exibindo ${filteredReviews.length} item(ns) apos filtro.`),
            globalError ? e("p", { className: "status-error", role: "alert" }, globalError) : null,
            e(
              "ul",
              { className: "reviews-list" },
              filteredReviews.length === 0
                ? e("li", { className: "empty-state" }, `Nao ha avaliacoes ${statusLabel(status)} para os filtros atuais.`)
                : filteredReviews.map((item) =>
                    e(ReviewItem, {
                      key: item.id,
                      item,
                      status,
                      disabled: isLoading || bulkBusy,
                      onModerate: moderateReview,
                    }),
                  ),
            ),
          ),
        ),
  );
}

const rootNode = document.getElementById("admin-root");
if (rootNode) {
  const root = ReactDOM.createRoot(rootNode);
  root.render(e(App));
}
