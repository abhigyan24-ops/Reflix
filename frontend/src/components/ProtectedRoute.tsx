import React from "react"
import { Navigate, Outlet } from "react-router-dom"
import { useAuthStore } from "../store/useAuthStore"
import { Loader } from "lucide-react"

interface ProtectedRouteProps {
  children?: React.ReactNode
}

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { currentUser, isLoading } = useAuthStore()

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center space-y-3">
          <Loader className="h-8 w-8 text-blue-500 animate-spin mx-auto" />
          <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Securing Connection...</p>
        </div>
      </div>
    )
  }

  if (!currentUser) {
    return <Navigate to="/login" replace />
  }

  return children ? <>{children}</> : <Outlet />
}
