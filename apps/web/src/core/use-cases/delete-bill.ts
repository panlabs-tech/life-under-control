import type { BillRepo, DependentesBill } from "../ports/bill-repo"
import { BillNaoEncontradaError } from "./edit-bill"

/**
 * Use-case: lê quantos dependentes (Lançamentos/Anexos) a exclusão de uma Conta
 * levaria junto — a contagem que a confirmação destrutiva mostra antes do aviso.
 * Lê pelo port, nunca o store direto.
 */
export async function resumoDeExclusao(
  repo: BillRepo,
  householdId: string,
  billId: string,
): Promise<DependentesBill> {
  return repo.contarDependentes(householdId, billId)
}

/**
 * Use-case: deleta uma Conta do Lar — destrutivo. Apaga a Conta junto com seus
 * Lançamentos e Anexos e devolve a contagem do que levou (para a borda confirmar
 * o que foi feito). `null` do port (Conta inexistente ou de outro Lar) vira erro.
 * As duas Pessoas deletam (acesso simétrico, #1).
 */
export async function deleteBill(
  repo: BillRepo,
  householdId: string,
  billId: string,
): Promise<DependentesBill> {
  const removidos = await repo.deletarBill(householdId, billId)
  if (!removidos) throw new BillNaoEncontradaError()
  return removidos
}
