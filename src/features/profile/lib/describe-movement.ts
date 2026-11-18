import type { CoinMovement } from "@/types";

// Builds the Spanish label for a wallet movement ("Destronaste a Nico"); the card adds the bot chip and the title after it.
export function describeMovement(m: CoinMovement): string {
  switch (m.reason) {
    case "welcome":
      return "Saldo inicial";
    case "salary":
      return "Sueldo diario";
    case "dethrone":
      return m.counterpartName ? `Destronaste a ${m.counterpartName}` : "Te coronaste";
    case "dethroned":
      return `Te destronó ${m.counterpartName ?? "alguien"}`;
    case "proposal":
      return "Propuesta de título";
    case "proposal_refund":
      return "Reembolso: propuesta rechazada";
    default:
      return m.reason;
  }
}
