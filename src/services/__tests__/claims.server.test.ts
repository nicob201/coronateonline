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
  amount: 5000,
  status: "pending",
  created_at: "2026-08-29T00:00:00Z",
  resolved_at: null,
};

describe("createClaim", () => {
  it("returns the created claim row from the RPC", async () => {
    const supabase = createSupabaseMock({ rpc: { data: claimRow, error: null } });
    const result = await createClaim(supabase, "t1", 5000);
    expect(result).toEqual(claimRow);
  });

  it("throws when the RPC returns an error", async () => {
    const supabase = createSupabaseMock({
      rpc: { data: null, error: { message: "Amount must be at least 6000" } },
    });
    await expect(createClaim(supabase, "t1", 5000)).rejects.toMatchObject({
      message: "Amount must be at least 6000",
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
        amount: 5000,
        created_at: "2026-08-29T00:00:00Z",
        profiles: { username: "nico", display_name: "Nico B" },
        titles: { name: "Rey de Córdoba", slug: "rey-de-cordoba" },
      },
    ];
    const supabase = createSupabaseMock({ query: { data: rows, error: null } });
    const result = await getPendingClaims(supabase);
    expect(result).toEqual([
      {
        id: "c1",
        amount: 5000,
        createdAt: "2026-08-29T00:00:00Z",
        claimantName: "Nico B",
        titleName: "Rey de Córdoba",
        titleSlug: "rey-de-cordoba",
      },
    ]);
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
