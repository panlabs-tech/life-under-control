@AGENTS.md

## Específico do Claude Code

- **Economia de contexto (enforçada por hooks).** Toda implementação delega o reconhecimento do código a um subagente `Explore` e age só sobre o digest -- não relê a árvore. Dois hooks **globais** (`~/.claude/hooks/`) cuidam disso: o injetor (`UserPromptSubmit`) injeta o protocolo no gatilho (`/implement`, "implementa as issues") e a trava (`PreToolUse`/Read) bloqueia releitura de output cru. Os dois são **marker-gated**: só agem onde `.claude/context-economy-protocol.md` existe, que é o único artefato de equipamento que este repo versiona. Detalhe em [`docs/agents/workflow.md`](docs/agents/workflow.md).
- **Skills, subagentes e commands são equipamento de máquina**, instalados globalmente em `~/.agents` e symlinkados em `~/.claude`. Este repo **não** versiona nenhum deles: a cópia global é a única (cláusula de zero redundância). Não vendorize.
- **Permissions e statusline** são globais, com override apenas em `.claude/settings.local.json` (sempre gitignored). Este repo não versiona lista de permissões.
- **MCPs** são declarados em [`.mcp.json`](.mcp.json), versionado com placeholder de variável de ambiente no lugar do segredo. Ver [`docs/agents/mcps.md`](docs/agents/mcps.md).
