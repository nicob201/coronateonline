import { describe, expect, it } from "vitest";
import {
  getPublicProfile,
  removeAvatarByUrl,
  updateOwnProfile,
  uploadAvatar,
} from "../profiles.server";
import { createSupabaseMock } from "@/test/supabase-mock";

function pngFile(name = "a.png"): File {
  return new File([new Uint8Array([1, 2, 3])], name, { type: "image/png" });
}

function profileRow(overrides: Record<string, unknown> = {}) {
  return {
    username: "nico",
    display_name: "Nicolás",
    avatar_url: null,
    bio: "El verdadero rey.",
    is_bot: false,
    instagram: "nico",
    tiktok: null,
    youtube: null,
    x: null,
    twitch: null,
    website: null,
    reigns: [
      {
        price_paid: 5,
        started_at: "2026-08-20T00:00:00Z",
        ended_at: null,
        titles: { name: "Rey de Córdoba", emoji: "👑", slug: "rey-de-cordoba" },
      },
      {
        price_paid: 2,
        started_at: "2026-08-10T00:00:00Z",
        ended_at: "2026-08-15T00:00:00Z",
        titles: { name: "CEO de los Lunes", emoji: "😂", slug: "ceo-lunes" },
      },
      {
        price_paid: 3,
        started_at: "2026-08-01T00:00:00Z",
        ended_at: "2026-08-05T00:00:00Z",
        titles: { name: "Rey de la Pizza", emoji: "🍕", slug: "rey-pizza" },
      },
    ],
    ...overrides,
  };
}

describe("getPublicProfile", () => {
  it("returns null when no profile matches the username", async () => {
    const supabase = createSupabaseMock({ query: { data: null, error: null } });
    expect(await getPublicProfile(supabase, "ghost")).toBeNull();
  });

  it("splits active reigns from past reigns, past ones newest-first", async () => {
    const supabase = createSupabaseMock({ query: { data: profileRow(), error: null } });
    const result = await getPublicProfile(supabase, "nico");

    expect(result?.currentReigns.map((r) => r.titleSlug)).toEqual(["rey-de-cordoba"]);
    expect(result?.pastReigns.map((r) => r.titleSlug)).toEqual([
      "ceo-lunes",
      "rey-pizza",
    ]);
  });

  it("maps reign fields to the domain shape", async () => {
    const supabase = createSupabaseMock({ query: { data: profileRow(), error: null } });
    const result = await getPublicProfile(supabase, "nico");

    expect(result?.currentReigns[0]).toEqual({
      titleName: "Rey de Córdoba",
      titleEmoji: "👑",
      titleSlug: "rey-de-cordoba",
      pricePaid: 5,
      startedAt: "2026-08-20T00:00:00Z",
      endedAt: null,
    });
  });

  it("falls back to username when display_name is empty", async () => {
    const supabase = createSupabaseMock({
      query: { data: profileRow({ display_name: "  " }), error: null },
    });
    const result = await getPublicProfile(supabase, "nico");
    expect(result?.displayName).toBe("nico");
  });

  it("flags a bot profile", async () => {
    const supabase = createSupabaseMock({ query: { data: profileRow({ is_bot: true }), error: null } });
    const result = await getPublicProfile(supabase, "baron_bug");
    expect(result?.isBot).toBe(true);
  });

  it("keeps only non-null social links", async () => {
    const supabase = createSupabaseMock({ query: { data: profileRow(), error: null } });
    const result = await getPublicProfile(supabase, "nico");
    expect(result?.socials).toEqual({ instagram: "nico" });
  });
});

describe("updateOwnProfile", () => {
  it("forwards the given fields to the profiles update", async () => {
    const supabase = createSupabaseMock({ query: { data: { username: "n" }, error: null } });
    await updateOwnProfile(supabase, "u1", {
      bio: "hola",
      instagram: "https://instagram.com/n",
    });
    const builder = supabase.from("profiles");
    expect(builder.update).toHaveBeenCalledWith({
      bio: "hola",
      instagram: "https://instagram.com/n",
    });
  });
});

describe("uploadAvatar", () => {
  it("returns the public URL of the uploaded file", async () => {
    const supabase = createSupabaseMock({ publicUrl: "https://cdn.test/u1/x.png" });
    const url = await uploadAvatar(supabase, "u1", pngFile());
    expect(url).toBe("https://cdn.test/u1/x.png");
  });

  it("uploads under the user's own folder", async () => {
    const supabase = createSupabaseMock();
    await uploadAvatar(supabase, "u1", pngFile());
    const bucket = supabase.storage.from("avatars");
    const [path] = (bucket.upload as unknown as { mock: { calls: unknown[][] } }).mock
      .calls[0];
    expect(String(path).startsWith("u1/")).toBe(true);
  });

  it("throws when storage rejects the upload", async () => {
    const supabase = createSupabaseMock({
      storageUpload: { data: null, error: { message: "Payload too large" } },
    });
    await expect(uploadAvatar(supabase, "u1", pngFile())).rejects.toMatchObject({
      message: "Payload too large",
    });
  });
});

describe("removeAvatarByUrl", () => {
  it("removes the object path parsed from a public avatars URL", async () => {
    const supabase = createSupabaseMock();
    await removeAvatarByUrl(
      supabase,
      "https://x.supabase.co/storage/v1/object/public/avatars/u1/123.png",
    );
    expect(supabase.storage.from("avatars").remove).toHaveBeenCalledWith(["u1/123.png"]);
  });

  it("ignores a URL outside the avatars bucket", async () => {
    const supabase = createSupabaseMock();
    await removeAvatarByUrl(supabase, "https://example.com/pic.png");
    expect(supabase.storage.from("avatars").remove).not.toHaveBeenCalled();
  });
});
