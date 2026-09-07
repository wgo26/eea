'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { isRole } from '@/lib/auth/roles'
import type { AppRole } from '@/lib/auth/types'

type AuthContextValue = {
  user: User | null
  roles: AppRole[]
  isStaff: boolean
  isAdmin: boolean
  loading: boolean
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  roles: [],
  isStaff: false,
  isAdmin: false,
  loading: true,
})

/**
 * Mount once near the root layout. Gives client components (header, nav,
 * "submit a story" CTA state, etc.) reactive access to the current user
 * and roles without each one re-fetching independently.
 *
 * This is UI convenience only — it is never the source of truth for access
 * control. Real enforcement lives in middleware + RLS + the server guards
 * in lib/auth/guards.ts.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [roles, setRoles] = useState<AppRole[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()
    let active = true

    async function loadRoles(userId: string) {
      try {
        const { data, error } = await supabase.from('user_roles').select('role').eq('user_id', userId)
        if (error || !active) return
        setRoles((data ?? []).map((r) => r.role).filter(isRole))
      } catch {
        // UI convenience only — a failed role fetch degrades to signed-out
        // chrome; server guards + RLS remain the real enforcement.
      }
    }

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!active) return
      setUser(user)
      if (user) loadRoles(user.id)
      setLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) loadRoles(session.user.id)
      else setRoles([])
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  const isStaff = roles.includes('admin') || roles.includes('editor')
  const isAdmin = roles.includes('admin')

  return (
    <AuthContext.Provider value={{ user, roles, isStaff, isAdmin, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
