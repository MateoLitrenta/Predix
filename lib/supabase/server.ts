import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// Force IPv4 for local Node.js environment to prevent DNS resolution timeouts
if (typeof window === 'undefined') {
  try {
    const dns = require('node:dns')
    if (dns && dns.setDefaultResultOrder) {
      dns.setDefaultResultOrder('ipv4first')
    }
  } catch (e) {
    // Silent catch if dns module is not available (e.g. Edge runtime)
  }
}

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            )
          } catch {
            // Server Component context - ignore setAll failures
          }
        },
      },
      global: {
        // Force Next.js to skip caching for Supabase Server requests
        fetch: (url, options) => fetch(url, { ...options, cache: 'no-store' }),
      },
    },
  )
}
