import { createBrowserClient } from '@supabase/ssr'

let client: ReturnType<typeof createBrowserClient> | null = null

export function createClient() {
  if (client) return client
  client = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          if (typeof document === 'undefined') return []
          return document.cookie.split(';').map((c) => {
            const [key, ...v] = c.split('=')
            return { name: key.trim(), value: v.join('=') }
          })
        },
        setAll(cookies) {
          if (typeof document === 'undefined') return
          cookies.forEach(({ name, value, options }) => {
            document.cookie = `${name}=${value}; path=/; max-age=${options?.maxAge || 31536000}; SameSite=${options?.sameSite || 'Lax'}`
          })
        },
      },
    }
  )
  return client
}
