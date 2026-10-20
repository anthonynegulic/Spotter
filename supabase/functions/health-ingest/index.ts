// Supabase Edge Function: receives Health Auto Export's REST API automation.
// Deployed with JWT verification off (Health Auto Export can't send a
// Supabase session); it authenticates with a per-user ingest token instead.
import { createClient } from "npm:@supabase/supabase-js@2";
import { handleIngest } from "../_shared/ingest.ts";
import { supabaseStore } from "../_shared/supabaseStore.ts";

const client = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const store = supabaseStore(client);

Deno.serve(async (req) => {
  try {
    return await handleIngest(req, store);
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: "Server error" }), { status: 500, headers: { "content-type": "application/json" } });
  }
});
