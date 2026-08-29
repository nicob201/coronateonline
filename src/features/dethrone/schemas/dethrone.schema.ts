import { z } from "zod";

// Validates a dethrone submission: which title, its slug (for revalidation), and the offered amount in ARS.
export const dethroneSchema = z.object({
  titleId: z.uuid(),
  slug: z.string().min(1),
  amount: z.coerce
    .number()
    .int()
    .positive()
    .multipleOf(1000, { error: "El monto debe ser múltiplo de 1000." }),
});

export type DethroneInput = z.infer<typeof dethroneSchema>;
