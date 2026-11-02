import { z } from "zod";

// One RGI emoji (ZWJ sequences, flags and keycaps included); built at runtime because the TS target predates the `v` flag.
const SINGLE_EMOJI = new RegExp("^\\p{RGI_Emoji}$", "v");

// Validates a title proposal: name, a single emoji and a short description.
export const proposeTitleSchema = z.object({
  name: z
    .string()
    .trim()
    .min(3, { error: "El nombre debe tener al menos 3 caracteres." })
    .max(40, { error: "El nombre no puede superar los 40 caracteres." }),
  emoji: z.string().trim().regex(SINGLE_EMOJI, { error: "Elegí un solo emoji." }),
  description: z
    .string()
    .trim()
    .min(3, { error: "La descripción debe tener al menos 3 caracteres." })
    .max(140, { error: "La descripción no puede superar los 140 caracteres." }),
});
