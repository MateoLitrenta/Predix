import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  console.log("🔎 URL Supabase:", process.env.NEXT_PUBLIC_SUPABASE_URL);
  console.log("🔎 Clave Supabase:", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.substring(0, 10) + "...");

  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
