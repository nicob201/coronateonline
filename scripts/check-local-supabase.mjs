// Runs before dev, build and test:sql. Any Supabase URL that points to this machine must be published by this
// project's own containers, so CoronaTeOnline never reads or writes another local project's database.
// Remote URLs (the hosted project, Vercel builds) pass untouched.
import { execFileSync } from "node:child_process"
import { existsSync } from "node:fs"

// Same precedence as Next: variables already in the environment win over the file
if (existsSync(".env.local")) process.loadEnvFile(".env.local")

const CHECKS = [
  ["NEXT_PUBLIC_SUPABASE_URL", "supabase_kong_coronateonline"],
  ["SUPABASE_DB_URL", "supabase_db_coronateonline"],
]

function fail(reason) {
  console.error(`\n✖ ${reason}\n  Start this project's stack with \`npx supabase start\` and use the URLs it prints.\n`)
  process.exit(1)
}

function publishedPorts(container) {
  try {
    return execFileSync("docker", ["ps", "--filter", `name=^${container}$`, "--format", "{{.Ports}}"], { encoding: "utf8" }).trim()
  } catch {
    fail("Docker is not running, so the local Supabase stack can't be verified.")
  }
}

for (const [name, container] of CHECKS) {
  const value = process.env[name]
  if (!value || !URL.canParse(value)) continue
  const { hostname, port } = new URL(value)
  if (hostname !== "127.0.0.1" && hostname !== "localhost") continue

  // Only host and port are printed: database URLs carry the password
  const published = publishedPorts(container)
  if (!published) fail(`${name} points to ${hostname}:${port}, but the CoronaTeOnline stack is not running (${container} not found).`)
  if (!published.includes(`:${port}->`)) fail(`${name} points to ${hostname}:${port}, which does not belong to the CoronaTeOnline stack (it publishes ${published}).`)
}
