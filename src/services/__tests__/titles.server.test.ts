import { describe, expect, it } from "vitest";
import { getTitleBySlug, getTitlesWithCurrentReign } from "../titles.server";
import { createSupabaseMock } from "@/test/supabase-mock";

const heldRow = {
  id: "t1",
  slug: "rey-de-cordoba",
  name: "Rey de Córdoba",
  emoji: "👑",
  description: "x",
  created_at: "2026-08-01T00:00:00Z",
  current_price: 48,
  price_floor: 13,
  reign_id: "r1",
  holder_user_id: "u1",
  holder_paid: 50,
  reign_started_at: "2026-08-19T00:00:00Z",
  holder_username: "nico",
  holder_display_name: "Nico B",
  holder_avatar_url: null,
};

const unclaimedRow = {
  id: "t2",
  slug: "rey-pizza",
  name: "Rey de la Pizza",
  emoji: "🍕",
  description: "x",
  created_at: "2026-08-02T00:00:00Z",
  current_price: null,
  price_floor: 1,
  reign_id: null,
  holder_user_id: null,
  holder_paid: null,
  reign_started_at: null,
  holder_username: null,
  holder_display_name: null,
  holder_avatar_url: null,
};

describe("getTitlesWithCurrentReign", () => {
  it("maps a held title to its effective price, floor and holder", async () => {
    const supabase = createSupabaseMock({ query: { data: [heldRow], error: null } });
    const [card] = await getTitlesWithCurrentReign(supabase);

    expect(card.price).toBe(48);
    expect(card.priceFloor).toBe(13);
    expect(card.holderUserId).toBe("u1");
    expect(card.holder).toEqual({
      username: "nico",
      display_name: "Nico B",
      avatar_url: null,
    });
    expect(card.reignStartedAt).toBe("2026-08-19T00:00:00Z");
  });

  it("maps an unclaimed title to a null price and holder", async () => {
    const supabase = createSupabaseMock({ query: { data: [unclaimedRow], error: null } });
    const [card] = await getTitlesWithCurrentReign(supabase);

    expect(card.price).toBeNull();
    expect(card.priceFloor).toBe(1);
    expect(card.holder).toBeNull();
    expect(card.holderUserId).toBeNull();
  });
});

describe("getTitleBySlug", () => {
  it("returns the priced card plus past reigns, with holderPaid", async () => {
    const pastReignRows = [
      {
        id: "r0",
        price_paid: 20,
        started_at: "2026-08-05T00:00:00Z",
        ended_at: "2026-08-19T00:00:00Z",
        profiles: { username: "juan", display_name: "Juan" },
      },
    ];
    const supabase = createSupabaseMock({
      queryByTable: {
        titles_priced: { data: heldRow, error: null },
        reigns: { data: pastReignRows, error: null },
      },
    });

    const detail = await getTitleBySlug(supabase, "rey-de-cordoba");

    expect(detail?.price).toBe(48);
    expect(detail?.priceFloor).toBe(13);
    expect(detail?.holderPaid).toBe(50);
    expect(detail?.holderName).toBe("Nico B");
    expect(detail?.pastReigns).toEqual([
      {
        id: "r0",
        holderName: "Juan",
        pricePaid: 20,
        startedAt: "2026-08-05T00:00:00Z",
        endedAt: "2026-08-19T00:00:00Z",
      },
    ]);
  });

  it("returns null when no title matches the slug", async () => {
    const supabase = createSupabaseMock({
      queryByTable: { titles_priced: { data: null, error: null } },
    });
    expect(await getTitleBySlug(supabase, "ghost")).toBeNull();
  });
});
