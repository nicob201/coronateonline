import { describe, expect, it } from "vitest";
import { dethrone } from "../dethrone.server";
import { createSupabaseMock } from "@/test/supabase-mock";

const reignRow = {
  id: "r1",
  title_id: "t1",
  user_id: "u1",
  price_paid: 5,
  started_at: "2026-10-07T00:00:00Z",
  ended_at: null,
  message: null,
  dethroned_user_id: "u2",
};

describe("dethrone", () => {
  it("returns the new reign from the dethrone_with_coins RPC", async () => {
    const supabase = createSupabaseMock({ rpc: { data: reignRow, error: null } });
    await expect(dethrone(supabase, "t1", 5)).resolves.toEqual(reignRow);
    expect(supabase.rpc).toHaveBeenCalledWith("dethrone_with_coins", {
      p_title_id: "t1",
      p_amount: 5,
    });
  });

  it("forwards p_message when provided", async () => {
    const supabase = createSupabaseMock({ rpc: { data: reignRow, error: null } });
    await dethrone(supabase, "t1", 5, "Soy el rey");
    expect(supabase.rpc).toHaveBeenCalledWith("dethrone_with_coins", {
      p_title_id: "t1",
      p_amount: 5,
      p_message: "Soy el rey",
    });
  });

  it("throws the RPC error", async () => {
    const supabase = createSupabaseMock({
      rpc: { data: null, error: { message: "Insufficient balance" } },
    });
    await expect(dethrone(supabase, "t1", 5)).rejects.toMatchObject({
      message: "Insufficient balance",
    });
  });
});
