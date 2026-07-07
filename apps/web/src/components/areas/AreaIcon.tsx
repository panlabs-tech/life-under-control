import {
  Car,
  ChefHat,
  HeartPulse,
  House,
  type LucideIcon,
  Plug,
  Repeat,
  ShoppingCart,
  TrendingUp,
  Wallet,
} from "lucide-react"
import { WhatsAppGlyph } from "./WhatsAppGlyph"

/** Registro borda: nome do ícone (no catálogo do núcleo) → componente Lucide. */
const ICONS: Record<string, LucideIcon> = {
  wallet: Wallet,
  "chef-hat": ChefHat,
  "shopping-cart": ShoppingCart,
  "heart-pulse": HeartPulse,
  house: House,
  car: Car,
  "trending-up": TrendingUp,
  repeat: Repeat,
  plug: Plug,
}

/**
 * "whatsapp" é logo de marca (simple-icons), não ícone Lucide — caso especial
 * fora do mapa genérico, mas com a mesma assinatura (name, size).
 */
export function AreaIcon({ name, size = 20 }: { name: string; size?: number }) {
  if (name === "whatsapp") return <WhatsAppGlyph size={size} />

  const Icon = ICONS[name] ?? Wallet
  return <Icon size={size} strokeWidth={1.6} aria-hidden />
}
