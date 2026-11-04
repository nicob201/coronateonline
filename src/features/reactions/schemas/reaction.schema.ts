import { z } from "zod";

// Validates a reaction throw: the reign it targets and what is thrown.
export const reactionSchema = z.object({
  reignId: z.uuid(),
  kind: z.enum(["tomato", "applause"]),
});
