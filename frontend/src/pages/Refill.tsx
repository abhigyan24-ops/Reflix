import { useState, useEffect, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { collection, query, onSnapshot, doc } from "firebase/firestore"
import { getFunctions, httpsCallable } from "firebase/functions"
import { db } from "../lib/firebase"
import { useAuthStore } from "../store/useAuthStore"
import Navbar from "../components/Navbar"
import { QRCodeSVG } from "qrcode.react"
import { Sparkles, RefreshCw, CheckCircle2, AlertTriangle, MapPin, Search, Check } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { toast, Toaster } from "react-hot-toast"

interface Dispenser {
  id: string
  name: string
  location: string
  productType: string
  stockLevel: number
  status: "Active" | "Maintenance" | "Offline" | "Dispensing"
  latitude?: number
  longitude?: number
  distance?: number
}

export default function Refill() {
  const navigate = useNavigate()
  const { currentUser, userProfile } = useAuthStore()

  const [dispensers, setDispensers] = useState<Dispenser[]>([])
  const [selectedMachineId, setSelectedMachineId] = useState<string>("")
  const [selectedMachine, setSelectedMachine] = useState<Dispenser | null>(null)
  
  const [searchQuery, setSearchQuery] = useState<string>("")
  const [amount, setAmount] = useState<number>(500) // in ml
  const [isCustomAmount, setIsCustomAmount] = useState<boolean>(false)
  const [customMl, setCustomMl] = useState<string>("750")
  
  const [qrTokenString, setQrTokenString] = useState<string>("")
  const [timeLeft, setTimeLeft] = useState<number>(0)
  const [generating, setGenerating] = useState<boolean>(false)
  
  const [dispensingProgress, setDispensingProgress] = useState<number>(0)
  const [isDispensingMode, setIsDispensingMode] = useState<boolean>(false)
  const [isFinished, setIsFinished] = useState<boolean>(false)
  
  const [userCoords, setUserCoords] = useState<{ lat: number; lon: number } | null>(null)
  
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  
  const dispenserStatusRef = useRef<string>("")

  // Get user coordinates for Haversine sorting
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setUserCoords({ lat: pos.coords.latitude, lon: pos.coords.longitude })
        },
        () => {
          // Fallback coordinate
          setUserCoords({ lat: 12.9250, lon: 77.6200 })
        }
      )
    }
  }, [])

  // 1. Fetch dispensers in real time
  useEffect(() => {
    const q = query(collection(db, "dispensers"))
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list: Dispenser[] = []
        snapshot.forEach((doc) => {
          const data = doc.data()
          list.push({
            id: doc.id,
            name: data.name || `Refill Hub ${doc.id}`,
            location: data.location || "Unknown Location",
            productType: data.productType || "Drinking Water",
            stockLevel: data.stockLevel || 0,
            status: data.status || "Active",
            latitude: data.latitude,
            longitude: data.longitude,
          })
        })
        setDispensers(list)
        if (list.length > 0 && !selectedMachineId) {
          setSelectedMachineId(list[0].id)
        }
      },
      (error) => {
        console.error("Firestore dispensers listen error:", error)
        toast.error("Failed to load dispensers list.")
      }
    )
    return () => unsubscribe()
  }, [selectedMachineId])

  // 2. Real-time subscription to selected dispenser status
  useEffect(() => {
    if (!selectedMachineId) {
      setSelectedMachine(null)
      return
    }
    const docRef = doc(db, "dispensers", selectedMachineId)
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data()
        const currentStatus = data.status || "Active"
        
        setSelectedMachine({
          id: docSnap.id,
          name: data.name || `Refill Hub ${docSnap.id}`,
          location: data.location || "Unknown Location",
          productType: data.productType || "Drinking Water",
          stockLevel: data.stockLevel || 0,
          status: currentStatus,
        })

        // Check if dispenser enters Dispensing state
        if (currentStatus === "Dispensing" && dispenserStatusRef.current !== "Dispensing") {
          setIsDispensingMode(true)
          setDispensingProgress(0)
          
          // Animate dispensing progress client side (takes about 5 seconds)
          if (progressIntervalRef.current) clearInterval(progressIntervalRef.current)
          progressIntervalRef.current = setInterval(() => {
            setDispensingProgress((prev) => {
              if (prev >= 100) {
                if (progressIntervalRef.current) clearInterval(progressIntervalRef.current)
                return 100
              }
              return prev + 10
            })
          }, 500)
        }

        // Check if dispensing completes (goes from Dispensing to Active/Complete)
        if (dispenserStatusRef.current === "Dispensing" && currentStatus === "Active") {
          setIsDispensingMode(false)
          setIsFinished(true)
          setQrTokenString("")
          toast.success("Dispensing complete! Receipt generated.")
        }
        
        dispenserStatusRef.current = currentStatus
      }
    })
    return () => {
      unsubscribe()
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current)
    }
  }, [selectedMachineId])

  // Haversine formula
  const getDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371
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

  // Process, filter and sort dispensers list
  const filteredDispensers = dispensers
    .map((disp) => {
      if (userCoords && disp.latitude && disp.longitude) {
        const dist = getDistance(userCoords.lat, userCoords.lon, disp.latitude, disp.longitude)
        return { ...disp, distance: Number(dist.toFixed(2)) }
      }
      return disp
    })
    .filter((disp) => {
      const matchQuery =
        disp.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        disp.location.toLowerCase().includes(searchQuery.toLowerCase())
      return matchQuery
    })
    .sort((a, b) => (a.distance ?? 9999) - (b.distance ?? 9999))

  // Fetch secure QR Token
  const handleGenerateQR = async () => {
    if (!currentUser) {
      toast.error("Please login first.")
      navigate("/login")
      return
    }
    if (!selectedMachineId) {
      toast.error("Please select a dispenser.")
      return
    }

    const selectedVolume = isCustomAmount ? parseInt(customMl) || 500 : amount
    if (selectedVolume <= 0 || selectedVolume > 10000) {
      toast.error("Invalid volume amount (must be 1ml - 10000ml)")
      return
    }
    
    // ₹30 per Litre = ₹0.03 per ml
    const calculatedCost = (selectedVolume / 1000) * 30
    const balance = userProfile?.walletBalance || 0
    
    if (balance < calculatedCost) {
      toast.error(`Insufficient balance. Cost: ₹${calculatedCost.toFixed(2)} | Wallet: ₹${balance.toFixed(2)}.`)
      return
    }

    setGenerating(true)
    try {
      const functionsInstance = getFunctions()
      const generateQRTokenCall = httpsCallable(functionsInstance, "generateQRToken")
      
      const result: any = await generateQRTokenCall({
        uid: currentUser.uid,
        amount: calculatedCost,
        machineId: selectedMachineId,
      })

      if (result.data?.status === "success") {
        setQrTokenString(result.data.token)
        setTimeLeft(90) // 90s expiring QR countdown

        if (timerRef.current) clearInterval(timerRef.current)
        timerRef.current = setInterval(() => {
          setTimeLeft((prev) => {
            if (prev <= 1) {
              if (timerRef.current) clearInterval(timerRef.current)
              setQrTokenString("")
              toast.error("QR Code expired. Please regenerate.")
              return 0
            }
            return prev - 1
          })
        }, 1000)
        toast.success("Secure QR generated successfully!")
      } else {
        throw new Error(result.data?.message || "Failed to generate token.")
      }
    } catch (error: any) {
      console.error(error)
      toast.error(error.message || "Failed to contact secure QR service.")
    } finally {
      setGenerating(false)
    }
  }

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  // QR Circular progress parameters
  const qrRadius = 20
  const qrCircumference = 2 * Math.PI * qrRadius
  const qrStrokeOffset = qrCircumference - (timeLeft / 90) * qrCircumference

  // Volume presets
  const presets = [
    { value: 250, label: "250 ml", desc: "Small Glass (₹7.50)" },
    { value: 500, label: "500 ml", desc: "Bottle Size (₹15.00)" },
    { value: 1000, label: "1000 ml", desc: "1 Litre Jar (₹30.00)" },
    { value: 2000, label: "2000 ml", desc: "2 Litre Jar (₹60.00)" },
  ]

  const activeAmount = isCustomAmount ? parseInt(customMl) || 0 : amount
  const activeCost = (activeAmount / 1000) * 30

  return (
    <div className="min-h-screen bg-slate-950 text-white md:pl-64">
      <Toaster position="top-right" />
      <Navbar />

      <main className="max-w-md mx-auto px-4 py-8 space-y-8 pb-24">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-teal-400 to-cyan-400">
            Secure Smart Refill
          </h1>
          <p className="text-slate-400 text-xs">Authorize water dispense and scan QR at the edge terminal</p>
        </div>

        <AnimatePresence mode="wait">
          {isDispensingMode ? (
            // Dispensing screen
            <motion.div
              key="dispensing-card"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="glass-card p-8 rounded-3xl border border-teal-500/20 flex flex-col items-center space-y-6 text-center shadow-2xl relative overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-teal-500 to-cyan-500 animate-pulse" />
              
              <h3 className="text-lg font-bold text-teal-400 animate-pulse">Dispensing In Progress</h3>
              <p className="text-xs text-slate-400 max-w-[260px]">
                Solenoid valve is active at <span className="text-white font-semibold">{selectedMachine?.name}</span>. Please hold your bottle.
              </p>

              {/* Simulated Wave Animated Bottle Fill */}
              <div className="relative h-48 w-28 border-4 border-slate-700/60 rounded-3xl overflow-hidden bg-slate-900/50 shadow-inner flex items-end">
                <div 
                  className="w-full bg-gradient-to-t from-teal-500 to-cyan-400 transition-all duration-300 relative"
                  style={{ height: `${dispensingProgress}%` }}
                >
                  {/* Wave effect overlay */}
                  <div className="absolute -top-3 left-0 right-0 h-4 bg-cyan-300/40 rounded-full blur-[2px] animate-bounce" />
                </div>
                <div className="absolute inset-0 flex items-center justify-center font-mono text-xl font-black text-white mix-blend-difference">
                  {dispensingProgress}%
                </div>
              </div>

              <div className="w-full bg-slate-950/60 rounded-2xl p-4 border border-white/5 space-y-1.5 text-xs text-left">
                <div className="flex justify-between">
                  <span className="text-slate-500">Volume Target:</span>
                  <span className="font-bold text-white">{activeAmount} ml</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Dispensed:</span>
                  <span className="font-bold text-teal-400">{Math.round((dispensingProgress / 100) * activeAmount)} ml</span>
                </div>
                <div className="flex justify-between border-t border-white/5 pt-1.5 mt-1.5">
                  <span className="text-slate-500">Status:</span>
                  <span className="font-bold text-cyan-400 animate-pulse">FLOW SENSOR ACTIVE</span>
                </div>
              </div>
            </motion.div>
          ) : isFinished ? (
            // Finished screen
            <motion.div
              key="finished-card"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="glass-card p-8 rounded-3xl border border-emerald-500/20 flex flex-col items-center space-y-6 text-center shadow-2xl relative overflow-hidden"
            >
              <div className="h-16 w-16 bg-emerald-500/10 border border-emerald-500/30 rounded-full flex items-center justify-center text-emerald-450 shadow-lg">
                <Check className="h-8 w-8 stroke-[3]" />
              </div>

              <div className="space-y-1.5">
                <h3 className="text-lg font-bold text-emerald-400">Refill Completed!</h3>
                <p className="text-xs text-slate-400">
                  Thank you for saving plastic bottles and avoiding carbon footprints.
                </p>
              </div>

              <div className="w-full bg-slate-900/40 rounded-2xl p-4 border border-white/5 space-y-2 text-xs text-left">
                <div className="flex justify-between">
                  <span className="text-slate-500">Machine Name:</span>
                  <span className="font-bold text-white">{selectedMachine?.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Volume Dispensed:</span>
                  <span className="font-bold text-white">{activeAmount} ml</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Cost Deducted:</span>
                  <span className="font-extrabold text-teal-400">₹{activeCost.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Eco Points Earned:</span>
                  <span className="font-bold text-emerald-400">+{Math.floor(activeAmount / 100)} pts</span>
                </div>
              </div>

              <button
                onClick={() => {
                  setIsFinished(false)
                  setSearchQuery("")
                }}
                className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-black rounded-xl text-sm transition-all shadow-lg active:scale-95"
              >
                Start New Session
              </button>
            </motion.div>
          ) : !qrTokenString ? (
            // Preset / Volume selector setup screen
            <motion.div
              key="setup-form"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              {/* Select Dispenser & search bar */}
              <div className="glass-card p-6 rounded-2xl border border-white/5 space-y-4 shadow-xl">
                <div className="flex justify-between items-center">
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider">Select Dispenser Station</label>
                  {userCoords && <span className="text-[9.5px] text-teal-400 font-bold">GPS ACTIVE</span>}
                </div>
                
                {/* Search Bar */}
                <div className="relative">
                  <Search className="h-4 w-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Search by station name or location..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 pl-9 pr-4 text-xs text-white focus:outline-none focus:ring-1 focus:ring-teal-500"
                  />
                </div>

                <div className="space-y-2 max-h-[190px] overflow-y-auto pr-1">
                  {filteredDispensers.length === 0 ? (
                    <div className="p-4 text-center text-xs text-slate-500">No dispenser stations found matching search query.</div>
                  ) : (
                    filteredDispensers.map((disp) => (
                      <div
                        key={disp.id}
                        onClick={() => setSelectedMachineId(disp.id)}
                        className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                          selectedMachineId === disp.id
                            ? "bg-teal-500/10 border-teal-500/40"
                            : "bg-slate-900/40 border-white/5 hover:border-slate-850"
                        }`}
                      >
                        <div className="flex items-center space-x-3 min-w-0">
                          <MapPin className="h-4 w-4 text-teal-450 shrink-0" />
                          <div className="min-w-0">
                            <h4 className="text-xs font-bold text-white leading-tight truncate">{disp.name}</h4>
                            <p className="text-[9px] text-slate-450 mt-0.5 truncate">{disp.productType} • Stock: {disp.stockLevel}%</p>
                            {disp.distance !== undefined && (
                              <p className="text-[9px] text-teal-400 font-bold mt-0.5">{disp.distance} km away</p>
                            )}
                          </div>
                        </div>
                        <span className={`text-[8.5px] font-bold px-2 py-0.5 rounded-full uppercase shrink-0 ${
                          disp.status === "Active" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-red-500/10 text-red-400 border border-red-500/20"
                        }`}>
                          {disp.status}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Select Volume presest & custom inputs */}
              <div className="glass-card p-6 rounded-2xl border border-white/5 space-y-4 shadow-xl">
                <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Select Dispense Volume</h2>
                
                <div className="grid grid-cols-2 gap-2">
                  {presets.map((vol) => (
                    <button
                      key={vol.value}
                      onClick={() => {
                        setAmount(vol.value)
                        setIsCustomAmount(false)
                      }}
                      className={`p-3 rounded-xl border flex flex-col items-center justify-center transition-all ${
                        amount === vol.value && !isCustomAmount
                          ? "bg-teal-500/20 border-teal-500 text-white"
                          : "bg-slate-900/40 border-white/5 text-slate-400 hover:border-slate-850"
                      }`}
                    >
                      <span className="text-xs font-extrabold">{vol.label}</span>
                      <span className="text-[9px] opacity-70 mt-1">{vol.value >= 1000 ? `${vol.value / 1000}L` : `${vol.value}ml`} presets</span>
                    </button>
                  ))}
                </div>

                <div 
                  onClick={() => setIsCustomAmount(true)}
                  className={`p-3.5 rounded-xl border cursor-pointer transition-all space-y-2 ${
                    isCustomAmount ? "bg-teal-500/20 border-teal-500" : "bg-slate-900/40 border-white/5 hover:border-slate-850"
                  }`}
                >
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-extrabold text-slate-350">Enter Custom Volume (ml)</span>
                    <span className="text-[9px] text-slate-500">Min 50ml</span>
                  </div>
                  {isCustomAmount && (
                    <input
                      type="number"
                      value={customMl}
                      onChange={(e) => setCustomMl(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      placeholder="e.g. 750"
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg py-2 px-3 text-sm text-white font-extrabold focus:outline-none focus:border-teal-500"
                    />
                  )}
                </div>

                {/* Estimate Cost block */}
                <div className="p-3 bg-slate-950/60 border border-white/5 rounded-2xl flex items-center justify-between text-xs">
                  <span className="text-slate-450">Estimated Session Cost:</span>
                  <span className="font-extrabold text-teal-400 text-sm">₹{activeCost.toFixed(2)}</span>
                </div>

                <div className="pt-2">
                  <button
                    onClick={handleGenerateQR}
                    disabled={generating || !selectedMachineId || selectedMachine?.status !== "Active"}
                    className="w-full py-3.5 bg-teal-500 hover:bg-teal-600 disabled:opacity-50 text-slate-950 font-black rounded-xl transition-all shadow-lg shadow-teal-500/20 flex items-center justify-center space-x-2 active:scale-95 text-sm"
                  >
                    {generating ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    <span>{generating ? "Authorizing Token..." : "Generate Secure QR Code"}</span>
                  </button>
                </div>
              </div>
            </motion.div>
          ) : (
            // QR Display with 90s countdown circular progress ring
            <motion.div
              key="qr-terminal"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="glass-card p-8 rounded-3xl border border-white/10 flex flex-col items-center space-y-6 relative overflow-hidden"
            >
              {/* 90s expiring QR countdown ring */}
              <div className="absolute top-4 right-4 flex items-center justify-center h-12 w-12 shrink-0">
                <svg className="h-12 w-12 transform -rotate-90">
                  <circle
                    cx="24"
                    cy="24"
                    r={qrRadius}
                    stroke="rgba(255,255,255,0.05)"
                    strokeWidth="3.5"
                    fill="transparent"
                  />
                  <circle
                    cx="24"
                    cy="24"
                    r={qrRadius}
                    stroke={timeLeft <= 15 ? "rgb(239, 68, 68)" : "rgb(20, 184, 166)"}
                    strokeWidth="3.5"
                    fill="transparent"
                    strokeDasharray={qrCircumference}
                    strokeDashoffset={qrStrokeOffset}
                    strokeLinecap="round"
                    className="transition-all duration-1000"
                  />
                </svg>
                <div className="absolute text-[10px] font-mono font-extrabold text-white">
                  {timeLeft}s
                </div>
              </div>

              {/* QR Render */}
              <div className="bg-white p-4 rounded-2xl shadow-xl shadow-teal-500/10 border border-white/20">
                <QRCodeSVG value={qrTokenString} size={220} />
              </div>

              {/* Warnings and Info */}
              {timeLeft <= 15 ? (
                <div className="p-3 bg-red-500/15 border border-red-500/35 text-red-300 rounded-xl text-[10px] flex items-center space-x-2 w-full">
                  <AlertTriangle className="h-4 w-4 shrink-0 animate-bounce" />
                  <span>Token is expiring. Scan quickly or click regenerate to renew.</span>
                </div>
              ) : (
                <div className="text-center space-y-1">
                  <h3 className="text-sm font-bold flex items-center justify-center space-x-1.5 text-teal-400">
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Secure Token Active</span>
                  </h3>
                  <p className="text-[10px] text-slate-400 max-w-[220px] mx-auto leading-relaxed">
                    Scan this QR at the edge scanner module. Dispense cycles automatically on validation.
                  </p>
                </div>
              )}

              {/* Dispenser Realtime State */}
              <div className="w-full bg-slate-900/60 rounded-xl p-4 border border-white/5 space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-400">Selected Station:</span>
                  <span className="font-bold text-white">{selectedMachine?.name}</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-400">Dispense Charge:</span>
                  <span className="font-extrabold text-teal-400">₹{activeCost.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center text-xs border-t border-white/5 pt-2 mt-2">
                  <span className="text-slate-400">Station Status:</span>
                  <span className={`font-extrabold flex items-center space-x-1.5 ${
                    selectedMachine?.status === "Active" ? "text-emerald-450" : 
                    selectedMachine?.status === "Dispensing" ? "text-cyan-400 animate-pulse" : "text-red-400"
                  }`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${
                      selectedMachine?.status === "Active" ? "bg-emerald-400" :
                      selectedMachine?.status === "Dispensing" ? "bg-cyan-400" : "bg-red-400"
                    }`}></span>
                    <span>{selectedMachine?.status}</span>
                  </span>
                </div>
              </div>

              <div className="flex space-x-3 w-full">
                <button
                  onClick={handleGenerateQR}
                  className="flex-1 py-2.5 bg-slate-900 hover:bg-slate-850 border border-slate-800 text-slate-350 hover:text-white rounded-xl text-xs font-semibold flex items-center justify-center space-x-1.5 transition-colors"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  <span>Regenerate QR</span>
                </button>
                <button
                  onClick={() => setQrTokenString("")}
                  className="px-4 py-2.5 bg-slate-950 border border-white/10 hover:bg-slate-900 rounded-xl text-xs font-semibold text-slate-450 hover:text-white transition-colors"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  )
}
