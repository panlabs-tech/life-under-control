// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { AreaIcon } from "./AreaIcon"

afterEach(cleanup)

describe("AreaIcon (side quest #152)", () => {
  it("test_nome_whatsapp_renderiza_glifo_de_marca_nao_lucide", () => {
    const { container } = render(<AreaIcon name="whatsapp" size={18} />)
    const svg = container.querySelector("svg")

    expect(svg).toHaveAttribute("viewBox", "0 0 24 24")
    expect(container.querySelector("path")?.getAttribute("d")).toMatch(/^M17.472 14.382/)
  })

  it("test_nome_plug_resolve_icone_lucide_do_mapa", () => {
    const { container } = render(<AreaIcon name="plug" size={18} />)

    expect(container.querySelector("svg")).toBeInTheDocument()
    expect(container.querySelector("path")?.getAttribute("d")).not.toMatch(/^M17.472 14.382/)
  })
})
