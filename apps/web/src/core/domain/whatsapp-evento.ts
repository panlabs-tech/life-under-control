/**
 * Classificação pura do payload do webhook da Meta (ADR-0012, issue #155). O
 * POST recebe mensagem, status (delivered/read) e eventos de template no
 * mesmo formato de envelope — roteia sem quebrar em forma inesperada.
 */

/**
 * Mídia recebida numa mensagem (comprovante — imagem ou documento/PDF, ADR-0012):
 * só o `mediaId` (a resolver na Graph API) e o tipo MIME. Nunca uma URL — o
 * corpo do webhook é público e seguir uma URL de lá abriria SSRF; os bytes vêm
 * do lookup autenticado do media ID (issue #158).
 */
export type MidiaRecebida = { mediaId: string; tipoMime: string }

export type EventoWebhook =
  | {
      tipo: "mensagem"
      waMessageId: string
      remetente: string
      texto: string | null
      midia: MidiaRecebida | null
    }
  | { tipo: "interactive"; waMessageId: string; remetente: string; replyId: string }
  | { tipo: "status" }
  | { tipo: "template" }
  | { tipo: "desconhecido" }

type MidiaBruta = { id?: unknown; mime_type?: unknown }
type InteractiveBruto = { button_reply?: { id?: unknown }; list_reply?: { id?: unknown } }
type MensagemBruta = {
  id?: unknown
  from?: unknown
  type?: unknown
  text?: { body?: unknown }
  image?: MidiaBruta
  document?: MidiaBruta
  interactive?: InteractiveBruto
}
type ValorBruto = {
  messages?: MensagemBruta[]
  statuses?: unknown[]
  message_template_status_update?: unknown
}

/**
 * Extrai a mídia de uma mensagem de comprovante (imagem ou documento/PDF). Só
 * quando há `id` e `mime_type` legíveis — um `type: "image"` sem o sub-objeto
 * (payload truncado) volta `null`, nunca um palpite. A URL efêmera dos bytes
 * **não** vem daqui: é resolvida depois pelo media ID na Graph API (anti-SSRF).
 */
function extrairMidia(m: MensagemBruta): MidiaRecebida | null {
  const bruta = m.type === "image" ? m.image : m.type === "document" ? m.document : undefined
  if (!bruta || typeof bruta.id !== "string" || typeof bruta.mime_type !== "string") return null
  return { mediaId: bruta.id, tipoMime: bruta.mime_type }
}

/**
 * O id da resposta interativa (botão ou linha de lista) que a Meta manda quando a
 * Pessoa toca um botão/linha da Proposta — é exatamente o `id` que
 * `botoesDaProposta`/`linhasContasProposta` embutiram. `null` se ilegível.
 */
function extrairReplyId(i: InteractiveBruto | undefined): string | null {
  const id = i?.button_reply?.id ?? i?.list_reply?.id
  return typeof id === "string" && id.length > 0 ? id : null
}

/** Uma mensagem vira evento: resposta a botão/lista → `interactive`; o resto → `mensagem`. */
function classificarMensagem(m: MensagemBruta): EventoWebhook {
  if (m.type === "interactive") {
    const replyId = extrairReplyId(m.interactive)
    if (replyId) {
      return {
        tipo: "interactive",
        waMessageId: String(m.id ?? ""),
        remetente: String(m.from ?? ""),
        replyId,
      }
    }
  }
  return {
    tipo: "mensagem",
    waMessageId: String(m.id ?? ""),
    remetente: String(m.from ?? ""),
    texto: m.type === "text" && typeof m.text?.body === "string" ? m.text.body : null,
    midia: extrairMidia(m),
  }
}

function classificarValor(value: ValorBruto): EventoWebhook[] {
  if (Array.isArray(value.messages) && value.messages.length > 0) {
    return value.messages.map(classificarMensagem)
  }

  if (Array.isArray(value.statuses) && value.statuses.length > 0) return [{ tipo: "status" }]

  if (value.message_template_status_update) return [{ tipo: "template" }]

  return [{ tipo: "desconhecido" }]
}

/** Classifica um payload bruto do webhook em uma lista de eventos — nunca lança. */
export function classificarEventoWebhook(payloadBruto: unknown): EventoWebhook[] {
  if (typeof payloadBruto !== "object" || payloadBruto === null) return [{ tipo: "desconhecido" }]

  const entry = (payloadBruto as { entry?: unknown }).entry
  if (!Array.isArray(entry) || entry.length === 0) return [{ tipo: "desconhecido" }]

  const eventos = entry.flatMap((e) => {
    const changes = (e as { changes?: unknown }).changes
    if (!Array.isArray(changes) || changes.length === 0) return []

    return changes.flatMap((c) => {
      const value = (c as { value?: unknown }).value
      if (typeof value !== "object" || value === null) return []
      return classificarValor(value as ValorBruto)
    })
  })

  return eventos.length > 0 ? eventos : [{ tipo: "desconhecido" }]
}
