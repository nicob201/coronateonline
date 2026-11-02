import { z } from "zod";

// Validates an admin review: which proposal and whether it is approved or rejected.
export const reviewProposalSchema = z.object({
  proposalId: z.uuid(),
  decision: z.enum(["approve", "reject"]),
});
