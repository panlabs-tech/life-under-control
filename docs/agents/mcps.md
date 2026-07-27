# MCPs

Os servidores MCP que este repo declara, o que cada um alcança, e o que precisa estar preenchido antes de usá-los.

O documento existe porque **este repo versiona configuração de MCP**, e sem ele ninguém sabe quais são sem abrir o JSON e adivinhar o que cada pacote faz. Um MCP de infraestrutura alcança produção; saber qual é qual é pré-requisito de operar com autonomia.

## Onde a configuração mora

[`.mcp.json`](../../.mcp.json), na raiz, **versionado**.

Ele já foi gitignored, com o token colado literal dentro. Isso tinha dois defeitos ao mesmo tempo: um segredo em texto puro num arquivo a um `git add -f` de distância do histórico, e uma configuração "compartilhada" que nunca era compartilhada — cada clone remontava o arquivo do zero. A forma versionada resolve os dois: **o valor do segredo sai, o placeholder de variável de ambiente entra**, e o que fica no git é a lista de servidores, que é justamente a parte que todo mundo precisa e ninguém precisa esconder.

`.claude/settings.local.json` continua fora do git, e é lá que mora qualquer override de máquina.

## Os servidores

| servidor | transporte | alcança | segredo |
| --- | --- | --- | --- |
| `coolify` | stdio (`npx`) | o painel Coolify da VPS: aplicações, deploys, variáveis de ambiente, banco | `COOLIFY_ACCESS_TOKEN` |
| `hostinger-vps` | stdio (`npx`) | a VPS em si, no provedor: ciclo de vida da máquina | lê do ambiente, sem chave no arquivo |
| `cloudflare` | http | DNS, R2 e o resto da conta Cloudflare | OAuth no primeiro uso |
| `meta-devtools` | http | o app da Meta / WhatsApp Cloud API ([ADR-0012](../adr/0012-whatsapp-cloud-api.md)) | OAuth no primeiro uso |
| `aws` | stdio (`uvx`) | a conta AWS, hoje só Bedrock para extração de comprovante ([ADR-0013](../adr/0013-extracao-comprovante-bedrock.md)) | credencial IAM do ambiente |

Os pacotes `npx` são pinados por versão exata no arquivo, e não em `@latest`: um MCP que resolve pacote novo a cada inicialização muda de comportamento sem ninguém ter mudado nada.

## O que preencher antes de usar

Só um valor é segredo literal, e ele **não** vem do `.env` do produto — vem do ambiente do shell que sobe o agente, porque quem o expande é o cliente MCP e não a aplicação:

```sh
export COOLIFY_ACCESS_TOKEN='<token do painel Coolify>'
```

Os dois servidores HTTP (`cloudflare`, `meta-devtools`) autenticam por OAuth no primeiro uso: não há token no arquivo, e não há o que preencher antes. O `aws` usa a credencial IAM já presente no ambiente (`AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`, descritos em [`.env.example`](../../.env.example)); a região vem cravada no próprio `.mcp.json`.

Um placeholder que não resolve deixa o servidor subir e falhar na primeira chamada autenticada, não na inicialização. Se um MCP de infra responder 401, a primeira hipótese é a variável ausente no shell, não o token revogado.

## A regra que não muda

**Nenhum segredo literal entra no `.mcp.json`.** O arquivo é versionado; um valor colado nele é um vazamento com uma etapa de atraso. O portão local (`lefthook.yml`) roda `gitleaks` sobre o staged exatamente para que essa etapa nunca aconteça.

Trocar de token é trocar a variável de ambiente. O arquivo não muda.

## Fronteira com o equipamento global

MCP é **configuração de projeto**, e por isso mora aqui. Skill, subagente, comando e hook portável são **equipamento de máquina** e moram no global, fora deste repo — ver a seção "Equipamento de agente" do [`AGENTS.md`](../../AGENTS.md). A distinção importa na hora de limpar: configuração de ferramenta de agente concorrente encontrada versionada aqui é resíduo, e a remoção dela passa por um preflight de uma pergunta só — *aquilo é capacidade que só existe ali?* Para MCP a resposta é não, porque este arquivo já cobre.
