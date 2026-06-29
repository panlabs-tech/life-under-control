"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { drizzleBillRepo } from "@/adapters/db/bill-repo.drizzle"
import { drizzleHouseholdRepo } from "@/adapters/db/household-repo.drizzle"
import type { BillBruto, ErroCampo } from "@/core/domain/bill"
import { BillInvalidaError, createBill } from "@/core/use-cases/create-bill"
import { deleteBill } from "@/core/use-cases/delete-bill"
import { BillNaoEncontradaError, editBill } from "@/core/use-cases/edit-bill"
import { EncerramentoInvalidoError, encerrarBill } from "@/core/use-cases/encerrar-bill"
import { getPainel } from "@/core/use-cases/get-painel"

/** Estado do formulário de Conta entre submissões — só os erros por campo (vazio = ok). */
export type ContaFormState = { erros: ErroCampo[] }

/** Estado do encerramento entre submissões — uma mensagem de erro (vazio = ok). */
export type EncerrarContaState = { erro?: string }

/** A lista de Finanças — destino e chave de revalidação de toda ação de Conta. */
const ROTA_FINANCAS = "/areas/financas"

/** Cauda comum de toda mutação bem-sucedida: revalida a lista e volta pra ela. */
function voltarParaFinancas(): never {
  revalidatePath(ROTA_FINANCAS)
  redirect(ROTA_FINANCAS)
}

/** Lê um campo numérico do form: vazio/ausente → null; texto inválido → null. */
function numeroOuNull(v: FormDataEntryValue | null): number | null {
  if (v == null || v === "") return null
  const n = Number(v)
  return Number.isNaN(n) ? null : n
}

/** Traduz o FormData do wizard num `BillBruto` cru — fonte única para criar e editar. */
function lerBrutoDoForm(formData: FormData): BillBruto {
  const descricao = formData.get("descricao")
  return {
    nome: String(formData.get("nome") ?? ""),
    descricao: descricao ? String(descricao) : null,
    icon: String(formData.get("icon") ?? ""),
    intervalMonths: numeroOuNull(formData.get("intervalMonths")) ?? Number.NaN,
    anchorMonth: numeroOuNull(formData.get("anchorMonth")),
    dueRuleKind: String(formData.get("dueRuleKind") ?? ""),
    dueRuleDay: numeroOuNull(formData.get("dueRuleDay")),
    dueRuleNth: numeroOuNull(formData.get("dueRuleNth")),
    dueMonthOffset: numeroOuNull(formData.get("dueMonthOffset")),
  }
}

/**
 * Server action de cadastro de Conta (borda fina — ADR-0003). Traduz o FormData
 * em `BillBruto`, resolve o Lar logado (o `householdId` nunca vem do formulário)
 * e chama o use-case `createBill`. Em erro de validação, devolve os erros por
 * campo para o wizard; no sucesso, revalida e volta à lista.
 */
export async function criarConta(
  _prev: ContaFormState,
  formData: FormData,
): Promise<ContaFormState> {
  const bruto = lerBrutoDoForm(formData)

  // Resolve o Lar pelo use-case (não o store direto): a borda fala com use-case
  // (ADR-0003), e LarNaoEncontradoError é a mesma falha que a página já trata.
  const { lar } = await getPainel(drizzleHouseholdRepo())

  try {
    await createBill(drizzleBillRepo(), lar.id, bruto)
  } catch (e) {
    if (e instanceof BillInvalidaError) return { erros: e.erros }
    throw e
  }

  voltarParaFinancas()
}

/**
 * Server action de edição da regra de uma Conta. `billId` chega ligado (`.bind`)
 * pela borda — nunca do formulário. Reajustar a regra recalcula derivações
 * futuras, jamais reescreve os fatos passados (invariante #4).
 */
export async function editarConta(
  billId: string,
  _prev: ContaFormState,
  formData: FormData,
): Promise<ContaFormState> {
  const bruto = lerBrutoDoForm(formData)
  const { lar } = await getPainel(drizzleHouseholdRepo())

  try {
    await editBill(drizzleBillRepo(), lar.id, billId, bruto)
  } catch (e) {
    if (e instanceof BillInvalidaError) return { erros: e.erros }
    if (e instanceof BillNaoEncontradaError) redirect(ROTA_FINANCAS)
    throw e
  }

  voltarParaFinancas()
}

/**
 * Server action de encerramento. Grava `encerrada` + a data civil informada (a
 * Pessoa pode datar "quando cancelei"); a Conta sai da lista ativa e cessa a
 * projeção. Data inválida volta como mensagem; sucesso revalida e volta à lista.
 */
export async function encerrarConta(
  billId: string,
  _prev: EncerrarContaState,
  formData: FormData,
): Promise<EncerrarContaState> {
  const encerradaEm = String(formData.get("encerradaEm") ?? "")
  const { lar } = await getPainel(drizzleHouseholdRepo())

  try {
    await encerrarBill(drizzleBillRepo(), lar.id, billId, encerradaEm)
  } catch (e) {
    if (e instanceof EncerramentoInvalidoError)
      return { erro: "Informe uma data de encerramento válida." }
    if (e instanceof BillNaoEncontradaError) redirect(ROTA_FINANCAS)
    throw e
  }

  voltarParaFinancas()
}

/**
 * Server action de exclusão — destrutivo. Apaga a Conta e seus dependentes
 * (Lançamentos/Anexos). A contagem do aviso é mostrada antes, na borda; aqui só
 * se executa após a confirmação. Conta já ausente apenas volta à lista.
 */
export async function deletarConta(billId: string): Promise<void> {
  const { lar } = await getPainel(drizzleHouseholdRepo())

  try {
    await deleteBill(drizzleBillRepo(), lar.id, billId)
  } catch (e) {
    if (e instanceof BillNaoEncontradaError) redirect(ROTA_FINANCAS)
    throw e
  }

  voltarParaFinancas()
}
