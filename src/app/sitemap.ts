import type { MetadataRoute } from "next";
import { env } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

const STATIC_PATHS = ["/", "/titulos", "/mapa", "/rankings"];

// Lists the public pages and every title; profiles stay out so guest accounts don't flood it.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = await createClient();
  const { data: titles, error } = await supabase.from("titles").select("slug, created_at");
  if (error) throw error;
  const absolute = (path: string): string => new URL(path, env.NEXT_PUBLIC_SITE_URL).href;

  return [
    ...STATIC_PATHS.map((path) => ({ url: absolute(path) })),
    ...titles.map((title) => ({
      url: absolute(`/t/${title.slug}`),
      lastModified: title.created_at,
    })),
  ];
}
