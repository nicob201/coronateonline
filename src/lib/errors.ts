// Reads the message of a thrown value; Supabase errors are plain objects, not Error instances.
export function errorMessage(err: unknown): string {
  return typeof err === "object" && err !== null && "message" in err ? String(err.message) : "";
}

// Spanish copy for the 'Profile incomplete' RPC error (no display_name yet).
export const PROFILE_INCOMPLETE_ERROR = "Elegí tu nombre en el perfil antes de jugar.";
