import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock } from "@/test/supabase-mock";

const { createClientMock, revalidatePathMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  revalidatePathMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: createClientMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));

import { marcarNotificacionesLeidas } from "../notifications";

beforeEach(() => {
  createClientMock.mockReset();
  revalidatePathMock.mockReset();
});

describe("marcarNotificacionesLeidas", () => {
  it("returns an error when the user is not authenticated", async () => {
    const supabase = createSupabaseMock({ user: null });
    createClientMock.mockResolvedValue(supabase);
    await expect(marcarNotificacionesLeidas()).resolves.toEqual({
      success: false,
      error: "Tenés que iniciar sesión para ver tus avisos.",
    });
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it.each([
    ["CT001", "Tenés que iniciar sesión para ver tus avisos."],
    ["XX000", "No se pudieron marcar los avisos como leídos. Probá de nuevo."],
  ])("maps the RPC error code %j to a Spanish message", async (rpcCode, expected) => {
    createClientMock.mockResolvedValue(
      createSupabaseMock({ user: { id: "u1" }, rpc: { data: null, error: { code: rpcCode, message: "rpc error" } } }),
    );
    await expect(marcarNotificacionesLeidas()).resolves.toEqual({ success: false, error: expected });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("marks them seen and revalidates the whole layout so the bell clears", async () => {
    const supabase = createSupabaseMock({ user: { id: "u1" }, rpc: { data: null, error: null } });
    createClientMock.mockResolvedValue(supabase);
    await expect(marcarNotificacionesLeidas()).resolves.toEqual({ success: true, data: null });
    expect(supabase.rpc).toHaveBeenCalledWith("mark_notifications_seen");
    expect(revalidatePathMock).toHaveBeenCalledWith("/", "layout");
  });
});
