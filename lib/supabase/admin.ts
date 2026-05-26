import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

// Server-only. Bypasses RLS. Never import into client components.
export function createAdminClient() {
  return createClient(env.supabaseUrl(), env.supabaseServiceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
