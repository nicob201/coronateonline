import { describe, expect, it } from "vitest";
import { createClaim, getPendingClaim } from "../claims.server";
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
