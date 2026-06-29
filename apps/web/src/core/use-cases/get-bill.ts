import type { Bill } from "../domain/bill"
import type { BillRepo } from "../ports/bill-repo"

/**
 * Use-case: carrega uma Conta do Lar por id. Borda (Server Component) chama isto,
 * nunca o store direto. `null` quando não existe ou é de outro Lar — a borda
 * traduz em 404. Acesso simétrico: qualquer Pessoa do Lar lê (#1).
 */
export async function getBill(
  repo: BillRepo,
  householdId: string,
  billId: string,
): Promise<Bill | null> {
  return repo.obterBill(householdId, billId)
}
