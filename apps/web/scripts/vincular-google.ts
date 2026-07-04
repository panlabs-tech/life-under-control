/**
 * Operação de vínculo Pessoa ↔ e-mail Google em ambiente real (issue #94, executada
 * pela #96). Fina borda de linha-de-comando sobre o use-case `vincularGoogle` — a
 * validação (allowlist + escopo do Lar + conflito) e a normalização vivem no núcleo,
 * não aqui. O e-mail real NUNCA entra no repo/fixtures/logs (ADR-0007): entra por env
 * na hora de rodar e este script só imprime a forma mascarada.
 *
 * Uso (da pasta apps/web, com DATABASE_URL e LUC_ALLOWLIST do ambiente-alvo):
 *   PESSOA_NOME=Thiago GOOGLE_EMAIL=... node_modules/.bin/tsx scripts/vincular-google.ts            # dry-run: valida, não grava
 *   PESSOA_NOME=Thiago GOOGLE_EMAIL=... node_modules/.bin/tsx scripts/vincular-google.ts --commit    # grava o vínculo
 *   node_modules/.bin/tsx scripts/vincular-google.ts --verify                                        # lista os vínculos (mascarados)
 *
 * Sem `--commit` é dry-run: roda TODA a validação (inclusive o conflito, que consulta
 * o banco) e só pula a escrita. Runbook: docs/runbooks/vincular-google.md.
 */

import { drizzleHouseholdRepo } from "@/adapters/db/household-repo.drizzle"
import { drizzleUserRepo } from "@/adapters/db/user-repo.drizzle"
import type { UserRepo } from "@/core/ports/user-repo"
import { vincularGoogle } from "@/core/use-cases/vincular-google"

/** Mascara o e-mail pra log auditável sem vazar o dado real: `t***@gmail.com`. */
function mascarar(email: string): string {
  const [local, dominio] = email.split("@")
  if (!dominio) return "***"
  return `${local.slice(0, 1)}***@${dominio}`
}

/** Mascara qualquer e-mail embutido numa string (mensagens de erro do domínio). */
function mascararEmails(texto: string): string {
  return texto.replace(/[^\s@]+@[^\s@]+/g, (m) => mascarar(m))
}

function requerEnv(nome: string): string {
  const valor = process.env[nome]
  if (!valor) throw new Error(`Env ${nome} é obrigatória`)
  return valor
}

async function verificar(): Promise<void> {
  const lar = await drizzleHouseholdRepo().carregarLar()
  if (!lar) throw new Error("Nenhum Lar carregado — verifique DATABASE_URL")
  console.log(`Vínculos do Lar "${lar.nome}":`)
  for (const p of lar.pessoas) {
    console.log(`  ${p.nome}: ${p.googleEmail ? mascarar(p.googleEmail) : "— sem vínculo"}`)
  }
}

async function vincular(commit: boolean): Promise<void> {
  const pessoaNome = requerEnv("PESSOA_NOME")
  const googleEmail = requerEnv("GOOGLE_EMAIL")

  const lar = await drizzleHouseholdRepo().carregarLar()
  if (!lar) throw new Error("Nenhum Lar carregado — verifique DATABASE_URL")
  const pessoa = lar.pessoas.find((p) => p.nome.toLowerCase() === pessoaNome.toLowerCase())
  if (!pessoa) throw new Error(`Pessoa "${pessoaNome}" não encontrada no Lar "${lar.nome}"`)

  // Em dry-run, a escrita é um no-op — o resto da validação (allowlist, escopo,
  // conflito via obterPorGoogleEmail) roda de verdade contra o banco.
  const base = drizzleUserRepo()
  const repo: UserRepo = commit
    ? base
    : {
        ...base,
        async vincularGoogleEmail() {
          /* dry-run: valida, não grava */
        },
      }

  await vincularGoogle(repo, lar.pessoas, pessoa.id, googleEmail, process.env.LUC_ALLOWLIST)
  const prefixo = commit ? "vinculado" : "[dry-run] validação OK — vincularia"
  console.log(`${prefixo}: ${pessoa.nome} ← ${mascarar(googleEmail)}`)
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  if (args.includes("--verify")) return verificar()
  await vincular(args.includes("--commit"))
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    // Mensagem do erro de domínio, com qualquer e-mail embutido mascarado (ADR-0007).
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[vincular-google] falhou: ${mascararEmails(msg)}`)
    process.exit(1)
  })
