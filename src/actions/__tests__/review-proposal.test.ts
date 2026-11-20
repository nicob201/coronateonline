import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock } from "@/test/supabase-mock";

const { createClientMock, revalidatePathMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  revalidatePathMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: createClientMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));

import { revisarPropuesta } from "../proposals";

const PROPOSAL_ID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";

function form(decision = "approve", proposalId = PROPOSAL_ID): FormData {
  const fd = new FormData();
  fd.set("proposalId", proposalId);
  fd.set("decision", decision);
  return fd;
}

const reviewed = {
  id: PROPOSAL_ID,
  user_id: "u1",
  name: "Rey del Fernet",
  emoji: "🧉",
  description: "Nadie lo corta mejor.",
  cost: 30,
  status: "approved",
  title_id: "t1",
  created_at: "2026-11-02T00:00:00Z",
  reviewed_at: "2026-11-02T01:00:00Z",
};

beforeEach(() => {
  createClientMock.mockReset();
  revalidatePathMock.mockReset();
});

describe("revisarPropuesta", () => {
  it("answers a signed-out caller with a generic error", async () => {
    createClientMock.mockResolvedValue(createSupabaseMock({ user: null }));
    await expect(revisarPropuesta(null, form())).resolves.toEqual({ success: false, error: "No autorizado." });
  });

  it.each([
    ["maybe", PROPOSAL_ID],
    ["approve", "not-a-uuid"],
  ])("rejects decision %j / id %j before calling the RPC", async (decision, id) => {
    const supabase = createSupabaseMock({ user: { id: "admin" } });
    createClientMock.mockResolvedValue(supabase);
    const result = await revisarPropuesta(null, form(decision, id));
    expect(result.success).toBe(false);
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it.each([
    ["CT004", "No autorizado."],
    ["CT407", "Esa propuesta ya fue revisada."],
    ["CT405", "Ya existe un título con ese nombre: rechazala."],
    ["CT406", "No se pudo revisar la propuesta. Probá de nuevo."],
  ])("maps the RPC error code %j to a Spanish message", async (rpcCode, expected) => {
    createClientMock.mockResolvedValue(
      createSupabaseMock({ user: { id: "admin" }, rpc: { data: null, error: { code: rpcCode, message: "rpc error" } } }),
    );
    await expect(revisarPropuesta(null, form())).resolves.toEqual({ success: false, error: expected });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it.each([
    ["approve", true],
    ["reject", false],
  ])("sends %j as p_approve=%s and revalidates the whole layout", async (decision, approve) => {
    const supabase = createSupabaseMock({ user: { id: "admin" }, rpc: { data: reviewed, error: null } });
    createClientMock.mockResolvedValue(supabase);
    await expect(revisarPropuesta(null, form(decision))).resolves.toEqual({ success: true, data: reviewed });
    expect(supabase.rpc).toHaveBeenCalledWith("review_title_proposal", {
      p_proposal_id: PROPOSAL_ID,
      p_approve: approve,
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/", "layout");
  });
});
