import { vi } from "vitest";
import type { SupabaseServerClient } from "@/lib/supabase/server";

type Result = { data: unknown; error: unknown };

// Options for a chainable Supabase mock: canned results per surface.
export interface SupabaseMockOptions {
  user?: { id: string } | null;
  rpc?: Result;
  query?: Result;
  storageUpload?: Result;
  storageRemove?: Result;
  publicUrl?: string;
}

// Builds a chainable Supabase client mock: query builder methods return the
// builder, terminal calls (maybeSingle/single/await) resolve to `query`.
export function createSupabaseMock(options: SupabaseMockOptions = {}) {
  const queryResult: Result = options.query ?? { data: null, error: null };
  const rpcResult: Result = options.rpc ?? { data: null, error: null };

  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  for (const method of ["select", "insert", "update", "delete", "eq", "is", "order", "limit"]) {
    builder[method] = vi.fn(chain);
  }
  builder.maybeSingle = vi.fn(async () => queryResult);
  builder.single = vi.fn(async () => queryResult);
  builder.then = (resolve: (r: Result) => unknown) => Promise.resolve(queryResult).then(resolve);

  const storageBucket = {
    upload: vi.fn(async () => options.storageUpload ?? { data: { path: "p" }, error: null }),
    remove: vi.fn(async () => options.storageRemove ?? { data: [], error: null }),
    getPublicUrl: vi.fn(() => ({
      data: { publicUrl: options.publicUrl ?? "https://cdn.test/avatar.png" },
    })),
  };

  const client = {
    from: vi.fn(() => builder),
    rpc: vi.fn(async () => rpcResult),
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
