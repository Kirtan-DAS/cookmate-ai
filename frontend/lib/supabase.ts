import { createClient } from "@supabase/supabase-js";

// Read environment variables with fallback support for your Supabase credentials
const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://rlyuzutdeguycfojdypx.supabase.co";

const supabasePublishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "sb_publishable_RuaY1yQZdPSyUKEXvqBa_w_PYi00NUZ";

if (!supabaseUrl) {
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_URL is missing. Please check your .env.local file."
  );
}

if (!supabasePublishableKey) {
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY is missing. Please check your .env.local file."
  );
}

// Create and export the Supabase client with auth session persistence enabled
export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});