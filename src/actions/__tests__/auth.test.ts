import { beforeEach, describe, expect, it, vi } from "vitest";

const { redirectMock, revalidatePathMock, nameGuestMock, getUserMock } = vi.hoisted(() => ({
  redirectMock: vi.fn(),
  revalidatePathMock: vi.fn(),
  nameGuestMock: vi.fn(),
  getUserMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: getUserMock } })),
}));
vi.mock("@/services/auth.server", () => ({ nameGuest: nameGuestMock }));

import { enterAsGuest } from "../auth";

const NAME = "Bufón sin corona #0427";
const guest = { data: { user: { id: "u1", is_anonymous: true } } };

function form(next?: string, displayName = NAME): FormData {
  const fd = new FormData();
  fd.set("displayName", displayName);
  if (next !== undefined) fd.set("next", next);
  return fd;
}

describe("enterAsGuest", () => {
  beforeEach(() => vi.resetAllMocks());

  it("names a new guest and returns to a safe next path", async () => {
    getUserMock.mockResolvedValue(guest);
    await enterAsGuest(null, form("/t/rey-de-cordoba"));
    expect(nameGuestMock).toHaveBeenCalledWith(expect.anything(), "u1", NAME);
    expect(revalidatePathMock).toHaveBeenCalledWith("/", "layout");
    expect(redirectMock).toHaveBeenCalledWith("/t/rey-de-cordoba");
  });

  it("never renames a registered user", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1", is_anonymous: false } } });
    await enterAsGuest(null, form());
    expect(nameGuestMock).not.toHaveBeenCalled();
    expect(redirectMock).toHaveBeenCalledWith("/titulos");
  });

  it("rejects off-site redirects", async () => {
    getUserMock.mockResolvedValue(guest);
    await enterAsGuest(null, form("//evil.com"));
    expect(redirectMock).toHaveBeenCalledWith("/titulos");
  });

  it("returns a friendly error when there is no session", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const result = await enterAsGuest(null, form());
    expect(result).toEqual({ success: false, error: expect.stringContaining("invitado") });
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("rejects a display name that fails validation", async () => {
    getUserMock.mockResolvedValue(guest);
    const result = await enterAsGuest(null, form(undefined, "x".repeat(51)));
    expect(result).toEqual({ success: false, error: expect.stringContaining("invitado") });
    expect(nameGuestMock).not.toHaveBeenCalled();
  });

  it("returns a friendly error when naming the guest fails", async () => {
    getUserMock.mockResolvedValue(guest);
    nameGuestMock.mockRejectedValue(new Error("db down"));
    const result = await enterAsGuest(null, form());
    expect(result).toEqual({ success: false, error: expect.stringContaining("invitado") });
    expect(redirectMock).not.toHaveBeenCalled();
  });
});
