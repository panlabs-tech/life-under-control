// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import { DatePicker } from "./DatePicker"

/**
 * Seam: date-picker sob medida (#88) — substitui o `<input type="date">` nativo
 * do modal "Registrar pagamento". `hoje` é injetado para tornar "hoje" e a
 * navegação de mês determinísticos no teste (sem mexer no relógio real).
 */
afterEach(cleanup)

function renderDatePicker(props: Partial<React.ComponentProps<typeof DatePicker>> = {}) {
  const onChange = vi.fn()
  const utils = render(
    <>
      <label htmlFor="data-pagamento">Data de pagamento</label>
      <DatePicker
        id="data-pagamento"
        name="dataPagamento"
        value=""
        onChange={onChange}
        hoje="2026-07-03"
        {...props}
      />
    </>,
  )
  return { onChange, ...utils }
}

describe("DatePicker (issue #88)", () => {
  it("test_nao_usa_input_nativo_de_data", () => {
    renderDatePicker()
    expect(document.querySelector('input[type="date"]')).not.toBeInTheDocument()
  })

  it("test_trigger_mostra_placeholder_quando_vazio", () => {
    renderDatePicker()
    expect(screen.getByRole("button", { name: "Data de pagamento" })).toHaveTextContent(
      "dd/mm/aaaa",
    )
  })

  it("test_trigger_mostra_data_formatada_em_ptbr", () => {
    renderDatePicker({ value: "2026-06-29" })
    expect(screen.getByRole("button", { name: "Data de pagamento" })).toHaveTextContent(
      "29/06/2026",
    )
  })

  it("test_input_hidden_carrega_iso_para_submissao", () => {
    const { container } = renderDatePicker({ value: "2026-06-29" })
    const hidden = container.querySelector('input[name="dataPagamento"]')
    expect(hidden).toHaveAttribute("type", "hidden")
    expect(hidden).toHaveValue("2026-06-29")
  })

  it("test_clique_no_gatilho_abre_calendario_do_mes_de_hoje", async () => {
    const user = userEvent.setup()
    renderDatePicker()
    await user.click(screen.getByRole("button", { name: "Data de pagamento" }))
    expect(screen.getByRole("dialog", { name: "Escolher data" })).toBeInTheDocument()
    expect(screen.getByText("Julho de 2026")).toBeInTheDocument()
    expect(screen.getByText("Dom")).toBeInTheDocument()
  })

  it("test_selecionar_dia_chama_onChange_com_iso_e_fecha", async () => {
    const user = userEvent.setup()
    const { onChange } = renderDatePicker({ value: "2026-07-01" })
    await user.click(screen.getByRole("button", { name: "Data de pagamento" }))
    await user.click(screen.getByRole("button", { name: "9" }))
    expect(onChange).toHaveBeenCalledWith("2026-07-09")
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("test_atalho_hoje_seleciona_data_atual_e_fecha", async () => {
    const user = userEvent.setup()
    const { onChange } = renderDatePicker({ value: "2026-06-15" })
    await user.click(screen.getByRole("button", { name: "Data de pagamento" }))
    await user.click(screen.getByRole("button", { name: "Hoje" }))
    expect(onChange).toHaveBeenCalledWith("2026-07-03")
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("test_navegacao_proximo_mes_avanca_o_titulo", async () => {
    const user = userEvent.setup()
    renderDatePicker({ value: "2026-07-01" })
    await user.click(screen.getByRole("button", { name: "Data de pagamento" }))
    await user.click(screen.getByRole("button", { name: "Próximo mês" }))
    expect(screen.getByText("Agosto de 2026")).toBeInTheDocument()
  })

  it("test_escape_fecha_e_devolve_foco_ao_gatilho", async () => {
    const user = userEvent.setup()
    renderDatePicker({ value: "2026-07-01" })
    const trigger = screen.getByRole("button", { name: "Data de pagamento" })
    await user.click(trigger)
    await user.keyboard("{Escape}")
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it("test_clique_fora_fecha_sem_selecionar", async () => {
    const user = userEvent.setup()
    const { onChange } = renderDatePicker({ value: "2026-07-01" })
    await user.click(screen.getByRole("button", { name: "Data de pagamento" }))
    await user.click(document.body)
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
  })

  it("test_seta_direita_move_foco_um_dia_e_enter_seleciona", async () => {
    const user = userEvent.setup()
    const { onChange } = renderDatePicker({ value: "2026-07-01" })
    await user.click(screen.getByRole("button", { name: "Data de pagamento" }))
    await user.keyboard("{ArrowRight}")
    await user.keyboard("{Enter}")
    expect(onChange).toHaveBeenCalledWith("2026-07-02")
  })
})
