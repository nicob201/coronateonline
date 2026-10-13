import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getNotifications, markNotificationsSeen } from "../notifications.server";
import { createSupabaseMock } from "@/test/supabase-mock";

const T1 = "2026-10-13T10:00:00+00:00";
const T2 = "2026-10-13T11:00:00+00:00";
const T3 = "2026-10-13T12:00:00.5+00:00";

function reignRow(id: string, startedAt: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    started_at: startedAt,
    price_paid: 12,
    message: null,
    profiles: { username: "fran", display_name: "Fran" },
    titles: { name: "Rey de Córdoba", emoji: "👑", slug: "rey-de-cordoba" },
    ...overrides,
  };
}

function mockWith(rows: unknown[], seenAt: string | null) {
  return createSupabaseMock({
    queryByTable: {
      reigns: { data: rows, error: null },
      notification_seen: { data: seenAt === null ? null : { seen_at: seenAt }, error: null },
    },
  });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-14T00:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("getNotifications", () => {
  it("maps joined reigns to notices, newest first as returned", async () => {
    const supabase = mockWith([reignRow("r2", T2, { message: "jaque" }), reignRow("r1", T1)], null);
    const { items } = await getNotifications(supabase, "u1");
    expect(items).toEqual([
      { id: "r2", titleName: "Rey de Córdoba", titleEmoji: "👑", titleSlug: "rey-de-cordoba", byName: "Fran", pricePaid: 12, message: "jaque", at: T2 },
      { id: "r1", titleName: "Rey de Córdoba", titleEmoji: "👑", titleSlug: "rey-de-cordoba", byName: "Fran", pricePaid: 12, message: null, at: T1 },
    ]);
  });

  it("falls back to the username, then to Anónimo, for the dethroner's name", async () => {
    const supabase = mockWith(
      [
        reignRow("r3", T3, { profiles: { username: "fran", display_name: "  " } }),
        reignRow("r2", T2, { profiles: { username: "fran", display_name: null } }),
        reignRow("r1", T1, { profiles: null }),
      ],
      null,
    );
    const { items } = await getNotifications(supabase, "u1");
    expect(items.map((i) => i.byName)).toEqual(["fran", "fran", "Anónimo"]);
  });

  it("skips a reign whose title join is missing", async () => {
    const supabase = mockWith([reignRow("r2", T2, { titles: null }), reignRow("r1", T1)], null);
    const { items } = await getNotifications(supabase, "u1");
    expect(items.map((i) => i.id)).toEqual(["r1"]);
  });

  it("counts only items strictly newer than seen_at as unread", async () => {
    const supabase = mockWith([reignRow("r3", T3), reignRow("r2", T2), reignRow("r1", T1)], T2);
    await expect(getNotifications(supabase, "u1")).resolves.toMatchObject({ unread: 1 });
  });

  it("treats everything as unread when the user has no notification_seen row", async () => {
    const supabase = mockWith([reignRow("r2", T2), reignRow("r1", T1)], null);
    await expect(getNotifications(supabase, "u1")).resolves.toMatchObject({ unread: 2 });
  });

  it("has nothing unread when seen_at is newer than every item", async () => {
    const supabase = mockWith([reignRow("r2", T2), reignRow("r1", T1)], "2026-10-13T20:00:00+00:00");
    await expect(getNotifications(supabase, "u1")).resolves.toMatchObject({ unread: 0 });
  });

  it("returns an empty inbox when nobody dethroned the user", async () => {
    const supabase = mockWith([], null);
    await expect(getNotifications(supabase, "u1")).resolves.toEqual({ items: [], unread: 0 });
  });

  it("queries the user's dethrones of the last 14 days, newest first, capped at 10", async () => {
    const supabase = mockWith([], null);
    await getNotifications(supabase, "u1");
    const reigns = supabase.from("reigns").select();
    expect(reigns.eq).toHaveBeenCalledWith("dethroned_user_id", "u1");
    expect(reigns.gt).toHaveBeenCalledWith("started_at", "2026-09-30T00:00:00.000Z");
    expect(reigns.order).toHaveBeenCalledWith("started_at", { ascending: false });
    expect(reigns.limit).toHaveBeenCalledWith(10);
    expect(supabase.from("notification_seen").select().eq).toHaveBeenCalledWith("user_id", "u1");
  });

  it("throws when the reigns query fails", async () => {
    const supabase = createSupabaseMock({
      queryByTable: {
        reigns: { data: null, error: { message: "boom" } },
        notification_seen: { data: null, error: null },
      },
    });
    await expect(getNotifications(supabase, "u1")).rejects.toMatchObject({ message: "boom" });
  });

  it("throws when the seen-state query fails", async () => {
    const supabase = createSupabaseMock({
      queryByTable: {
        reigns: { data: [], error: null },
        notification_seen: { data: null, error: { message: "seen boom" } },
      },
    });
    await expect(getNotifications(supabase, "u1")).rejects.toMatchObject({ message: "seen boom" });
  });
});

describe("markNotificationsSeen", () => {
  it("calls the mark_notifications_seen RPC", async () => {
    const supabase = createSupabaseMock({ rpc: { data: null, error: null } });
    await expect(markNotificationsSeen(supabase)).resolves.toBeUndefined();
    expect(supabase.rpc).toHaveBeenCalledWith("mark_notifications_seen");
  });

  it("throws when the RPC fails", async () => {
    const supabase = createSupabaseMock({ rpc: { data: null, error: { message: "boom" } } });
    await expect(markNotificationsSeen(supabase)).rejects.toMatchObject({ message: "boom" });
  });
});
