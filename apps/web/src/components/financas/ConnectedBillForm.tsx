"use client"

import { useActionState } from "react"
import type { ContaFormState } from "@/app/(app)/areas/financas/actions"
import { BillForm } from "@/components/financas/BillForm"
import type { BillFormInicial } from "@/components/financas/bill-form-inicial"

/**
 * Liga o `BillForm` a um server action via `useActionState` — a fiação única de
 * cadastro e edição (borda fina). O Server Component passa o action pronto:
 * `criarConta` no cadastro, `editarConta.bind(null, billId)` na edição (o id
 * ligado no servidor, nunca vindo do formulário), mais os valores iniciais e os
 * rótulos do botão.
 */
export function ConnectedBillForm({
  action,
  inicial,
  submitLabel,
  submittingLabel,
}: {
  action: (prev: ContaFormState, formData: FormData) => Promise<ContaFormState>
  inicial?: BillFormInicial
  submitLabel?: string
  submittingLabel?: string
}) {
  const [state, formAction, pending] = useActionState(action, { erros: [] })
  return (
    <BillForm
      formAction={formAction}
      erros={state.erros}
      pending={pending}
      inicial={inicial}
      submitLabel={submitLabel}
      submittingLabel={submittingLabel}
    />
  )
}
