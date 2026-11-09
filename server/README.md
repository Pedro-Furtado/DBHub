# DBHub — server

API em **Fastify + TypeScript** que guarda as conexões (criptografadas) num Postgres próprio e executa as operações nos bancos externos.

## Rodando em dev

```bash
cp .env.example .env     # preencha DATABASE_URL, ENCRYPTION_KEY, SESSION_SECRET, ADMIN_*
npm install
npm run dev              # http://localhost:3333 — migrations rodam sozinhas no boot
```

Gerar as chaves:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"   # ENCRYPTION_KEY
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"      # SESSION_SECRET
```

Na raiz, rode o front com `npm run dev` (o Vite faz proxy de `/api` para cá).

## Estrutura

```
server/
├── drizzle/               # migrations SQL geradas (versionadas no git)
└── src/
    ├── index.ts           # boot: migrations → admin → listen → shutdown gracioso
    ├── app.ts             # monta o Fastify (plugins + rotas)
    ├── config/env.ts      # variáveis validadas com Zod (falha cedo se faltar algo)
    ├── db/                # Drizzle: client, schema, migrate
    ├── lib/               # logger, crypto (AES-256-GCM, scrypt), erros
    ├── plugins/           # segurança, auth, error handler, log de acesso, static (front)
    └── modules/
        ├── auth/          # login, logout, me (sessão em cookie httpOnly)
        ├── connections/   # CRUD de conexões + teste da URL
        ├── database/      # pools externos, introspecção, linhas, SQL
        ├── saved-queries/
        └── health/
```

Cada módulo segue **routes → service → repository**: a rota só valida (Zod) e responde, o service tem a regra, o repository fala com o banco.

## Logs

- **Dev:** legível e colorido — `[08/11/2026 11:55:03.482] INFO: [http] GET /api/connections 200 - 12ms`
- **Produção:** uma linha JSON por evento, com `level` (`DEBUG`/`INFO`/`WARN`/`ERROR`/`FATAL`), `time` em ISO com fuso (`2026-11-08T11:55:03.482-03:00`), `message`, `module`, `reqId` e contexto. O Railway colore e filtra por `@level:error`, `@module:database`, `@reqId:…`.
- Status 2xx/3xx → INFO, 4xx → WARN, 5xx → ERROR (com stack).
- Senhas, URLs de conexão e cookies são mascarados (`[REDACTED]`). O SQL completo só aparece com `LOG_LEVEL=debug`.

## Segurança

- Connection strings criptografadas com AES-256-GCM; nunca voltam para o front.
- Sessão: token aleatório em cookie `httpOnly`/assinado; no banco fica só o SHA-256.
- Senha com scrypt; rate limit global e mais rígido no login.
- Bancos externos: `statement_timeout`, limite de linhas, pool fechado quando ocioso.
- Conexões **somente leitura**: sessão com `default_transaction_read_only`, tudo dentro de `BEGIN READ ONLY` e bloqueio de comandos que tentam sair desse modo. Para proteção total em produção, use também um usuário do Postgres só com permissão de leitura.

## Endpoints

| Método | Rota | |
|---|---|---|
| GET | `/api/health` | healthcheck |
| POST | `/api/auth/login` · `/api/auth/logout` | sessão |
| GET | `/api/auth/me` | usuário logado |
| GET/POST | `/api/connections` | listar / criar |
| POST | `/api/connections/test` | testar URL sem salvar |
| GET/PATCH/DELETE | `/api/connections/:id` | detalhe / editar / remover |
| POST | `/api/connections/:id/refresh` | revalidar status e métricas |
| GET | `/api/c/:id/tables` | tabelas e views |
| GET | `/api/c/:id/tables/:schema/:table/columns` | colunas, PK, FK |
| GET/POST/PATCH/DELETE | `/api/c/:id/tables/:schema/:table/rows` | ler (paginado) / inserir / editar / excluir |
| POST | `/api/c/:id/query` | executar SQL |
| GET | `/api/c/:id/history` | histórico de queries |
| GET/POST/PATCH/DELETE | `/api/c/:id/saved-queries[/:queryId]` | queries salvas |

Erros sempre no formato `{ statusCode, code, message, details?, reqId }`.
