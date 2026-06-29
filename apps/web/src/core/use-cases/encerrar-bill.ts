import { type Bill, ehDataIsoValida } from "../domain/bill"
import type { BillRepo } from "../ports/bill-repo"
import { BillNaoEncontradaError } from "./edit-bill"

/** A data de encerramento não é uma data civil válida (`YYYY-MM-DD` real). */
export class EncerramentoInvalidoError extends Error {
  constructor() {
    super("Data de encerramento inválida")
    this.name = "EncerramentoInvalidoError"
  }
}

/**
 * Use-case: encerra uma Conta **ativa** do Lar numa data civil. A Conta passa a
 * `encerrada`, sai da lista ativa e cessa a projeção dali pra frente, preservando
 * o histórico (#9 / invariante #4). A data ("quando cancelei o serviço") vem da
 * borda — o use-case não lê relógio, então é testável sem Clock real. O port só
 * encerra quem está ativa (transição atômica): encerrar de novo não acha Conta
 * ativa e lança `BillNaoEncontradaError`, nunca reescreve a data original. As
 * duas Pessoas encerram (acesso simétrico, #1).
 */
export async function encerrarBill(
  repo: BillRepo,
  householdId: string,
  billId: string,
  encerradaEm: string,
): Promise<Bill> {
  if (!ehDataIsoValida(encerradaEm)) throw new EncerramentoInvalidoError()
  const encerrada = await repo.encerrarBill(householdId, billId, encerradaEm)
  if (!encerrada) throw new BillNaoEncontradaError()
  return encerrada
}
