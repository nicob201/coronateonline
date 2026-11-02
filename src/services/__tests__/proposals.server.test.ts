import { describe, expect, it } from "vitest";
import { getOwnProposals, getPendingProposals } from "../proposals.server";
import { createSupabaseMock } from "@/test/supabase-mock";

describe("getOwnProposals", () => {
  it("flattens the published title's slug, null until approved", async () => {
    const supabase = createSupabaseMock({
      query: {
        data: [
          { id: "p2", name: "Rey del Fernet", emoji: "🧉", status: "pending", created_at: "2026-11-02T00:00:00Z", titles: null },
          { id: "p1", name: "Duque", emoji: "🦆", status: "approved", created_at: "2026-11-01T00:00:00Z", titles: { slug: "duque" } },
        ],
        error: null,
      },
    });
    const result = await getOwnProposals(supabase, "u1");
    expect(result.map((p) => [p.id, p.titleSlug])).toEqual([
      ["p2", null],
      ["p1", "duque"],
    ]);
  });
});

describe("getPendingProposals", () => {
  it("names the author by display name, falling back to the username", async () => {
    const supabase = createSupabaseMock({
      query: {
        data: [
          {
            id: "p1",
            name: "Rey del Fernet",
            emoji: "🧉",
            description: "Nadie lo corta mejor.",
            created_at: "2026-11-02T00:00:00Z",
            author: { username: "nico", display_name: "  " },
          },
        ],
        error: null,
      },
    });
    const [proposal] = await getPendingProposals(supabase);
    expect(proposal).toEqual({
      id: "p1",
      name: "Rey del Fernet",
      emoji: "🧉",
      description: "Nadie lo corta mejor.",
      created_at: "2026-11-02T00:00:00Z",
      authorUsername: "nico",
      authorName: "nico",
    });
  });
});
