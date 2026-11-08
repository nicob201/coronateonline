import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock } from "@/test/supabase-mock";

const { revalidatePathMock, requireOnboardedUserMock, createClientMock } = vi.hoisted(() => ({
  revalidatePathMock: vi.fn(),
  requireOnboardedUserMock: vi.fn(),
  createClientMock: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: createClientMock }));
vi.mock("@/services/auth.server", () => ({
  requireOnboardedUser: requireOnboardedUserMock,
}));

import { updateProfile, updateProfileDetails } from "../profiles";

const TAKEN_NAME = {
  code: "23505",
  message: 'duplicate key value violates unique constraint "profiles_display_name_unique"',
};
const TAKEN_USERNAME = {
  code: "23505",
  message: 'duplicate key value violates unique constraint "profiles_username_key"',
};

function pngFile(bytes = 3): File {
  return new File([new Uint8Array(bytes)], "a.png", { type: "image/png" });
}

function form(overrides: Record<string, string | File> = {}): FormData {
  const fd = new FormData();
  fd.set("display_name", "Nicolás");
  fd.set("bio", "El verdadero rey.");
  for (const [k, v] of Object.entries(overrides)) fd.set(k, v);
  return fd;
}

function mockUser(
  supabase: ReturnType<typeof createSupabaseMock>,
  profile: Record<string, unknown> = {},
) {
  requireOnboardedUserMock.mockResolvedValue({
    supabase,
    user: { id: "u1" },
    profile: { username: "nico", avatar_url: null, ...profile },
  });
}

beforeEach(() => {
  revalidatePathMock.mockReset();
  requireOnboardedUserMock.mockReset();
});

describe("updateProfileDetails", () => {
  it("rejects an empty display_name", async () => {
    const supabase = createSupabaseMock({ query: { data: { username: "nico" }, error: null } });
    mockUser(supabase);
    const result = await updateProfileDetails(null, form({ display_name: "  " }));
    expect(result.success).toBe(false);
    expect(supabase.storage.from("avatars").upload).not.toHaveBeenCalled();
  });

  it("saves text fields and revalidates, without touching storage", async () => {
    const supabase = createSupabaseMock({
      query: { data: { username: "nico", display_name: "Nicolás" }, error: null },
    });
    mockUser(supabase);
    const result = await updateProfileDetails(null, form({ instagram: "" }));

    expect(result.success).toBe(true);
    const builder = supabase.from("profiles");
    expect(builder.update).toHaveBeenCalledWith(
      expect.objectContaining({ display_name: "Nicolás", bio: "El verdadero rey.", instagram: null }),
    );
    expect(supabase.storage.from("avatars").upload).not.toHaveBeenCalled();
    expect(revalidatePathMock).toHaveBeenCalledWith("/@nico");
  });

  it("rejects a non-image avatar", async () => {
    const supabase = createSupabaseMock({ query: { data: { username: "nico" }, error: null } });
    mockUser(supabase);
    const pdf = new File([new Uint8Array(3)], "cv.pdf", { type: "application/pdf" });
    const result = await updateProfileDetails(null, form({ avatar: pdf }));
    expect(result.success).toBe(false);
    expect(supabase.storage.from("avatars").upload).not.toHaveBeenCalled();
  });

  it("rejects an avatar larger than 2 MB", async () => {
    const supabase = createSupabaseMock({ query: { data: { username: "nico" }, error: null } });
    mockUser(supabase);
    const result = await updateProfileDetails(null, form({ avatar: pngFile(2_100_000) }));
    expect(result.success).toBe(false);
  });

  it("uploads the avatar, stores its URL and removes the previous one", async () => {
    const supabase = createSupabaseMock({
      query: { data: { username: "nico" }, error: null },
      publicUrl: "https://cdn.test/u1/new.png",
    });
    mockUser(supabase, { avatar_url: "https://cdn.test/storage/v1/object/public/avatars/u1/old.png" });

    const result = await updateProfileDetails(null, form({ avatar: pngFile() }));

    expect(result.success).toBe(true);
    expect(supabase.storage.from("avatars").upload).toHaveBeenCalled();
    expect(supabase.from("profiles").update).toHaveBeenCalledWith(
      expect.objectContaining({ avatar_url: "https://cdn.test/u1/new.png" }),
    );
    expect(supabase.storage.from("avatars").remove).toHaveBeenCalledWith(["u1/old.png"]);
  });

  it("rolls back the uploaded avatar when the DB update fails", async () => {
    const supabase = createSupabaseMock({
      query: { data: null, error: { message: "update failed" } },
      publicUrl: "https://cdn.test/storage/v1/object/public/avatars/u1/new.png",
    });
    mockUser(supabase);

    const result = await updateProfileDetails(null, form({ avatar: pngFile() }));

    expect(result.success).toBe(false);
    expect(supabase.storage.from("avatars").remove).toHaveBeenCalledWith(["u1/new.png"]);
  });

  it("says the name is taken and still rolls back the avatar", async () => {
    const supabase = createSupabaseMock({
      query: { data: null, error: TAKEN_NAME },
      publicUrl: "https://cdn.test/storage/v1/object/public/avatars/u1/new.png",
    });
    mockUser(supabase);

    const result = await updateProfileDetails(null, form({ avatar: pngFile() }));

    expect(result).toEqual({ success: false, error: "Ese nombre ya lo usa otra persona." });
    expect(supabase.storage.from("avatars").remove).toHaveBeenCalledWith(["u1/new.png"]);
  });
});

describe("updateProfile", () => {
  it.each([
    [TAKEN_NAME, "Ese nombre ya lo usa otra persona."],
    [TAKEN_USERNAME, "Ese username ya está en uso."],
    [{ message: "db down" }, "Error al actualizar el perfil."],
  ])("maps a failed save to the right message", async (error, message) => {
    createClientMock.mockResolvedValue(
      createSupabaseMock({ user: { id: "u1" }, query: { data: null, error } }),
    );
    const fd = form();
    fd.set("username", "nico");

    expect(await updateProfile(null, fd)).toEqual({ success: false, error: message });
  });
});
