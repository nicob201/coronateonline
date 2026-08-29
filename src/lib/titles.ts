// Domain constants and pure helpers for titles. Money is integer ARS, multiples of 1000.

import type { RankedReign, Rarity } from "@/types";
import { formatReignDuration } from "@/lib/format";

export const BASE_PRICE = 1000;
export const MIN_INCREMENT = 1000;

// Derives a cosmetic rarity tier from a title's current price (base price when unclaimed).
export function rarity(currentPrice: number | null): Rarity {
  const price = currentPrice ?? BASE_PRICE;
  if (price >= 50000) return "legendario";
  if (price >= 20000) return "epico";
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
      durationLabel: formatReignDuration(r.startedAt, r.endedAt),
      pricePaid: r.pricePaid,
      isActive: r.endedAt === null,
    }));
}
