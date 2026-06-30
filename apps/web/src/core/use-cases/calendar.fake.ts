import type { Calendar } from "@/core/ports/calendar"

/**
 * Fake do `Calendar` para o Seam 1: dia útil = não é fim de semana **e** não está
 * na lista de feriados informada. Por padrão não há feriado — o teste injeta só os
 * que importam para o cenário (ex.: Corpus Christi num teste de N-ésimo dia útil).
 * O adapter real (`nationalBankCalendar`) é que computa o calendário bancário.
 */
export function fakeCalendar(feriados: string[] = []): Calendar {
  const naoUteis = new Set(feriados)
  return {
    ehDiaUtil(iso: string): boolean {
      if (naoUteis.has(iso)) return false
      const [ano, mes, dia] = iso.split("-").map(Number)
      const diaSemana = new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay() // 0 dom … 6 sáb
      return diaSemana !== 0 && diaSemana !== 6
    },
  }
}
