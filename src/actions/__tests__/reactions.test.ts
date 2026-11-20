import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock } from "@/test/supabase-mock";
import type { ReactionKind } from "@/types";

const { createClientMock } = vi.hoisted(() => ({ createClientMock: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({ createClient: createClientMock }));

import { reaccionar } from "../reactions";

const REIGN_ID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";

beforeEach(() => {
  createClientMock.mockReset();
});

describe("reaccionar", () => {
  it("returns an error when the user is not authenticated", async () => {
    createClientMock.mockResolvedValue(createSupabaseMock({ user: null }));
    await expect(reaccionar(REIGN_ID, "tomato")).resolves.toEqual({
      success: false,
      error: "Tenés que iniciar sesión para reaccionar.",
    });
  });

  it.each([
    ["not-a-uuid", "tomato"],
    [REIGN_ID, "egg"],
  ])("rejects reign %j / kind %j before calling the RPC", async (reignId, kind) => {
    const supabase = createSupabaseMock({ user: { id: "u1" } });
    createClientMock.mockResolvedValue(supabase);
    // A client can send anything; the cast mimics a tampered request.
    const result = await reaccionar(reignId, kind as ReactionKind);
    expect(result).toEqual({ success: false, error: "Reacción inválida." });
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it.each([
    ["CT304", "Pará un poco: máximo 10 reacciones por minuto."],
    ["CT302", "Ese reinado ya terminó."],
    ["CT303", "No podés reaccionar a tu propio reinado."],
    ["CT001", "Tenés que iniciar sesión para reaccionar."],
    ["CT002", "Elegí tu nombre en el perfil antes de jugar."],
    ["XX000", "No se pudo reaccionar. Probá de nuevo."],
  ])("maps the RPC error code %j to a Spanish message", async (rpcCode, expected) => {
    createClientMock.mockResolvedValue(
      createSupabaseMock({ user: { id: "u1" }, rpc: { data: null, error: { code: rpcCode, message: "rpc error" } } }),
    );
    await expect(reaccionar(REIGN_ID, "applause")).resolves.toEqual({ success: false, error: expected });
  });

  it("calls react_to_reign and returns the new totals", async () => {
    const supabase = createSupabaseMock({
      user: { id: "u1" },
      rpc: { data: { tomatoes: 3, applause: 1 }, error: null },
    });
    createClientMock.mockResolvedValue(supabase);
    await expect(reaccionar(REIGN_ID, "tomato")).resolves.toEqual({
      success: true,
      data: { tomatoes: 3, applause: 1 },
    });
    expect(supabase.rpc).toHaveBeenCalledWith("react_to_reign", { p_reign_id: REIGN_ID, p_kind: "tomato" });
  });
});
