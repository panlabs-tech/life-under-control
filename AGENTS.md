# life-under-control

> Repositório em **pt-BR** (prosa, comentários, copy de UI, commits). Exceção: todo artefato de código do `apps/api` é em inglês ([ADR-0016](docs/adr/0016-ingles-codigo-apps-api.md)).

**Life Under Control (LUC)** — organizador da vida adulta de um **Lar** (um casal com acesso idêntico aos mesmos dados). Um cockpit com as Áreas da vida (Finanças, Saúde, Carro…), operado inteiramente de dentro do portal. Faseamento por Áreas ([ADR-0006](docs/adr/0006-faseamento-por-areas.md)).

Este arquivo é a **fonte-da-verdade da orientação de agente** deste repo. O arquivo do agente primário (`CLAUDE.md`) o referencia em vez de duplicá-lo: duas cópias da mesma orientação fazem a segunda virar fóssil.

## Autonomia (regra de ouro)

**Você opera com autonomia total sobre tudo que é escopo do projeto** — implementar, deploy/redeploy, env, gerar segredo que a máquina gera, migration aditiva, criar/dropar recurso próprio no Coolify e **mergear PR verde**. É a norma; faça sozinho, sem reafirmar autonomia a cada vez.

**Pare e chame o operador em exatamente 4 casos** — se a operação (1) **te trancaria pra fora** (root/painel, credencial de acesso, firewall, ou rotacionar o token do próprio MCP); (2) **recriaria o substrato** (destruir/recriar a VM); (3) **exige segredo de terceiro** que você não tem como ser (`client_secret` do OAuth Google, API key paga); ou (4) **tocaria outro projeto** no Coolify compartilhado (disciplina de alvo). **Na dúvida sobre cair num dos quatro, pare. Fora deles, faça.**

**Cláusula de dado:** o LUC guarda dado real e irreplicável do casal. Destruir dado de produção (dropar/wipe do Postgres com dados, down-migration destrutiva em prod) **pausa** — não por reversibilidade, mas porque o operador não recupera. Relaxa quando houver backup automatizado. Porquê e premissa em [ADR-0007](docs/adr/0007-autonomia-total-do-agente.md).

## Modo de implementação autônoma

Disparado por "implementa as issues" (ou equivalente): colete as issues `status:ready-for-agent` abertas (sem `status:blocked`) da Área corrente → um **git worktree por issue** → skill /tdd (RED→GREEN→refactor) → commit + push (Conventional Commits) → a esteira `pr-checks` abre o PR → **conferência de pixel** quando a issue referencia protótipo (gate verde não prova fidelidade — passos em [`docs/agents/workflow.md`](docs/agents/workflow.md)) → **mergeie no verde** → encadeie até as issues acabarem, **parando só se o operador pedir** (ex.: compactar contexto). Fluxo completo em [`docs/agents/workflow.md`](docs/agents/workflow.md).

## Fonte-da-verdade — leia antes de trabalho substantivo

1. **`CONTEXT.md`** — glossário de domínio + invariantes (núcleo estável) e o catálogo de primitivos (fronteira provisória). Código que viola invariante é bug.
2. **`docs/adr/`** ([índice](docs/adr/README.md)) — decisões e seus porquês. Não leia todos os ADRs, apenas saiba o que existe.

O sistema visual oficial do LUC está em [`docs/design/`](docs/design/README.md). Esse contrato vivo governa tokens, tipografia, componentes, casca, estados e vocabulário; os protótipos do Claude Design são sua origem visual, não uma dependência de execução do repo. Como consumi-lo ao implementar interface: [`docs/agents/design.md`](docs/agents/design.md).

## Convenções (não negociáveis)

- Termo de domínio em pt-BR; **identificador de código em inglês** (mapa no glossário do `CONTEXT.md`). Respeite os termos proibidos lá listados. No `apps/api`, o inglês cobre **todo** o código — docstrings, comentários, nomes de teste, mensagens de exceção ([ADR-0016](docs/adr/0016-ingles-codigo-apps-api.md)); copy de produto emitida pela borda (ex.: mensagens do bot WhatsApp) permanece pt-BR.
- **Markdown sem hard-wrap:** uma linha por parágrafo (quebra só *entre* parágrafos) — não corte frases em ~80 colunas; o soft-wrap é do editor. Quebra de linha só onde tem semântica: item de lista, linha de tabela, bloco de código. Vale pra todo `.md`, inclusive o escrito por agente.
- **Conventional Commits**, subject minúsculo. Não é só convenção escrita: o `commit-msg` de [`lefthook.yml`](lefthook.yml) roda `commitlint` contra [`commitlint.config.mjs`](commitlint.config.mjs).
- **Prompts:** quando o dono pedir "um prompt", salve em `prompts/` (nunca no scratchpad), nome `YYYYMMDDHHMMSS_slug-kebab-ptBR.md` — timestamp via `date +%Y%m%d%H%M%S`, slug curto em pt-BR; corpo em pt-BR começando por `# Título`, sem frontmatter. Diretório é local (gitignored).
- **Biome pelo binário direto** (`node_modules/.bin/biome`), nunca `pnpm exec biome`: aquele sai verde sem ter verificado nada quando o filtro não casa. Falso-verde num portão é pior que portão nenhum.

## Equipamento de agente

**Skill, subagente, comando, hook portável, lista de permissões e barra de status são equipamento da máquina, e moram num lugar só: o global.** A cláusula operante é **zero redundância** — a cópia global é a única, e este repo não versiona nenhum deles. Skill autoral da org mora em [`panlabs-tech/skills`](https://github.com/panlabs-tech/skills), instalada pela CLI de distribuição; promover copiando arquivo deixaria a cópia global sem upstream de onde atualizar.

O que este repo **versiona** é o **arquivo marcador** que declara adesão a um mecanismo global: `.claude/context-economy-protocol.md`. Marcador é declaração; a lógica que ele aciona continua fora. Sem o marcador, o hook global é inerte.

O padrão inteiro está em [`panlabs-tech/.github`](https://github.com/panlabs-tech/.github) (`docs/maquina.md` e `ANATOMY.md`).

## Arquitetura

App **Next.js 15** (App Router) full-stack, TypeScript, **Postgres via Drizzle**, **Vitest** + **Biome**. **Em migração para split** ([ADR-0014](docs/adr/0014-backend-python-fastapi.md), que supersede o [ADR-0001](docs/adr/0001-app-unico-next-fullstack.md)): o `apps/api` — **Python/FastAPI/uv** — é dono do domínio, adapters e bordas de servidor; o Next vira borda de UI/BFF. Durante a migração vale o **hard-freeze do backend TS** (bugfix sim, feature nova não; UI livre). Todo dado nasce de um ato no portal e vive no banco; nada de uso é versionado em git.

- `apps/web/` — o app (Server Components / Server Actions / Route Handlers). O layout de pastas do núcleo firma no primeiro código ([ADR-0003](docs/adr/0003-nucleo-dominio-multi-borda.md)).
- `apps/api/` — o backend Python.

## Padrões de domínio (núcleo multi-borda — ADR-0003)

Ao tocar a lógica do LUC, considere:

- **Núcleo isolado das bordas.** Operações de domínio (criar Conta, dar baixa num pagamento, projetar a Agenda) vivem em **use-cases** puros que dependem de **ports** (interfaces), não de Drizzle/Next/HTTP. Adapters concretos implementam os ports.
- **Borda fina.** UI (Server Actions/Components) hoje; amanhã webhook de WhatsApp, OCR, importação — toda borda chama os **mesmos** use-cases. Borda nunca fala com o store direto; fala com use-case.
- **Primitivos descritivos, não schema fechado** ([ADR-0005](docs/adr/0005-primitivos-descritivos-spine-especializacao.md)). Tarefa/Registro/Métrica/Indicação/Gerador são spines genéricos; cada Área os especializa (Lançamento é-um Registro; Conta é o Gerador de Finanças). O catálogo cresce por Área — não crave ontologia universal a partir de uma Área só.
- **Persistir fatos, derivar interpretações** (CONTEXT.md). "Atrasado", juros, vencimento esperado são calculados, nunca colunas.
- **Dinheiro** = inteiro em centavos, BRL; nunca ponto flutuante (CONTEXT.md #6). No `apps/api`: funções puras sobre `int`, sem VO `Money` ([ADR-0015](docs/adr/0015-forma-dominio-python-tipos-nativos.md)).
- **Datas civis** no `apps/api` = `datetime.date` no domínio (validação vira parse na borda); Competência = `str` `"YYYY-MM"` ([ADR-0015](docs/adr/0015-forma-dominio-python-tipos-nativos.md)). Regra geral de forma: tipo nativo semântico quando existe; primitivo quando a representação é contrato de ponta a ponta; VO próprio (`dataclass frozen`) só para conceito composto com comportamento, no contexto.
- **Estrutura Python por conceito de domínio, nunca por tipo DDD** (sem `entities/`/`value_objects/`): módulo por conceito; subpacote só quando um Assunto/agregado coeso emergir; módulos por papel (`errors.py`, `events.py`) ok; ports em `application/`; `shared/` é kernel mínimo (entra só o que 2+ contextos usam); `__all__` + façade + docstring-mapa nos `__init__.py`; sem base classes de DDD.
- **Testes:** use-case com fakes dos ports (sem DB); `Clock`/`FixedClock` no lugar do relógio real (nunca freezegun). Nome `test_<scenario>_<expected>` carrega o cenário (inglês no `apps/api`; no web segue `test_<cenário>_<esperado>` pt-BR); corpo AAA separado por linha em branco; comentários `# given`/`# when`/`# then` só onde há montagem real (use-case/adapter). No porte do oráculo TS: um teste por caso, ordem preservada (`parametrize` só em teste novo). `tests/` espelha `src/` com `__init__.py` por nível.

Porquê: [ADR-0003](docs/adr/0003-nucleo-dominio-multi-borda.md) e [ADR-0005](docs/adr/0005-primitivos-descritivos-spine-especializacao.md).

## Comandos

```bash
# Web (da raiz) — Next.js / TypeScript.
pnpm --filter @luc/web dev                 # :3000
pnpm --filter @luc/web typecheck
pnpm --filter @luc/web test                # vitest
node_modules/.bin/biome check apps/web     # NÃO use `pnpm exec biome` (falso-verde)

# API (de apps/api) — backend Python 3.14 / FastAPI / uv (ADR-0014).
uv sync                                    # instala deps (inclui dev)
uv run uvicorn luc_api.main:app --reload   # :8000
uv run pytest                              # pytest-asyncio
uv run ruff format --check . && uv run ruff check .
uv run pyright                             # tipos (strict)
uv run lint-imports                        # fronteiras (import-linter)

# Execução local (Docker) — dependências em container, app nativo. Ver docs/agents/local-dev.md.
pnpm dev:up                                # Postgres :5432 + MinIO :9000
pnpm --filter @luc/web db:migrate          # migra + semeia o Postgres local
pnpm dev:smoke                             # smoke fiel à prod (imagem do Dockerfile)

# Portão local (equipamento da máquina, não dependência do repo).
lefthook install                           # instala os hooks num clone novo
```

## Os três portões

| | onde | o que roda |
| --- | --- | --- |
| **1. local** | [`lefthook.yml`](lefthook.yml) | `ruff` no `apps/api`, `biome` no `apps/web`, `gitleaks` no staged, `commitlint` na mensagem |
| **2. CI** | [`.github/workflows/pr-checks.yml`](.github/workflows/pr-checks.yml) | as pernas `checks-node` e `checks-python`, agregadas pelo rollup `checks`, mais `security` |
| **3. deploy** | [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) | build dos apps → GHCR → redeploy Coolify → smoke |

O portão 1 pega barato o erro barato; o **portão 2 é o gate real**. `main` é protegida → o `pr-checks` abre o PR no verde e o agente mergeia sozinho (merge autônomo — [ADR-0007](docs/adr/0007-autonomia-total-do-agente.md)).

`checks` e `security` são os dois **required checks de nome fixo** da org inteira, publicados por todo repo consumidor da CI compartilhada de `panlabs-tech/.github`, não importa quantas superfícies ele tenha por baixo.

## Agent skills

Config que as skills de engenharia assumem por repo — detalhe em [`docs/agents/`](docs/agents/).

### Fluxo de desenvolvimento

Default grill → `/to-tickets` → `/tdd` + **Modo de implementação autônoma** em [`docs/agents/workflow.md`](docs/agents/workflow.md).

### Issue tracker

Issues e PRDs vivem no GitHub Issues (`panlabs-tech/life-under-control`, via `gh`); PRs externos **não** entram na triagem. Ver [`docs/agents/issue-tracker.md`](docs/agents/issue-tracker.md).

### Triage labels

Cinco papéis de triagem no namespace `status:` — `status:needs-triage` / `needs-info` / `ready-for-agent` / `hitl` (= ready-for-human) / `wontfix`. Família ortogonal `needs:` sinaliza pré-requisito de execução — `needs:mcp` quando a implementação executa um MCP de infra (Coolify/Cloudflare/Hostinger). Ver [`docs/agents/triage-labels.md`](docs/agents/triage-labels.md).

### Domain docs

Single-context: `CONTEXT.md` (glossário pt-BR + invariantes) + `docs/adr/` na raiz. Ver [`docs/agents/domain.md`](docs/agents/domain.md).

### Design

O contrato vivo da interface e como consumi-lo ao implementar tela: [`docs/agents/design.md`](docs/agents/design.md).

### MCPs

Quais servidores MCP este repo declara, o que cada um alcança e o que preencher antes de usá-los: [`docs/agents/mcps.md`](docs/agents/mcps.md).

### Execução local

Como subir as dependências com estado e rodar o app: [`docs/agents/local-dev.md`](docs/agents/local-dev.md).
