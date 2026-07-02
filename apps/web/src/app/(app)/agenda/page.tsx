import { nationalBankCalendar } from "@/adapters/calendar/national-bank-calendar"
import { systemClock } from "@/adapters/clock/system-clock"
import { drizzleBillRepo } from "@/adapters/db/bill-repo.drizzle"
import { drizzleHouseholdRepo } from "@/adapters/db/household-repo.drizzle"
import { drizzlePaymentRepo } from "@/adapters/db/payment-repo.drizzle"
import { LinhaAgenda } from "@/components/agenda/LinhaAgenda"
import { PageHeader } from "@/components/ds/PageHeader"
import { derivarAgenda } from "@/core/use-cases/derive-agenda"
import { getPainel } from "@/core/use-cases/get-painel"
import { listAllPayments } from "@/core/use-cases/list-all-payments"
import { listBills } from "@/core/use-cases/list-bills"

export const dynamic = "force-dynamic"

export default async function AgendaPage() {
  const { lar } = await getPainel(drizzleHouseholdRepo())
  const [bills, pagamentos] = await Promise.all([
    listBills(drizzleBillRepo(), lar.id),
    listAllPayments(drizzlePaymentRepo(), lar.id),
  ])
  const grupos = derivarAgenda(systemClock(), nationalBankCalendar(), bills, pagamentos)

  return (
    <div className="luc-page-gutter py-7 lg:py-7">
      <div className="mx-auto max-w-[820px]">
        <PageHeader
          title="Agenda"
          description="Projeção no tempo do que vence e das Tarefas com data."
          className="mb-[26px]"
        />

        {grupos.length === 0 ? (
          <div className="rounded-[14px] border border-luc-border border-dashed bg-luc-surface-2 p-8 text-luc-text-2">
            Nada a vencer por aqui. Tudo em dia.
          </div>
        ) : (
          <>
            {grupos.map((grupo) => (
              <section key={grupo.titulo} className="mb-[26px]">
                <div className="mb-[11px] flex items-center gap-2.5">
                  <h2
                    className={`text-[13px] font-bold ${grupo.tone === "warn" ? "text-luc-warn" : "text-luc-text-strong"}`}
                  >
                    {grupo.titulo}
                  </h2>
                  <span className="text-[11.5px] text-luc-muted">{grupo.nota}</span>
                </div>
                <ul
                  className={`overflow-hidden rounded-[14px] border bg-luc-surface-2 ${
                    grupo.tone === "warn" ? "border-luc-warn/25" : "border-luc-border"
                  }`}
                >
                  {grupo.itens.map((item) => (
                    <LinhaAgenda key={`${item.geradorId}-${item.competencia}`} item={item} />
                  ))}
                </ul>
              </section>
            ))}
            <p className="text-[11px] text-luc-faint leading-relaxed">
              valores são estimativas da média histórica — o exato só nasce no Lançamento
            </p>
          </>
        )}
      </div>
    </div>
  )
}
