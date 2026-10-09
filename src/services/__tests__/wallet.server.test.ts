import { describe, expect, it } from "vitest";
import { claimSalary, getBalance, getRecentMovements, getSalaryStatus } from "../wallet.server";
import { createSupabaseMock } from "@/test/supabase-mock";

const welcomeRow = {
  id: "m1",
  amount: 20,
  reason: "welcome",
  created_at: "2026-10-07T00:00:00Z",
  reigns: null,
};

const dethroneRow = {
  id: "m2",
  amount: -40,
  reason: "dethrone",
  created_at: "2026-10-07T01:00:00Z",
  reigns: {
    titles: { name: "Rey de Córdoba" },
    holder: { username: "fran", display_name: "Fran" },
    dethroned: { username: "nico", display_name: null },
  },
};

const dethronedRow = { ...dethroneRow, id: "m3", amount: 40, reason: "dethroned" };

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

describe("getSalaryStatus", () => {
  it("returns the single row computed by the salary_status RPC", async () => {
    const status = { claimed_today: false, streak: 2, next_amount: 7 };
    const supabase = createSupabaseMock({ rpc: { data: status, error: null } });
    await expect(getSalaryStatus(supabase)).resolves.toEqual(status);
    expect(supabase.rpc).toHaveBeenCalledWith("salary_status");
  });

  it("throws when the RPC fails", async () => {
    const supabase = createSupabaseMock({ rpc: { data: null, error: { message: "boom" } } });
    await expect(getSalaryStatus(supabase)).rejects.toMatchObject({ message: "boom" });
  });
});

describe("claimSalary", () => {
  it("returns the amount credited by the claim_salary RPC", async () => {
    const supabase = createSupabaseMock({ rpc: { data: 5, error: null } });
    await expect(claimSalary(supabase)).resolves.toBe(5);
    expect(supabase.rpc).toHaveBeenCalledWith("claim_salary");
  });

  it("throws when the RPC fails", async () => {
    const supabase = createSupabaseMock({ rpc: { data: null, error: { message: "boom" } } });
    await expect(claimSalary(supabase)).rejects.toMatchObject({ message: "boom" });
  });
});

describe("getRecentMovements", () => {
  it("maps joined rows to movements with title and counterpart, newest first", async () => {
    const supabase = createSupabaseMock({
      queryByTable: {
        coin_ledger: { data: [dethroneRow, dethronedRow, welcomeRow], error: null },
      },
    });
    await expect(getRecentMovements(supabase, "u1")).resolves.toEqual([
      { id: "m2", amount: -40, reason: "dethrone", created_at: "2026-10-07T01:00:00Z", titleName: "Rey de Córdoba", counterpartName: "nico" },
      { id: "m3", amount: 40, reason: "dethroned", created_at: "2026-10-07T01:00:00Z", titleName: "Rey de Córdoba", counterpartName: "Fran" },
      { id: "m1", amount: 20, reason: "welcome", created_at: "2026-10-07T00:00:00Z", titleName: null, counterpartName: null },
    ]);
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
