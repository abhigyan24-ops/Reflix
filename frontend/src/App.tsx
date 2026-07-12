import { useEffect, useState, lazy, Suspense } from "react"
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom"
import { onAuthStateChanged } from "firebase/auth"
import { doc, getDoc } from "firebase/firestore"
import { auth, db } from "./lib/firebase"
import { useAuthStore } from "./store/useAuthStore"
import ProtectedRoute from "./components/ProtectedRoute"

const Login = lazy(() => import("./pages/Login"))
const Home = lazy(() => import("./pages/Home"))
const Refill = lazy(() => import("./pages/Refill"))
const Wallet = lazy(() => import("./pages/Wallet"))
const History = lazy(() => import("./pages/History"))
const Profile = lazy(() => import("./pages/Profile"))
const Vendor = lazy(() => import("./pages/Vendor"))
const VendorDashboard = lazy(() => import("./pages/VendorDashboard"))
const Simulation = lazy(() => import("./pages/Simulation"))
const VendingMachine = lazy(() => import("./pages/VendingMachine"))

const SuspenseLoader = () => (
  <div className="min-h-screen bg-slate-950 flex items-center justify-center">
    <div className="text-center space-y-3">
      <div className="h-8 w-8 border-2 border-blue-500/20 border-t-blue-500 rounded-full animate-spin mx-auto" />
      <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Loading Page Modules...</p>
    </div>
  </div>
)

function App() {
  const { setUser, setUserProfile } = useAuthStore()
  const [isOnline, setIsOnline] = useState(navigator.onLine)

  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)
    window.addEventListener("online", handleOnline)
    window.addEventListener("offline", handleOffline)
    return () => {
      window.removeEventListener("online", handleOnline)
      window.removeEventListener("offline", handleOffline)
    }
  }, [])

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setUser(user)
        try {
          const userDoc = await getDoc(doc(db, "users", user.uid))
          if (userDoc.exists()) {
            setUserProfile(userDoc.data() as any)
          }
        } catch (error) {
          console.error("Error fetching user profile:", error)
        }
      } else {
        setUser(null)
        setUserProfile(null)
      }
    })

    return () => unsubscribe()
  }, [setUser, setUserProfile])

  return (
    <Router>
      {!isOnline && (
        <div className="bg-red-650 text-white text-[11px] font-bold text-center py-2 px-4 sticky top-0 z-50 flex items-center justify-center space-x-2 border-b border-red-500/25 shadow-lg">
          <div className="h-2 w-2 rounded-full bg-white animate-ping" />
          <span>Offline mode enabled. Local sync active via IndexedDB cache.</span>
        </div>
      )}
      <Suspense fallback={<SuspenseLoader />}>
        <Routes>
          <Route path="/login" element={<Login />} />
          
          {/* Protected Routes */}
          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<Navigate to="/home" replace />} />
            <Route path="/home" element={<Home />} />
            <Route path="/refill" element={<Refill />} />
            <Route path="/wallet" element={<Wallet />} />
            <Route path="/history" element={<History />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/vendor/dashboard" element={<VendorDashboard />} />
            <Route path="/simulation" element={<Simulation />} />
            <Route path="/vending" element={<VendingMachine />} />
          </Route>

          {/* Public Vendor entry path */}
          <Route path="/vendor" element={<Vendor />} />
          
          <Route path="*" element={<Navigate to="/home" replace />} />
        </Routes>
      </Suspense>
    </Router>
  )
}

export default App
