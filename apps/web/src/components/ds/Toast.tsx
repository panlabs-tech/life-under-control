"use client"

import { useEffect, useRef, useState } from "react"

/**
 * Toast oficial do LUC: `role="status"` (anunciado, não interrompe) que some
 * sozinho após `duracaoMs`. `onDismiss` roda só quando o timer expira — nunca
 * na desmontagem por navegação — para a borda (ex.: limpar um parâmetro da
 * URL) só agir depois que o toast já cumpriu o tempo de tela. O timer não
 * depende da identidade de `onDismiss` (um ref guarda sempre a versão mais
 * recente) — um chamador que passa uma closure nova a cada render (comum,
 * ex. `() => router.replace(...)`) não reinicia a contagem a cada re-render.
 */
export function Toast({
  mensagem,
  duracaoMs = 4000,
  onDismiss,
}: {
  mensagem: string
  duracaoMs?: number
  onDismiss?: () => void
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

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 bottom-6 z-50 flex justify-center px-4"
    >
      <p className="rounded-luc-lg border border-luc-border bg-luc-surface-2 px-4 py-2.5 text-sm text-luc-text shadow-lg">
        {mensagem}
      </p>
    </div>
  )
}
