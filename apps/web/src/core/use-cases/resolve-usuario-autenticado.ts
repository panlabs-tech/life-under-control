/**
 * Decisão pura (issue #94): qual Pessoa do Lar é a autenticada, pra casca
 * mostrar nome/avatar e o domínio atribuir autoria. Casa pelo `googleEmail`
 * vinculado (case-insensitive) — nunca pelo e-mail nominal semeado, que é
 * fictício. A allowlist (ADR-0004) já foi checada no `signIn`; aqui só
 * traduzimos a sessão para a Pessoa correta.
 *
 * Regras (ADR-0002: identidade/autoria nunca inferida por posição):
 * - Sessão cujo e-mail casa um `googleEmail` vinculado → aquela Pessoa.
 * - Sem sessão + bypass local (dev) → a primeira Pessoa (opera contra o seed).
 * - Sessão real sem vínculo, sem bypass (produção) → `VinculoInexistenteError`:
 *   falha explícita, jamais cai silenciosamente na primeira Pessoa.
 * - Sem sessão e sem bypass → `SessaoAusenteError` (não deveria alcançar a
 *   casca, que fica atrás do gate; explícito por segurança).
 */

/** Sessão válida sem Pessoa vinculada — em produção, falha em vez de adivinhar. */
export class VinculoInexistenteError extends Error {
  constructor(email: string) {
    super(`Sessão autenticada (${email}) não está vinculada a nenhuma Pessoa do Lar`)
    this.name = "VinculoInexistenteError"
  }
}

/** Sem sessão e sem bypass local habilitado — resolução impossível. */
export class SessaoAusenteError extends Error {
  constructor() {
    super("Sessão ausente e bypass local desabilitado")
    this.name = "SessaoAusenteError"
  }
}

export function resolverUsuarioAutenticado<T extends { googleEmail: string | null }>(
  pessoas: T[] | undefined,
  emailLogado: string | null | undefined,
  bypassLocal: boolean,
): T {
  const lar = pessoas ?? []

  if (emailLogado) {
    const email = emailLogado.toLowerCase()
    const vinculada = lar.find((pessoa) => pessoa.googleEmail?.toLowerCase() === email)
    if (vinculada) return vinculada
    // Tolerância só de dev: um e-mail de sessão que não casa ainda opera contra o seed.
    if (bypassLocal && lar[0]) return lar[0]
    throw new VinculoInexistenteError(emailLogado)
  }

  if (bypassLocal && lar[0]) return lar[0]
  throw new SessaoAusenteError()
}
