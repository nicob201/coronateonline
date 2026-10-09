import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock } from "@/test/supabase-mock";

const { createClientMock, revalidatePathMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  revalidatePathMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: createClientMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));

import { cobrarSueldo } from "../salary";

beforeEach(() => {
  createClientMock.mockReset();
  revalidatePathMock.mockReset();
});

describe("cobrarSueldo", () => {
  it("returns an error when the user is not authenticated", async () => {
    const supabase = createSupabaseMock({ user: null });
    createClientMock.mockResolvedValue(supabase);
    await expect(cobrarSueldo()).resolves.toEqual({
      success: false,
      error: "Tenés que iniciar sesión para cobrar.",
    });
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it.each([
    ["Salary already claimed today", "Ya cobraste el sueldo de hoy. Volvé mañana."],
    ["Not authenticated", "Tenés que iniciar sesión para cobrar."],
    ["boom", "No se pudo cobrar el sueldo. Probá de nuevo."],
  ])("maps the RPC error %j to a Spanish message", async (rpcMessage, expected) => {
    createClientMock.mockResolvedValue(
      createSupabaseMock({ user: { id: "u1" }, rpc: { data: null, error: { message: rpcMessage } } }),
    );
    await expect(cobrarSueldo()).resolves.toEqual({ success: false, error: expected });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("returns the amount credited and revalidates the whole layout", async () => {
    const supabase = createSupabaseMock({ user: { id: "u1" }, rpc: { data: 7, error: null } });
    createClientMock.mockResolvedValue(supabase);
    await expect(cobrarSueldo()).resolves.toEqual({ success: true, data: 7 });
    expect(supabase.rpc).toHaveBeenCalledWith("claim_salary");
    expect(revalidatePathMock).toHaveBeenCalledWith("/", "layout");
  });
});
