import { BillLogoTile } from "@/components/financas/BillLogoTile"

/**
 * Chip 28×28 do header dos modais compactos (Final): o logo da Conta quando
 * existe, senão o ícone do catálogo — renderizado pelo tile único (#139), no
 * mesmo padrão neutro e levemente escurecido de toda a aplicação. Antes o chip
 * era ciano (accent); o tile é sempre neutro, ciano fica reservado pra ação.
 */
export function BillHeaderChip({ icon, logoUrl }: { icon: string; logoUrl: string | null }) {
  return <BillLogoTile icon={icon} logoUrl={logoUrl} size={28} iconSize={15} />
}
