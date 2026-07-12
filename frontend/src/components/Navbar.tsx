import { Link, useLocation, useNavigate } from "react-router-dom"
import { Droplet, Wallet, History as HistoryIcon, ShieldAlert, Home, Cpu, User, LogOut, Sun, Moon, ConciergeBell } from "lucide-react"
import { useAuthStore } from "../store/useAuthStore"
import { useThemeStore } from "../store/useThemeStore"
import { signOut } from "firebase/auth"
import { auth } from "../lib/firebase"
import { toast } from "react-hot-toast"

export default function Navbar() {
  const location = useLocation()
  const navigate = useNavigate()
  const { currentUser, userProfile, logout } = useAuthStore()
  const { theme, toggleTheme } = useThemeStore()

  const isVendor = userProfile?.role === "vendor" || userProfile?.role === "admin"

  // 5 main tabs for mobile / regular navigation
  const navItems = [
    { path: "/home", label: "Home", icon: Home },
    { path: "/refill", label: "Refill", icon: Droplet },
    { path: "/wallet", label: "Wallet", icon: Wallet },
    { path: "/history", label: "History", icon: HistoryIcon },
    { path: "/profile", label: "Profile", icon: User },
  ]

  const handleSignOut = async () => {
    try {
      await signOut(auth)
      logout()
      toast.success("Signed out successfully.")
      navigate("/login")
    } catch (err: any) {
      toast.error("Sign out failed: " + err.message)
    }
  }

  const initials = userProfile?.name
    ? userProfile.name.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2)
    : "Savior"

  return (
    <>
      {/* Desktop Left Sidebar */}
      <aside className="hidden md:flex flex-col fixed left-0 top-0 bottom-0 w-64 bg-slate-950 border-r border-white/5 p-6 z-40 justify-between">
        <div className="space-y-8">
          {/* Logo */}
          <Link to="/home" className="flex items-center space-x-2">
            <div className="bg-teal-500/20 p-2 rounded-lg border border-teal-500/30">
              <Droplet className="h-6 w-6 text-teal-400 animate-pulse" />
            </div>
            <span className="text-xl font-bold tracking-wider bg-clip-text text-transparent bg-gradient-to-r from-teal-400 to-cyan-400">
              RefillX
            </span>
          </Link>

          {/* Navigation Links */}
          <div className="space-y-1">
            <span className="text-[10px] font-bold text-slate-550 uppercase tracking-widest block px-3 mb-2">Navigation</span>
            {navItems.map((item) => {
              const Icon = item.icon
              const isActive = location.pathname === item.path
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center space-x-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                    isActive
                      ? "text-teal-400 bg-teal-500/10 border border-teal-500/20"
                      : "text-slate-400 hover:text-white hover:bg-white/5 border border-transparent"
                  }`}
                >
                  <Icon className="h-4.5 w-4.5" />
                  <span>{item.label}</span>
                </Link>
              )
            })}

            {/* Extra Developer / Vendor links */}
            {(isVendor || userProfile?.role === "admin") && (
              <>
                <span className="text-[10px] font-bold text-slate-555 uppercase tracking-widest block px-3 pt-6 mb-2">Vendor Console</span>
                <Link
                  to="/vendor/dashboard"
                  className={`flex items-center space-x-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                    location.pathname.startsWith("/vendor")
                      ? "text-amber-400 bg-amber-500/10 border border-amber-500/20"
                      : "text-slate-400 hover:text-white hover:bg-white/5 border border-transparent"
                  }`}
                >
                  <ShieldAlert className="h-4.5 w-4.5" />
                  <span>Dashboard</span>
                </Link>
              </>
            )}

            <span className="text-[10px] font-bold text-slate-555 uppercase tracking-widest block px-3 pt-6 mb-2">Developer</span>
            <Link
              to="/simulation"
              className={`flex items-center space-x-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                location.pathname === "/simulation"
                  ? "text-cyan-400 bg-cyan-500/10 border border-cyan-500/20"
                  : "text-slate-400 hover:text-white hover:bg-white/5 border border-transparent"
              }`}
            >
              <Cpu className="h-4.5 w-4.5" />
              <span>Edge Simulator</span>
            </Link>
            <Link
              to="/vending"
              className={`flex items-center space-x-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                location.pathname === "/vending"
                  ? "text-emerald-400 bg-emerald-500/10 border border-emerald-500/20"
                  : "text-slate-400 hover:text-white hover:bg-white/5 border border-transparent"
              }`}
            >
              <ConciergeBell className="h-4.5 w-4.5" />
              <span>Vending Machine</span>
            </Link>
          </div>
        </div>

        {/* Footer info & theme toggle */}
        <div className="space-y-4 pt-4 border-t border-white/5">
          <div className="flex items-center justify-between px-3">
            <span className="text-xs text-slate-450">Theme Mode</span>
            <button
              onClick={toggleTheme}
              className="p-1.5 border border-white/5 bg-slate-900 hover:bg-slate-800 rounded-lg transition-all"
            >
              {theme === "dark" ? <Sun className="h-4 w-4 text-yellow-400" /> : <Moon className="h-4 w-4 text-blue-400" />}
            </button>
          </div>

          {currentUser && (
            <div className="flex items-center justify-between p-2 bg-slate-900/60 border border-white/5 rounded-2xl">
              <div className="flex items-center space-x-2.5">
                <div className="h-9 w-9 bg-gradient-to-tr from-teal-400 to-blue-500 rounded-xl flex items-center justify-center font-bold text-slate-950 text-xs">
                  {initials}
                </div>
                <div className="truncate max-w-[110px]">
                  <span className="text-xs font-bold text-white block truncate">{userProfile?.name || "User"}</span>
                  <span className="text-[9px] text-slate-500 uppercase font-semibold">{userProfile?.tier || "Occasional"}</span>
                </div>
              </div>
              <button
                onClick={handleSignOut}
                className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
                title="Logout"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Mobile Top Header (Just Brand logo & small theme toggler) */}
      <header className="md:hidden flex items-center justify-between px-4 py-3 bg-slate-950/80 backdrop-blur-md border-b border-white/5 sticky top-0 z-40">
        <Link to="/home" className="flex items-center space-x-1.5">
          <Droplet className="h-5 w-5 text-teal-400 animate-pulse" />
          <span className="text-md font-bold tracking-wider bg-clip-text text-transparent bg-gradient-to-r from-teal-400 to-cyan-400">
            RefillX
          </span>
        </Link>
        <div className="flex items-center space-x-2">
          {isVendor && (
            <Link to="/vendor/dashboard" className="p-1.5 text-slate-400 hover:text-white">
              <ShieldAlert className="h-4.5 w-4.5" />
            </Link>
          )}
          <Link to="/simulation" className="p-1.5 text-slate-400 hover:text-white">
            <Cpu className="h-4.5 w-4.5" />
          </Link>
          <button
            onClick={toggleTheme}
            className="p-1.5 border border-white/5 bg-slate-900 rounded-lg"
          >
            {theme === "dark" ? <Sun className="h-4 w-4 text-yellow-400" /> : <Moon className="h-4 w-4 text-blue-400" />}
          </button>
        </div>
      </header>

      {/* Mobile Bottom Tabbar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-slate-950/90 backdrop-blur-md border-t border-white/5 shadow-2xl py-2.5 px-4 flex justify-around">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = location.pathname === item.path
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex flex-col items-center justify-center space-y-1 py-1 px-3 transition-all ${
                isActive ? "text-teal-450 scale-105" : "text-slate-450"
              }`}
            >
              <Icon className="h-5.5 w-5.5" />
              <span className="text-[9px] font-bold tracking-wider">{item.label}</span>
            </Link>
          )
        })}
      </nav>
    </>
  )
}
