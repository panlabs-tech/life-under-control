/**
 * Port do calendário (ADR-0003). Responde a única pergunta que as derivações da
 * Conta precisam: **um dia é dia útil bancário?** O núcleo resolve o vencimento
 * esperado (N-ésimo dia útil, último dia útil) sem conhecer o calendário real —
 * o adapter carrega o calendário bancário nacional (fins de semana + feriados
 * fixos + móveis computados da Páscoa; sem feriado municipal). O fake do Seam 1
 * injeta os dias não-úteis que o teste quiser.
 */
export type Calendar = {
  /** O dia civil (`YYYY-MM-DD`) é dia útil bancário (nem fim de semana nem feriado)? */
  ehDiaUtil(iso: string): boolean
}
