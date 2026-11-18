import { z } from "zod";

// Where Google sends a guest back after linking: /perfil, flagged so it can confirm or explain the result.
export const LINK_RETURN_PATH = "/perfil?vincular=google";

// Reads /perfil's search params after a Google link round trip; anything unexpected is dropped.
export const linkResultSchema = z.object({
  vincular: z.literal("google").optional().catch(undefined),
  error: z.string().max(64).optional().catch(undefined),
});
