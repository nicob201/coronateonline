// SQLSTATE codes raised by the game's RPCs (migration 0023); the code, not the English message, identifies an error.
export const RPC_ERROR = {
  NOT_AUTHENTICATED: "CT001",
  PROFILE_INCOMPLETE: "CT002",
  INSUFFICIENT_BALANCE: "CT003",
  NOT_AUTHORIZED: "CT004",
  AMOUNT_NOT_POSITIVE: "CT101",
  MESSAGE_TOO_LONG: "CT102",
  TITLE_NOT_FOUND: "CT103",
  ALREADY_HOLDER: "CT104",
  AMOUNT_TOO_LOW: "CT105",
  SALARY_CLAIMED: "CT201",
  INVALID_REACTION: "CT301",
  REIGN_NOT_ACTIVE: "CT302",
  OWN_REIGN: "CT303",
  RATE_LIMITED: "CT304",
  INVALID_NAME: "CT401",
  INVALID_EMOJI: "CT402",
  INVALID_DESCRIPTION: "CT403",
  PROPOSAL_PENDING: "CT404",
  TITLE_NAME_TAKEN: "CT405",
  PROPOSAL_NOT_FOUND: "CT406",
  PROPOSAL_REVIEWED: "CT407",
} as const;

export type RpcErrorCode = (typeof RPC_ERROR)[keyof typeof RPC_ERROR];

// Spanish copy shared by every action whose RPC calls assert_onboarded.
export const PROFILE_INCOMPLETE_ERROR = "Elegí tu nombre en el perfil antes de jugar.";

// Reads the SQLSTATE of a thrown Supabase error; Supabase errors are plain objects, not Error instances.
export function rpcErrorCode(err: unknown): string | null {
  return typeof err === "object" && err !== null && "code" in err && typeof err.code === "string"
    ? err.code
    : null;
}

// Picks the Spanish message for a thrown RPC error by its SQLSTATE, or the fallback for unknown codes and non-RPC errors.
export function rpcErrorMessage(
  err: unknown,
  messages: Partial<Record<RpcErrorCode, string>>,
  fallback: string,
): string {
  const code = rpcErrorCode(err);
  const byCode: Partial<Record<string, string>> = messages;
  return (code && byCode[code]) || fallback;
}
