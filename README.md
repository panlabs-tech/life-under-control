# Life Under Control

Um cockpit para a vida adulta de um **Lar** — um casal com acesso idêntico aos mesmos dados, operado inteiramente de dentro do portal.

A vida administrativa de dois adultos vive espalhada: a fatura num app, o exame numa gaveta, a revisão do carro na memória de alguém. O LUC reúne isso num só lugar, organizado por **Áreas** (Finanças, Saúde, Carro…), com uma regra simples por trás: **tudo nasce de um ato no portal e vira fato no banco** — nada de uso é planilha ou arquivo versionado. Guardamos os fatos; as interpretações ("atrasado", juros, vencimento esperado) são sempre *derivadas*, nunca colunas.

> Repositório **single-context** e em **pt-BR** (prosa, comentários, copy de UI, commits). O glossário de domínio e as invariantes vivem em [`CONTEXT.md`](CONTEXT.md) — leia antes de trabalho substantivo.

## Como funciona, em uma tela

- O **Painel** abre com todas as Áreas lado a lado — a maioria ainda `em breve`.
- Cada **Área** `ativa` se compõe de **Assuntos** (recortes com modelo próprio) montados sobre um punhado de **primitivos** genéricos — Tarefa, Registro, Métrica, Indicação, Gerador.
- A **Agenda** é uma vista transversal: projeta no tempo toda Tarefa com data e toda ocorrência futura de um Gerador, de qualquer Área, sem materializá-las.

A Área trabalhada a fundo é **Finanças**, no Assunto **Pagamentos Recorrentes**:

- **Conta** — a regra de um pagamento que se repete (condomínio, luz, fatura): guarda periodicidade e vencimento esperado, nunca um valor fixo. Fica `ativa` ou `encerrada`.
- **Lançamento** — o registro de um pagamento efetuado; nasce na quitação, com o valor real do momento, e ganha uma **Competência** (o mês a que se refere, independente de quando foi pago). Todo Lançamento nasce de uma Conta — o LUC não registra gasto avulso.
- **Anexo** — o comprovante do pagamento, guardado em object storage.

## Arquitetura

App único **Next.js 15** (App Router) full-stack, TypeScript, **Postgres via Drizzle**. Sem backend separado — Server Components, Server Actions e Route Handlers falam com o mesmo núcleo.

O desenho é um **núcleo de domínio multi-borda** (hexagonal leve, [ADR-0003](docs/adr/0003-nucleo-dominio-multi-borda.md)): as operações de domínio vivem em **use-cases puros** que dependem de **ports** (interfaces), não de Drizzle/Next/HTTP; os **adapters** concretos implementam os ports. A UI de hoje é só uma borda — amanhã um webhook de WhatsApp ou uma importação chamam os *mesmos* use-cases.

| Camada | Onde | Papel |
| --- | --- | --- |
| Núcleo | `apps/web/src/core` | Domínio, ports e use-cases puros — sem I/O |
| Adapters | `apps/web/src/adapters` | Drizzle/Postgres, object storage, etc. |
| Bordas | `apps/web/src/app` | App Router: Server Components/Actions/Route Handlers |

Autenticação: **Auth.js v5** com login Google e allowlist de exatamente duas Pessoas ([ADR-0004](docs/adr/0004-lockdown-allowlist-oauth-google.md)) — em dev, o login é dispensável (ver abaixo). Comprovantes em **Cloudflare R2** (S3-compatível, [ADR-0008](docs/adr/0008-anexos-object-storage-r2.md); MinIO local no dev). Produção: imagem Docker → GHCR → **Coolify**. Dinheiro é sempre inteiro em centavos (BRL), nunca ponto flutuante.

```
apps/web/
├─ src/
│  ├─ core/              # núcleo puro (sem Next/Drizzle/HTTP)
│  │  ├─ domain/         #   tipos e regras de significado
│  │  ├─ ports/          #   interfaces que o núcleo exige das bordas
│  │  └─ use-cases/      #   operações de domínio (criar Conta, dar baixa…)
│  ├─ adapters/db/       # Drizzle + Postgres (schema e repositórios)
│  └─ app/               # bordas: App Router
├─ drizzle/              # migrações .sql + seed
├─ migrate.mjs           # runner idempotente de migração + seed
└─ Dockerfile            # imagem de produção (standalone, migra no boot)
docker-compose.yml       # stack de dev local (Postgres + MinIO)
```

## Desenvolvimento local

As dependências com estado (Postgres e MinIO) sobem em Docker; o app roda nativo com `next dev` e hot-reload. O login Google é dispensado por `LUC_LOCAL_AUTH_BYPASS=true` — o app entra direto como o Lar semeado (Casa Panini). Runbook completo, com o racional das duas camadas e o hazard do `.env`, em [`docs/agents/local-dev.md`](docs/agents/local-dev.md).

**Pré-requisito:** Docker rodando (`docker ps` responde). Node ≥ 22 e pnpm já instalados.

### Primeira vez (uma vez só)

```bash
pnpm install                            # instala as dependências
pnpm dev:up                             # sobe Postgres + MinIO em background
pnpm --filter @luc/web db:migrate       # cria as tabelas + seed (Casa Panini)
pnpm --filter @luc/web dev              # abre http://localhost:3000
```

Com o bypass ligado você **não faz login** — o app já entra como a Casa Panini (Thiago e Jakeline).

### No dia a dia

```bash
pnpm dev:up                             # 1. sobe o banco (se não estiver no ar)
pnpm --filter @luc/web dev              # 2. sobe o app  → localhost:3000
#    ...trabalha com hot-reload; Ctrl+C encerra o app...
pnpm dev:down                           # 3. desliga o banco no fim (mantém os dados)
```

### Quando mexer no schema do banco

```bash
pnpm --filter @luc/web db:generate      # gera o novo .sql a partir do schema.ts
pnpm --filter @luc/web db:migrate       # aplica no banco local
```

### Zerar o banco

```bash
pnpm dev:reset                          # apaga os volumes (Postgres + MinIO)
pnpm dev:up && pnpm --filter @luc/web db:migrate
```

### (Opcional) Smoke fiel à produção

Builda e roda a **mesma imagem** que vai pro Coolify (migração no boot + servidor `standalone`, `NODE_ENV=production`). Pega a classe de bug que o `next dev` não pega. Como o bypass é impossível em produção por design, este alvo valida build/migração e a superfície pública (`/login`), não a navegação autenticada.

```bash
pnpm dev:smoke                          # docker compose --profile full up --build
# confira http://localhost:3000/login → 200; depois: Ctrl+C && docker compose rm -sf app
```

### Bom saber

- **Console do MinIO** (inspecionar comprovantes): http://localhost:9001 — usuário `lucminio`, senha `lucminio123`.
- **`/painel` deu 500 com `getaddrinfo … hzt3jhiwe…` (ou outro host esquisito)?** Seu shell tem um `DATABASE_URL` de **produção** exportado — de "carregar o `.env`", de um túnel, do jeito que você abre o editor — e o Next **não** deixa o `.env.local` sobrepor variável que já está no ambiente. O `pnpm --filter @luc/web dev` já neutraliza isso (limpa as vars de prod herdadas antes de subir), então o loop diário acima funciona como está. Só esbarra nisso quem roda `next dev` cru: aí faça `unset DATABASE_URL` antes, ou abra um terminal limpo. Confira com `echo $DATABASE_URL` — se aparecer um host que não seja `127.0.0.1`, é isso.
- **Túnel SSH ao Postgres de produção na 5432** colide com o banco local — **derrube o túnel antes do `dev:up`**. A 5432 local pertence ao banco de dev.

## Testes e qualidade

```bash
pnpm --filter @luc/web test             # vitest (use-cases com fakes; sem DB)
pnpm --filter @luc/web typecheck        # tsc --noEmit
node_modules/.bin/biome check apps/web  # lint/format (NÃO use `pnpm exec biome`)
```

Os use-cases testam com **fakes dos ports** (sem banco) e um `Clock` port no lugar do relógio real. Os testes de adapter (`*.drizzle.test.ts`) rodam contra um Postgres real — no CI, um serviço `postgres:16-alpine`; localmente, quando a stack de dev está no ar (`pnpm dev:up`). O gate `pr-checks` roda biome + typecheck + vitest e abre o PR para a `main` no verde.

## Fonte da verdade

- [`CONTEXT.md`](CONTEXT.md) — glossário de domínio (pt-BR) e as invariantes. Código que viola invariante é bug.
- [`docs/adr/`](docs/adr/README.md) — as decisões de arquitetura e seus porquês.
- [`docs/design/`](docs/design/README.md) — o sistema visual (tokens, componentes, casca, vocabulário).
- [`CLAUDE.md`](CLAUDE.md) — como o repositório é operado, inclusive por agentes.

## Convenções

Termo de domínio em pt-BR, **identificador de código em inglês** (mapa no glossário). **Conventional Commits** com subject minúsculo. Markdown **sem hard-wrap**: uma linha por parágrafo. Detalhes em [`CLAUDE.md`](CLAUDE.md).
