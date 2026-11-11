import type { MetadataRoute } from "next";
import { env } from "@/lib/env";

// Keeps crawlers out of account pages; /admin stays unlisted because it answers 404 to everyone but admins.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/auth", "/login", "/onboarding", "/perfil"] },
    sitemap: new URL("/sitemap.xml", env.NEXT_PUBLIC_SITE_URL).href,
  };
}
