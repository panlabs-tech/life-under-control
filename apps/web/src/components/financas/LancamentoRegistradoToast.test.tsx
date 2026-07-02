// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { act, cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { replaceMock } = vi.hoisted(() => ({ replaceMock: vi.fn() }))
vi.mock("next/navigation", () => ({
  usePathname: () => "/areas/financas/pagamentos-recorrentes/bill-1",
  useRouter: () => ({ replace: replaceMock }),
}))

import { LancamentoRegistradoToast } from "./LancamentoRegistradoToast"

/** Seam 3 (borda, #63): mostra o toast de sucesso e limpa a URL só quando ele some. */
beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  replaceMock.mockClear()
})

describe("LancamentoRegistradoToast (Seam 3, #63)", () => {
  it("test_mostra_a_mensagem_de_sucesso", () => {
    render(<LancamentoRegistradoToast mensagem="Lançamento registrado — Internet · Junho/2026" />)
    expect(screen.getByRole("status")).toHaveTextContent(
      "Lançamento registrado — Internet · Junho/2026",
    )
  })

  it("test_nao_limpa_a_url_antes_do_toast_sumir", () => {
    render(<LancamentoRegistradoToast mensagem="Lançamento registrado" />)
    expect(replaceMock).not.toHaveBeenCalled()
  })

  it("test_limpa_a_url_quando_o_toast_some", () => {
    render(<LancamentoRegistradoToast mensagem="Lançamento registrado" />)
    act(() => vi.advanceTimersByTime(4000))
    expect(replaceMock).toHaveBeenCalledWith("/areas/financas/pagamentos-recorrentes/bill-1", {
      scroll: false,
    })
  })
})
