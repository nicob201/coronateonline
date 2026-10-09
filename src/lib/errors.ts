// Reads the message of a thrown value; Supabase errors are plain objects, not Error instances.
export function errorMessage(err: unknown): string {
  return typeof err === "object" && err !== null && "message" in err ? String(err.message) : "";
}
