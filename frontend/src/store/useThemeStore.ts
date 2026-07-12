import { create } from "zustand"
import { persist } from "zustand/middleware"

interface ThemeState {
  theme: "light" | "dark"
  toggleTheme: () => void
  setTheme: (theme: "light" | "dark") => void
  applyTheme: () => void
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: (typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: light)").matches) ? "light" : "dark", // respect system preferences, default to dark for premium aesthetics
      setTheme: (theme) => {
        set({ theme })
        get().applyTheme()
      },
      toggleTheme: () => {
        const current = get().theme
        const next = current === "light" ? "dark" : "light"
        set({ theme: next })
        get().applyTheme()
      },
      applyTheme: () => {
        const theme = get().theme
        const root = window.document.documentElement
        root.classList.remove("light", "dark")
        root.classList.add(theme)
      }
    }),
    {
      name: "refillx-theme-storage",
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.applyTheme()
        }
      }
    }
  )
)
