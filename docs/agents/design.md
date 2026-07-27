# Design

Como um agente consome o sistema de design deste repo ao implementar ou revisar interface.

O documento existe porque este repo **tem interface declarada em manifesto Node** (`next`/`react` em `apps/web/package.json`). Onde há interface, há decisão visual, e decisão visual que só vive num protótipo externo não sobrevive à primeira sessão que não o abriu.

## Onde o design mora

O contrato vivo e oficial é [`docs/design/`](../design/README.md), versionado neste repo. Ele transcreve a opção visual de codinome interno **Mirante** -- codinome que rastreia a origem e **nunca** aparece na UI nem em copy; a marca apresentada às Pessoas é **Life Under Control** ou **LUC**.

| assunto | arquivo |
| --- | --- |
| tokens, tipografia, escala, cor | [`fundamentos.md`](../design/fundamentos.md) |
| catálogo de componentes | [`componentes.md`](../design/componentes.md) |
| casca, navegação, login | [`casca.md`](../design/casca.md) |
| vocabulário da interface | [`vocabulario.md`](../design/vocabulario.md) |
| gaps priorizados | [`gaps-front-end.md`](../design/gaps-front-end.md) |

A **origem visual** é o projeto Claude Design `e38da83f-221e-4f00-844f-fe0657868f93` (`Mirante - Design System.dc.html` para invariantes e componentes; `Mirante.dc.html` para composição das telas). Ela é origem, não dependência de execução: o repo compila e roda sem ela.

## A precedência, e ela não é negociável

1. **`docs/design/` governa toda implementação versionada.** É o contrato.
2. **A origem visual governa composição** -- layout, medidas, cores, formas.
3. **`CONTEXT.md` e os ADRs governam significado e escopo.** O design decide a pele; **não** ativa uma Área nem cria domínio por conta própria.
4. **`apps/web/src/styles/tokens.css` espelha exatamente o bloco `:root` da origem visual.** Exemplo isolado que divergir dele não altera token.
5. **Tela existente que não aparece no protótipo** usa os componentes e fundamentos do contrato, sem alterar função. Decisão derivada fica registrada em `docs/design/`.

O conflito que mais aparece é composição × vocabulário: o protótipo diz uma coisa, o glossário diz outra. Ele **não se resolve sozinho** -- vira achado para o operador. Ver `docs/agents/workflow.md`.

## Princípios invariantes

Eles governam decisão de tela mesmo onde o protótipo é omisso:

- **Guardar fatos, derivar leituras.** "Atrasado", pontualidade, total do mês e estados de Conta são calculados na leitura, nunca persistidos como interpretação.
- **Acesso simétrico.** As duas Pessoas do Lar veem os mesmos dados. Autoria é nota discreta, nunca permissão.
- **`em breve` é honesto.** Área inativa aparece sem métrica, sem funcionalidade falsa e sem prazo inventado.
- **Números são instrumentos.** Seção operacional abre por métrica e tendência quando há dado. Dinheiro, data e percentual usam a fonte monoespaçada.
- **Cor comunica estado ou profundidade.** Sem gradiente decorativo. Ciano identifica ação, navegação ativa e leitura; verde resolve; âmbar pede atenção.
- **Escopo vigente.** Finanças é a única Área ativa ([ADR-0006](../adr/0006-faseamento-por-areas.md)).

## Antes de mergear tela

**Gate verde não prova fidelidade**: o jsdom não renderiza layout, overflow nem cor, então a suíte passa com o pixel errado. A conferência de pixel é obrigatória quando a issue referencia protótipo, e os três passos (resolver o `sc-if`, comparar com o glossário, olhar o pixel) estão em [`workflow.md`](workflow.md#conferência-de-pixel-obrigatória-quando-a-issue-referencia-protótipo) -- não os duplique aqui.

A forma dos critérios de aceite de uma issue de UI, separados por autoridade (composição / vocabulário / verificação visual), também vive lá.

## Se `docs/design/` não existir

**Siga em silêncio.** Não sinalize a ausência nem proponha criar o contrato de antemão -- a mesma regra de [`domain.md`](domain.md). Ele se cria quando uma decisão visual de fato se resolve.
