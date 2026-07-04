"use client"

import { usePathname, useRouter } from "next/navigation"
import { Toast } from "@/components/ds/Toast"

/**
 * Toast de sucesso da edição rápida (#97): a action redireciona com `?editado=`
 * (a única forma de o Server Component avisar o cliente depois do `redirect`);
 * este componente mostra o toast — na veste info do protótipo, com botão de fechar —
 * e só limpa o parâmetro quando ele já sumiu, nunca antes, pra não cortar o
 * toast no meio por causa do refetch do RSC.
 */
export function ContaEditadaToast({ mensagem }: { mensagem: string }) {
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
