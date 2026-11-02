import { z } from "zod";

export const TITLE_CATEGORIES = ["todos", "provincias", "clasicos", "comunidad"] as const;
export const TITLE_SORTS = ["caros", "baratos", "nuevos", "recientes"] as const;

// Parses the /titulos search params; anything unexpected falls back to its default so a bad link still renders.
export const titleFiltersSchema = z.object({
  q: z.string().trim().max(60).catch(""),
  cat: z.enum(TITLE_CATEGORIES).catch("todos"),
  orden: z.enum(TITLE_SORTS).catch("caros"),
  alcanza: z
    .literal("1")
    .transform((): boolean => true)
    .catch(false),
});

export type TitleFilters = z.infer<typeof titleFiltersSchema>;
