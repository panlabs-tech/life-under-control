import { type Bill, descreverMesPorExtenso } from "@/core/domain/bill"
import type { Payment } from "@/core/domain/payment"
import { assuntosDaArea } from "@/core/domain/subjects"
import type { Calendar } from "@/core/ports/calendar"
import type { Clock } from "@/core/ports/clock"
import type { FarolEstado } from "./derive-bill-card"
import { farolDaOcorrencia, fraseDaOcorrencia, type Ocorrencia } from "./derive-estado-ocorrencia"
import { mediaHistoricaAte } from "./derive-forma-competencia"
import { type ItemAgenda, projetarAgenda } from "./project-agenda"

/**
 * A Agenda pronta pra exibição (issue #60): enriquece a projeção (#23) com a
 * leitura de estado (#62 — farol e frase, nunca redefinida aqui) e a
 * estimativa de valor (média histórica, #61); agrupa por urgência temporal —
 * **Atrasado** (tudo `em-aberto`) sempre primeiro e à parte, depois um grupo
 * por mês de vencimento entre as ocorrências `aguardando`.
 */

/** Um item da Agenda pronto pra linha: a projeção (#23) + farol/frase (#62) + estimativa (#61). */
export type ItemAgendaView = ItemAgenda & {
  farol: FarolEstado
  frase: string
  /** O Assunto ativo da Área de origem — hoje só "Pagamentos Recorrentes" em Finanças. */
  assunto: string
  /** Média histórica até a Competência, em centavos; `null` sem histórico — nunca inventa. */
  valorEstimado: number | null
}

export type GrupoAgenda = {
  titulo: string
  nota: string
  tone: "warn" | "default"
  itens: ItemAgendaView[]
}

function assuntoAtivoDe(area: ItemAgenda["area"]): string {
  return assuntosDaArea(area).find((assunto) => assunto.estado === "ativa")?.nome ?? ""
}

/** Título do grupo de mês ("2026-07" → "Julho de 2026"), a partir do mês do vencimento. */
function tituloMes(mesVencimento: string): string {
  const descricao = descreverMesPorExtenso(mesVencimento)
  return descricao.charAt(0).toUpperCase() + descricao.slice(1)
}

function paraItemView(
  item: ItemAgenda,
  bills: Bill[],
  payments: Payment[],
  hoje: string,
): ItemAgendaView {
  // Todo item vem de `projetarAgenda(bills)` — a Conta de origem sempre existe na mesma lista.
  const bill = bills.find((b) => b.id === item.geradorId) as Bill
  const ocorrencia: Ocorrencia = {
    vencimento: item.vencimento,
    competencia: item.competencia,
    recurrence: bill.recurrence,
    quitada: false,
  }
  return {
    ...item,
    farol: farolDaOcorrencia(ocorrencia, hoje),
    frase: fraseDaOcorrencia(ocorrencia, hoje),
    assunto: assuntoAtivoDe(item.area),
    valorEstimado: mediaHistoricaAte(bill, payments, item.competencia),
  }
}

function agrupar(itens: ItemAgendaView[]): GrupoAgenda[] {
  const grupos: GrupoAgenda[] = []

  const atrasados = itens.filter((item) => item.estado === "em-aberto")
  if (atrasados.length > 0) {
    grupos.push({
      titulo: "Atrasado",
      nota: "venceu ou vence hoje, sem Lançamento",
      tone: "warn",
      itens: atrasados,
    })
  }

  const porMes = new Map<string, ItemAgendaView[]>()
  for (const item of itens.filter((entry) => entry.estado === "aguardando")) {
    const mes = item.vencimento.slice(0, 7)
    porMes.set(mes, [...(porMes.get(mes) ?? []), item])
  }
  for (const [mes, itensDoMes] of porMes) {
    grupos.push({
      titulo: tituloMes(mes),
      nota: "projeções das Contas",
      tone: "default",
      itens: itensDoMes,
    })
  }

  return grupos
}

/**
 * Deriva a Agenda pronta pra exibição. A borda injeta os adapters reais; o
 * Seam 1 injeta os fakes de `Clock` e `Calendar`.
 */
export function derivarAgenda(
  clock: Clock,
  calendar: Calendar,
  bills: Bill[],
  payments: Payment[],
): GrupoAgenda[] {
  const hoje = clock.hoje()
  // Um só `hoje` resolvido pro Clock inteiro da composição — thread manual via
  // um Clock congelado, pra `projetarAgenda` (que resolve o dele mesmo
  // internamente) nunca discordar do `hoje` usado aqui no farol/frase.
  const clockDeHoje: Clock = { hoje: () => hoje }
  const itens = projetarAgenda(clockDeHoje, calendar, bills, payments)
  return agrupar(itens.map((item) => paraItemView(item, bills, payments, hoje)))
}
