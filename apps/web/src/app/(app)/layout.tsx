import { redirect } from "next/navigation"
import type { ReactNode } from "react"
import { drizzleHouseholdRepo } from "@/adapters/db/household-repo.drizzle"
import { r2AttachmentStore } from "@/adapters/r2/r2-attachment-store"
import { auth } from "@/auth"
import { AppShell } from "@/components/shell/AppShell"
import { localAuthBypass } from "@/core/use-cases/gate"
import { type PessoaComAvatar, resolveAvatares } from "@/core/use-cases/resolve-avatares"
import { resolverUsuarioAutenticado } from "@/core/use-cases/resolve-usuario-autenticado"

/**
 * Tudo sob (app) ganha a casca navegável e re-checa a sessão no servidor:
 * defesa-em-profundidade (ADR-0004). O middleware é otimização, não o único
 * portão — quem renderiza dado do Lar confirma a sessão perto do dado. A casca
 * (rodapé da sidebar, #85) mostra a Pessoa autenticada — casada pelo e-mail
 * Google **vinculado** (issue #94) — com avatar já resolvido (#51).
 *
 * Duas falhas distintas: se as Pessoas nem carregam (R2/banco fora do ar), a
 * casca degrada pro fallback padrão e o resto da rota renderiza (nunca um 500
 * universal). Mas se as Pessoas carregam e a sessão real não casa vínculo algum,
 * `resolverUsuarioAutenticado` LANÇA — em produção isso falha explícito em vez de
 * atribuir silenciosamente a sessão à primeira Pessoa (ADR-0002). O bypass local
 * tolera e cai na primeira Pessoa pra operar contra o seed.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const bypass = localAuthBypass(
    process.env.NODE_ENV ?? "development",
    process.env.LUC_LOCAL_AUTH_BYPASS,
  )
  const session = bypass ? null : await auth()
  if (!bypass && !session) redirect("/login")

  const pessoas = await carregarPessoasComAvatar()
  // Só resolve quando o Lar carregou; `undefined` é falha de infra e mantém a
  // casca no fallback (a resolução lançaria, e um hiccup de infra não deve
  // derrubar toda rota autenticada). Sessão sem vínculo com Lar carregado, sim.
  const usuario = pessoas
    ? resolverUsuarioAutenticado(pessoas, session?.user?.email, bypass)
    : undefined

  return <AppShell usuario={usuario}>{children}</AppShell>
}

/**
 * Carrega as Pessoas com avatar pra casca — nunca deixa uma falha aqui (R2 mal
 * configurado, banco fora do ar) derrubar TODA rota autenticada com um 500; a
 * casca cai no fallback padrão de `AppShell` e o resto da página renderiza normal.
 */
async function carregarPessoasComAvatar(): Promise<PessoaComAvatar[] | undefined> {
  try {
    const lar = await drizzleHouseholdRepo().carregarLar()
    return lar ? await resolveAvatares(lar.pessoas, r2AttachmentStore()) : undefined
  } catch (err) {
    console.error("[layout] falha ao carregar Pessoas com avatar — casca cai no fallback:", err)
    return undefined
  }
}
