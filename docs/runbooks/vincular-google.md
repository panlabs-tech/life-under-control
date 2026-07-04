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

## Idempotência e conflitos

- Revincular o **mesmo** e-mail à **mesma** Pessoa é no-op bem-sucedido.
- Tentar vincular um e-mail já pertencente a **outra** Pessoa falha com `VinculoEmConflitoError` (a unicidade também é garantida no banco). Zere o vínculo anterior antes.

## Referências

- Use-case: [`vincular-google.ts`](../../apps/web/src/core/use-cases/vincular-google.ts) — a validação canônica.
- Resolução da sessão: [`resolve-usuario-autenticado.ts`](../../apps/web/src/core/use-cases/resolve-usuario-autenticado.ts).
- ADRs: [0002](../adr/0002-lar-acesso-simetrico.md) (identidade/autoria ≠ autorização), [0004](../adr/0004-lockdown-allowlist-oauth-google.md) (allowlist), [0007](../adr/0007-autonomia-total-do-agente.md) (dado real do casal).
