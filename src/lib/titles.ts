// Domain constants and pure helpers for titles. Money is integer Coronas (👑).

import type { RankedReign, Rarity } from "@/types";
import { formatReignDuration } from "@/lib/format";

export const BASE_PRICE = 1;
export const MIN_INCREMENT = 1;
// What propose_title charges (migration 0015); the database is the authority, this is for display.
export const TITLE_PROPOSAL_COST = 30;

// Derives a cosmetic rarity tier from a title's current price (base price when unclaimed).
export function rarity(currentPrice: number | null): Rarity {
  const price = currentPrice ?? BASE_PRICE;
  if (price >= 50) return "legendario";
  if (price >= 20) return "epico";
  return "comun";
}

export const RARITY_LABELS: Record<Rarity, string> = {
  legendario: "LEGENDARIO",
  epico: "ÉPICO",
  comun: "COMÚN",
};

// The next valid claim amount for a title (current price + increment, or base price when unclaimed).
export function minClaimAmount(currentPrice: number | null): number {
  return currentPrice === null ? BASE_PRICE : currentPrice + MIN_INCREMENT;
}

export type ReignForRanking = {
  id: string;
  holderName: string;
  holderIsBot: boolean;
  pricePaid: number;
  startedAt: string;
  endedAt: string | null;
};

// Ranks reigns by duration descending, returning the top `limit` as RankedReign objects.
export function rankReignsByDuration(
  reigns: ReignForRanking[],
  limit = 5,
): RankedReign[] {
  return [...reigns]
    .sort((a, b) => {
      const endA = a.endedAt ? new Date(a.endedAt).getTime() : Date.now();
      const endB = b.endedAt ? new Date(b.endedAt).getTime() : Date.now();
      const durA = endA - new Date(a.startedAt).getTime();
      const durB = endB - new Date(b.startedAt).getTime();
      return durB - durA;
    })
    .slice(0, limit)
    .map((r) => ({
      id: r.id,
      holderName: r.holderName,
      holderIsBot: r.holderIsBot,
      durationLabel: formatReignDuration(r.startedAt, r.endedAt),
      pricePaid: r.pricePaid,
      isActive: r.endedAt === null,
    }));
}
