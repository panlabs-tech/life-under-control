// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it } from "vitest"
import { DarBaixaSurface } from "./DarBaixaSurface"

/** Seam 4 (borda, #63): a baixa expande sob o header, preservando o contexto. */
afterEach(cleanup)

describe("DarBaixaSurface (Seam 4, #63)", () => {
  it("test_colapsada_por_default_nao_monta_o_formulario", () => {
    render(
      <DarBaixaSurface abrirPorDefault={false}>
        <p>conteúdo da baixa</p>
      </DarBaixaSurface>,
    )
    const gatilho = screen.getByRole("button", { name: /dar baixa/i })
    expect(gatilho).toHaveAttribute("aria-expanded", "false")
    expect(screen.queryByText("conteúdo da baixa")).not.toBeInTheDocument()
  })

  it("test_abre_por_default_quando_pedido", () => {
    render(
      <DarBaixaSurface abrirPorDefault={true} competenciaLabel="Junho/2026">
        <p>conteúdo da baixa</p>
      </DarBaixaSurface>,
    )
    expect(screen.getByRole("button", { name: /dar baixa/i })).toHaveAttribute(
      "aria-expanded",
      "true",
    )
    expect(screen.getByText("conteúdo da baixa")).toBeVisible()
    expect(screen.getByRole("button", { name: /dar baixa/i })).toHaveTextContent("Junho/2026")
  })

  it("test_clicar_o_gatilho_alterna_a_expansao", async () => {
    const user = userEvent.setup()
    render(
      <DarBaixaSurface abrirPorDefault={false}>
        <p>conteúdo da baixa</p>
      </DarBaixaSurface>,
    )
    const gatilho = screen.getByRole("button", { name: /dar baixa/i })

    await user.click(gatilho)
    expect(gatilho).toHaveAttribute("aria-expanded", "true")
    expect(screen.getByText("conteúdo da baixa")).toBeVisible()

    await user.click(gatilho)
    expect(gatilho).toHaveAttribute("aria-expanded", "false")
    expect(screen.queryByText("conteúdo da baixa")).not.toBeInTheDocument()
  })
})
