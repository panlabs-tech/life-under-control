import { describe, expect, it } from "vitest"
import { nationalBankCalendar } from "./national-bank-calendar"

describe("nationalBankCalendar", () => {
  const cal = nationalBankCalendar()

  it("test_dia_de_semana_comum_e_util", () => {
    expect(cal.ehDiaUtil("2026-06-09")).toBe(true) // terça comum
    expect(cal.ehDiaUtil("2026-04-22")).toBe(true) // quarta após Tiradentes
  })

  it("test_fim_de_semana_nao_e_util", () => {
    expect(cal.ehDiaUtil("2026-06-06")).toBe(false) // sábado
    expect(cal.ehDiaUtil("2026-06-07")).toBe(false) // domingo
  })

  it("test_feriado_fixo_em_dia_de_semana_nao_e_util", () => {
    expect(cal.ehDiaUtil("2026-01-01")).toBe(false) // Confraternização (quinta)
    expect(cal.ehDiaUtil("2026-04-21")).toBe(false) // Tiradentes (terça)
    expect(cal.ehDiaUtil("2026-11-20")).toBe(false) // Consciência Negra (nacional)
    expect(cal.ehDiaUtil("2026-12-25")).toBe(false) // Natal
  })

  it("test_feriado_isolado_nao_contamina_os_vizinhos", () => {
    // Tiradentes 21/04/2026 é terça: a segunda e a quarta ao redor seguem úteis
    expect(cal.ehDiaUtil("2026-04-20")).toBe(true)
    expect(cal.ehDiaUtil("2026-04-21")).toBe(false)
    expect(cal.ehDiaUtil("2026-04-22")).toBe(true)
  })

  it("test_feriados_moveis_computados_da_pascoa", () => {
    // Páscoa 2026 = 05/04 → carnaval 16-17/02, Sexta Santa 03/04, Corpus Christi 04/06
    expect(cal.ehDiaUtil("2026-02-16")).toBe(false) // carnaval segunda
    expect(cal.ehDiaUtil("2026-02-17")).toBe(false) // carnaval terça
    expect(cal.ehDiaUtil("2026-04-03")).toBe(false) // sexta-feira santa
    expect(cal.ehDiaUtil("2026-06-04")).toBe(false) // Corpus Christi
  })

  it("test_pascoa_recomputada_por_ano", () => {
    // Páscoa 2025 = 20/04 → Sexta Santa 18/04/2025 (ano diferente, móvel correto)
    expect(cal.ehDiaUtil("2025-04-18")).toBe(false)
    expect(cal.ehDiaUtil("2025-04-17")).toBe(true) // quinta comum
  })
})
