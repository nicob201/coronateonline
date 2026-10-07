import { describe, expect, it } from "vitest";
import { getBalance, getRecentMovements } from "../wallet.server";
import { createSupabaseMock } from "@/test/supabase-mock";

const movement = {
  id: "m1",
  amount: 20,
  reason: "welcome",
  created_at: "2026-10-07T00:00:00Z",
};

describe("getBalance", () => {
  it("returns the balance computed by the coin_balance RPC", async () => {
    const supabase = createSupabaseMock({ rpc: { data: 20, error: null } });
    await expect(getBalance(supabase, "u1")).resolves.toBe(20);
    expect(supabase.rpc).toHaveBeenCalledWith("coin_balance", { p_user_id: "u1" });
  });

  it("throws when the RPC fails", async () => {
    const supabase = createSupabaseMock({ rpc: { data: null, error: { message: "boom" } } });
    await expect(getBalance(supabase, "u1")).rejects.toMatchObject({ message: "boom" });
  });
});

describe("getRecentMovements", () => {
  it("returns the user's newest movements first, capped at the limit", async () => {
    const supabase = createSupabaseMock({
      queryByTable: { coin_ledger: { data: [movement], error: null } },
    });
    await expect(getRecentMovements(supabase, "u1")).resolves.toEqual([movement]);
    // The mock's builder is shared per table; select() just exposes the typed filter methods.
    const builder = supabase.from("coin_ledger").select();
    expect(builder.eq).toHaveBeenCalledWith("user_id", "u1");
    expect(builder.order).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(builder.limit).toHaveBeenCalledWith(10);
  });

  it("throws when the query fails", async () => {
    const supabase = createSupabaseMock({
      queryByTable: { coin_ledger: { data: null, error: { message: "boom" } } },
    });
    await expect(getRecentMovements(supabase, "u1")).rejects.toMatchObject({ message: "boom" });
  });
});
