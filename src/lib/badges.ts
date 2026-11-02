// Profile achievements, all derived from the public reign history so none can be lost.

import type { Badge } from "@/types";

const DAY_MS = 86_400_000;

// One of the player's reigns, reduced to what the badge rules look at.
export type BadgeReign = {
  titleSlug: string;
  pricePaid: number;
  startedAt: string;
  endedAt: string | null;
  isProvince: boolean;
  // Who this reign took the crown from ("none" = the throne was empty).
  dethroned: "none" | "human" | "bot";
};

type Rule = Omit<Badge, "earned"> & {
  earned: (reigns: BadgeReign[], timesDethroned: number, now: number) => boolean;
};

const dethrones = (reigns: BadgeReign[]): number =>
  reigns.filter((r) => r.dethroned !== "none").length;

const distinctTitles = (reigns: BadgeReign[]): number =>
  new Set(reigns.map((r) => r.titleSlug)).size;

// Most crowns held at the same instant; a reign ending as another starts does not overlap it.
function maxSimultaneous(reigns: BadgeReign[]): number {
  const events: [number, number][] = reigns.flatMap((r): [number, number][] =>
    r.endedAt
      ? [[Date.parse(r.startedAt), 1], [Date.parse(r.endedAt), -1]]
      : [[Date.parse(r.startedAt), 1]],
  );
  events.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let open = 0;
  let max = 0;
  for (const [, delta] of events) {
    open += delta;
    max = Math.max(max, open);
  }
  return max;
}

const RULES: Rule[] = [
  { emoji: "👑", name: "Primera Corona", description: "Reinar por primera vez", earned: (r) => r.length > 0 },
  { emoji: "⚔️", name: "Usurpador", description: "Destronar a alguien", earned: (r) => dethrones(r) >= 1 },
  { emoji: "🗡️", name: "Conquistador Serial", description: "Destronar 10 veces", earned: (r) => dethrones(r) >= 10 },
  { emoji: "🤖", name: "Cazabots", description: "Destronar a un bot", earned: (r) => r.some((x) => x.dethroned === "bot") },
  { emoji: "🗺️", name: "Señor Feudal", description: "Reinar en una provincia", earned: (r) => r.some((x) => x.isProvince) },
  { emoji: "🏰", name: "Imperio", description: "Tener 3 coronas al mismo tiempo", earned: (r) => maxSimultaneous(r) >= 3 },
  { emoji: "🎖️", name: "Coleccionista", description: "Reinar en 5 títulos distintos", earned: (r) => distinctTitles(r) >= 5 },
  {
    emoji: "⏳",
    name: "Dinastía",
    description: "Reinar 7 días seguidos en un trono",
    earned: (r, _, now) =>
      r.some((x) => (x.endedAt ? Date.parse(x.endedAt) : now) - Date.parse(x.startedAt) >= 7 * DAY_MS),
  },
  { emoji: "💸", name: "Derroche Real", description: "Pagar 10 👑 o más por una corona", earned: (r) => r.some((x) => x.pricePaid >= 10) },
  { emoji: "🔥", name: "Revancha", description: "Recuperar un trono que te sacaron", earned: (r) => distinctTitles(r) < r.length },
  { emoji: "🥀", name: "Mártir", description: "Ser destronado 10 veces", earned: (_, timesDethroned) => timesDethroned >= 10 },
];

// Evaluates every badge for a player from their reigns and how many times they were dethroned.
export function computeBadges(reigns: BadgeReign[], timesDethroned: number, now: number): Badge[] {
  return RULES.map(({ earned, ...badge }) => ({ ...badge, earned: earned(reigns, timesDethroned, now) }));
}
