import { beforeEach, describe, expect, it, vi } from "vitest";

const { redirectMock, signInAsGuestMock, getUserMock } = vi.hoisted(() => ({
  redirectMock: vi.fn(),
  signInAsGuestMock: vi.fn(),
  getUserMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: getUserMock } })),
}));
vi.mock("@/services/auth.server", () => ({ signInAsGuest: signInAsGuestMock }));

import { enterAsGuest } from "../auth";

function form(next?: string): FormData {
  const fd = new FormData();
  if (next !== undefined) fd.set("next", next);
  return fd;
}

describe("enterAsGuest", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates a guest session and returns to a safe next path", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    await enterAsGuest(null, form("/t/rey-de-cordoba"));
    expect(signInAsGuestMock).toHaveBeenCalledOnce();
    expect(redirectMock).toHaveBeenCalledWith("/t/rey-de-cordoba");
  });

  it("reuses an existing session instead of creating another guest", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    await enterAsGuest(null, form());
    expect(signInAsGuestMock).not.toHaveBeenCalled();
    expect(redirectMock).toHaveBeenCalledWith("/titulos");
  });

  it("rejects off-site redirects", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    await enterAsGuest(null, form("//evil.com"));
    expect(redirectMock).toHaveBeenCalledWith("/titulos");
  });

  it("returns a friendly error when Supabase refuses the sign-in", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    signInAsGuestMock.mockRejectedValue(new Error("Anonymous sign-ins are disabled"));
    const result = await enterAsGuest(null, form());
    expect(result).toEqual({ success: false, error: expect.stringContaining("invitado") });
    expect(redirectMock).not.toHaveBeenCalled();
  });
});
