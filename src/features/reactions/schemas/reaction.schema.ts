import { z } from "zod";

// Validates a reaction throw: the reign it targets and what is thrown.
export const reactionSchema = z.object({
  reignId: z.uuid(),
  kind: z.enum(["tomato", "applause"]),
});

// Validates a react_to_reign broadcast: what was thrown and the reign's new totals.
export const reactionBroadcastSchema = z.object({
  kind: z.enum(["tomato", "applause"]),
  tomatoes: z.number().int().nonnegative(),
  applause: z.number().int().nonnegative(),
});
