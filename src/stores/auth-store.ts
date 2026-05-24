import { create } from 'zustand'
import { createClient } from '@/lib/supabase/client'
import type { User, Session } from '@supabase/supabase-js'

interface AuthState {
  user: User | null
  session: Session | null
  isLoading: boolean
  initialized: boolean
  role: string
  setUser: (user: User | null) => void
  setSession: (session: Session | null) => void
  setInitialized: (val: boolean) => void
  checkSession: () => Promise<void>
  signOut: () => Promise<void>
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
}

async function fetchRole(userId: string): Promise<string> {
  try {
    const supabase = createClient()
    const { data } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single()
    return data?.role || 'staff'
  } catch {
    return 'staff'
  }
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  session: null,
  isLoading: true,
  initialized: false,
  role: 'staff',

  setUser: (user) => set({ user }),
  setSession: (session) => set({ session }),
  setInitialized: (val) => set({ initialized: val }),

  checkSession: async () => {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    const user = session?.user ?? null
    const role = user ? await fetchRole(user.id) : 'staff'
    set({ session, user, role, isLoading: false, initialized: true })
  },

  signOut: async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    set({ user: null, session: null, role: 'staff' })
  },

  signIn: async (email, password) => {
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return { error: error.message }
    const { data: { session } } = await supabase.auth.getSession()
    const user = session?.user ?? null
    const role = user ? await fetchRole(user.id) : 'staff'
    set({ session, user, role, isLoading: false })
    return { error: null }
  },
}))
