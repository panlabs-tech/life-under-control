import { chaveAvatar } from "../domain/household"
import type { AttachmentStore } from "../ports/attachment-store"
import type { ImageFetcher } from "../ports/image-fetcher"
import type { UserRepo } from "../ports/user-repo"

/**
 * Use-case: espelha a foto do Google no R2 no login. Acha a Pessoa pelo e-mail
 * Google **vinculado** (issue #94) — não pelo e-mail nominal semeado, que é
 * fictício e não casa com a sessão. Baixa a `picture` e grava no bucket sob uma
 * chave fixa por Pessoa, então seta `avatarKey`. Nunca lança e nunca bloqueia o
 * login: sem `pictureUrl`, sem vínculo, e-mail desconhecido, falha no download ou
 * erro no R2 — o use-case só não toca `avatarKey` (nulo → fallback inicial+hue).
 */
export async function mirrorAvatar(
  userRepo: UserRepo,
  attachmentStore: AttachmentStore,
  fetchImage: ImageFetcher,
  email: string,
  pictureUrl: string | null | undefined,
): Promise<void> {
  if (!pictureUrl) return

  const pessoa = await userRepo.obterPorGoogleEmail(email)
  if (!pessoa) return

  const baixada = await fetchImage(pictureUrl)
  if (!baixada) return

  const chave = chaveAvatar(pessoa.id)
  try {
    await attachmentStore.enviar(chave, baixada.bytes, baixada.tipoMime)
    await userRepo.definirAvatarKey(pessoa.id, chave)
  } catch {
    return // erro no R2 ou ao gravar avatarKey não derruba o login — Pessoa fica sem foto até o próximo
  }
}
