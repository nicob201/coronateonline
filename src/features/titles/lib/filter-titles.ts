import { minClaimAmount } from "@/lib/titles";
import type { TitleCard } from "@/types";
import type { TitleFilters } from "../schemas/title-filters.schema";

type Viewer = { id: string; balance: number };
type Compare = (a: TitleCard, b: TitleCard) => number;

export type CategoryCounts = Record<TitleFilters["cat"], number>;

// Lowercases and strips accents so "cordoba" matches "Córdoba".
const fold = (text: string): string => text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
const cost = (t: TitleCard): number => minClaimAmount(t.price);
const time = (iso: string | null): number => (iso ? Date.parse(iso) : 0);
const byName: Compare = (a, b) => a.name.localeCompare(b.name, "es-AR");

const SORTS: Record<TitleFilters["orden"], Compare> = {
  caros: (a, b) => cost(b) - cost(a) || byName(a, b),
  baratos: (a, b) => cost(a) - cost(b) || byName(a, b),
  nuevos: (a, b) => time(b.created_at) - time(a.created_at) || byName(a, b),
  recientes: (a, b) => time(b.reignStartedAt) - time(a.reignStartedAt) || byName(a, b),
};

// Applies the /titulos search, "Me alcanza", category and order; category counts ignore only the category pick.
// ponytail: filters every title in memory; move to SQL (unaccent + trigram index) if titles reach the hundreds.
export function filterTitles(
  titles: TitleCard[],
  filters: TitleFilters,
  viewer: Viewer | null,
): { results: TitleCard[]; counts: CategoryCounts } {
  const q = fold(filters.q);
  const matching = titles.filter(
    (t) =>
      (!q || fold(`${t.name} ${t.description}`).includes(q)) &&
      (!filters.alcanza || !viewer || (t.holderUserId !== viewer.id && cost(t) <= viewer.balance)),
  );

  const counts: CategoryCounts = { todos: matching.length, provincias: 0, clasicos: 0, comunidad: 0 };
  for (const t of matching) counts[t.category] += 1;

  const results = matching
    .filter((t) => filters.cat === "todos" || t.category === filters.cat)
    .sort(SORTS[filters.orden]);
  return { results, counts };
}
