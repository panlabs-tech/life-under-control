// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest"
import { cleanup, fireEvent, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { BillHeaderChip } from "./BillHeaderChip"

afterEach(cleanup)

describe("BillHeaderChip", () => {
  it("test_sem_logo_mostra_o_icone_do_catalogo_em_tile_neutro", () => {
    const { container } = render(<BillHeaderChip icon="wifi" logoUrl={null} />)

    expect(container.querySelector("img")).toBeNull()
    expect(container.querySelector("svg")).toBeInTheDocument()
    // o chip do header agora é neutro (via tile único, #139), nunca mais ciano.
    expect(container.firstElementChild?.className).not.toContain("bg-luc-accent-12")
  })

  it("test_com_logo_renderiza_o_tile_unico_escurecido_com_fallback", () => {
    const { container } = render(<BillHeaderChip icon="wifi" logoUrl="https://r2.fake/x" />)

    const img = container.querySelector("img") as HTMLImageElement
    expect(img).toHaveClass("brightness-90")

    // logo assinado que expira cai no ícone — antes o <img> cru não tinha onError.
    fireEvent.error(img)
    expect(container.querySelector("img")).toBeNull()
    expect(container.querySelector("svg")).toBeInTheDocument()
  })
})
