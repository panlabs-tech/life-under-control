# Sistema de design do LUC

Este diretório é o contrato vivo e oficial da interface do Life Under Control. Ele transcreve a opção visual de codinome interno **Mirante**; esse codinome serve apenas para rastrear a origem do design e nunca aparece na UI ou em copy. A marca apresentada às Pessoas é **Life Under Control** ou **LUC**.

## Autoridade e precedência

1. Este contrato governa toda implementação versionada no repo.
2. A origem visual é o projeto Claude Design `e38da83f-221e-4f00-844f-fe0657868f93`, em especial `Mirante - Design System.dc.html` para invariantes e componentes e `Mirante.dc.html` para composição das telas.
3. `CONTEXT.md` e os ADRs governam significado e escopo. O design decide a pele; não ativa uma Área nem cria domínio por conta própria.
4. `apps/web/src/styles/tokens.css` deve espelhar exatamente o bloco `:root` da origem visual. Exemplos isolados que divergirem dele não alteram tokens.
5. Quando uma tela existente não aparece no protótipo, usam-se os componentes e fundamentos deste contrato sem alterar sua função. Decisões derivadas ficam registradas aqui.

## Princípios invariantes

- **Guardar fatos, derivar leituras.** “Atrasado”, pontualidade, total do mês e estados de Conta são calculados na leitura, nunca persistidos como interpretação.
- **Acesso simétrico.** Thiago e Jakeline veem os mesmos dados. Autoria é uma nota discreta, nunca permissão.
- **`em breve` é honesto.** Áreas inativas aparecem sem métrica, funcionalidade falsa ou prazo inventado.
- **Números são instrumentos.** Toda seção operacional abre por métricas e tendência quando há dados. Dinheiro, datas e percentuais usam a fonte monoespaçada.
- **Cor comunica estado ou profundidade.** Não há gradiente decorativo. Ciano identifica ação, navegação ativa e leitura; verde resolve; âmbar pede atenção.
- **Escopo vigente.** Finanças é a única Área ativa. Saúde, Gastronomia, Imóvel, Supermercado e Carro permanecem `em breve`, conforme ADR-0006.

## Contrato por assunto

- [Fundamentos e tokens](fundamentos.md)
- [Catálogo de componentes](componentes.md)
- [Casca, navegação e login](casca.md)
- [Vocabulário da interface](vocabulario.md)
- [Relatório priorizado de gaps](gaps-front-end.md)

## Decisões derivadas do operador

Em 01/07/2026, o operador confirmou:

- o protótipo não amplia o roadmap: apenas Finanças permanece ativa;
- formulários e telas de detalhe preservam sua estrutura funcional e recebem a linguagem visual mais próxima deste contrato;
- hover, focus, active e disabled podem ser derivados das variantes existentes, com acessibilidade e sem criar uma segunda paleta;
- a casca responsiva existente pode ser preservada onde o protótipo desktop é silente, usando a mesma hierarquia e os mesmos tokens da navegação desktop.

## Decisões derivadas da rodada de fidelidade (04/07/2026 — issue #103)

Registradas pelo agente sob o mandato de autonomia; **avaliáveis pelo operador a posteriori** (não são gate). Cada uma reconcilia uma divergência protótipo × contrato encontrada na auditoria do PRD #92:

- **Título de página segue 25px** ([Fundamentos](fundamentos.md)); o 26px do protótipo Final é drift de origem. A implementação (`PageHeader`) já está em 25px.
- **Raio 8px é degrau literal** dos chips de ícone 28–36px (Final), sem token novo — a origem não o define no `:root` ([Fundamentos](fundamentos.md)).
- **Estados de Conta/ocorrência no feminino** (`vencida`, nunca `vencido`) e **termos de domínio capitalizados** mesmo quando o protótipo escreve "contas" — copy segue o glossário ([Vocabulário](vocabulario.md)).
- **Card `pago` atenuado** (opacidade .62) recupera contraste no hover e nunca depende só da atenuação ([Componentes](componentes.md)); se a legibilidade em repouso incomodar em tela real, o ajuste é do operador.
- **Modal compacto (`narrow`)** entrou no catálogo como componente oficial ([Componentes](componentes.md)); a grade de ícones fica sempre visível mesmo com logo — o mock não dita comportamento.
- Pendente de ato do operador (fora do repo): corrigir na origem do Claude Design o gênero `vencido`, o "contas" minúsculo e — se preferir — o 26px do título.

## Ambiguidades registradas

- A amostra visual de borda descreve `rgba(255,255,255,.06)`, enquanto o `:root` entregue define `--luc-border: rgba(255,255,255,.07)`. Vale o `:root`; `.06` permanece reservado a divisórias de baixa ênfase presentes no protótipo, sem token novo.
- A escala tipográfica mostra “Título de bloco · 13px” no metadado, mas renderiza 14px; “Rótulo · 11px” renderiza 12px. Até a origem ser corrigida, o metadado define o papel semântico e as telas de referência definem o tamanho contextual, conforme [Fundamentos](fundamentos.md).
- O protótipo não especifica primitivas de formulário nem dock mobile. As regras derivadas e aprovadas estão em [Componentes](componentes.md) e [Casca](casca.md).
- O domínio do card de Conta nomeia quatro cores de farol, mas a paleta oficial tem apenas dois semânticos. A UI distingue os quatro estados com texto, forma e intensidade usando somente tokens oficiais; cor nunca é o único sinal.
