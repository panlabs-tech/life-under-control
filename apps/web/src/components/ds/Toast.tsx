"use client"

import { Info, X } from "lucide-react"
import { type ReactNode, useEffect, useRef, useState } from "react"

/**
 * Toast oficial do LUC: `role="status"` (anunciado, não interrompe) que some
 * sozinho após `duracaoMs`. `onDismiss` roda só quando o timer expira — nunca
 * na desmontagem por navegação — para a borda (ex.: limpar um parâmetro da
 * URL) só agir depois que o toast já cumpriu o tempo de tela. O timer não
 * depende da identidade de `onDismiss` (um ref guarda sempre a versão mais
 * recente) — um chamador que passa uma closure nova a cada render (comum,
 * ex. `() => router.replace(...)`) não reinicia a contagem a cada re-render.
 *
 * A veste é a do protótipo Final: surface-3, borda strong, raio 11, sombra
 * profunda e o ícone `info` neutro (text-3) por padrão — `icone` sobrescreve.
 * `comFechar` mostra o X, que dispensa na hora (o mesmo `onDismiss`, sem
 * esperar o timer).
 */
export function Toast({
  mensagem,
  duracaoMs = 4000,
  onDismiss,
  icone,
  comFechar = false,
}: {
  mensagem: string
  duracaoMs?: number
  onDismiss?: () => void
  /** Ícone antes da mensagem — por padrão o `info` neutro do protótipo Final. */
  icone?: ReactNode
  /** Mostra o botão de fechar, que dispensa o toast na hora chamando `onDismiss`. */
  comFechar?: boolean
}) {
  const [visivel, setVisivel] = useState(true)
  const onDismissRef = useRef(onDismiss)
  onDismissRef.current = onDismiss

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisivel(false)
      onDismissRef.current?.()
    }, duracaoMs)
    return () => clearTimeout(timer)
  }, [duracaoMs])

  if (!visivel) return null

  function fechar() {
    setVisivel(false)
    onDismissRef.current?.()
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 bottom-6 z-50 flex justify-center px-4"
    >
      <div className="flex items-center gap-2.5 rounded-[11px] border border-luc-border-strong bg-luc-surface-3 px-3.5 py-[11px] text-[13px] text-luc-text shadow-[0_24px_60px_rgba(0,0,0,.5)]">
        <span aria-hidden className="flex shrink-0 items-center text-luc-text-3">
          {icone ?? <Info size={17} />}
        </span>
        <p>{mensagem}</p>
        {comFechar && (
          <button
            type="button"
            aria-label="Fechar"
            onClick={fechar}
            className="-mr-1 ml-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-luc-sm text-luc-text-3 transition-colors hover:bg-luc-surface-3 hover:text-luc-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-luc-accent"
          >
            <X aria-hidden size={14} />
          </button>
        )}
      </div>
    </div>
  )
}
