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
  assignedCity: string | null
}

async function fetchProfile(): Promise<ProfileInfo> {
  try {
    const res = await fetch('/api/auth/profile')
    if (res.status === 401 || res.status === 404 || res.status === 403) {
      return { roleName: 'staff', displayName: null, username: null, assignedCity: null }
    }
    const json = await res.json()
    return json.data || { roleName: 'staff', displayName: null, username: null, assignedCity: null }
  } catch {
    return { roleName: 'staff', displayName: null, username: null, assignedCity: null }
  }
}

interface AuthState {
  user: User | null
  session: Session | null
  isLoading: boolean
  initialized: boolean
  roleName: string
  displayName: string | null
  assignedCity: string | null
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
  assignedCity: null,

  setUser: (user) => set({ user }),
  setSession: (session) => set({ session }),
  setInitialized: (val) => set({ initialized: val }),

  checkSession: async () => {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    const user = session?.user ?? null
    if (user) {
      const profile = await fetchProfile()
      set({ session, user, ...profile, isLoading: false, initialized: true })
    } else {
      set({ session: null, user: null, roleName: 'staff', displayName: null, assignedCity: null, isLoading: false, initialized: true })
    }
  },

  signOut: async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    set({ user: null, session: null, roleName: 'staff', displayName: null, assignedCity: null })
  },

  signIn: async (input, password) => {
    const email = toEmail(input)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return { error: error.message }

    const { data: { session } } = await supabase.auth.getSession()
    const user = session?.user ?? null
    if (!user) return { error: 'Session not found' }

    const profile = await fetchProfile()

    // fetchProfile handles frozen/deleted check via the API route
    if (!profile.displayName) {
      await supabase.auth.signOut()
      return { error: 'Account not found or frozen' }
    }

    set({ session, user, ...profile, isLoading: false })
    return { error: null }
  },
}))
