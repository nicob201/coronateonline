import { z } from "zod";

const INVALID_AMOUNT = { error: "Monto inválido." };

// Validates a dethrone submission: title, amount, and optional coronation message.
export const dethroneSchema = z.object({
  titleId: z.uuid({ error: "Título inválido." }),
  amount: z.coerce.number(INVALID_AMOUNT).int(INVALID_AMOUNT).positive(INVALID_AMOUNT),
  message: z
    .string()
    .trim()
    .max(80, { error: "El mensaje no puede superar los 80 caracteres." })
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
});

export type DethroneInput = z.infer<typeof dethroneSchema>;
