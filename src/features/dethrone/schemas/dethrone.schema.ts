import { z } from "zod";

// Validates a dethrone submission: title, amount, and optional coronation message.
export const dethroneSchema = z.object({
  titleId: z.uuid(),
  amount: z.coerce.number().int().positive(),
  message: z
    .string()
    .trim()
    .max(80, { error: "El mensaje no puede superar los 80 caracteres." })
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
});

export type DethroneInput = z.infer<typeof dethroneSchema>;
