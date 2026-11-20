// Waits until PostgREST has reloaded its schema cache: right after `supabase db reset` it answers PGRST002 for a few seconds.
export default async function globalSetup(): Promise<void> {
  const apiUrl = process.env.E2E_API_URL;
  const key = process.env.E2E_ANON_KEY;
  if (!apiUrl || !key) throw new Error("E2E_API_URL and E2E_ANON_KEY come from playwright.config.ts");

  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${apiUrl}/rest/v1/titles?select=id&limit=1`, { headers: { apikey: key } });
      if (response.ok) return;
    } catch {
      // The API container is still restarting.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("The Supabase REST API did not become ready within 60 s");
}
