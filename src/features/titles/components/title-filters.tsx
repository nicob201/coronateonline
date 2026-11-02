"use client";

import { useRef, useTransition, type FormEvent } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { CategoryCounts } from "../lib/filter-titles";
import { TITLE_CATEGORIES, TITLE_SORTS, type TitleFilters as Filters } from "../schemas/title-filters.schema";

const CATEGORY_LABELS: Record<Filters["cat"], string> = {
  todos: "Todos",
  provincias: "Provincias",
  clasicos: "Clásicos",
  comunidad: "De la comunidad",
};

const SORT_LABELS: Record<Filters["orden"], string> = {
  caros: "Más caros",
  baratos: "Más baratos",
  nuevos: "Más nuevos",
  recientes: "Recién conquistados",
};

const CHIP = "px-4 py-2 rounded-full border text-body-sm font-body-sm whitespace-nowrap transition-colors";
const CHIP_ON = "border-primary bg-primary/15 text-primary";
const CHIP_OFF = "border-outline-variant/30 text-on-surface-variant hover:border-primary/50";

// /titulos search box, category chips with counts, sort and "Me alcanza"; every choice lives in the URL.
export function TitleFilters({
  filters,
  counts,
  signedIn,
}: {
  filters: Filters;
  counts: CategoryCounts;
  signedIn: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const typing = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Sets one param (null or the default removes it) and swaps the URL without a scroll jump.
  function update(key: keyof Filters, value: string | null) {
    const params = new URLSearchParams(searchParams);
    if (value) params.set(key, value);
    else params.delete(key);
    const query = params.toString();
    startTransition(() => router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false }));
  }

  function search(value: string) {
    clearTimeout(typing.current);
    typing.current = setTimeout(() => update("q", value.trim() || null), 300);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearTimeout(typing.current);
    update("q", new FormData(event.currentTarget).get("q")?.toString().trim() || null);
  }

  return (
    <div className="flex flex-col gap-4" aria-busy={pending}>
      <form role="search" action="/titulos" onSubmit={submit} className="flex flex-col gap-3 md:flex-row">
        <label htmlFor="q" className="sr-only">
          Buscar títulos
        </label>
        <input
          id="q"
          name="q"
          type="search"
          defaultValue={filters.q}
          onChange={(e) => search(e.target.value)}
          placeholder="Buscá un título: fernet, córdoba, gamer…"
          className="flex-1 px-4 py-3 rounded-lg bg-surface-container-high border border-outline-variant/30 text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 transition-colors"
        />
        <label htmlFor="orden" className="sr-only">
          Ordenar
        </label>
        <select
          id="orden"
          value={filters.orden}
          onChange={(e) => update("orden", e.target.value === "caros" ? null : e.target.value)}
          className="px-4 py-3 rounded-lg bg-surface-container-high border border-outline-variant/30 text-on-surface focus:outline-none focus:border-primary"
        >
          {TITLE_SORTS.map((sort) => (
            <option key={sort} value={sort}>
              {SORT_LABELS[sort]}
            </option>
          ))}
        </select>
      </form>

      <div className="flex gap-2 overflow-x-auto pb-1 -mx-5 px-5 md:mx-0 md:px-0 md:flex-wrap">
        {TITLE_CATEGORIES.map((cat) => (
          <button
            key={cat}
            type="button"
            aria-pressed={filters.cat === cat}
            onClick={() => update("cat", cat === "todos" ? null : cat)}
            className={`${CHIP} ${filters.cat === cat ? CHIP_ON : CHIP_OFF}`}
          >
            {CATEGORY_LABELS[cat]} <span className="opacity-70">{counts[cat]}</span>
          </button>
        ))}
        {signedIn && (
          <button
            type="button"
            aria-pressed={filters.alcanza}
            onClick={() => update("alcanza", filters.alcanza ? null : "1")}
            className={`${CHIP} ${filters.alcanza ? "border-tertiary bg-tertiary/15 text-tertiary" : CHIP_OFF}`}
          >
            👑 Me alcanza
          </button>
        )}
      </div>
    </div>
  );
}
