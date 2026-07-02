"use client"

import { ChevronRight } from "lucide-react"
import { type ReactNode, useState } from "react"
import { Surface } from "@/components/ds/Surface"

/**
 * A baixa expande sob o header do detalhe da Conta (#63), preservando o
 * contexto — mesmo padrão de `aria-expanded`/estado local da linha híbrida
 * (#56): o gatilho É o cabeçalho clicável, o painel É o *sibling* que monta só
 * quando aberto. Abre por default quando a Conta chega via um ponto de entrada
 * que já sabe a Competência (header/linha/painel/agenda — a borda decide).
 */
export function DarBaixaSurface({
  abrirPorDefault,
  competenciaLabel,
  children,
}: {
  abrirPorDefault: boolean
  competenciaLabel?: string
  children: ReactNode
}) {
  const [aberto, setAberto] = useState(abrirPorDefault)
  const painelId = "dar-baixa-painel"

  return (
    <Surface id="dar-baixa" className="flex scroll-mt-6 flex-col gap-5 p-5 sm:p-6">
      <button
        type="button"
        aria-expanded={aberto}
        aria-controls={painelId}
        onClick={() => setAberto((atual) => !atual)}
        className="flex items-center justify-between gap-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-luc-accent focus-visible:ring-offset-2 focus-visible:ring-offset-luc-bg"
      >
        <h2 className="text-sm font-bold text-luc-text-strong">
          Dar baixa
          {competenciaLabel && <span className="text-luc-faint"> · {competenciaLabel}</span>}
        </h2>
        <ChevronRight
          aria-hidden
          size={16}
          className={`shrink-0 text-luc-muted transition-transform duration-150 ${aberto ? "rotate-90" : ""}`}
        />
      </button>

      {aberto && <div id={painelId}>{children}</div>}
    </Surface>
  )
}
