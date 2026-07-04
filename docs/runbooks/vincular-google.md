# Runbook — vincular Pessoa do Lar à identidade Google

Procedimento auditável para aplicar e verificar, em ambiente real, o vínculo entre cada Pessoa canônica do Lar (Thiago, Jakeline) e seu e-mail Google autorizado (issue #94). É a operação que a issue #96 (HITL) executa contra produção. A mecânica vive no use-case puro [`vincular-google.ts`](../../apps/web/src/core/use-cases/vincular-google.ts); este runbook é só o procedimento operacional em volta dele, mais a ferramenta de linha-de-comando [`scripts/vincular-google.ts`](../../apps/web/scripts/vincular-google.ts).

## Por que existe

O e-mail nominal semeado (`*@casapanini.lar`) é fictício e nunca casa com a sessão real do Google. Sem o vínculo, a casca cai em "Usuário" e a autoria default escorrega para a primeira Pessoa do Lar (bug corrigido pela #94). O vínculo grava o e-mail Google real na coluna `users.google_email` — normalizado em minúsculas, único — e passa a ser a chave de autenticação/autoria (ADR-0002), separada da autorização (allowlist, ADR-0004).

## Regra de ouro sobre o dado pessoal

O e-mail Google real **não entra** no repositório, em fixtures, em PRs nem em logs (ADR-0007). Ele só existe em memória no momento de rodar, passado por variável de ambiente. O script imprime apenas a forma mascarada (`t***@gmail.com`) e mascara qualquer e-mail embutido em mensagens de erro. Nunca cole o e-mail real numa issue ou num comentário.

## Pré-condições

- `DATABASE_URL` aponta para o ambiente-alvo (confirme que não é o banco errado — o `DATABASE_URL` local já apontou para produção por engano).
- Migração `0007_add_google_email.sql` aplicada no alvo (o boot do deploy já roda `migrate.mjs`; confirme a coluna existe).
- `LUC_ALLOWLIST` no ambiente contém exatamente os 2 e-mails Google do Lar — é a mesma allowlist do login. Um e-mail fora dela é rejeitado pelo próprio use-case.
- Comandos rodados da pasta `apps/web`.

## Acesso a produção (canal real)

O Postgres de produção não é alcançável direto: é um container Coolify (rede `coolify`, sem porta pública), e o `DATABASE_URL` interno só resolve dentro da rede Docker do VPS. O canal reproduzível para rodar o script contra prod:

- Acesso SSH ao VPS como usuário `deploy` (host `panini-vps`, chave `panini_vps_ed25519` com passphrase — carregue no `ssh-agent` antes: `ssh-add ~/.ssh/panini_vps_ed25519`). `deploy` tem `sudo` sem senha, logo `sudo docker`.
- Túnel TCP até o container do banco pelo IP dele na bridge `coolify`: pegue o IP com `sudo docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' <db>` e abra `ssh -fN -o ExitOnForwardFailure=yes -L 15432:<ip-do-container>:5432 panini-vps`. O script roda local contra `postgres://luc:<senha>@127.0.0.1:15432/luc`.
- Os segredos ativos vêm dos próprios containers, nunca de arquivo versionado: senha via `sudo docker exec <db> printenv POSTGRES_PASSWORD`; `LUC_ALLOWLIST` via `sudo docker exec <app> printenv LUC_ALLOWLIST`. Usar a `LUC_ALLOWLIST` **ativa do app** como fonte do dry-run prova que os e-mails pertencem à allowlist real de produção — não a uma cópia local.
- Higiene do e-mail: os e-mails reais entram por um arquivo local fora do repositório, lido com `source` (sem `cat`/`echo`); senha e allowlist capturadas em variável por `$(...)` sem imprimir; stderr do script mascarado (`sed -E 's/[A-Za-z0-9._%+-]+@/***@/g'`) como rede de segurança.

## Backup antes de gravar (ADR-0007)

Antes do primeiro `--commit`, congele o estado com um dump fresco e verifique que abre (o vínculo é aditivo, mas a cláusula de dado pede a rede de segurança):

```bash
ssh panini-vps "sudo docker exec -i <db> sh -c 'PGPASSWORD=\$POSTGRES_PASSWORD pg_dump -h 127.0.0.1 -U luc -d luc -Fc'" > luc-prewrite.dump
head -c5 luc-prewrite.dump    # deve imprimir 'PGDMP' (custom-format restaurável)
```

O backup agendado diário do Coolify (`0 3 * * *`, 7 dias, local) é a rede de fundo; o dump manual acima captura o instante imediatamente pré-escrita.

## Procedimento

Para cada Pessoa (repita com o `PESSOA_NOME`/`GOOGLE_EMAIL` de cada uma):

1. **Dry-run** — valida allowlist, escopo do Lar e conflito, sem gravar:

   ```bash
   PESSOA_NOME=Thiago GOOGLE_EMAIL='<email-google-real>' \
     node_modules/.bin/tsx scripts/vincular-google.ts
   ```

   Espere `[dry-run] validação OK — vincularia: Thiago ← t***@gmail.com`. Se falhar (fora da allowlist, Pessoa inexistente, e-mail já vinculado a outra Pessoa), corrija antes de seguir.

2. **Aplicar** — grava o vínculo:

   ```bash
   PESSOA_NOME=Thiago GOOGLE_EMAIL='<email-google-real>' \
     node_modules/.bin/tsx scripts/vincular-google.ts --commit
   ```

3. **Verificar** — lista os vínculos do Lar (mascarados):

   ```bash
   node_modules/.bin/tsx scripts/vincular-google.ts --verify
   ```

   Confirme que cada Pessoa aparece com um vínculo e nenhuma ficou "sem vínculo".

4. **Smoke de sessão** — faça login com cada conta Google e confira na sidebar: nome correto da Pessoa (não "Usuário"), texto "Conta Google" e avatar espelhado. Um Lançamento de teste deve nascer com a autoria certa.

## Reversão

O vínculo é uma coluna nullable — reverter é aditivo, não destrutivo. Para desfazer um vínculo trocado, zere a coluna da Pessoa afetada e reaplique o correto:

```sql
UPDATE users SET google_email = NULL WHERE nome = 'Thiago';
```

Depois rode o dry-run + `--commit` de novo com o e-mail certo.

Para **verificar a reversão sem persistir**, ensaie numa transação abortada — confirma que o statement afeta exatamente a Pessoa-alvo e que o `ROLLBACK` preserva os vínculos reais:

```sql
BEGIN;
UPDATE users SET google_email = NULL WHERE nome = 'Thiago';   -- espere UPDATE 1
SELECT nome, google_email FROM users ORDER BY nome;            -- Thiago zerado só dentro da transação
ROLLBACK;
SELECT nome, google_email FROM users ORDER BY nome;            -- vínculo real intacto
```

## Idempotência e conflitos

- Revincular o **mesmo** e-mail à **mesma** Pessoa é no-op bem-sucedido.
- Tentar vincular um e-mail já pertencente a **outra** Pessoa falha com `VinculoEmConflitoError` (a unicidade também é garantida no banco). Zere o vínculo anterior antes.

## Referências

- Use-case: [`vincular-google.ts`](../../apps/web/src/core/use-cases/vincular-google.ts) — a validação canônica.
- Resolução da sessão: [`resolve-usuario-autenticado.ts`](../../apps/web/src/core/use-cases/resolve-usuario-autenticado.ts).
- ADRs: [0002](../adr/0002-lar-acesso-simetrico.md) (identidade/autoria ≠ autorização), [0004](../adr/0004-lockdown-allowlist-oauth-google.md) (allowlist), [0007](../adr/0007-autonomia-total-do-agente.md) (dado real do casal).

## Registro de execução

- **2026-07-03 (#96)** — vínculos aplicados em produção pelo agente, via o canal acima. Gate ADR-0007 cumprido: dump `PGDMP` de ~34 KB verificado + backup diário do Coolify vivo. Estado pré-escrita: ambas as Pessoas com `google_email` `NULL`. Dry-run das duas contra a `LUC_ALLOWLIST` **ativa** do app: OK (prova de allowlist). `--commit` de Thiago e Jakeline: OK, sem conflito nem duplicidade. `--verify` pós-escrita: 2 vínculos mascarados distintos. Reversão ensaiada em transação abortada (`UPDATE 1` + `ROLLBACK` preservando o estado). **Pendente do operador** para fechar a #96: smoke de login das duas contas (nome + avatar corretos na sidebar) e um Lançamento de teste por identidade com a autoria default certa.
