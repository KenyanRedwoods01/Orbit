import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

interface AuthUser {
  username: string
  scope: string
}

interface AuthState {
  user: AuthUser | null
  setUser: (user: AuthUser | null) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      setUser: (user) => set({ user }),
      logout: () => set({ user: null }),
    }),
    {
      name: 'orbit-auth',
      storage: createJSONStorage(() =>
        typeof window !== 'undefined' ? window.sessionStorage : localStorage
      ),
    }
  )
)
