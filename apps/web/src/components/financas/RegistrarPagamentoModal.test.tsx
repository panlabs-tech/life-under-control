// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import { RegistrarPagamentoModal } from "./RegistrarPagamentoModal"

// next/navigation não tem router montado nos testes — mockamos o mínimo; a
// navegação em si (fechar/redirect) é do Next, não deste seam.
const replace = vi.fn()
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, refresh: vi.fn() }),
}))

// O módulo real de actions é "use server" e arrasta @/auth (next-auth) — fora
// do alcance do jsdom. O upload em duas etapas tem o próprio fluxo testado; o
// seam aqui é a composição do modal.
vi.mock("@/app/(app)/areas/financas/actions", () => ({
  prepararComprovante: vi.fn(),
  confirmarComprovante: vi.fn(),
}))

afterEach(() => {
  cleanup()
  replace.mockClear()
})

const PESSOAS = [
  {
    id: "p-1",
    nome: "Thiago",
    email: "thiago@x.com",
    googleEmail: null,
    hue: 210,
    inicial: "T",
    avatarKey: null,
    avatarUrl: null,
  },
]

describe("RegistrarPagamentoModal (Seam 2)", () => {
  it("test_modal_compacto_competencia_fixa_nota_e_comprovantes", () => {
    const { container } = render(
      <RegistrarPagamentoModal
        billId="luz"
        billName="Luz"
        billIcon="zap"
        action={async () => ({ erros: [] })}
        pessoas={PESSOAS}
        inicial={{
          valor: "120,00",
          dataPagamento: "2026-07-09",
          competencia: "2026-07",
          paidBy: "p-1",
        }}
        competenciasComLancamento={[]}
        contexto="competência julho de 2026 · vence em 6 dias (18/07)"
        notaValor="estimativa pelo histórico: ~R$ 120,00 — o valor exato nasce agora, no Lançamento"
        closeHref="/areas/financas/pagamentos-recorrentes"
        successHref="/areas/financas/pagamentos-recorrentes?lancadoConta=luz"
      />,
    )

    expect(screen.getByRole("dialog", { name: "Luz" })).toBeInTheDocument()
    expect(screen.getByText("Registrar Lançamento")).toBeInTheDocument()
    expect(
      screen.getByText("competência julho de 2026 · vence em 6 dias (18/07)"),
    ).toBeInTheDocument()

    // chip de ícone 28×28 da Conta no header (Final, #87)
    const chip = container.querySelector("header svg")
    expect(chip).toBeInTheDocument()

    // competência fixa da ocorrência do bloco: hidden, sem campo editável
    expect(screen.queryByLabelText("Competência")).not.toBeInTheDocument()
    const hidden = container.querySelector('input[name="competencia"]')
    expect(hidden).toHaveAttribute("type", "hidden")
    expect(hidden).toHaveValue("2026-07")

    expect(
      screen.getByText(
        "estimativa pelo histórico: ~R$ 120,00 — o valor exato nasce agora, no Lançamento",
      ),
    ).toBeInTheDocument()
    expect(screen.getByText("Escolher imagens ou PDFs")).toBeInTheDocument()
  })

  it("test_cancelar_navega_para_closeHref", async () => {
    const user = userEvent.setup()
    render(
      <RegistrarPagamentoModal
        billId="luz"
        billName="Luz"
        billIcon="zap"
        action={async () => ({ erros: [] })}
        pessoas={PESSOAS}
        inicial={{
          valor: "120,00",
          dataPagamento: "2026-07-09",
          competencia: "2026-07",
          paidBy: "p-1",
        }}
        competenciasComLancamento={[]}
        contexto="competência julho de 2026 · vence em 6 dias (18/07)"
        closeHref="/areas/financas/pagamentos-recorrentes"
        successHref="/areas/financas/pagamentos-recorrentes?lancadoConta=luz"
      />,
    )

    await user.click(screen.getByRole("button", { name: "Cancelar" }))
    expect(replace).toHaveBeenCalledWith("/areas/financas/pagamentos-recorrentes", {
      scroll: false,
    })
  })
})
