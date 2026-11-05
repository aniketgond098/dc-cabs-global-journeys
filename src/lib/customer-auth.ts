import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let customerAuthClient: SupabaseClient | null = null;

export function normalizeCustomerPhone(value: string) {
  const compact = value.trim().replace(/[\s().-]/g, "");
  const international = compact.startsWith("+") ? compact : `+91${compact}`;
  return /^\+[1-9]\d{7,14}$/.test(international) ? international : null;
}

export function getCustomerAuthClient() {
  if (typeof window === "undefined") return null;

  const url = import.meta.env["VITE_SUPABASE_URL"]?.trim();
  const key =
    import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"]?.trim() ||
    import.meta.env["VITE_SUPABASE_ANON_KEY"]?.trim();

  if (!url || !key) return null;

  customerAuthClient ??= createClient(url, key, {
    auth: {
      autoRefreshToken: true,
      detectSessionInUrl: false,
      persistSession: true,
    },
  });

  return customerAuthClient;
}
