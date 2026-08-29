import { z } from "zod";

// Validates a dethrone submission: title, slug, amount, and optional coronation message.
export const dethroneSchema = z.object({
  titleId: z.uuid(),
  slug: z.string().min(1),
  amount: z.coerce
    .number()
    .int()
    .positive()
    .multipleOf(1000, { error: "El monto debe ser múltiplo de 1000." }),
  message: z
    .string()
    .trim()
    .max(80, { error: "El mensaje no puede superar los 80 caracteres." })
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
});

export type DethroneInput = z.infer<typeof dethroneSchema>;
