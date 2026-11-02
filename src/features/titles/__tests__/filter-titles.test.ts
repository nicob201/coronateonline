import { describe, expect, it } from "vitest";
import { filterTitles } from "../lib/filter-titles";
import { titleFiltersSchema, type TitleFilters } from "../schemas/title-filters.schema";
import type { TitleCard } from "@/types";

function card(overrides: Partial<TitleCard>): TitleCard {
  return {
    id: "t",
    slug: "rey",
    name: "Rey",
    emoji: "👑",
    description: "Una corona.",
    created_at: "2026-10-01T00:00:00Z",
    holder: null,
    holderUserId: null,
    price: null,
    priceFloor: 1,
    reignStartedAt: null,
    rarity: "comun",
    point: null,
    category: "clasicos",
    ...overrides,
  };
}

const TITLES: TitleCard[] = [
  card({ id: "cba", name: "Rey de Córdoba", category: "provincias", price: 40, reignStartedAt: "2026-11-01T00:00:00Z", created_at: "2026-10-01T00:00:00Z" }),
  card({ id: "pizza", name: "Rey de la Pizza", description: "Muzza y fainá.", price: 4, holderUserId: "me", reignStartedAt: "2026-11-02T00:00:00Z", created_at: "2026-08-01T00:00:00Z" }),
  card({ id: "fernet", name: "Rey del Fernet", category: "comunidad", price: 1, reignStartedAt: "2026-10-30T00:00:00Z", created_at: "2026-11-02T00:00:00Z" }),
  card({ id: "libre", name: "Duque del Asado", price: null, created_at: "2026-09-01T00:00:00Z" }),
];

const filters = (overrides: Partial<TitleFilters> = {}): TitleFilters => ({
  ...titleFiltersSchema.parse({}),
  ...overrides,
});

const ids = (titles: TitleCard[]): string[] => titles.map((t) => t.id);

describe("titleFiltersSchema", () => {
  it("defaults to everything, priciest first", () => {
    expect(titleFiltersSchema.parse({})).toEqual({ q: "", cat: "todos", orden: "caros", alcanza: false });
  });

  it("falls back to defaults on junk instead of failing the page", () => {
    expect(
      titleFiltersSchema.parse({ q: ["a", "b"], cat: "reyes", orden: "random", alcanza: "si" }),
    ).toEqual({ q: "", cat: "todos", orden: "caros", alcanza: false });
  });

  it("reads a full query", () => {
    expect(
      titleFiltersSchema.parse({ q: "  fernet ", cat: "comunidad", orden: "baratos", alcanza: "1" }),
    ).toEqual({ q: "fernet", cat: "comunidad", orden: "baratos", alcanza: true });
  });
});

describe("filterTitles", () => {
  it("searches name and description ignoring case and accents", () => {
    expect(ids(filterTitles(TITLES, filters({ q: "CORDOBA" }), null).results)).toEqual(["cba"]);
    expect(ids(filterTitles(TITLES, filters({ q: "faina" }), null).results)).toEqual(["pizza"]);
  });

  it("counts categories after the search, before picking one", () => {
    const { results, counts } = filterTitles(TITLES, filters({ q: "rey", cat: "comunidad" }), null);
    expect(ids(results)).toEqual(["fernet"]);
    expect(counts).toEqual({ todos: 3, provincias: 1, clasicos: 1, comunidad: 1 });
  });

  it("keeps only titles the viewer can afford and does not already hold", () => {
    const viewer = { id: "me", balance: 5 };
    expect(ids(filterTitles(TITLES, filters({ alcanza: true }), viewer).results)).toEqual(["fernet", "libre"]);
  });

  it("ignores Me alcanza for a signed-out visitor", () => {
    expect(filterTitles(TITLES, filters({ alcanza: true }), null).results).toHaveLength(4);
  });

  it.each([
    ["caros", ["cba", "pizza", "fernet", "libre"]],
    ["baratos", ["libre", "fernet", "pizza", "cba"]],
    ["nuevos", ["fernet", "cba", "libre", "pizza"]],
    ["recientes", ["pizza", "cba", "fernet", "libre"]],
  ] as const)("sorts by %s", (orden, expected) => {
    expect(ids(filterTitles(TITLES, filters({ orden }), null).results)).toEqual(expected);
  });
});
