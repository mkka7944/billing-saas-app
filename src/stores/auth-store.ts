import { create } from 'zustand'
import { createClient } from '@/lib/supabase/client'
import type { User, Session } from '@supabase/supabase-js'

function toEmail(input: string): string {
  return input.includes('@') ? input : `${input}@billing.local`
}

interface ProfileInfo {
  roleName: string
  displayName: string | null
  username: string | null
}

async function fetchProfile(userId: string): Promise<ProfileInfo> {
  try {
    const supabase = createClient()
    const { data } = await supabase
      .from('profiles')
      .select('username, full_name, suspended_at, deleted_at, roles!inner(name)')
      .eq('id', userId)
      .single()
    const roles = data?.roles as { name: string } | undefined
    return {
      roleName: roles?.name || 'staff',
      displayName: data?.full_name || data?.username || null,
      username: data?.username || null,
    }
  } catch {
    return { roleName: 'staff', displayName: null, username: null }
  }
}

interface AuthState {
  user: User | null
  session: Session | null
  isLoading: boolean
  initialized: boolean
  roleName: string
  displayName: string | null
  setUser: (user: User | null) => void
  setSession: (session: Session | null) => void
  setInitialized: (val: boolean) => void
  checkSession: () => Promise<void>
  signOut: () => Promise<void>
  signIn: (input: string, password: string) => Promise<{ error: string | null }>
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  session: null,
  isLoading: true,
  initialized: false,
  roleName: 'staff',
  displayName: null,

  setUser: (user) => set({ user }),
  setSession: (session) => set({ session }),
  setInitialized: (val) => set({ initialized: val }),

  checkSession: async () => {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    const user = session?.user ?? null
    if (user) {
      const profile = await fetchProfile(user.id)
      if (profile.displayName) {
        set({ session, user, ...profile, isLoading: false, initialized: true })
      } else {
        set({ session, user, ...profile, isLoading: false, initialized: true })
      }
    } else {
      set({ session: null, user: null, roleName: 'staff', displayName: null, isLoading: false, initialized: true })
    }
  },

  signOut: async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    set({ user: null, session: null, roleName: 'staff', displayName: null })
  },

  signIn: async (input, password) => {
    const email = toEmail(input)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return { error: error.message }

    const { data: { session } } = await supabase.auth.getSession()
    const user = session?.user ?? null
    if (!user) return { error: 'Session not found' }

    const profile = await fetchProfile(user.id)

    // Check if account is suspended or deleted
    try {
      const { data: check } = await supabase
        .from('profiles')
        .select('suspended_at, deleted_at')
        .eq('id', user.id)
        .single()
      if (check?.deleted_at) {
        await supabase.auth.signOut()
        return { error: 'Account not found' }
      }
      if (check?.suspended_at) {
        await supabase.auth.signOut()
        return { error: 'Account is frozen. Contact your admin.' }
      }
    } catch {}

    set({ session, user, ...profile, isLoading: false })
    return { error: null }
  },
}))
