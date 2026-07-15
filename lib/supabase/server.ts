import { createClient } from "@supabase/supabase-js";
import { supabaseUrl } from "@/lib/supabase/config";

const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

export const isServerSupabaseConfigured = Boolean(
  supabaseUrl && supabaseServiceRoleKey,
);

export const serverSupabase = isServerSupabaseConfigured
  ? createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })
  : null;
