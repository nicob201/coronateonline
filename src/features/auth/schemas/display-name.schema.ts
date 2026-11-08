import { z } from "zod";

// Validates a public display name.
export const displayNameSchema = z
  .string()
  .trim()
  .min(1, { error: "El nombre es obligatorio." })
  .max(50, { error: "El nombre no puede superar los 50 caracteres." });
