# Loja Galeria + Notion + SQLite

Site de loja com visual estilo vitrine, selecao multipla de itens e finalizacao via WhatsApp com mensagem personalizada.

Agora os produtos sao sincronizados do Notion para SQLite local, melhorando desempenho e permitindo recursos de produto detalhado e avaliacoes com moderacao.

## Rodando o projeto

1. Tenha Node.js 18+.
2. Execute `npm install`.
3. Copie `.env.example` para `.env` e preencha as variaveis.
4. Execute `npm run dev`.
5. Abra `http://localhost:3000`.

Observacao: a aplicacao usa Express com entrypoint em `app.js` para melhor compatibilidade em ambientes Node gerenciados.

## Configuracao do Notion

Variaveis no `.env`:

- `NOTION_API_KEY`: token de integracao interna do Notion.
- `NOTION_DATABASE_ID`: id do database de produtos.
- `NOTION_VERSION`: versao da API (padrao `2025-09-03`).
- `PRODUCTS_SYNC_INTERVAL_MS`: intervalo de sincronizacao Notion -> SQLite (padrao `300000`).
- `ADMIN_REVIEW_KEY`: chave para endpoints de moderacao de avaliacao.
- `ENABLE_DEBUG_ENDPOINT`: opcional, habilita `/api/debug` quando `true` (recomendado manter `false` em producao).
- `WHATSAPP_LOJA`: numero WhatsApp da loja com DDI e DDD (ex: 5511999999999).
- `PORT`: porta local (padrao `3000`).

No banco do Notion, use propriedades com estes nomes (ou variacoes ja mapeadas):

- `Name` (title)
- `Price` (number)
- `Description` (rich_text)
- `Image` (files ou url)
- `Active` (checkbox)
- `StockStatus` (status/select)
- `StockQty` (number)
- `Variants` (multi_select ou rich_text separado por virgula)

Se Notion nao estiver configurado, o site usa produtos locais de fallback automaticamente.

### Como configurar no Notion (passo a passo)

1. Abra o seu database de produtos no Notion.
2. Crie/garanta as propriedades obrigatorias:
	- `Name` (Title)
	- `Price` (Number)
	- `Description` (Text)
	- `Image` (Files & media ou URL)
	- `Active` (Checkbox)
3. Crie propriedades de estoque:
	- `StockStatus` (Status ou Select) com valores sugeridos: `in_stock`, `low_stock`, `out_of_stock`, `pre_order`.
	- `StockQty` (Number), opcional. Se for `0`, a API marca automaticamente como sem estoque (exceto quando `StockStatus=pre_order`).
4. Crie propriedade de variacoes:
	- `Variants` (Multi-select recomendado).
	- Alternativa: `Rich text` com valores separados por virgula (ex.: `Rosa, Azul, Bege`).
5. Compartilhe o database com a integracao usada no `NOTION_API_KEY`.
6. Rode sincronizacao manual no painel admin (`POST /api/admin/sync`) para refletir campos novos imediatamente.

Observacao sobre banco local: a aplicacao aplica migracoes automaticamente no SQLite ao subir. Nao e necessario criar scripts manuais para as colunas novas de estoque/variacoes.

## Novos recursos

- Home estilo loja com cards enxutos (nome + preco + botao "Ver detalhes")
- Modal de produto com descricao completa
- Galeria com multiplas fotos do produto
- Variações no modal (ex.: cor/tamanho/acabamento)
- Status de estoque (disponivel, ultimas unidades, sem estoque, sob encomenda)
- Envio de avaliacao do cliente (fica pendente)
- Moderacao de avaliacao por admin
- Painel grafico de aprovacao em `/admin` com login por chave
- Carrinho persistente no navegador (nome/observacoes/itens)
- Checkout com subtotal por linha e acao de limpar carrinho

## Endpoints principais

- `GET /api/products`: lista de produtos vinda do SQLite
- `GET /api/products/:slug`: detalhe do produto + fotos + avaliacoes aprovadas
- `POST /api/reviews`: cria avaliacao pendente
- `GET /api/admin/reviews?status=pending` (header `x-admin-key`)
- `PATCH /api/admin/reviews/:id` com body `{ "status": "approved" | "rejected" }` (header `x-admin-key`)
- `POST /api/admin/sync` para forcar sincronizacao com Notion (header `x-admin-key`)

Observacoes de seguranca:

- Rotas de avaliacao e admin possuem limitacao de taxa (rate limit) para reduzir spam e brute force.
- `GET /api/debug` exige header `x-admin-key` e so fica disponivel quando `ENABLE_DEBUG_ENDPOINT=true`.
- Sincronizacao Notion usa paginacao e reconciliacao: produtos removidos da origem sao desativados localmente.

## Personalizacao rapida

- Numero da loja: configure a variavel `WHATSAPP_LOJA` no `.env` (formato: DDI + DDD + numero, ex: 5511999999999).
- Produtos fallback: edite `fallbackProducts` em `script.js`.
- Visual: ajuste cores e espacamentos em `styles.css` (variaveis em `:root`).

## Deploy na Hostinger

Use hospedagem com suporte a Node.js (normalmente VPS ou plano com Node habilitado).

1. Suba o projeto para o servidor.
2. Execute `npm install`.
3. Configure variaveis de ambiente no painel/servidor:
	- `NOTION_API_KEY`
	- `NOTION_DATABASE_ID`
	- `NOTION_VERSION`
	- `NOTION_TIMEOUT_MS`
	- `PRODUCTS_SYNC_INTERVAL_MS`
	- `ADMIN_REVIEW_KEY`
	- `ENABLE_NOTION_DIAGNOSTICS` (opcional, `true` para habilitar `/api/test-notion`)
	- `ENABLE_DEBUG_ENDPOINT` (opcional, `true` para habilitar `/api/debug`, protegido por `x-admin-key`)
	- `WHATSAPP_LOJA`
	- `PORT`
4. Inicie com `npm start` (ou via PM2).
5. Aponte o dominio para a porta da aplicacao com proxy reverso (Nginx/Apache).

Melhorias de producao ja aplicadas no projeto:

- Cache curto de produtos para reduzir chamadas no Notion.
- Timeout de requisicao para evitar travar a pagina quando a API externa estiver lenta.
- Headers basicos de seguranca no servidor HTTP.
- Sincronizacao de produtos com paginacao completa e reconciliacao de itens removidos.
- Campos de estoque e variacoes sincronizados de forma retrocompativel.
