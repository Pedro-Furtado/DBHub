# DBHub

Painel estilo Supabase Studio para gerenciar qualquer banco PostgreSQL: cole a connection string e navegue pelas tabelas, edite dados e rode SQL.

## Rodando em dev

```bash
npm install && npm install --prefix server
cp server/.env.example server/.env   # preencha as variáveis (ver server/README.md)

npm run dev:server   # API em http://localhost:3333
npm run dev          # front em http://localhost:5173 (proxy de /api → 3333)
```

Para rodar só o front com dados de exemplo: `VITE_USE_MOCKS=true` no `.env` da raiz.

## Deploy no Railway

Um serviço só: o server entrega a API em `/api` e o front buildado nas demais rotas.

1. No projeto do Railway, adicione um **PostgreSQL** (banco interno do DBHub).
2. Crie um serviço a partir do repositório — o `railway.json` já define build, start e healthcheck.
3. Variáveis do serviço:
   - `NODE_ENV=production`
   - `DATABASE_URL=${{Postgres.DATABASE_URL}}` (rede privada do Railway)
   - `ENCRYPTION_KEY`, `SESSION_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`
   - opcional: `TZ=America/Araguaina`, `LOG_LEVEL=info`
4. Gere um domínio público para o serviço.

> Guarde a `ENCRYPTION_KEY` em lugar seguro: sem ela as conexões salvas não podem ser lidas.

## Estrutura

```
src/
├── app/                 # bootstrap: App, providers globais, rotas (lazy)
├── components/
│   ├── ui/              # design system (estilo shadcn): button, input, select, dialog…
│   ├── layout/          # AppShell, NavRail, TopBar, ConnectionSwitcher
│   ├── shared/          # PageHeader, EmptyState, ConfirmDialog, Logo
│   └── data-grid/       # grid reutilizável (Table Editor + resultado do SQL)
├── features/            # cada domínio com api/, hooks/, components/, pages/
│   ├── auth/
│   ├── connections/
│   ├── database/        # api + hooks de schema, linhas e queries
│   ├── overview/
│   ├── table-editor/
│   └── sql-editor/
├── hooks/               # hooks genéricos
├── lib/                 # api-client, query-client, env, utils (cn, format…)
├── mocks/               # dados de exemplo
├── pages/               # páginas soltas (404, settings)
├── styles/globals.css   # Tailwind v4 + tokens de tema
└── types/               # tipos de domínio compartilhados
```

### Regras da arquitetura

- **Componentes `ui/`** não conhecem regra de negócio — só recebem props.
- **Features** não importam umas das outras, exceto componentes públicos simples (ex.: `EnvironmentBadge`).
- **Toda chamada HTTP** passa por `lib/api-client.ts`; cada feature tem seu `api/` com versão mock e real.
- **Cache e estado de servidor** ficam no TanStack Query (chaves centralizadas em cada `hooks/`).
- **Páginas são lazy** (`app/router.tsx`): cada uma vira um chunk separado.

### Adicionar componentes shadcn

O `components.json` já está configurado, então dá para usar a CLI:

```bash
npx shadcn@latest add checkbox popover
```
