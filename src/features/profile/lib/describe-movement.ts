import type { CoinMovement } from "@/types";

// Builds the Spanish label for a wallet movement ("Destronaste a Nico · Rey de Córdoba").
export function describeMovement(m: CoinMovement): string {
  const where = m.titleName ? ` · ${m.titleName}` : "";
  switch (m.reason) {
    case "welcome":
      return "Saldo inicial";
    case "salary":
      return "Sueldo diario";
    case "dethrone":
      return m.counterpartName ? `Destronaste a ${m.counterpartName}${where}` : `Te coronaste${where}`;
    case "dethroned":
      return `Te destronó ${m.counterpartName ?? "alguien"}${where}`;
    case "proposal":
      return "Propuesta de título";
    case "proposal_refund":
      return "Reembolso: propuesta rechazada";
    default:
      return m.reason;
  }
}
