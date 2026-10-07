import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock } from "@/test/supabase-mock";

const { createClientMock, revalidatePathMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  revalidatePathMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: createClientMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));

import { destronar } from "../dethrone";

const TITLE_ID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";

function form(overrides: Record<string, string> = {}): FormData {
  const fd = new FormData();
  fd.set("titleId", TITLE_ID);
  fd.set("amount", "5");
  for (const [k, v] of Object.entries(overrides)) fd.set(k, v);
  return fd;
}

const reignRow = {
  id: "r1",
  title_id: TITLE_ID,
  user_id: "u1",
  price_paid: 5,
  started_at: "2026-10-07T00:00:00Z",
  ended_at: null,
  message: null,
  dethroned_user_id: "u2",
};

function withRpcError(message: string) {
  return createSupabaseMock({ user: { id: "u1" }, rpc: { data: null, error: { message } } });
}

beforeEach(() => {
  createClientMock.mockReset();
  revalidatePathMock.mockReset();
});

describe("destronar", () => {
  it("returns an error when the user is not authenticated", async () => {
    createClientMock.mockResolvedValue(createSupabaseMock({ user: null }));
    await expect(destronar(null, form())).resolves.toEqual({
      success: false,
      error: "Tenés que iniciar sesión para destronar.",
    });
  });

  it("rejects a non-integer amount before calling the RPC", async () => {
    const supabase = createSupabaseMock({ user: { id: "u1" } });
    createClientMock.mockResolvedValue(supabase);
    const result = await destronar(null, form({ amount: "5.5" }));
    expect(result.success).toBe(false);
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it.each([
    ["Amount must be at least 6", "El monto no alcanza: alguien pagó más. Refrescá la página."],
    ["Insufficient balance", "No te alcanzan las Coronas."],
    ["You already hold this title", "Ya sos el dueño de este título."],
    ["Message too long", "El mensaje es demasiado largo (máx. 80 caracteres)."],
    ["Amount must be positive", "Monto inválido."],
    ["Title not found", "No se pudo procesar la solicitud. Probá de nuevo."],
  ])("maps the RPC error %j to a Spanish message", async (rpcMessage, expected) => {
    createClientMock.mockResolvedValue(withRpcError(rpcMessage));
    await expect(destronar(null, form())).resolves.toEqual({ success: false, error: expected });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("returns the new reign and revalidates the whole layout on success", async () => {
    createClientMock.mockResolvedValue(
      createSupabaseMock({ user: { id: "u1" }, rpc: { data: reignRow, error: null } }),
    );
    await expect(destronar(null, form({ message: "Soy el rey" }))).resolves.toEqual({
      success: true,
      data: reignRow,
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/", "layout");
  });
});
