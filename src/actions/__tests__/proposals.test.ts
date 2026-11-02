import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock } from "@/test/supabase-mock";

const { createClientMock, revalidatePathMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  revalidatePathMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: createClientMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));

import { proponerTitulo } from "../proposals";

function form(overrides: Record<string, string> = {}): FormData {
  const fd = new FormData();
  fd.set("name", "Rey del Fernet");
  fd.set("emoji", "🧉");
  fd.set("description", "Nadie lo corta mejor.");
  for (const [k, v] of Object.entries(overrides)) fd.set(k, v);
  return fd;
}

const proposalRow = {
  id: "p1",
  user_id: "u1",
  name: "Rey del Fernet",
  emoji: "🧉",
  description: "Nadie lo corta mejor.",
  cost: 30,
  status: "pending",
  title_id: null,
  created_at: "2026-11-02T00:00:00Z",
  reviewed_at: null,
};

beforeEach(() => {
  createClientMock.mockReset();
  revalidatePathMock.mockReset();
});

describe("proponerTitulo", () => {
  it("returns an error when the user is not authenticated", async () => {
    createClientMock.mockResolvedValue(createSupabaseMock({ user: null }));
    await expect(proponerTitulo(null, form())).resolves.toEqual({
      success: false,
      error: "Tenés que iniciar sesión para crear un título.",
    });
  });

  it("rejects an invalid emoji before calling the RPC", async () => {
    const supabase = createSupabaseMock({ user: { id: "u1" } });
    createClientMock.mockResolvedValue(supabase);
    await expect(proponerTitulo(null, form({ emoji: "ab" }))).resolves.toEqual({
      success: false,
      error: "Elegí un solo emoji.",
    });
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it.each([
    ["Proposal already pending", "Ya tenés una propuesta esperando revisión."],
    ["Title name taken", "Ya existe un título con ese nombre."],
    ["Insufficient balance", "No te alcanzan las Coronas: crear un título cuesta 30 👑."],
    ["Not authenticated", "Tenés que iniciar sesión para crear un título."],
    ["Invalid name", "No se pudo enviar la propuesta. Probá de nuevo."],
  ])("maps the RPC error %j to a Spanish message", async (rpcMessage, expected) => {
    createClientMock.mockResolvedValue(
      createSupabaseMock({ user: { id: "u1" }, rpc: { data: null, error: { message: rpcMessage } } }),
    );
    await expect(proponerTitulo(null, form())).resolves.toEqual({ success: false, error: expected });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("sends the trimmed fields and revalidates the whole layout on success", async () => {
    const supabase = createSupabaseMock({ user: { id: "u1" }, rpc: { data: proposalRow, error: null } });
    createClientMock.mockResolvedValue(supabase);
    await expect(proponerTitulo(null, form({ name: "  Rey del Fernet " }))).resolves.toEqual({
      success: true,
      data: proposalRow,
    });
    expect(supabase.rpc).toHaveBeenCalledWith("propose_title", {
      p_name: "Rey del Fernet",
      p_emoji: "🧉",
      p_description: "Nadie lo corta mejor.",
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/", "layout");
  });
});
