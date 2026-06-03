import 'server-only'
import { createClient } from '@supabase/supabase-js'

let client: ReturnType<typeof createClient> | null = null

export function createAdminClient() {
  if (client) return client
  client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )
  return client
}
