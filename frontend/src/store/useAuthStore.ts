import { create } from "zustand"
import { persist } from "zustand/middleware"
import type { User } from "firebase/auth"

export interface UserProfile {
  name: string
  phone: string
  walletBalance: number
  ecoPoints: number
  tier: string
  createdAt?: any
  role?: string
  notificationPrefs?: {
    dispenseComplete?: boolean
    lowWallet?: boolean
    ecoTips?: boolean
  }
  ecoPassportUrl?: string
}

interface AuthState {
  currentUser: User | null
  userProfile: UserProfile | null
  isLoading: boolean
  setUser: (user: User | null) => void
  setUserProfile: (profile: UserProfile | null) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      currentUser: null,
      userProfile: null,
      isLoading: true,
      setUser: (user) => set({ currentUser: user, isLoading: false }),
      setUserProfile: (profile) => set({ userProfile: profile }),
      logout: () => set({ currentUser: null, userProfile: null, isLoading: false }),
    }),
    {
      name: "refillx-auth-storage",
      // Only serialize serializable items (e.g. userProfile) to prevent circular structures in User object
      partialize: (state) => ({
        userProfile: state.userProfile,
      }),
    }
  )
)
