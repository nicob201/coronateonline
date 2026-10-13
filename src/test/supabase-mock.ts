import { vi } from "vitest";
import type { SupabaseServerClient } from "@/lib/supabase/server";

type Result = { data: unknown; error: unknown };

// Options for a chainable Supabase mock: canned results per surface.
export interface SupabaseMockOptions {
  user?: { id: string } | null;
  rpc?: Result;
  query?: Result;
  queryByTable?: Record<string, Result>;
  storageUpload?: Result;
  storageRemove?: Result;
  publicUrl?: string;
}

const BUILDER_METHODS = [
  "select", "insert", "update", "delete",
  "eq", "in", "is", "not", "gt", "order", "limit",
];

function makeBuilder(result: Result) {
  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  for (const method of BUILDER_METHODS) builder[method] = vi.fn(chain);
  builder.maybeSingle = vi.fn(async () => result);
  builder.single = vi.fn(async () => result);
  builder.then = (resolve: (r: Result) => unknown) =>
    Promise.resolve(result).then(resolve);
  return builder;
}

// Builds a chainable Supabase client mock; from(table) returns a stable per-table builder resolving to queryByTable[table] ?? query.
export function createSupabaseMock(options: SupabaseMockOptions = {}) {
  const fallback: Result = options.query ?? { data: null, error: null };
  const rpcResult: Result = options.rpc ?? { data: null, error: null };
  const builders = new Map<string, ReturnType<typeof makeBuilder>>();

  const storageBucket = {
    upload: vi.fn(async () => options.storageUpload ?? { data: { path: "p" }, error: null }),
    remove: vi.fn(async () => options.storageRemove ?? { data: [], error: null }),
    getPublicUrl: vi.fn(() => ({
      data: { publicUrl: options.publicUrl ?? "https://cdn.test/avatar.png" },
    })),
  };

  const client = {
    from: vi.fn((table: string) => {
      const existing = builders.get(table);
      if (existing) return existing;
      const created = makeBuilder(options.queryByTable?.[table] ?? fallback);
      builders.set(table, created);
      return created;
    }),
    rpc: vi.fn(() => makeBuilder(rpcResult)),
    storage: { from: vi.fn(() => storageBucket) },
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: options.user ?? null },
        error: null,
      })),
    },
  };

  return client as unknown as SupabaseServerClient;
}
