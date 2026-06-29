import { type Bill, type BillBruto, validarDadosBill } from "../domain/bill"
import type { BillRepo } from "../ports/bill-repo"
import { BillInvalidaError } from "./create-bill"

/** A Conta-alvo não existe no Lar (id inexistente ou de outro Lar). */
export class BillNaoEncontradaError extends Error {
  constructor() {
    super("Conta não encontrada")
    this.name = "BillNaoEncontradaError"
  }
}

/**
 * Use-case: edita a *regra* de uma Conta do Lar. Valida no núcleo (a mesma regra
 * do cadastro — `validarDadosBill`) e persiste pelo port, nunca o store direto.
 * Reajustar a regra recalcula derivações futuras, jamais reescreve os fatos
 * passados (invariante #4): aqui só muda a Conta, não os Lançamentos. As duas
 * Pessoas editam tudo (acesso simétrico, #1).
 */
export async function editBill(
  repo: BillRepo,
  householdId: string,
  billId: string,
  bruto: BillBruto,
): Promise<Bill> {
  const res = validarDadosBill(bruto)
  if (!res.ok) throw new BillInvalidaError(res.erros)
  const atualizada = await repo.editarBill(householdId, billId, res.value)
  if (!atualizada) throw new BillNaoEncontradaError()
  return atualizada
}
