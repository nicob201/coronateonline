import { describe, expect, it } from "vitest";
import {
  getHallOfFame,
  getRecentCoronations,
  getTitleBySlug,
  getTitlesWithCurrentReign,
} from "../titles.server";
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
  holder_is_bot: false,
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
  holder_is_bot: null,
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
      is_bot: false,
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

describe("title categories", () => {
  it("tells province crowns, community titles and classics apart", async () => {
    const supabase = createSupabaseMock({
      query: {
        data: [
          { ...heldRow, id: "p", level: "provincia", created_by: null },
          { ...heldRow, id: "c", level: null, created_by: "u9" },
          { ...heldRow, id: "s", level: null, created_by: null },
        ],
        error: null,
      },
    });
    const cards = await getTitlesWithCurrentReign(supabase);
    expect(cards.map((c) => [c.id, c.category])).toEqual([
      ["p", "provincias"],
      ["c", "comunidad"],
      ["s", "clasicos"],
    ]);
  });

  it("names a community title's creator on its detail page", async () => {
    const supabase = createSupabaseMock({
      queryByTable: {
        titles_priced: {
          data: { ...heldRow, created_by: "u9", creator_username: "nicocrack", creator_display_name: " " },
          error: null,
        },
        reigns: { data: [], error: null },
      },
    });
    const detail = await getTitleBySlug(supabase, "rey-de-cordoba");
    expect(detail?.creator).toEqual({ username: "nicocrack", name: "nicocrack" });
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
        profiles: { username: "juan", display_name: "Juan", is_bot: false },
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
        holderIsBot: false,
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

describe("bots", () => {
  it("flags a bot holder on the card", async () => {
    const supabase = createSupabaseMock({
      query: { data: [{ ...heldRow, holder_is_bot: true }], error: null },
    });
    const [card] = await getTitlesWithCurrentReign(supabase);
    expect(card.holder?.is_bot).toBe(true);
  });

  it("flags bot holders and bot victims in the coronation ticker", async () => {
    const supabase = createSupabaseMock({
      query: {
        data: [
          {
            id: "r9",
            price_paid: 7,
            started_at: "2026-10-09T12:00:00Z",
            titles: { name: "Rey de Córdoba", emoji: "👑", slug: "rey-de-cordoba" },
            profiles: { username: "baron_bug", display_name: "Barón Bug", is_bot: true },
            dethroned: { username: "nico", display_name: "Nico B", is_bot: false },
          },
        ],
        error: null,
      },
    });
    const [c] = await getRecentCoronations(supabase, 6);
    expect(c.holderIsBot).toBe(true);
    expect(c.dethronedIsBot).toBe(false);
  });

  it("maps the hall of fame RPC rows and asks for the requested limit", async () => {
    const supabase = createSupabaseMock({
      rpc: {
        data: [
          { username: "nico", display_name: null, avatar_url: null, reign_count: 7, latest_title_name: "Rey de Córdoba" },
        ],
        error: null,
      },
    });
    const entries = await getHallOfFame(supabase, 5);
    expect(supabase.rpc).toHaveBeenCalledWith("ranking_hall_of_fame", { p_limit: 5 });
    expect(entries).toEqual([
      { username: "nico", name: "nico", avatarUrl: null, reignCount: 7, latestTitleName: "Rey de Córdoba" },
    ]);
  });
});
