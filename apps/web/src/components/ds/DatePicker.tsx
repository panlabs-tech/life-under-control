"use client"

import { Calendar, ChevronLeft, ChevronRight } from "lucide-react"
import { type KeyboardEvent, useEffect, useLayoutEffect, useRef, useState } from "react"
import { inputClass } from "@/components/ds/FormField"
import { descreverMesPorExtenso, formatarDataBr } from "@/core/domain/bill"

const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"]

function pad(n: number): string {
  return String(n).padStart(2, "0")
}

function hojeIsoLocal(): string {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function somarDias(iso: string, dias: number): string {
  const [ano, mes, dia] = iso.split("-").map(Number)
  const d = new Date(Date.UTC(ano, mes - 1, dia + dias))
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

function anoMes(iso: string): { year: number; month: number } {
  const [ano, mes] = iso.split("-").map(Number)
  return { year: ano, month: mes - 1 }
}

function tituloMes(view: { year: number; month: number }): string {
  const desc = descreverMesPorExtenso(`${view.year}-${pad(view.month + 1)}`)
  return desc.charAt(0).toUpperCase() + desc.slice(1)
}

/** Dias do mês em grade (com folgas antes do 1º dia da semana). `null` = folga. */
function celulasDoMes(view: {
  year: number
  month: number
}): Array<{ dia: number; iso: string } | null> {
  const primeiroDiaSemana = new Date(Date.UTC(view.year, view.month, 1)).getUTCDay()
  const totalDias = new Date(Date.UTC(view.year, view.month + 1, 0)).getUTCDate()
  const celulas: Array<{ dia: number; iso: string } | null> = Array(primeiroDiaSemana).fill(null)
  for (let dia = 1; dia <= totalDias; dia++) {
    celulas.push({ dia, iso: `${view.year}-${pad(view.month + 1)}-${pad(dia)}` })
  }
  return celulas
}

/**
 * Date-picker sob medida (issue #88): substitui o `<input type="date">` nativo
 * (popup do SO) por um popover próprio, consistente com os tokens do DS. O
 * contrato de dados não muda — segue emitindo `name`/valor em ISO civil
 * (`YYYY-MM-DD`) via input hidden, como o form já espera (CONTEXT.md #3).
 *
 * Ancoragem por `position: fixed` medido do gatilho (sem lib, sem portal) —
 * mesmo padrão do `AreaFlyoutTrigger` (`AppShell.tsx`) para escapar do
 * `overflow` do container do modal sem ser cortado.
 */
export function DatePicker({
  id,
  name,
  value,
  onChange,
  invalid = false,
  describedBy,
  hoje = hojeIsoLocal(),
}: {
  id: string
  name: string
  value: string
  onChange: (value: string) => void
  invalid?: boolean
  describedBy?: string
  hoje?: string
}) {
  const [open, setOpen] = useState(false)
  const [view, setView] = useState(() => anoMes(value || hoje))
  const [focoIso, setFocoIso] = useState<string | null>(null)
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const focoRef = useRef<HTMLButtonElement>(null)

  useLayoutEffect(() => {
    if (!open) return
    const rect = triggerRef.current?.getBoundingClientRect()
    if (rect) setPosition({ top: rect.bottom + 6, left: rect.left })
  }, [open])

  useEffect(() => {
    if (!open) return
    setView(anoMes(value || hoje))
    setFocoIso(value || hoje)
  }, [open, value, hoje])

  useEffect(() => {
    if (!focoIso) return
    setView((v) => {
      const alvo = anoMes(focoIso)
      return v.year === alvo.year && v.month === alvo.month ? v : alvo
    })
  }, [focoIso])

  useEffect(() => {
    if (!open || !focoIso) return
    focoRef.current?.focus()
  }, [open, focoIso])

  useEffect(() => {
    if (!open) return
    function fecharNoEsc(event: globalThis.KeyboardEvent) {
      if (event.key !== "Escape") return
      setOpen(false)
      triggerRef.current?.focus()
    }
    function fecharForaDoClique(event: MouseEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener("keydown", fecharNoEsc)
    document.addEventListener("mousedown", fecharForaDoClique)
    return () => {
      document.removeEventListener("keydown", fecharNoEsc)
      document.removeEventListener("mousedown", fecharForaDoClique)
    }
  }, [open])

  function selecionar(iso: string) {
    onChange(iso)
    setOpen(false)
    triggerRef.current?.focus()
  }

  function mesAnterior() {
    setView((v) =>
      v.month === 0 ? { year: v.year - 1, month: 11 } : { year: v.year, month: v.month - 1 },
    )
  }

  function proximoMes() {
    setView((v) =>
      v.month === 11 ? { year: v.year + 1, month: 0 } : { year: v.year, month: v.month + 1 },
    )
  }

  function moverFoco(event: KeyboardEvent<HTMLDivElement>) {
    const deltas: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
    }
    const delta = deltas[event.key]
    if (delta === undefined) return
    event.preventDefault()
    setFocoIso((atual) => somarDias(atual ?? value ?? hoje, delta))
  }

  return (
    <div ref={wrapperRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        id={id}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        onClick={() => setOpen((o) => !o)}
        className={`${inputClass} flex items-center gap-2 font-mono`}
      >
        <Calendar aria-hidden size={16} className="shrink-0 text-luc-text-3" />
        <span className={value ? "" : "text-luc-faint"}>
          {value ? formatarDataBr(value) : "dd/mm/aaaa"}
        </span>
      </button>
      <input type="hidden" name={name} value={value} />
      {open && position && (
        <div
          role="dialog"
          aria-label="Escolher data"
          style={{ top: position.top, left: position.left }}
          className="fixed z-[80] w-[272px] rounded-luc-lg border border-luc-border-strong bg-luc-surface-3 p-3 shadow-[0_24px_60px_rgba(0,0,0,.5)]"
          onKeyDown={moverFoco}
        >
          <div className="flex items-center justify-between pb-2">
            <button
              type="button"
              aria-label="Mês anterior"
              onClick={mesAnterior}
              className="rounded-luc-md p-1 text-luc-text-3 outline-none transition-colors hover:bg-luc-surface-2 hover:text-luc-text focus-visible:ring-2 focus-visible:ring-luc-accent"
            >
              <ChevronLeft aria-hidden size={16} />
            </button>
            <span className="text-[12.5px] font-semibold text-luc-text">{tituloMes(view)}</span>
            <button
              type="button"
              aria-label="Próximo mês"
              onClick={proximoMes}
              className="rounded-luc-md p-1 text-luc-text-3 outline-none transition-colors hover:bg-luc-surface-2 hover:text-luc-text focus-visible:ring-2 focus-visible:ring-luc-accent"
            >
              <ChevronRight aria-hidden size={16} />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1 pb-1 text-center text-[10.5px] font-semibold text-luc-text-3">
            {DIAS_SEMANA.map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {celulasDoMes(view).map((cel, i) =>
              cel === null ? (
                // biome-ignore lint/suspicious/noArrayIndexKey: folgas não têm identidade própria
                <span key={`folga-${i}`} />
              ) : (
                <button
                  key={cel.iso}
                  ref={cel.iso === focoIso ? focoRef : undefined}
                  type="button"
                  tabIndex={cel.iso === focoIso ? 0 : -1}
                  aria-current={cel.iso === hoje ? "date" : undefined}
                  aria-pressed={cel.iso === value}
                  onClick={() => selecionar(cel.iso)}
                  className={`rounded-luc-md py-1 text-[11.5px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-luc-accent ${
                    cel.iso === value
                      ? "bg-luc-accent text-luc-bg font-bold"
                      : cel.iso === hoje
                        ? "bg-luc-accent-06 text-luc-accent"
                        : "text-luc-text hover:bg-luc-surface-2"
                  }`}
                >
                  {cel.dia}
                </button>
              ),
            )}
          </div>
          <div className="pt-2">
            <button
              type="button"
              onClick={() => selecionar(hoje)}
              className="w-full rounded-luc-md border border-luc-border py-1.5 text-[11.5px] font-semibold text-luc-accent hover:bg-luc-accent-06"
            >
              Hoje
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
