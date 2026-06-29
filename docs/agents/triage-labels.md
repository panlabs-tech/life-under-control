# Labels de triagem

As skills falam em cinco papéis canônicos de triagem. Este repo usa o namespace `status:` para estados de workflow, então cada papel mapeia para a label `status:*` correspondente.

| Papel canônico (skills) | Label no repo | Significado |
| ----------------------- | ----------------------- | --------------------------------------------------- |
| `needs-triage`          | `status:needs-triage`   | Mantenedor precisa avaliar a issue |
| `needs-info`            | `status:needs-info`     | Esperando informação do autor/reporter |
| `ready-for-agent`       | `status:ready-for-agent`| Especificada, pronta para um agente AFK pegar |
| `ready-for-human`       | `status:hitl`           | Requer o operador num dos 4 casos da fronteira de autonomia (segredo de terceiro, lock-out/acesso, recriar substrato, tocar outro projeto) |
| `wontfix`               | `status:wontfix`        | Não será implementada |

Quando uma skill cita um papel (ex.: "aplique a label de pronto-para-AFK"), use a string da coluna do meio.

A fronteira AFK↔HITL é de **capacidade/acesso, não de reversibilidade**: DNS (Cloudflare MCP), deploy/produção e segredo auto-gerável são AFK; só os 4 casos viram `status:hitl`. Ver [ADR-0007](../adr/0007-autonomia-total-do-agente.md).

`status:blocked` (bloqueada por dependência/borda externa) é um estado de workflow ortogonal — não faz parte da máquina de triagem de entrada, mas convive no mesmo namespace.

As demais famílias (`type:`, `area:`, `boundary:`, `phase:`, `needs:`) classificam tipo de mudança, área de código, boundary de domínio, fase e pré-requisito de execução — são ortogonais à triagem e as skills não as substituem.

## Família `needs:` — pré-requisito de execução

Marca o que a *implementação* vai exigir, não em que estado de triagem a issue está. Hoje tem um membro:

- **`needs:mcp`** — implementar ou verificar a issue executa pelo menos um dos MCPs de infra (Coolify, Cloudflare ou Hostinger; na prática quase sempre **Coolify**). Casos típicos: criar/dropar recurso próprio no Coolify, mexer em env/deploy, registro DNS no Cloudflare.

Aplique `needs:mcp` ao fatiar (`/to-issues`) ou triar sempre que a slice tocar infra por MCP — e, no fatiamento, sinalize por slice quais precisam dele. É só sinalização organizacional: **não muda a fronteira AFK↔HITL**. Operação de MCP é AFK (o agente tem os MCPs), então uma issue normalmente leva `status:ready-for-agent` **e** `needs:mcp` juntas; só vira `status:hitl` se cair num dos 4 casos da fronteira (acima), nunca por *usar* MCP.

Não confunda com os estados `status:needs-triage`/`status:needs-info`: aqueles são papéis de triagem no namespace `status:`; `needs:` é família de pré-requisito.
