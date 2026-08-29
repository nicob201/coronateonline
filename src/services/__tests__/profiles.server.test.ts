import { describe, expect, it } from "vitest";
import { getPublicProfile } from "../profiles.server";
import { createSupabaseMock } from "@/test/supabase-mock";

function profileRow(overrides: Record<string, unknown> = {}) {
  return {
    username: "nico",
    display_name: "Nicolás",
    avatar_url: null,
    bio: "El verdadero rey.",
    instagram: "nico",
    tiktok: null,
    youtube: null,
    x: null,
    twitch: null,
    website: null,
    reigns: [
      {
        price_paid: 5000,
        started_at: "2026-08-20T00:00:00Z",
        ended_at: null,
        titles: { name: "Rey de Córdoba", emoji: "👑", slug: "rey-de-cordoba" },
      },
      {
        price_paid: 2000,
        started_at: "2026-08-10T00:00:00Z",
        ended_at: "2026-08-15T00:00:00Z",
        titles: { name: "CEO de los Lunes", emoji: "😂", slug: "ceo-lunes" },
      },
      {
        price_paid: 3000,
        started_at: "2026-08-01T00:00:00Z",
        ended_at: "2026-08-05T00:00:00Z",
        titles: { name: "Rey de la Pizza", emoji: "🍕", slug: "rey-pizza" },
      },
    ],
    ...overrides,
  };
}

describe("getPublicProfile", () => {
  it("returns null when no profile matches the username", async () => {
    const supabase = createSupabaseMock({ query: { data: null, error: null } });
    expect(await getPublicProfile(supabase, "ghost")).toBeNull();
  });

  it("splits active reigns from past reigns, past ones newest-first", async () => {
    const supabase = createSupabaseMock({ query: { data: profileRow(), error: null } });
    const result = await getPublicProfile(supabase, "nico");

    expect(result?.currentReigns.map((r) => r.titleSlug)).toEqual(["rey-de-cordoba"]);
    expect(result?.pastReigns.map((r) => r.titleSlug)).toEqual([
      "ceo-lunes",
      "rey-pizza",
    ]);
  });

  it("maps reign fields to the domain shape", async () => {
    const supabase = createSupabaseMock({ query: { data: profileRow(), error: null } });
    const result = await getPublicProfile(supabase, "nico");

    expect(result?.currentReigns[0]).toEqual({
      titleName: "Rey de Córdoba",
      titleEmoji: "👑",
      titleSlug: "rey-de-cordoba",
      pricePaid: 5000,
      startedAt: "2026-08-20T00:00:00Z",
      endedAt: null,
    });
  });

  it("falls back to username when display_name is empty", async () => {
    const supabase = createSupabaseMock({
      query: { data: profileRow({ display_name: "  " }), error: null },
    });
    const result = await getPublicProfile(supabase, "nico");
    expect(result?.displayName).toBe("nico");
  });

  it("keeps only non-null social links", async () => {
    const supabase = createSupabaseMock({ query: { data: profileRow(), error: null } });
    const result = await getPublicProfile(supabase, "nico");
    expect(result?.socials).toEqual({ instagram: "nico" });
  });
});
