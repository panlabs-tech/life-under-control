import type { Calendar } from "@/core/ports/calendar"

/**
 * Adapter do `Calendar` sobre o **calendário bancário nacional** (ADR-0003). Dia
 * útil = não é fim de semana e não é feriado bancário nacional. Cobre os feriados
 * fixos nacionais e os móveis computados da Páscoa (carnaval, Sexta-feira Santa,
 * Corpus Christi). Não conhece feriado municipal nem estadual — é o calendário do
 * país, o mesmo para o Lar inteiro. O conjunto de feriados é memoizado por ano.
 */

/** Feriados fixos nacionais bancários, como `MM-DD`. */
const FIXOS = [
  "01-01", // Confraternização Universal
  "04-21", // Tiradentes
  "05-01", // Dia do Trabalho
  "09-07", // Independência
  "10-12", // Nossa Senhora Aparecida
  "11-02", // Finados
  "11-15", // Proclamação da República
  "11-20", // Consciência Negra (nacional desde 2024)
  "12-25", // Natal
] as const

function pad2(n: number): string {
  return String(n).padStart(2, "0")
}

/**
 * Domingo de Páscoa de um ano, como `[mes, dia]` (1-based), pelo algoritmo de
 * Meeus/Jones/Butcher (Computus gregoriano) — base dos feriados móveis.
 */
function domingoDePascoa(ano: number): { mes: number; dia: number } {
  const a = ano % 19
  const b = Math.floor(ano / 100)
  const c = ano % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const mes = Math.floor((h + l - 7 * m + 114) / 31)
  const dia = ((h + l - 7 * m + 114) % 31) + 1
  return { mes, dia }
}

/** Data civil `YYYY-MM-DD` a `offsetDias` da Páscoa (negativo = antes). */
function aPartirDaPascoa(ano: number, offsetDias: number): string {
  const { mes, dia } = domingoDePascoa(ano)
  const data = new Date(Date.UTC(ano, mes - 1, dia + offsetDias))
  return `${data.getUTCFullYear()}-${pad2(data.getUTCMonth() + 1)}-${pad2(data.getUTCDate())}`
}

function feriadosDoAno(ano: number): Set<string> {
  const set = new Set<string>()
  for (const md of FIXOS) set.add(`${ano}-${md}`)
  set.add(aPartirDaPascoa(ano, -48)) // carnaval — segunda
  set.add(aPartirDaPascoa(ano, -47)) // carnaval — terça
  set.add(aPartirDaPascoa(ano, -2)) // Sexta-feira Santa
  set.add(aPartirDaPascoa(ano, 60)) // Corpus Christi
  return set
}

export function nationalBankCalendar(): Calendar {
  const cache = new Map<number, Set<string>>()
  function feriados(ano: number): Set<string> {
    const cacheado = cache.get(ano)
    if (cacheado) return cacheado
    const set = feriadosDoAno(ano)
    cache.set(ano, set)
    return set
  }

  return {
    ehDiaUtil(iso: string): boolean {
      const [ano, mes, dia] = iso.split("-").map(Number)
      const diaSemana = new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay() // 0 dom … 6 sáb
      if (diaSemana === 0 || diaSemana === 6) return false
      return !feriados(ano).has(iso)
    },
  }
}
