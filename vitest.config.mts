import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Vitest config: node environment, @/* alias mirrors tsconfig paths.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/__tests__/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
