import { randomUUID } from "node:crypto"
import { chaveComprovante } from "../domain/attachment"
import { type Bill, formatarDataBr } from "../domain/bill"
import { formatBRL } from "../domain/money"
import { descreverCompetencia } from "../domain/payment"
import {
  type AcaoProposta,
  botoesDaProposta,
  estaExpirada,
  formatarLancamentoCriado,
  formatarPropostaMensagem,
  linhasContasProposta,
  mensagemPropostaExpirada,
  type PaymentProposal,
  type ResumoProposta,
} from "../domain/payment-proposal"
import type { AttachmentRepo } from "../ports/attachment-repo"
import type { AttachmentStore } from "../ports/attachment-store"
import type { BillRepo } from "../ports/bill-repo"
import type { Calendar } from "../ports/calendar"
import type { Clock } from "../ports/clock"
import type { ContaMatcher } from "../ports/conta-matcher"
import type { PaymentProposalRepo } from "../ports/payment-proposal-repo"
import type { PaymentRepo } from "../ports/payment-repo"
import type { WhatsappMessenger } from "../ports/whatsapp-messenger"
import { inferirCompetenciaRecibo } from "./inferir-competencia-recibo"
import { removerStagingSeguro } from "./propor-lancamento-comprovante"
import { recordPayment } from "./record-payment"
import { registerAttachment } from "./register-attachment"

/**
 * As respostas do casal a uma Proposta de Lançamento (#159): os botões Confirmar
 * / Trocar Conta / Cancelar e a escolha da Conta na lista. Roda **pós-resposta**
 * ao webhook (ADR-0012), sobre a Proposta já persistida (#158). **Confirmar** é o
 * único caminho que vira fato: cria o Lançamento (reusando `recordPayment`) e
 * promove o comprovante do staging à chave canônica (Anexo idêntico ao do
 * portal). Cancelar/expirar não deixam efeito no domínio — só limpam o staging.
 *
 * Expiração é **derivada do relógio** (`criadoEm + TTL`, invariante #3): o estado
 * `expirada` persistido é carimbo do ato de limpeza. Dois caminhos, sem job novo:
 * lazy (interação tardia aqui) e a varredura oportunista (`varrerPropostasExpiradas`).
 */

/** A Proposta sumiu (id de botão de uma Proposta que não existe mais) — orienta reenviar. */
export const MENSAGEM_PROPOSTA_SUMIU =
  "Não achei essa Proposta — talvez já tenha sido resolvida ou expirada. Manda o comprovante de novo. 🔁"
/** Clique num botão de Proposta que já saiu do estado aberto (confirmada/cancelada/expirada). */
export const MENSAGEM_JA_RESOLVIDA = "Essa Proposta já foi resolvida. 👍"
/** Confirmar sem Conta casada: força o Trocar Conta antes (sem Conta não há onde lançar). */
export const MENSAGEM_FALTA_CONTA =
  "Antes de confirmar, toque *Trocar Conta* pra eu saber em qual Conta lançar. 🙏"
/** Confirmar com valor/data/competência ilegível: não cria Lançamento inválido (ADR-0013). */
export const MENSAGEM_FALTA_DADO =
  "Faltou ler algum dado do comprovante. Manda ele de novo, por favor. 🙏"
/** Falha transitória ao criar o Lançamento (banco/R2) após o Confirmar — pede retry; a Proposta reabre. */
export const MENSAGEM_TENTE_CONFIRMAR_DE_NOVO =
  "Não consegui registrar agora. Toque *Confirmar* de novo daqui a pouco. 🙏"
/** Cancelamento: nada foi registrado. */
export const MENSAGEM_CANCELADO = "Cancelado — não registrei nada. 👍"
/** Trocar Conta sem nenhuma Conta ativa pra oferecer. */
export const MENSAGEM_SEM_CONTAS = "Você ainda não tem Contas ativas pra escolher."
/** Escolha de uma Conta que não existe/está inativa. */
export const MENSAGEM_CONTA_SUMIU = "Não achei essa Conta. Toque *Trocar Conta* de novo."
/** Cabeçalho da lista de Trocar Conta. */
export const TITULO_LISTA_CONTAS = "Qual é a Conta certa?"

/** Teto de linhas de uma lista interativa da Graph API. */
const MAX_LINHAS_LISTA = 10

export type ResponderDeps = {
  proposalRepo: PaymentProposalRepo
  paymentRepo: PaymentRepo
  attachmentRepo: AttachmentRepo
  billRepo: Pick<BillRepo, "listarBills">
  matcher: ContaMatcher
  store: AttachmentStore
  messenger: WhatsappMessenger
  clock: Clock
  calendar: Calendar
  /** Gera o id do Anexo — injetável pro teste ser determinístico. */
  novoId?: () => string
  log?: (mensagem: string) => void
}

/** Uma resposta do casal a uma Proposta, com a Pessoa e o Lar já resolvidos pela borda. */
export type InteracaoEntrada = {
  householdId: string
  remetente: string
  acao: AcaoProposta
}

/** Nome de exibição do comprovante no Anexo (cosmético) — o tipo dita a extensão. */
function nomeComprovante(proposta: PaymentProposal): string {
  const ext =
    proposta.tipoMime === "application/pdf" ? "pdf" : (proposta.tipoMime.split("/")[1] ?? "jpg")
  return `comprovante-whatsapp.${ext}`
}

/** Ordena as Contas pela ordem do ranking do matcher; as fora do ranking vão ao fim (ordem original). */
function ordenarPorRanking(bills: Bill[], ranking: string[]): Bill[] {
  const noRanking = ranking
    .map((id) => bills.find((b) => b.id === id))
    .filter((b): b is Bill => b != null)
  const resto = bills.filter((b) => !ranking.includes(b.id))
  return [...noRanking, ...resto]
}

export async function responderProposta(
  deps: ResponderDeps,
  entrada: InteracaoEntrada,
): Promise<void> {
  const log = deps.log ?? console.log
  const { householdId, remetente, acao } = entrada

  const proposta = await deps.proposalRepo.obterPorId(householdId, acao.proposalId)
  if (!proposta) {
    await deps.messenger.enviarTexto(remetente, MENSAGEM_PROPOSTA_SUMIU)
    return
  }

  // Expiração lazy: Proposta aberta e velha (createdAt+TTL < hoje) não vira fato —
  // carimba `expirada`, limpa o staging e orienta reenviar.
  if (proposta.estado === "proposta" && estaExpirada(proposta, deps.clock.hoje())) {
    await deps.proposalRepo.marcarExpirada(householdId, proposta.id)
    await removerStagingSeguro(deps.store, proposta.stagingKey, log)
    await deps.messenger.enviarTexto(remetente, mensagemPropostaExpirada())
    return
  }

  switch (acao.acao) {
    case "confirmar":
      return confirmar(deps, log, proposta, remetente)
    case "cancelar":
      return cancelar(deps, log, proposta, remetente)
    case "trocar":
      return apresentarContas(deps, log, proposta, remetente)
    case "escolher-conta":
      return trocarConta(deps, proposta, acao.billId, remetente)
  }
}

async function confirmar(
  deps: ResponderDeps,
  log: (m: string) => void,
  proposta: PaymentProposal,
  remetente: string,
): Promise<void> {
  const { householdId } = proposta
  // Sem Conta não há onde lançar; sem valor/data/competência o Lançamento seria
  // inválido (ADR-0013 não chuta) — orienta antes de tocar o estado.
  if (proposta.billId == null) {
    await deps.messenger.enviarTexto(remetente, MENSAGEM_FALTA_CONTA)
    return
  }
  if (
    proposta.valorCentavos == null ||
    proposta.dataPagamento == null ||
    proposta.competencia == null
  ) {
    await deps.messenger.enviarTexto(remetente, MENSAGEM_FALTA_DADO)
    return
  }

  // CAS `proposta→confirmada`: só um clique ganha — a trava de idempotência (2º
  // Confirmar devolve null e não cria 2º Lançamento).
  const confirmada = await deps.proposalRepo.confirmar(householdId, proposta.id)
  if (!confirmada) {
    await deps.messenger.enviarTexto(remetente, MENSAGEM_JA_RESOLVIDA)
    return
  }

  try {
    const payment = await recordPayment(
      deps.paymentRepo,
      deps.clock,
      householdId,
      proposta.billId,
      {
        valor: proposta.valorCentavos,
        dataPagamento: proposta.dataPagamento,
        competencia: proposta.competencia,
        paidBy: proposta.paidBy,
      },
    )
    const attachmentId = (deps.novoId ?? randomUUID)()
    const chave = chaveComprovante(householdId, payment.id, attachmentId)
    // Promove os bytes de staging→canônico (já estão no R2, só mudam de chave) e
    // registra o Anexo lendo o metadado real da chave canônica (honesto, #3).
    await deps.store.copiar(proposta.stagingKey, chave)
    await registerAttachment(
      deps.attachmentRepo,
      deps.store,
      householdId,
      payment.id,
      attachmentId,
      proposta.paidBy,
      nomeComprovante(proposta),
    )
    await removerStagingSeguro(deps.store, proposta.stagingKey, log)
  } catch (e) {
    // Falha após o CAS: compensa reabrindo (confirmada→proposta) pra o Confirmar
    // poder ser tentado de novo — nada de Proposta confirmada sem Lançamento.
    await deps.proposalRepo.reabrir(householdId, proposta.id)
    log(`whatsapp: falha ao criar Lançamento da Proposta ${proposta.id}: ${e}`)
    await deps.messenger.enviarTexto(remetente, MENSAGEM_TENTE_CONFIRMAR_DE_NOVO)
    return
  }

  const bill = (await deps.billRepo.listarBills(householdId)).find((b) => b.id === proposta.billId)
  const resumo: ResumoProposta = {
    contaNome: bill?.nome ?? null,
    valor: formatBRL(proposta.valorCentavos),
    dataPagamento: formatarDataBr(proposta.dataPagamento),
    competencia: bill
      ? descreverCompetencia(proposta.competencia, bill.recurrence)
      : proposta.competencia,
  }
  await deps.messenger.enviarTexto(remetente, formatarLancamentoCriado(resumo))
}

async function cancelar(
  deps: ResponderDeps,
  log: (m: string) => void,
  proposta: PaymentProposal,
  remetente: string,
): Promise<void> {
  const cancelada = await deps.proposalRepo.cancelar(proposta.householdId, proposta.id)
  if (!cancelada) {
    await deps.messenger.enviarTexto(remetente, MENSAGEM_JA_RESOLVIDA)
    return
  }
  await removerStagingSeguro(deps.store, proposta.stagingKey, log)
  await deps.messenger.enviarTexto(remetente, MENSAGEM_CANCELADO)
}

async function apresentarContas(
  deps: ResponderDeps,
  log: (m: string) => void,
  proposta: PaymentProposal,
  remetente: string,
): Promise<void> {
  const ativas = (await deps.billRepo.listarBills(proposta.householdId)).filter(
    (b) => b.estado === "ativa",
  )
  if (ativas.length === 0) {
    await deps.messenger.enviarTexto(remetente, MENSAGEM_SEM_CONTAS)
    return
  }
  // Ranqueia pelo mesmo matcher LLM (#177); se ele estiver fora, lista sem ordem
  // em vez de sumir — o casal ainda escolhe na mão.
  let ranking: string[] = []
  try {
    ranking = await deps.matcher(
      proposta.favorecido,
      ativas.map((b) => ({ billId: b.id, nome: b.nome })),
    )
  } catch (e) {
    log(`whatsapp: matcher fora no Trocar Conta da Proposta ${proposta.id}: ${e}`)
  }
  const ordenadas = ordenarPorRanking(ativas, ranking).slice(0, MAX_LINHAS_LISTA)
  const linhas = linhasContasProposta(
    proposta.id,
    ordenadas.map((b) => ({ billId: b.id, nome: b.nome })),
  )
  await deps.messenger.enviarLista(remetente, TITULO_LISTA_CONTAS, linhas)
}

async function trocarConta(
  deps: ResponderDeps,
  proposta: PaymentProposal,
  billId: string,
  remetente: string,
): Promise<void> {
  const { householdId } = proposta
  const bill = (await deps.billRepo.listarBills(householdId)).find(
    (b) => b.id === billId && b.estado === "ativa",
  )
  if (!bill) {
    await deps.messenger.enviarTexto(remetente, MENSAGEM_CONTA_SUMIU)
    return
  }

  // Re-infere a Competência pra Conta nova. Sem o vencimento impresso persistido
  // (não guardamos na Proposta), cai no fallback da ocorrência em aberto mais
  // próxima — que é o modelo "última em aberto" (decisão de 04/07).
  const payments = (await deps.paymentRepo.listarTodosPayments(householdId)).filter(
    (p) => p.billId === bill.id,
  )
  const competencia = inferirCompetenciaRecibo(
    bill,
    payments,
    deps.clock.hoje(),
    deps.calendar,
    null,
  )

  const atualizada = await deps.proposalRepo.atualizarConta(
    householdId,
    proposta.id,
    bill.id,
    competencia,
  )
  if (!atualizada) {
    await deps.messenger.enviarTexto(remetente, MENSAGEM_JA_RESOLVIDA)
    return
  }

  const resumo: ResumoProposta = {
    contaNome: bill.nome,
    valor: proposta.valorCentavos !== null ? formatBRL(proposta.valorCentavos) : null,
    dataPagamento: proposta.dataPagamento ? formatarDataBr(proposta.dataPagamento) : null,
    competencia: competencia ? descreverCompetencia(competencia, bill.recurrence) : null,
  }
  await deps.messenger.enviarBotoes(
    remetente,
    formatarPropostaMensagem(resumo),
    botoesDaProposta(proposta.id),
  )
}

/**
 * Varredura oportunista de Propostas expiradas (#159): roda pós-resposta de
 * qualquer evento processado, sem job novo. Lista as abertas, e para cada uma que
 * o relógio já expirou carimba `expirada` e remove o staging órfão — nada de bytes
 * de Proposta velha sobrevivendo no bucket.
 */
export async function varrerPropostasExpiradas(deps: {
  proposalRepo: Pick<PaymentProposalRepo, "listarAbertas" | "marcarExpirada">
  store: Pick<AttachmentStore, "remover">
  clock: Clock
  log?: (mensagem: string) => void
}): Promise<void> {
  const log = deps.log ?? console.log
  const hoje = deps.clock.hoje()
  const abertas = await deps.proposalRepo.listarAbertas()
  for (const p of abertas) {
    if (!estaExpirada(p, hoje)) continue
    await deps.proposalRepo.marcarExpirada(p.householdId, p.id)
    await removerStagingSeguro(deps.store, p.stagingKey, log)
  }
}
