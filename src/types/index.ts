import type { Database } from "./database.types";

// Generic result type for server actions.
export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

// Domain row types re-exported from the generated database types.
export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type Title = Database["public"]["Tables"]["titles"]["Row"];
export type Reign = Database["public"]["Tables"]["reigns"]["Row"];
export type Claim = Database["public"]["Tables"]["claims"]["Row"];

export type { Database };
