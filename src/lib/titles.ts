// Domain constants and pure helpers for titles. Money is integer ARS, multiples of 1000.

import type { Rarity } from "@/types";

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
