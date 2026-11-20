import { execFileSync } from "node:child_process";
import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const baseURL = `http://localhost:${PORT}`;

// Always the local stack: these tests write to the database and .env.local points at the shared hosted project.
const stack: { API_URL: string; ANON_KEY: string; SERVICE_ROLE_KEY: string } = JSON.parse(
  execFileSync("npx", ["supabase", "status", "-o", "json"], { encoding: "utf8" }),
);

// Lets specs top up a test guest through the REST API; the service role never reaches the app under test.
process.env.E2E_API_URL = stack.API_URL;
process.env.E2E_SERVICE_ROLE_KEY = stack.SERVICE_ROLE_KEY;
process.env.E2E_ANON_KEY = stack.ANON_KEY;

export default defineConfig({
  testDir: "e2e",
  globalSetup: "./e2e/global-setup.ts",
  workers: 1,
  use: { ...devices["Desktop Chrome"], baseURL },
  webServer: {
    command: `npm run build && npm run start -- -p ${PORT}`,
    url: baseURL,
    timeout: 300_000,
    // Never attach to a dev server already running, it could be talking to the hosted project.
    reuseExistingServer: false,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: stack.API_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: stack.ANON_KEY,
      NEXT_PUBLIC_SITE_URL: baseURL,
    },
  },
});
