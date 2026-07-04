"use client"

import { usePathname, useRouter } from "next/navigation"
import { Toast } from "@/components/ds/Toast"

/**
 * Toast de sucesso da baixa (#63): a Conta redireciona com `?lancado=` na URL
 * (a única forma de o Server Component avisar o cliente depois do `redirect`);
 * este componente mostra o toast e só limpa o parâmetro quando ele já sumiu —
 * nunca antes, pra não cortar o toast no meio por causa do refetch do RSC.
 */
export function LancamentoRegistradoToast({ mensagem }: { mensagem: string }) {
  const router = useRouter()
  const pathname = usePathname()
  return (
    <Toast
      mensagem={mensagem}
      comFechar
      onDismiss={() => router.replace(pathname, { scroll: false })}
    />
  )
}
