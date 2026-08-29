import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock } from "@/test/supabase-mock";

const { createClientMock, revalidatePathMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  revalidatePathMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: createClientMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));

import { destronar } from "../claims";

const TITLE_ID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";

function form(overrides: Record<string, string> = {}): FormData {
  const fd = new FormData();
  fd.set("titleId", TITLE_ID);
  fd.set("slug", "rey-de-cordoba");
  fd.set("amount", "5000");
  for (const [k, v] of Object.entries(overrides)) fd.set(k, v);
  return fd;
}

const claimRow = {
  id: "c1",
  title_id: TITLE_ID,
  user_id: "u1",
  amount: 5000,
  status: "pending",
  created_at: "2026-08-29T00:00:00Z",
  resolved_at: null,
};

beforeEach(() => {
  createClientMock.mockReset();
  revalidatePathMock.mockReset();
});

describe("destronar", () => {
  it("returns an error when the user is not authenticated", async () => {
    createClientMock.mockResolvedValue(createSupabaseMock({ user: null }));
    const result = await destronar(null, form());
    expect(result).toEqual({
      success: false,
      error: "Tenés que iniciar sesión para destronar.",
    });
  });

  it("rejects an amount that is not a multiple of 1000", async () => {
    createClientMock.mockResolvedValue(createSupabaseMock({ user: { id: "u1" } }));
    const result = await destronar(null, form({ amount: "5500" }));
    expect(result.success).toBe(false);
  });

  it("maps an outbid RPC error to a Spanish message", async () => {
    createClientMock.mockResolvedValue(
      createSupabaseMock({
        user: { id: "u1" },
        rpc: { data: null, error: { message: "Amount must be at least 6000" } },
      }),
    );
    const result = await destronar(null, form());
    expect(result).toEqual({
      success: false,
      error: "El monto no alcanza: alguien pagó más. Refrescá la página.",
    });
  });

  it("maps a duplicate pending-claim RPC error to a Spanish message", async () => {
    createClientMock.mockResolvedValue(
      createSupabaseMock({
        user: { id: "u1" },
        rpc: {
          data: null,
          error: { message: "You already have a pending claim for this title" },
        },
      }),
    );
    const result = await destronar(null, form());
    expect(result).toEqual({
      success: false,
      error: "Ya tenés una solicitud pendiente para este título.",
    });
  });

  it("returns the claim and revalidates on success", async () => {
    createClientMock.mockResolvedValue(
      createSupabaseMock({ user: { id: "u1" }, rpc: { data: claimRow, error: null } }),
    );
    const result = await destronar(null, form());
    expect(result).toEqual({ success: true, data: claimRow });
    expect(revalidatePathMock).toHaveBeenCalledWith("/t/rey-de-cordoba");
  });
});
