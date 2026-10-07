import { describe, expect, it } from "vitest";
import {
  applyClaim,
  createClaim,
  getPendingClaim,
  getPendingClaims,
  rejectClaim,
} from "../claims.server";
import { createSupabaseMock } from "@/test/supabase-mock";

const claimRow = {
  id: "c1",
  title_id: "t1",
  user_id: "u1",
  amount: 5,
  status: "pending",
  created_at: "2026-08-29T00:00:00Z",
  resolved_at: null,
};

describe("createClaim", () => {
  it("returns the created claim row from the RPC", async () => {
    const supabase = createSupabaseMock({ rpc: { data: claimRow, error: null } });
    const result = await createClaim(supabase, "t1", 5);
    expect(result).toEqual(claimRow);
  });

  it("forwards p_message when provided", async () => {
    const supabase = createSupabaseMock({ rpc: { data: claimRow, error: null } });
    await createClaim(supabase, "t1", 5, "Soy el rey");
    expect(supabase.rpc).toHaveBeenCalledWith("create_claim", {
      p_title_id: "t1",
      p_amount: 5,
      p_message: "Soy el rey",
    });
  });

  it("sends p_message as null when omitted", async () => {
    const supabase = createSupabaseMock({ rpc: { data: claimRow, error: null } });
    await createClaim(supabase, "t1", 5);
    expect(supabase.rpc).toHaveBeenCalledWith("create_claim", {
      p_title_id: "t1",
      p_amount: 5,
    });
  });

  it("throws when the RPC returns an error", async () => {
    const supabase = createSupabaseMock({
      rpc: { data: null, error: { message: "Amount must be at least 6" } },
    });
    await expect(createClaim(supabase, "t1", 5)).rejects.toMatchObject({
      message: "Amount must be at least 6",
    });
  });
});

describe("getPendingClaim", () => {
  it("returns the pending claim when one exists", async () => {
    const supabase = createSupabaseMock({ query: { data: claimRow, error: null } });
    const result = await getPendingClaim(supabase, "u1", "t1");
    expect(result).toEqual(claimRow);
  });

  it("returns null when there is no pending claim", async () => {
    const supabase = createSupabaseMock({ query: { data: null, error: null } });
    const result = await getPendingClaim(supabase, "u1", "t1");
    expect(result).toBeNull();
  });
});

describe("getPendingClaims", () => {
  it("maps joined rows to the admin list item shape", async () => {
    const rows = [
      {
        id: "c1",
        amount: 5,
        created_at: "2026-08-29T00:00:00Z",
        message: "Soy el rey",
        title_id: "t1",
        profiles: { username: "nico", display_name: "Nico B" },
        titles: { name: "Rey de Córdoba", slug: "rey-de-cordoba" },
      },
    ];
    const supabase = createSupabaseMock({
      queryByTable: {
        claims: { data: rows, error: null },
        titles_priced: { data: [{ id: "t1", current_price: 44 }], error: null },
      },
    });
    const result = await getPendingClaims(supabase);
    expect(result).toEqual([
      {
        id: "c1",
        amount: 5,
        createdAt: "2026-08-29T00:00:00Z",
        claimantName: "Nico B",
        titleName: "Rey de Córdoba",
        titleSlug: "rey-de-cordoba",
        currentPrice: 44,
        message: "Soy el rey",
      },
    ]);
  });

  it("merges the current effective price for each claim's title", async () => {
    const claimRows = [
      {
        id: "c1",
        amount: 5,
        created_at: "2026-08-29T00:00:00Z",
        message: null,
        title_id: "t1",
        profiles: { username: "nico", display_name: "Nico B" },
        titles: { name: "Rey de Córdoba", slug: "rey-de-cordoba" },
      },
    ];
    const supabase = createSupabaseMock({
      queryByTable: {
        claims: { data: claimRows, error: null },
        titles_priced: { data: [{ id: "t1", current_price: 47 }], error: null },
      },
    });

    const result = await getPendingClaims(supabase);
    expect(result[0].currentPrice).toBe(47);
  });

  it("throws when the query returns an error", async () => {
    const supabase = createSupabaseMock({
      query: { data: null, error: { message: "boom" } },
    });
    await expect(getPendingClaims(supabase)).rejects.toMatchObject({ message: "boom" });
  });
});

describe("applyClaim / rejectClaim", () => {
  it("applyClaim resolves when the RPC succeeds", async () => {
    const supabase = createSupabaseMock({ rpc: { data: null, error: null } });
    await expect(applyClaim(supabase, "c1")).resolves.toBeUndefined();
    expect(supabase.rpc).toHaveBeenCalledWith("apply_claim", {
      p_claim_id: "c1",
      p_clear_message: false,
    });
  });

  it("applyClaim forwards p_clear_message when true", async () => {
    const supabase = createSupabaseMock({ rpc: { data: null, error: null } });
    await applyClaim(supabase, "c1", true);
    expect(supabase.rpc).toHaveBeenCalledWith("apply_claim", {
      p_claim_id: "c1",
      p_clear_message: true,
    });
  });

  it("applyClaim throws when the RPC returns an error", async () => {
    const supabase = createSupabaseMock({
      rpc: { data: null, error: { message: "Claim amount is below the current price" } },
    });
    await expect(applyClaim(supabase, "c1")).rejects.toMatchObject({
      message: "Claim amount is below the current price",
    });
  });

  it("rejectClaim throws when the RPC returns an error", async () => {
    const supabase = createSupabaseMock({
      rpc: { data: null, error: { message: "Claim not found or already resolved" } },
    });
    await expect(rejectClaim(supabase, "c1")).rejects.toMatchObject({
      message: "Claim not found or already resolved",
    });
  });
});
