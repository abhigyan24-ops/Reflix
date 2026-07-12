import { useState, useEffect } from "react"
import { Link } from "react-router-dom"
import Navbar from "../components/Navbar"
import { useAuthStore } from "../store/useAuthStore"
import { db } from "../lib/firebase"
import { collection, query, onSnapshot } from "firebase/firestore"
import { Wallet, Leaf, Award, MapPin, Compass, ChevronRight, Sparkles, TrendingUp, Bell, Wifi, WifiOff, Camera, Zap, Trophy, Star, Gift, CheckCircle2, AlertCircle } from "lucide-react"
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from "recharts"
import { motion, AnimatePresence } from "framer-motion"

interface Dispenser {
  id: string
  name: string
  location: string
  productType: string
  stockLevel: number
  status: string
  latitude?: number
  longitude?: number
  distance?: number
}

interface Forecast {
  id: string
  predictedDemand: number[]
  nextRefillAt?: string
}

export default function Home() {
  const { userProfile } = useAuthStore()
  const [dispensers, setDispensers] = useState<Dispenser[]>([])
  const [forecasts, setForecasts] = useState<Forecast[]>([])
  const [userCoords, setUserCoords] = useState<{ lat: number; lon: number } | null>(null)
  
  // Offline mode state
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine)
  
  // Notifications state
  const [notifications, setNotifications] = useState([
    { id: 1, type: "low_stock", title: "Low Stock Alert", message: "Water tank at station S-42 is running low", timestamp: new Date(Date.now() - 5 * 60000), read: false },
    { id: 2, type: "points_expiry", title: "Points Expiring Soon", message: "Your 50 eco points expire in 7 days", timestamp: new Date(Date.now() - 2 * 3600000), read: false },
    { id: 3, type: "new_station", title: "New Station Nearby", message: "A new refill station opened 2km away", timestamp: new Date(Date.now() - 24 * 3600000), read: true },
  ])
  const [showNotifications, setShowNotifications] = useState(false)
  
  // Gamification state
  const [badges, setBadges] = useState([
    { id: "first_refill", name: "First Refill", icon: "🎯", unlocked: true, unlockedAt: new Date(Date.now() - 30 * 24 * 3600000) },
    { id: "10_refill_streak", name: "10-Refill Streak", icon: "🔥", unlocked: true, unlockedAt: new Date(Date.now() - 7 * 24 * 3600000) },
    { id: "1l_plastic_saved", name: "1L Plastic Saved", icon: "♻️", unlocked: true, unlockedAt: new Date(Date.now() - 2 * 24 * 3600000) },
    { id: "eco_champion", name: "Eco Champion", icon: "👑", unlocked: false, unlockedAt: null },
  ])
  const [newBadges, setNewBadges] = useState<string[]>([])
  
  // Scanner state
  const [showScanner, setShowScanner] = useState(false)
  const [scannedProduct, setScannedProduct] = useState<{ barcode: string; product: string } | null>(null)

  // Monitor online status
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

  // 1. Time-based Greeting
  const hour = new Date().getHours()
  let greeting = "Good evening"
  if (hour < 12) greeting = "Good morning"
  else if (hour < 17) greeting = "Good afternoon"

  // 2. Browser Geolocation
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserCoords({
            lat: position.coords.latitude,
            lon: position.coords.longitude,
          })
        },
        (error) => {
          console.warn("Geolocation permission denied or unavailable:", error.message)
          // Default to Bangalore Tech Park coordinates as fallback
          setUserCoords({ lat: 12.9250, lon: 77.6200 })
        }
      )
    }
  }, [])

  // 3. Real-Time Dispensers Subscription
  useEffect(() => {
    const q = query(collection(db, "dispensers"))
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: Dispenser[] = []
      snapshot.forEach((docSnap) => {
        const data = docSnap.data()
        list.push({
          id: docSnap.id,
          name: data.name || `Refill Hub ${docSnap.id}`,
          location: data.location || "Unknown Location",
          productType: data.productType || "Drinking Water",
          stockLevel: data.stockLevel || 0,
          status: data.status || "Active",
          latitude: data.latitude,
          longitude: data.longitude,
        })
      })
      setDispensers(list)
    })
    return () => unsubscribe()
  }, [])

  // 4. Real-Time Forecasts Subscription
  useEffect(() => {
    const q = query(collection(db, "forecasts"))
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: Forecast[] = []
      snapshot.forEach((docSnap) => {
        const data = docSnap.data()
        list.push({
          id: docSnap.id,
          predictedDemand: data.predictedDemand || [],
          nextRefillAt: data.nextRefillAt,
        })
      })
      setForecasts(list)
    })
    return () => unsubscribe()
  }, [])

  // Mock Bottle Cap Scanner
  const handleScanBottle = () => {
    const products = [
      { barcode: "8901575107139", product: "Purified Drinking Water" },
      { barcode: "8901575107146", product: "Mineral Water" },
      { barcode: "8901575107153", product: "Alkaline Water" },
      { barcode: "8901575107160", product: "Distilled Water" },
    ]
    const randomProduct = products[Math.floor(Math.random() * products.length)]
    setScannedProduct(randomProduct)
    setTimeout(() => {
      setShowScanner(false)
      setScannedProduct(null)
    }, 3000)
  }

  // 5. Haversine Distance Calculation & Sorting
  const getDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371 // Earth radius in km
    const dLat = ((lat2 - lat1) * Math.PI) / 180
    const dLon = ((lon2 - lon1) * Math.PI) / 180
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    return R * c
  }

  const processedDispensers = dispensers
    .map((disp) => {
      if (userCoords && disp.latitude && disp.longitude) {
        const dist = getDistance(userCoords.lat, userCoords.lon, disp.latitude, disp.longitude)
        return { ...disp, distance: Number(dist.toFixed(2)) }
      }
      return disp
    })
    .sort((a, b) => (a.distance ?? 9999) - (b.distance ?? 9999))

  const nearestDispenser = processedDispensers[0] || null

  // 6. Eco point progression (Tier standings)
  const userPoints = userProfile?.ecoPoints || 0
  let nextTier = "Regular"
  let pointsNeeded = 100
  let prevTierPoints = 0
  if (userPoints >= 1000) {
    nextTier = "Max"
    pointsNeeded = 1000
    prevTierPoints = 1000
  } else if (userPoints >= 500) {
    nextTier = "Champion"
    pointsNeeded = 1000
    prevTierPoints = 500
  } else if (userPoints >= 100) {
    nextTier = "Eco-Hero"
    pointsNeeded = 500
    prevTierPoints = 100
  }

  const tierProgressPercent = nextTier === "Max"
    ? 100
    : Math.min(100, Math.max(0, ((userPoints - prevTierPoints) / (pointsNeeded - prevTierPoints)) * 100))

  // SVG Circular Ring Metrics
  const radius = 32
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = circumference - (tierProgressPercent / 100) * circumference

  // 7. Mock Eco Point growth chart based on actual user points
  const chartData = [
    { day: "Mon", points: Math.round(userPoints * 0.4) },
    { day: "Tue", points: Math.round(userPoints * 0.5) },
    { day: "Wed", points: Math.round(userPoints * 0.6) },
    { day: "Thu", points: Math.round(userPoints * 0.7) },
    { day: "Fri", points: Math.round(userPoints * 0.8) },
    { day: "Sat", points: Math.round(userPoints * 0.9) },
    { day: "Sun", points: userPoints },
  ]

  // Gamification: XP Level and Progress
  const totalXP = userPoints
  const xpPerLevel = 50
  const currentLevel = Math.floor(totalXP / xpPerLevel) + 1
  const currentLevelXP = totalXP % xpPerLevel
  const xpProgress = (currentLevelXP / xpPerLevel) * 100

  // AI Prediction: Days until runout
  const predictedDaysUntilRunout = Math.max(1, Math.ceil((userProfile?.walletBalance || 100) / 25)) || 4

  // Peak time check for recommendation card
  const activeForecast = nearestDispenser ? forecasts.find((f) => f.id === nearestDispenser.id) : null
  const peakPredictionValue = activeForecast?.predictedDemand ? Math.max(...activeForecast.predictedDemand) : 0
  const peakHourIndex = activeForecast?.predictedDemand ? activeForecast.predictedDemand.indexOf(peakPredictionValue) : -1
  const peakTimeText = peakHourIndex !== -1 ? `${10 + peakHourIndex}:00 hrs` : "Afternoon"

  return (
    <div className="min-h-screen bg-slate-950 text-white md:pl-64">
      <Navbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 pb-24">
        
        {/* Offline Mode Banner */}
        <AnimatePresence>
          {!isOnline && (
            <motion.div
              initial={{ y: -20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -20, opacity: 0 }}
              className="bg-amber-500/10 border border-amber-500/30 p-3 rounded-xl flex items-center space-x-3"
            >
              <WifiOff className="h-5 w-5 text-amber-400 flex-shrink-0 animate-pulse" />
              <div className="flex-1">
                <p className="text-sm font-bold text-amber-300">Offline Mode Active</p>
                <p className="text-xs text-amber-200">Showing cached data • Changes will sync when online</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Welcome Section with Notifications & Scanner */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white via-slate-200 to-slate-400">
              {greeting}, {userProfile?.name || "Savior"}
            </h1>
            <p className="text-slate-400 text-sm mt-1">Ready to refill and save single-use plastics today?</p>
          </div>
          <div className="flex items-center gap-3">
            {/* Notifications Bell */}
            <div className="relative">
              <button
                onClick={() => setShowNotifications(!showNotifications)}
                className="relative p-3 bg-slate-900/50 hover:bg-slate-900 rounded-xl border border-white/10 transition-all"
              >
                <Bell className="h-5 w-5 text-slate-400 hover:text-white" />
                {notifications.some((n) => !n.read) && (
                  <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
                )}
              </button>

              {/* Notifications Popup */}
              <AnimatePresence>
                {showNotifications && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    className="absolute right-0 mt-2 w-80 glass-card p-4 rounded-2xl border border-white/5 shadow-2xl z-50 space-y-3"
                  >
                    <h3 className="font-bold text-sm mb-3 flex items-center space-x-2">
                      <Bell className="h-4 w-4 text-blue-400" />
                      <span>Notifications</span>
                    </h3>
                    <div className="space-y-2 max-h-[300px] overflow-y-auto">
                      {notifications.length === 0 ? (
                        <p className="text-xs text-slate-500 text-center py-4">No notifications</p>
                      ) : (
                        notifications.map((notif) => (
                          <div
                            key={notif.id}
                            className={`p-2.5 rounded-lg border transition-all ${
                              notif.read
                                ? "bg-slate-900/20 border-slate-800"
                                : "bg-blue-500/10 border-blue-500/30"
                            }`}
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <p className={`text-xs font-bold ${notif.read ? "text-slate-400" : "text-blue-300"}`}>
                                  {notif.title}
                                </p>
                                <p className="text-[11px] text-slate-400 mt-0.5">{notif.message}</p>
                              </div>
                              {!notif.read && <span className="w-2 h-2 bg-blue-400 rounded-full flex-shrink-0 mt-1 ml-2"></span>}
                            </div>
                            <p className="text-[9px] text-slate-500 mt-1">
                              {Math.floor((Date.now() - notif.timestamp.getTime()) / 60000)} mins ago
                            </p>
                          </div>
                        ))
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Bottle Cap Scanner Button */}
            <button
              onClick={() => setShowScanner(true)}
              className="p-3 bg-slate-900/50 hover:bg-slate-900 rounded-xl border border-white/10 transition-all"
              title="Scan bottle barcode"
            >
              <Camera className="h-5 w-5 text-slate-400 hover:text-white" />
            </button>

            {/* Primary CTA */}
            <Link
              to="/refill"
              className="inline-flex items-center justify-center px-6 py-3 bg-teal-500 hover:bg-teal-600 text-slate-950 font-extrabold rounded-xl transition-all shadow-lg shadow-teal-500/20 active:scale-95 text-center text-sm"
            >
              <span>Scan QR / Refill Now</span>
              <Compass className="ml-2 h-5 w-5 animate-spin-slow" />
            </Link>
          </div>
        </div>

        {/* Bottle Cap Scanner Modal */}
        <AnimatePresence>
          {showScanner && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowScanner(false)}
              className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                onClick={(e) => e.stopPropagation()}
                className="glass-card p-6 rounded-2xl border border-white/5 max-w-md w-full space-y-4"
              >
                <h3 className="text-lg font-bold flex items-center space-x-2">
                  <Camera className="h-5 w-5 text-blue-400" />
                  <span>Bottle Cap Scanner</span>
                </h3>

                {!scannedProduct ? (
                  <>
                    <div className="relative w-full aspect-square bg-slate-900 rounded-xl border-2 border-dashed border-blue-500/30 flex items-center justify-center overflow-hidden">
                      {/* Fake camera viewfinder */}
                      <div className="absolute inset-0 bg-gradient-to-b from-blue-500/10 to-transparent opacity-50"></div>
                      <div className="relative z-10 flex flex-col items-center justify-center space-y-3">
                        <motion.div
                          animate={{ scaleY: [1, 1.2, 1] }}
                          transition={{ repeat: Infinity, duration: 1.5 }}
                          className="w-24 h-1 bg-blue-500 rounded"
                        />
                        <p className="text-xs text-slate-400 text-center">Point at bottle barcode</p>
                        <p className="text-[10px] text-slate-500">OR tap to demo scan</p>
                      </div>
                    </div>
                    <button
                      onClick={handleScanBottle}
                      className="w-full py-2 bg-blue-500 hover:bg-blue-600 rounded-lg text-sm font-bold text-white transition-all"
                    >
                      Simulate Scan
                    </button>
                  </>
                ) : (
                  <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="space-y-3 py-4"
                  >
                    <div className="bg-emerald-500/10 p-4 rounded-lg border border-emerald-500/20 text-center space-y-2">
                      <CheckCircle2 className="h-8 w-8 text-emerald-400 mx-auto animate-bounce" />
                      <p className="text-sm font-bold text-emerald-300">Scan Successful!</p>
                      <p className="text-xs text-slate-400">{scannedProduct.barcode}</p>
                    </div>
                    <div className="bg-slate-900/40 p-3 rounded-lg border border-white/5">
                      <p className="text-xs text-slate-500 uppercase font-bold tracking-wider mb-1">Product Type</p>
                      <p className="text-sm font-bold text-white">{scannedProduct.product}</p>
                    </div>
                  </motion.div>
                )}

                <button
                  onClick={() => {
                    setShowScanner(false)
                    setScannedProduct(null)
                  }}
                  className="w-full py-2 bg-slate-900 hover:bg-slate-800 border border-white/10 rounded-lg text-sm font-bold text-slate-400 transition-all"
                >
                  {scannedProduct ? "Close" : "Cancel"}
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Card 1: Wallet */}
          <div className="glass-card p-6 rounded-2xl border border-white/5 relative overflow-hidden group hover:border-teal-500/30 transition-all duration-300">
            <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity">
              <Wallet className="h-24 w-24 text-teal-400" />
            </div>
            <div className="flex justify-between items-start mb-4">
              <span className="text-slate-400 text-xs font-bold tracking-wider uppercase">Wallet Balance</span>
              <div className="bg-teal-500/10 p-2 rounded-lg border border-teal-500/20">
                <Wallet className="h-5 w-5 text-teal-450" />
              </div>
            </div>
            <h2 className="text-4xl font-extrabold tracking-tight text-white">
              ₹{(userProfile?.walletBalance || 0).toFixed(2)}
            </h2>
            <Link to="/wallet" className="inline-flex items-center text-xs text-teal-400 mt-4 hover:underline">
              <span>Top up wallet</span>
              <ChevronRight className="h-3 w-3 ml-1" />
            </Link>
          </div>

          {/* Card 2: Eco Points Circular Ring */}
          <div className="glass-card p-6 rounded-2xl border border-white/5 relative overflow-hidden group hover:border-emerald-500/30 transition-all duration-300 flex items-center justify-between">
            <div className="space-y-4">
              <div className="flex items-center space-x-2">
                <Leaf className="h-4 w-4 text-emerald-400" />
                <span className="text-slate-400 text-xs font-bold tracking-wider uppercase">Eco Impact Points</span>
              </div>
              <div>
                <h2 className="text-4xl font-extrabold tracking-tight text-emerald-400">{userPoints}</h2>
                <p className="text-[10px] text-slate-500 mt-1 uppercase font-semibold">
                  {(userPoints * 0.01).toFixed(2)} kg CO2 avoided
                </p>
              </div>
            </div>

            {/* Circular Ring SVG */}
            <div className="relative h-20 w-20 flex items-center justify-center shrink-0">
              <svg className="h-20 w-20 transform -rotate-90">
                <circle
                  cx="40"
                  cy="40"
                  r={radius}
                  stroke="rgba(255,255,255,0.05)"
                  strokeWidth="6"
                  fill="transparent"
                />
                <circle
                  cx="40"
                  cy="40"
                  r={radius}
                  stroke="rgb(16, 185, 129)"
                  strokeWidth="6"
                  fill="transparent"
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeDashoffset}
                  strokeLinecap="round"
                  className="transition-all duration-700"
                />
              </svg>
              <div className="absolute flex flex-col items-center justify-center text-center">
                <span className="text-[10px] font-extrabold text-white">{tierProgressPercent.toFixed(0)}%</span>
                <span className="text-[8px] text-slate-500 font-bold uppercase">{nextTier === "Max" ? "Max" : "Next"}</span>
              </div>
            </div>
          </div>

          {/* Card 3: Gamification - Eco Passport */}
          <motion.div 
            className="glass-card p-6 rounded-2xl border border-white/5 relative overflow-hidden group hover:border-purple-500/30 transition-all duration-300"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity">
              <Trophy className="h-24 w-24 text-purple-400" />
            </div>
            <div className="flex justify-between items-start mb-4">
              <div>
                <span className="text-slate-400 text-xs font-bold tracking-wider uppercase block">Eco Passport</span>
                <span className="text-slate-500 text-[10px] font-semibold mt-0.5">{userProfile?.tier || "Occasional"}</span>
              </div>
              <div className="bg-purple-500/10 p-2 rounded-lg border border-purple-500/20">
                <Trophy className="h-5 w-5 text-purple-400" />
              </div>
            </div>
            
            {/* XP Bar */}
            <div className="mb-4">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-bold">Level {currentLevel}</span>
                <span className="text-[10px] text-slate-400">{currentLevelXP}/{xpPerLevel} XP</span>
              </div>
              <div className="w-full bg-slate-900 rounded-full h-2 overflow-hidden border border-slate-800">
                <motion.div
                  className="h-full bg-gradient-to-r from-purple-500 to-pink-500"
                  initial={{ width: 0 }}
                  animate={{ width: `${xpProgress}%` }}
                  transition={{ duration: 0.5 }}
                />
              </div>
            </div>

            {/* Unlocked Badges Preview */}
            <div className="space-y-2">
              <p className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Badges Earned</p>
              <div className="flex gap-2">
                {badges.filter((b) => b.unlocked).map((badge) => (
                  <motion.div
                    key={badge.id}
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="w-8 h-8 bg-gradient-to-br from-amber-500/20 to-amber-500/5 rounded-lg border border-amber-500/30 flex items-center justify-center text-lg"
                    title={badge.name}
                  >
                    {badge.icon}
                  </motion.div>
                ))}
                {badges.filter((b) => !b.unlocked).length > 0 && (
                  <div className="w-8 h-8 bg-slate-900/50 rounded-lg border border-slate-700 flex items-center justify-center text-xs text-slate-500">
                    +{badges.filter((b) => !b.unlocked).length}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </div>

        {/* AI Prediction & Gamification Cards Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* AI Prediction Card */}
          <motion.div
            className="glass-card p-6 rounded-2xl border border-white/5 hover:border-cyan-500/30 transition-all duration-300 space-y-4"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
          >
            <div className="flex items-center space-x-3">
              <div className="bg-cyan-500/10 p-2.5 rounded-lg border border-cyan-500/20">
                <Sparkles className="h-5 w-5 text-cyan-400" />
              </div>
              <div>
                <h3 className="text-sm font-bold">Water Runout Prediction</h3>
                <p className="text-xs text-slate-500">Based on your usage pattern</p>
              </div>
            </div>

            <div className="bg-slate-900/40 p-4 rounded-xl border border-cyan-500/20 space-y-3">
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-extrabold text-cyan-400">~{predictedDaysUntilRunout} days</span>
                <span className="text-xs text-slate-400">until refill needed</span>
              </div>
              
              {/* Confidence Bar */}
              <div className="space-y-1">
                <div className="flex justify-between items-center text-[10px]">
                  <span className="text-slate-500">Confidence</span>
                  <span className="text-cyan-400 font-bold">92%</span>
                </div>
                <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                  <div className="h-full w-[92%] bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full"></div>
                </div>
              </div>
            </div>

            <button className="w-full py-2.5 bg-gradient-to-r from-cyan-500/20 to-blue-500/20 hover:from-cyan-500/30 hover:to-blue-500/30 border border-cyan-500/30 rounded-lg text-sm font-bold text-cyan-300 transition-all">
              📅 Pre-book Refill
            </button>
          </motion.div>

          {/* Today's Stats Card */}
          <motion.div
            className="glass-card p-6 rounded-2xl border border-white/5 hover:border-emerald-500/30 transition-all duration-300 space-y-4"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
          >
            <div className="flex items-center space-x-3">
              <div className="bg-emerald-500/10 p-2.5 rounded-lg border border-emerald-500/20">
                <Zap className="h-5 w-5 text-emerald-400" />
              </div>
              <div>
                <h3 className="text-sm font-bold">Today's Impact</h3>
                <p className="text-xs text-slate-500">Your eco contributions</p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="bg-slate-900/40 p-3 rounded-lg border border-emerald-500/20 text-center">
                <p className="text-xs text-slate-500 mb-1">Plastic Saved</p>
                <p className="text-lg font-extrabold text-emerald-400">2.5L</p>
              </div>
              <div className="bg-slate-900/40 p-3 rounded-lg border border-amber-500/20 text-center">
                <p className="text-xs text-slate-500 mb-1">CO₂ Avoided</p>
                <p className="text-lg font-extrabold text-amber-400">125g</p>
              </div>
              <div className="bg-slate-900/40 p-3 rounded-lg border border-blue-500/20 text-center">
                <p className="text-xs text-slate-500 mb-1">Points Earned</p>
                <p className="text-lg font-extrabold text-blue-400">15</p>
              </div>
            </div>
          </motion.div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Eco Saving Analytics (Chart) */}
          <div className="lg:col-span-2 glass-card p-6 rounded-2xl border border-white/5 flex flex-col justify-between">
            <div className="mb-4">
              <h3 className="text-lg font-bold">Eco Points Growth Trend</h3>
              <p className="text-xs text-slate-400">Weekly accumulated eco points saving milestones</p>
            </div>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="colorPoints" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="day" stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{
                      background: "#0f172a",
                      border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: "8px",
                    }}
                    labelStyle={{ fontWeight: "bold", color: "#94a3b8" }}
                  />
                  <Area
                    type="monotone"
                    dataKey="points"
                    stroke="#10b981"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorPoints)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Active / Geolocation Dispensers */}
          <div className="glass-card p-6 rounded-2xl border border-white/5 flex flex-col justify-between space-y-4">
            <div>
              <h3 className="text-lg font-bold">Nearby Active Dispensers</h3>
              <p className="text-xs text-slate-400">Sorted by geolocation distance (Haversine)</p>
            </div>
            <div className="space-y-3 flex-1 overflow-y-auto max-h-[300px]">
              {processedDispensers.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-500">Scanning for dispensers...</div>
              ) : (
                processedDispensers.map((disp) => (
                  <div
                    key={disp.id}
                    className="p-3 bg-slate-900/40 hover:bg-slate-900/80 rounded-xl border border-white/5 flex items-center justify-between transition-all"
                  >
                    <div className="flex items-center space-x-3">
                      <div className="bg-teal-500/10 p-2 rounded-lg border border-teal-500/20">
                        <MapPin className="h-4 w-4 text-teal-450" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-white leading-tight">{disp.name}</h4>
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          {disp.productType} • Stock: {disp.stockLevel}%
                        </p>
                        {disp.distance !== undefined && (
                          <p className="text-[9px] text-teal-400 font-extrabold mt-0.5">
                            {disp.distance} km away
                          </p>
                        )}
                      </div>
                    </div>
                    <span
                      className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                        disp.status === "Active"
                          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                          : "bg-amber-500/10 text-amber-500 border border-amber-500/20"
                      }`}
                    >
                      {disp.status}
                    </span>
                  </div>
                ))
              )}
            </div>

            {/* AI Recommendation Alert */}
            {nearestDispenser && (
              <div className="p-3 bg-teal-500/5 border border-teal-500/15 rounded-xl space-y-1.5">
                <div className="flex items-center space-x-1.5 text-xs text-teal-350 font-bold">
                  <Sparkles className="h-4 w-4 animate-bounce shrink-0" />
                  <span>AI Refill Recommendation</span>
                </div>
                <p className="text-[10.5px] text-slate-400 leading-relaxed">
                  Your closest dispenser is <strong className="text-white">{nearestDispenser.name}</strong>.
                  {activeForecast && peakHourIndex !== -1 && (
                    <span> Avoid refilling around <strong className="text-teal-400">{peakTimeText}</strong> due to forecasted peak demand.</span>
                  )}
                </p>
                <div className="flex items-center space-x-1 text-[9px] text-teal-500 font-bold uppercase tracking-wider">
                  <TrendingUp className="h-3.5 w-3.5" />
                  <span>ARIMA Model Analysis</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
