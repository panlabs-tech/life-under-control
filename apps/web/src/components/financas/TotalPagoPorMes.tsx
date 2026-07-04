"use client"

import { scaleLinear } from "@visx/scale"
import { ChartLine } from "lucide-react"
import { useState } from "react"
import { SectionHeading } from "@/components/ds/SectionHeading"
import { MESES, mesAno, mesCurto } from "@/core/domain/bill"
import { formatBRL } from "@/core/domain/money"
import type { PontoTotalPagoMes, SerieHistorica } from "@/core/use-cases/derive-analise-historica"
import type { DestaquesMes as Destaques } from "@/core/use-cases/derive-destaques-mes"
import { DestaquesMes } from "./DestaquesMes"

const WIDTH = 640
const HEIGHT = 190
const PAD_TOP = 22
const PAD_BOTTOM = 26
const PAD_X = 18

/** Um ponto sem cifra a exibir: mês fechado sem fato, ou mês corrente ainda sem Lançamento. */
function semValor(ponto: PontoTotalPagoMes): boolean {
  return ponto.estado === "sem-dado" || (ponto.estado === "em-curso" && ponto.valor === 0)
}

/** Rótulo textual de um ponto — traço + palavra, nunca só cor (mês parcial e ausência ditos por extenso). */
function textoPonto(ponto: PontoTotalPagoMes): string {
  const mes = mesAno(ponto.competencia)
  if (ponto.estado === "sem-dado") return `${mes} · sem dado`
  if (ponto.estado === "em-curso" && ponto.valor === 0) {
    return `${mes} · sem lançamento ainda · em curso`
  }
  const valor = formatBRL(ponto.valor)
  return ponto.estado === "em-curso" ? `${mes} · ${valor} · em curso` : `${mes} · ${valor}`
}

/** "Julho de 2026" — o título do tooltip, como o protótipo (mês por extenso). */
function tituloMes(competencia: string): string {
  return `${MESES[Number(competencia.slice(5, 7)) - 1]} de ${competencia.slice(0, 4)}`
}

/** A cifra do tooltip: valor formatado, ou a ausência dita por extenso. */
function valorTooltip(ponto: PontoTotalPagoMes): string {
  if (ponto.estado === "sem-dado") return "sem dado"
  if (ponto.estado === "em-curso" && ponto.valor === 0) return "sem lançamento ainda"
  return formatBRL(ponto.valor)
}

function ddmm(dataIso: string): string {
  return `${dataIso.slice(8, 10)}/${dataIso.slice(5, 7)}`
}

const ICONE = (
  <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-luc-md bg-luc-accent-12 text-luc-accent-bright">
    <ChartLine aria-hidden size={15} />
  </span>
)

/**
 * Análise Histórica (issue #98): a série do Total Pago por Mês nas doze
 * Competências até a atual, como o protótipo Final — uma linha de trajetória, não
 * barras. Meses fechados formam a linha sólida com área; o mês corrente é a cauda
 * tracejada com um ponto oco ("em curso"), nunca comparado (CONTEXT.md "mês em
 * curso × mês fechado"). Mês sem fato **quebra** a linha (nunca a puxa até zero:
 * ausência ≠ zero, invariante #3) e vira um marcador oco distinto. A seção nunca
 * some: sem fatos na janela, mostra a limitação por extenso. Consome a série
 * pronta do use-case — nada de domínio é recalculado aqui (ADR-0010). Ao lado do
 * gráfico, os destaques do último mês fechado (#101) compõem o grid do protótipo.
 */
export function TotalPagoPorMes({
  serie,
  destaques,
  hoje,
}: {
  serie: SerieHistorica
  destaques?: Destaques
  /** Data de hoje (`YYYY-MM-DD`) — só para o tooltip do mês em curso ("até dd/mm"). */
  hoje?: string
}) {
  return (
    <section aria-labelledby="historico-heading" className="flex flex-col gap-[18px]">
      <div aria-hidden className="border-luc-border border-t" />
      <SectionHeading
        id="historico-heading"
        title="Análise Histórica"
        variant="destaque"
        icon={ICONE}
      />
      <div className="flex flex-col gap-1">
        <span className="text-[11px] font-bold uppercase tracking-[0.13em] text-luc-text-3">
          Total Pago por Mês
        </span>
        <span className="text-xs text-luc-muted">
          A trajetória dos últimos 12 meses e as maiores variações do último mês fechado.
        </span>
      </div>
      {serie.estado === "sem-fatos" ? (
        <div className="rounded-luc-lg border border-luc-border bg-luc-surface-2 px-4 pt-[15px] pb-[13px]">
          <p className="text-xs text-luc-text-3">Sem Lançamentos na janela de 12 meses ainda.</p>
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(320px,1fr))] gap-3">
          <GraficoTotalPago pontos={serie.pontos} hoje={hoje} />
          {destaques && <DestaquesMes destaques={destaques} />}
        </div>
      )}
    </section>
  )
}

/** O card do gráfico Visx + a tabela `sr-only` equivalente. Isola o estado de foco/hover. */
function GraficoTotalPago({ pontos, hoje }: { pontos: PontoTotalPagoMes[]; hoje?: string }) {
  // Foco e hover à parte (como em `HistoriaConta`): passar o mouse por OUTRO
  // ponto não pode apagar o tooltip de quem está com foco de teclado.
  const [focado, setFocado] = useState<string | null>(null)
  const [emHover, setEmHover] = useState<string | null>(null)
  const ativo = focado ?? emHover

  // Escala só pelos meses fechados, na banda do protótipo: o domínio "dá zoom"
  // entre o menor e o maior mês fechado (lo = mín − 35% do intervalo; hi = máx
  // × 1,08) para a trajetória ocupar o quadro — o mês em curso é parcial, nunca
  // dita a escala (CONTEXT.md "mês em curso × mês fechado") e satura na borda.
  const valoresFechados = pontos
    .filter((ponto) => ponto.estado === "fechado")
    .map((ponto) => ponto.valor)
  const hiFechado = valoresFechados.length ? Math.max(...valoresFechados) : 1
  const loFechado = valoresFechados.length ? Math.min(...valoresFechados) : 0
  const hi = hiFechado * 1.08
  const lo = Math.max(0, loFechado - (hiFechado - loFechado) * 0.35)
  const span = hi - lo || 1
  const yTop = PAD_TOP
  const yBase = HEIGHT - PAD_BOTTOM
  const escalaY = scaleLinear<number>({ domain: [lo, hi], range: [yBase, yTop] })
  // Como o protótipo: transborda no máximo 3px em vez de grudar na borda.
  const yOf = (valor: number) => Math.max(yTop - 3, Math.min(yBase + 3, escalaY(valor)))

  const innerW = WIDTH - PAD_X * 2
  const xAt = (i: number) =>
    pontos.length === 1 ? WIDTH / 2 : PAD_X + (i * innerW) / (pontos.length - 1)
  const coords = pontos.map((ponto, i) => ({ ponto, x: xAt(i), y: yOf(ponto.valor) }))

  // A linha/área cobre só corridas de meses fechados; qualquer não-fechado
  // (sem-dado ou o mês em curso) **interrompe** o traço — a linha nunca cruza um
  // buraco como se fosse zero (invariante #3).
  const corridas: (typeof coords)[] = []
  let corrida: typeof coords = []
  for (const c of coords) {
    if (c.ponto.estado === "fechado") corrida.push(c)
    else if (corrida.length) {
      corridas.push(corrida)
      corrida = []
    }
  }
  if (corrida.length) corridas.push(corrida)

  const caminhoLinha = (corrida: typeof coords) =>
    corrida.map((c, k) => `${k === 0 ? "M" : "L"}${c.x} ${c.y}`).join(" ")
  // A área desce até a base do quadro (protótipo) — é moldura da trajetória,
  // não leitura proporcional; a cifra mora no tooltip e na tabela sr-only.
  const caminhoArea = (corrida: typeof coords) => {
    const primeiro = corrida[0]
    const ultimo = corrida[corrida.length - 1]
    const topo = corrida.map((c) => `L${c.x} ${c.y}`).join(" ")
    return `M${primeiro.x} ${yBase} ${topo} L${ultimo.x} ${yBase} Z`
  }

  // Cauda tracejada: do último mês fechado até o ponto do mês em curso (parcial).
  const emCurso = coords.find((c) => c.ponto.estado === "em-curso" && c.ponto.valor > 0)
  const ultimoFechado = [...coords].reverse().find((c) => c.ponto.estado === "fechado")
  const cauda =
    emCurso && ultimoFechado
      ? `M${ultimoFechado.x} ${ultimoFechado.y} L${emCurso.x} ${emCurso.y}`
      : null

  const gridYs = [0.82, 0.5, 0.18].map((f) => yOf(lo + span * f))
  const hitW = pontos.length > 1 ? innerW / (pontos.length - 1) : 80
  const pontoAtivo = pontos.find((ponto) => ponto.competencia === ativo)
  const coordAtiva = coords.find((c) => c.ponto.competencia === ativo)
  const temEmCurso = pontos.some((ponto) => ponto.estado === "em-curso")
  const tooltipLeft = coordAtiva ? Math.max(11, Math.min(89, (coordAtiva.x / WIDTH) * 100)) : 50

  return (
    <div className="rounded-luc-lg border border-luc-border bg-luc-surface-2 px-4 pt-[15px] pb-[13px]">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[10px] font-bold uppercase tracking-[0.11em] text-luc-text-3">
          Total pago por mês
        </span>
        <span className="font-mono text-[10.5px] text-luc-muted">
          {mesAno(pontos[0].competencia)} — {mesAno(pontos[pontos.length - 1].competencia)}
        </span>
      </div>

      <div className="relative mt-3">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          preserveAspectRatio="xMidYMid meet"
          className="block h-auto w-full"
        >
          <title>Total Pago por Mês</title>
          {gridYs.map((gy) => (
            <line
              key={gy}
              aria-hidden
              x1={PAD_X}
              x2={WIDTH - PAD_X}
              y1={gy}
              y2={gy}
              stroke="rgba(255,255,255,.05)"
              strokeWidth={1}
            />
          ))}

          {corridas.map((corrida) => (
            <path
              key={`area-${corrida[0].ponto.competencia}`}
              aria-hidden
              d={caminhoArea(corrida)}
              fill="var(--luc-accent)"
              fillOpacity={0.06}
              stroke="none"
            />
          ))}
          {corridas.map((corrida) => (
            <path
              key={`linha-${corrida[0].ponto.competencia}`}
              aria-hidden
              d={caminhoLinha(corrida)}
              fill="none"
              stroke="var(--luc-accent)"
              strokeWidth={2.2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}
          {cauda && (
            <path
              aria-hidden
              d={cauda}
              fill="none"
              stroke="var(--luc-accent)"
              strokeWidth={2.2}
              strokeDasharray="3 5"
              strokeLinecap="round"
              opacity={0.6}
            />
          )}

          {coordAtiva && (
            <line
              aria-hidden
              x1={coordAtiva.x}
              x2={coordAtiva.x}
              y1={yTop}
              y2={yBase}
              stroke="var(--luc-accent)"
              strokeWidth={1}
              opacity={0.38}
            />
          )}

          {coords.map(({ ponto, x, y }) => {
            const estaAtivo = ativo === ponto.competencia
            const compartilhado = {
              "data-testid": "total-pago-ponto",
              "data-estado": ponto.estado,
              tabIndex: 0,
              role: "graphics-symbol",
              "aria-label": textoPonto(ponto),
              onMouseEnter: () => setEmHover(ponto.competencia),
              onMouseLeave: () =>
                setEmHover((atual) => (atual === ponto.competencia ? null : atual)),
              onFocus: () => setFocado(ponto.competencia),
              onBlur: () => setFocado((atual) => (atual === ponto.competencia ? null : atual)),
              className: "cursor-pointer outline-none",
            }
            // Alvo invisível de largura de faixa: hover/foco generosos sem depender
            // do raio minúsculo do marcador.
            const hit = (
              <rect
                x={x - hitW / 2}
                y={PAD_TOP}
                width={hitW}
                height={yBase - PAD_TOP}
                fill="transparent"
              />
            )
            // Anel de destaque do ponto ativo (hover/foco), como o protótipo.
            const anel = estaAtivo && (
              <circle aria-hidden cx={x} cy={y} r={8.5} fill="var(--luc-accent)" opacity={0.22} />
            )

            if (ponto.estado === "sem-dado") {
              // Mês fechado sem fato: marcador oco na base, desconectado da linha —
              // ausência visível, não um ponto de zero (invariante #3).
              return (
                <g key={ponto.competencia} {...compartilhado}>
                  {hit}
                  <circle
                    cx={x}
                    cy={yBase}
                    r={3}
                    fill="none"
                    stroke="var(--luc-text-3)"
                    strokeWidth={1.5}
                    strokeDasharray="2 2"
                  />
                </g>
              )
            }

            if (ponto.estado === "em-curso" && ponto.valor === 0) {
              // Mês corrente ainda sem Lançamento: ponto oco na base — nunca um
              // zero disfarçado (invariante #3); o texto vive na legenda e no tooltip.
              return (
                <g key={ponto.competencia} {...compartilhado}>
                  {hit}
                  <circle
                    cx={x}
                    cy={yBase}
                    r={4}
                    fill="none"
                    stroke="var(--luc-accent)"
                    strokeWidth={2}
                    strokeDasharray="3 2"
                  />
                </g>
              )
            }

            if (ponto.estado === "em-curso") {
              // Ponto oco (open circle) no fim da cauda tracejada — parcial, por
              // forma além da cor.
              return (
                <g key={ponto.competencia} {...compartilhado}>
                  {anel}
                  {hit}
                  <circle
                    cx={x}
                    cy={y}
                    r={5}
                    fill="var(--luc-surface-2)"
                    stroke="var(--luc-accent)"
                    strokeWidth={2}
                  />
                </g>
              )
            }

            // Mês fechado: ponto sólido sobre a linha, contornado pela superfície
            // do card (o traço não "vaza" pelo ponto) — cresce quando ativo.
            return (
              <g key={ponto.competencia} {...compartilhado}>
                {anel}
                {hit}
                <circle
                  cx={x}
                  cy={y}
                  r={estaAtivo ? 4.5 : 3.5}
                  fill="var(--luc-accent)"
                  stroke="var(--luc-surface-2)"
                  strokeWidth={2}
                />
              </g>
            )
          })}
        </svg>

        <div aria-hidden className="pointer-events-none absolute inset-0">
          {coords.map(({ ponto, x }) => (
            <span
              key={ponto.competencia}
              style={{ left: `${(x / WIDTH) * 100}%`, top: `${((yBase + 12) / HEIGHT) * 100}%` }}
              className={`absolute -translate-x-1/2 whitespace-nowrap font-mono text-[9px] tracking-[0.02em] ${
                ponto.estado === "em-curso" ? "text-luc-text-3" : "text-luc-faint"
              }`}
            >
              {mesCurto(ponto.competencia)}
            </span>
          ))}
        </div>

        {pontoAtivo && (
          <div
            role="tooltip"
            style={{ left: `${tooltipLeft}%` }}
            className="pointer-events-none absolute top-0.5 z-[5] -translate-x-1/2 whitespace-nowrap rounded-luc-md border border-luc-border-strong bg-luc-surface-3 px-2.5 py-[7px] shadow-[0_12px_30px_rgba(0,0,0,.45)]"
          >
            <div className="text-[11px] font-bold text-luc-text">
              {tituloMes(pontoAtivo.competencia)}
            </div>
            <div className="mt-px font-mono text-[13px] font-semibold text-luc-text">
              {valorTooltip(pontoAtivo)}
            </div>
            {pontoAtivo.estado === "em-curso" && (
              <div className="mt-0.5 text-[10px] text-luc-warn">
                parcial · em curso{hoje ? ` até ${ddmm(hoje)}` : ""}
              </div>
            )}
          </div>
        )}
      </div>

      {temEmCurso && (
        <div className="mt-3 flex items-center gap-1.5 text-[10.5px] text-luc-faint">
          <span className="h-0 w-[15px] shrink-0 border-t-2 border-dashed border-luc-accent opacity-60" />
          <span>Último ponto: mês em curso (parcial).</span>
        </div>
      )}

      <table className="sr-only">
        <caption>Total Pago por Mês</caption>
        <thead>
          <tr>
            <th>Competência</th>
            <th>Valor</th>
            <th>Estado</th>
          </tr>
        </thead>
        <tbody>
          {pontos.map((ponto) => (
            <tr key={ponto.competencia}>
              <td>{mesAno(ponto.competencia)}</td>
              <td>{semValor(ponto) ? "sem dado" : formatBRL(ponto.valor)}</td>
              <td>{ponto.estado}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
