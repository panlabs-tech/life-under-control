# Issue tracker: GitHub

Issues e PRDs deste repo vivem como issues do GitHub (`panlabs-tech/life-under-control`). Use a CLI `gh` para todas as operações — ela infere o repo a partir do `git remote`.

## Convenções

- **Criar issue**: `gh issue create --title "..." --body "..."` (heredoc para corpo multi-linha).
- **Ler issue**: `gh issue view <número> --comments`.
- **Listar issues**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` com `--label`/`--state` conforme o caso.
- **Comentar**: `gh issue comment <número> --body "..."`.
- **Aplicar/remover label**: `gh issue edit <número> --add-label "..."` / `--remove-label "..."`.
- **Fechar**: `gh issue close <número> --comment "..."`.

Labels seguem o padrão `família:valor` (`status:`, `type:`, `area:`, `boundary:`, `phase:`, `needs:`); os estados de triagem e a família `needs:` (incl. `needs:mcp`) estão em `triage-labels.md`.

## Pull requests como superfície de triagem

**PRs como superfície de pedido: não.** Repo dirigido por milestones — `/triage` olha só issues, deixando PRs em andamento de colaboradores em paz. (Mude para "sim" se um dia PRs externos virarem feature requests; aí valem os equivalentes `gh pr view`/`gh pr list`/`gh pr edit`. O GitHub compartilha um único espaço de numeração entre issues e PRs, então `#42` pode ser qualquer um — resolva com `gh pr view 42` e caia para `gh issue view 42`.)

## Quando uma skill diz "publish to the issue tracker"

Crie uma issue no GitHub.

## Quando uma skill diz "fetch the relevant ticket"

Rode `gh issue view <número> --comments`.

## Wayfinding operations

Usadas pela `/wayfinder`. O **mapa** é uma issue única com issues **filhas** como tickets.

- **Mapa**: uma issue com a label `wayfinder:map`, guardando o corpo Destination / Notes / Decisions-so-far / Fog. `gh issue create --label wayfinder:map`.
- **Ticket filho**: issue vinculada ao mapa como **sub-issue** do GitHub (`gh api` no endpoint de sub-issues). Onde sub-issues não estiverem habilitadas, adicione o filho a uma task list no corpo do mapa e ponha `Part of #<mapa>` no topo do corpo do filho. Labels: `wayfinder:<type>` (`research`/`prototype`/`grilling`/`task`). Quando reivindicado, o ticket é atribuído ao dev que dirige o mapa.
- **Bloqueio**: dependências **nativas** de issue do GitHub — a representação canônica, visível na UI. Adicione uma aresta com `gh api --method POST repos/<owner>/<repo>/issues/<filho>/dependencies/blocked_by -F issue_id=<db-id-do-bloqueador>`, onde `<db-id-do-bloqueador>` é o **database id** numérico do bloqueador (`gh api repos/<owner>/<repo>/issues/<n> --jq .id`, _não_ o `#número` nem o `node_id`). O GitHub reporta `issue_dependencies_summary.blocked_by` (só bloqueadores abertos — o gate vivo). Onde dependências não estiverem disponíveis, caia para uma linha `Blocked by: #<n>, #<n>` no topo do corpo do filho. Um ticket está desbloqueado quando todo bloqueador está fechado.
- **Consulta de fronteira**: liste as filhas abertas do mapa (`gh issue list --state open`, escopado às sub-issues / task list do mapa), descarte as com bloqueador aberto (`issue_dependencies_summary.blocked_by > 0`, ou issue aberta na linha `Blocked by`) ou com assignee; a primeira na ordem do mapa vence.
- **Claim**: `gh issue edit <n> --add-assignee @me` — a primeira escrita da sessão.
- **Resolver**: `gh issue comment <n> --body "<resposta>"`, depois `gh issue close <n>`, depois anexe um ponteiro de contexto (gist + link) ao Decisions-so-far do mapa.
