import React, { useState } from "react"
import { useNavigate } from "react-router-dom"
import Navbar from "../components/Navbar"
import { ShieldCheck, Lock, User, AlertCircle } from "lucide-react"

export default function Vendor() {
  const navigate = useNavigate()
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    if (username === "admin" && password === "admin123") {
      setLoading(true)
      setTimeout(() => {
        setLoading(false)
        navigate("/vendor/dashboard")
      }, 1000)
    } else {
      setError("Invalid vendor username or password. Try 'admin' / 'admin123'.")
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <Navbar />

      <main className="max-w-md mx-auto px-4 py-16 space-y-8">
        <div className="text-center space-y-2">
          <div className="inline-flex bg-cyan-500/10 p-3 rounded-full border border-cyan-500/20 text-cyan-400 mb-2">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 to-blue-400">
            Vendor Portal
          </h1>
          <p className="text-slate-400 text-xs">Access RefillX dispenser telemetry and analytics dashboard</p>
        </div>

        <div className="glass-card p-6 rounded-2xl border border-white/5 space-y-4">
          {error && (
            <div className="p-3 bg-red-500/15 border border-red-500/35 text-red-400 rounded-xl text-xs flex items-center space-x-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-350 uppercase tracking-wider mb-2">
                Vendor Username
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-405">
                  <User className="h-4 w-4" />
                </span>
                <input
                  type="text"
                  placeholder="e.g. admin"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full bg-slate-900/60 border border-slate-700/50 rounded-xl py-2.5 pl-9 pr-4 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 transition-all text-sm"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-350 uppercase tracking-wider mb-2">
                Access Password
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-405">
                  <Lock className="h-4 w-4" />
                </span>
                <input
                  type="password"
                  placeholder="e.g. admin123"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-slate-900/60 border border-slate-700/50 rounded-xl py-2.5 pl-9 pr-4 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 transition-all text-sm"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white font-semibold rounded-xl transition-all shadow-lg shadow-cyan-500/10 flex items-center justify-center space-x-2 active:scale-95"
            >
              <span>{loading ? "Authenticating..." : "Login to Dashboard"}</span>
            </button>
          </form>
        </div>
      </main>
    </div>
  )
}
