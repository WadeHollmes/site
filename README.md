# Loja Galeria Minimalista + Notion

Site de loja com visual simples (estilo galeria), selecao multipla de itens e finalizacao via WhatsApp com mensagem personalizada.

Agora os produtos podem vir de um banco no Notion, usando API no backend para manter a chave segura.

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
- `WHATSAPP_LOJA`: numero WhatsApp da loja com DDI e DDD (ex: 5511999999999).
- `PORT`: porta local (padrao `3000`).

No banco do Notion, use propriedades com estes nomes (ou variacoes ja mapeadas):

- `Name` (title)
- `Price` (number)
- `Description` (rich_text)
- `Image` (files ou url)
- `Active` (checkbox)

Se Notion nao estiver configurado, o site usa produtos locais de fallback automaticamente.

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
	- `PRODUCTS_CACHE_TTL_MS`
	- `WHATSAPP_LOJA`
	- `PORT`
4. Inicie com `npm start` (ou via PM2).
5. Aponte o dominio para a porta da aplicacao com proxy reverso (Nginx/Apache).

Melhorias de producao ja aplicadas no projeto:

- Cache curto de produtos para reduzir chamadas no Notion.
- Timeout de requisicao para evitar travar a pagina quando a API externa estiver lenta.
- Headers basicos de seguranca no servidor HTTP.