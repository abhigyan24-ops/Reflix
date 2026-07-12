import { useState, useEffect, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Droplets, QrCode, CheckCircle, AlertTriangle, Zap, Wifi, WifiOff, RotateCcw, ShoppingCart, X } from "lucide-react"

// ── Types ──────────────────────────────────────────────────────────────────
type MachineState = "IDLE" | "SELECTING" | "SCANNING" | "VALIDATING" | "DISPENSING" | "COMPLETE" | "ERROR"

interface Product {
  id: string
  name: string
  size: number   // ml
  price: number  // ₹
  color: string
  gradient: string
  emoji: string
}

const PRODUCTS: Product[] = [
  { id: "p250",  name: "SmartSip",   size: 250,  price: 5,  color: "#38bdf8", gradient: "from-sky-400 to-blue-500",    emoji: "💧" },
  { id: "p500",  name: "HydroPro",   size: 500,  price: 8,  color: "#34d399", gradient: "from-emerald-400 to-teal-500", emoji: "🫗" },
  { id: "p1000", name: "AquaMax",    size: 1000, price: 15, color: "#a78bfa", gradient: "from-violet-400 to-purple-500", emoji: "🧴" },
  { id: "peco",  name: "EcoPure",    size: 750,  price: 12, color: "#fb923c", gradient: "from-orange-400 to-amber-500", emoji: "♻️" },
  { id: "pspa",  name: "MineraPure", size: 330,  price: 6,  color: "#f472b6", gradient: "from-pink-400 to-rose-500",    emoji: "✨" },
  { id: "pcold", name: "CrystalCold", size: 600, price: 10, color: "#4ade80", gradient: "from-green-400 to-lime-500",   emoji: "❄️" },
]

// Water bubble component
const Bubble = ({ delay, x }: { delay: number; x: number }) => (
  <motion.div
    className="absolute w-2 h-2 rounded-full bg-sky-300/60 blur-[1px]"
    style={{ left: `${x}%`, bottom: 0 }}
    animate={{ y: [0, -120, -200], opacity: [0, 0.8, 0], scale: [0.5, 1, 0.3] }}
    transition={{ duration: 1.8, delay, repeat: Infinity, ease: "easeOut" }}
  />
)

// LED Indicator
const LED = ({ on, color = "green" }: { on: boolean; color?: string }) => {
  const colors: Record<string, string> = {
    green: "bg-green-400 shadow-green-400",
    red: "bg-red-400 shadow-red-400",
    amber: "bg-amber-400 shadow-amber-400",
    blue: "bg-blue-400 shadow-blue-400",
    cyan: "bg-cyan-400 shadow-cyan-400",
  }
  return (
    <div className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${on ? `${colors[color]} shadow-lg` : "bg-slate-700"}`} />
  )
}

// ─── QR Scanner Animation ─────────────────────────────────────────────────
const QRScanner = ({ scanning }: { scanning: boolean }) => (
  <div className="relative w-32 h-32 mx-auto">
    {/* QR Code placeholder */}
    <div className="absolute inset-0 rounded-xl bg-white p-2">
      <div className="w-full h-full grid grid-cols-7 gap-0.5">
        {Array.from({ length: 49 }).map((_, i) => {
          const pattern = [
            [1,1,1,1,1,1,1],[1,0,0,0,0,0,1],[1,0,1,1,1,0,1],[1,0,1,0,1,0,1],[1,0,1,1,1,0,1],[1,0,0,0,0,0,1],[1,1,1,1,1,1,1],
          ]
          const row = Math.floor(i / 7)
          const col = i % 7
          const isBlack = pattern[row][col] || (Math.random() > 0.6 && row > 1 && col > 1 && row < 6 && col < 6)
          return <div key={i} className={`rounded-[1px] ${isBlack ? "bg-slate-900" : "bg-white"}`} />
        })}
      </div>
    </div>
    {/* Corner brackets */}
    {[["top-0 left-0","border-t-2 border-l-2"],["top-0 right-0","border-t-2 border-r-2"],["bottom-0 left-0","border-b-2 border-l-2"],["bottom-0 right-0","border-b-2 border-r-2"]].map(([pos, border], i) => (
      <div key={i} className={`absolute w-5 h-5 ${pos} ${border} border-cyan-400 rounded-[2px]`} />
    ))}
    {/* Scan line */}
    {scanning && (
      <motion.div
        className="absolute left-1 right-1 h-0.5 bg-gradient-to-r from-transparent via-cyan-400 to-transparent rounded shadow-[0_0_6px_2px_rgba(34,211,238,0.6)]"
        animate={{ top: ["8px", "120px", "8px"] }}
        transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
      />
    )}
    {/* Success flash */}
    {!scanning && (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="absolute inset-0 rounded-xl bg-green-400/20 flex items-center justify-center"
      >
        <CheckCircle className="h-10 w-10 text-green-400" />
      </motion.div>
    )}
  </div>
)

// ─── Water Dispense Animation ─────────────────────────────────────────────
const WaterDispenser = ({ progress }: { progress: number }) => (
  <div className="flex flex-col items-center gap-2">
    {/* Nozzle */}
    <div className="w-6 h-4 bg-slate-600 rounded-sm border border-slate-500 relative">
      <div className="absolute inset-x-1 bottom-0 h-0.5 bg-slate-400 rounded" />
    </div>
    {/* Water stream */}
    <div className="relative w-3 h-20 overflow-hidden">
      {progress > 0 && (
        <motion.div
          className="absolute inset-x-0 bg-gradient-to-b from-sky-400/90 to-blue-500/80"
          style={{ top: 0 }}
          animate={{ height: ["0%", "100%"] }}
          transition={{ duration: 0.4, ease: "linear" }}
        />
      )}
      {progress > 0 && Array.from({ length: 5 }).map((_, i) => (
        <motion.div
          key={i}
          className="absolute w-1 h-1 rounded-full bg-sky-300/70"
          style={{ left: `${20 + i * 12}%` }}
          animate={{ y: [0, 80], opacity: [0, 0.8, 0] }}
          transition={{ duration: 0.8, delay: i * 0.12, repeat: Infinity }}
        />
      ))}
    </div>
    {/* Cup with water fill */}
    <div className="relative w-14 h-16 border-2 border-sky-400/60 rounded-b-xl overflow-hidden bg-slate-900/80">
      <motion.div
        className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-blue-600/80 to-sky-400/60"
        style={{ height: `${Math.min(progress, 100)}%` }}
        transition={{ duration: 0.1 }}
      />
      {progress > 10 && Array.from({ length: 3 }).map((_, i) => (
        <Bubble key={i} delay={i * 0.5} x={20 + i * 25} />
      ))}
      {/* Ml label */}
      <div className="absolute inset-0 flex items-center justify-center z-10">
        <span className="text-[9px] font-black text-white/80">{Math.round(progress)}%</span>
      </div>
    </div>
  </div>
)

// ─── Machine Screen (inner display) ───────────────────────────────────────
const MachineScreen = ({
  state, selected, progress, timeLeft
}: {
  state: MachineState
  selected: Product | null
  progress: number
  timeLeft: number
}) => {
  const screenContent: Record<MachineState, JSX.Element> = {
    IDLE: (
      <div className="flex flex-col items-center justify-center h-full space-y-2">
        <motion.div
          animate={{ scale: [1, 1.05, 1], opacity: [0.7, 1, 0.7] }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          <Droplets className="h-10 w-10 text-cyan-400" />
        </motion.div>
        <p className="text-cyan-300 font-bold text-sm tracking-wider">REFILLX</p>
        <p className="text-slate-400 text-[10px] text-center">Smart Water Station<br />Select a product to begin</p>
        <div className="flex gap-1 pt-1">
          {Array.from({ length: 3 }).map((_, i) => (
            <motion.div
              key={i}
              className="w-1.5 h-1.5 rounded-full bg-cyan-400"
              animate={{ opacity: [0, 1, 0] }}
              transition={{ duration: 1.2, delay: i * 0.4, repeat: Infinity }}
            />
          ))}
        </div>
      </div>
    ),
    SELECTING: (
      <div className="flex flex-col items-center justify-center h-full space-y-3">
        <ShoppingCart className="h-8 w-8 text-amber-400" />
        <p className="text-amber-300 font-bold text-xs">ITEM SELECTED</p>
        {selected && (
          <>
            <p className="text-white font-black text-base">{selected.name}</p>
            <p className="text-slate-300 text-xs">{selected.size}ml · ₹{selected.price}</p>
          </>
        )}
        <p className="text-slate-400 text-[10px]">Confirm to generate QR</p>
      </div>
    ),
    SCANNING: (
      <div className="flex flex-col items-center justify-center h-full space-y-3">
        <QrCode className="h-6 w-6 text-cyan-400 animate-pulse" />
        <p className="text-cyan-300 font-bold text-[11px] tracking-wider">SCAN QR CODE</p>
        <QRScanner scanning={true} />
        <p className="text-slate-400 text-[10px]">Hold QR to camera</p>
        <motion.div
          className="text-amber-400 font-mono text-sm font-bold"
          animate={{ opacity: [1, 0.5, 1] }}
          transition={{ duration: 1, repeat: Infinity }}
        >
          {timeLeft}s
        </motion.div>
      </div>
    ),
    VALIDATING: (
      <div className="flex flex-col items-center justify-center h-full space-y-4">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          className="w-10 h-10 border-2 border-cyan-500/30 border-t-cyan-400 rounded-full"
        />
        <p className="text-cyan-300 font-bold text-xs">VALIDATING…</p>
        <div className="w-32 h-1 bg-slate-700 rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full"
            animate={{ x: ["-100%", "100%"] }}
            transition={{ duration: 1, repeat: Infinity, ease: "easeInOut" }}
          />
        </div>
        <p className="text-slate-500 text-[10px]">Verifying token…</p>
      </div>
    ),
    DISPENSING: (
      <div className="flex flex-col items-center justify-center h-full space-y-2">
        <p className="text-emerald-400 font-bold text-[11px] tracking-wider">DISPENSING</p>
        {selected && <p className="text-white text-xs font-bold">{selected.size}ml</p>}
        <WaterDispenser progress={progress} />
        <div className="w-28 bg-slate-700 rounded-full h-1.5 overflow-hidden">
          <motion.div
            className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full"
            style={{ width: `${progress}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
        <p className="text-slate-400 text-[10px]">{Math.round(progress)}% complete</p>
      </div>
    ),
    COMPLETE: (
      <div className="flex flex-col items-center justify-center h-full space-y-3">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 300 }}
        >
          <CheckCircle className="h-12 w-12 text-emerald-400" />
        </motion.div>
        <p className="text-emerald-300 font-black text-sm">COMPLETE!</p>
        {selected && (
          <p className="text-white text-xs">{selected.size}ml dispensed ✓</p>
        )}
        <p className="text-slate-400 text-[10px]">Thank you for choosing RefillX</p>
        <p className="text-cyan-400 text-[10px]">Eco points: +{(selected?.size || 0) / 50} 🌿</p>
      </div>
    ),
    ERROR: (
      <div className="flex flex-col items-center justify-center h-full space-y-3">
        <motion.div
          animate={{ rotate: [0, -5, 5, 0] }}
          transition={{ duration: 0.4, repeat: 3 }}
        >
          <AlertTriangle className="h-10 w-10 text-red-400" />
        </motion.div>
        <p className="text-red-400 font-black text-sm">ERROR</p>
        <p className="text-slate-400 text-[10px] text-center">QR token expired or invalid.<br />Please try again.</p>
      </div>
    ),
  }

  return (
    <div className="w-full h-full bg-slate-950 rounded-lg border border-slate-700 overflow-hidden relative">
      {/* Screen scanline effect */}
      <div className="absolute inset-0 pointer-events-none"
        style={{
          background: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.05) 2px, rgba(0,0,0,0.05) 4px)",
        }}
      />
      {/* Screen glow */}
      <div className={`absolute inset-0 rounded-lg transition-all duration-500 pointer-events-none ${
        state === "DISPENSING" ? "shadow-[inset_0_0_30px_rgba(52,211,153,0.15)]" :
        state === "COMPLETE"   ? "shadow-[inset_0_0_30px_rgba(52,211,153,0.2)]" :
        state === "ERROR"      ? "shadow-[inset_0_0_30px_rgba(248,113,113,0.15)]" :
        state === "SCANNING"   ? "shadow-[inset_0_0_30px_rgba(34,211,238,0.15)]" :
        "shadow-[inset_0_0_30px_rgba(30,41,59,0.5)]"
      }`} />
      <AnimatePresence mode="wait">
        <motion.div
          key={state}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.25 }}
          className="absolute inset-0 p-3"
        >
          {screenContent[state]}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

// ─── Product Slot ─────────────────────────────────────────────────────────
const ProductSlot = ({
  product, selected, disabled, onClick
}: {
  product: Product
  selected: boolean
  disabled: boolean
  onClick: () => void
}) => (
  <motion.button
    onClick={onClick}
    disabled={disabled}
    whileHover={!disabled ? { scale: 1.04, y: -2 } : {}}
    whileTap={!disabled ? { scale: 0.96 } : {}}
    className={`relative p-3 rounded-xl border-2 text-left transition-all duration-200 ${
      selected
        ? "border-cyan-400 bg-cyan-500/10 shadow-[0_0_16px_rgba(34,211,238,0.3)]"
        : disabled
        ? "border-slate-700 bg-slate-900/30 opacity-40 cursor-not-allowed"
        : "border-slate-700 bg-slate-900/50 hover:border-slate-500"
    }`}
  >
    {selected && (
      <motion.div
        className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-cyan-400 flex items-center justify-center"
        initial={{ scale: 0 }} animate={{ scale: 1 }}
      >
        <CheckCircle className="w-3 h-3 text-slate-950" />
      </motion.div>
    )}
    <div className="text-xl mb-1">{product.emoji}</div>
    <div className="text-white font-bold text-xs leading-tight">{product.name}</div>
    <div className="text-slate-400 text-[9px]">{product.size}ml</div>
    <div className={`text-xs font-black mt-1 bg-gradient-to-r ${product.gradient} bg-clip-text text-transparent`}>₹{product.price}</div>
  </motion.button>
)

// ─── Main Component ───────────────────────────────────────────────────────
export default function VendingMachine() {
  const [machineState, setMachineState] = useState<MachineState>("IDLE")
  const [selected, setSelected] = useState<Product | null>(null)
  const [progress, setProgress] = useState(0)
  const [timeLeft, setTimeLeft] = useState(90)
  const [isOnline, setIsOnline] = useState(true)
  const [temperature, setTemperature] = useState(22.4)
  const [pressure, setPressure] = useState(3.2)
  const [stockLevels, setStockLevels] = useState<Record<string, number>>({
    p250: 18, p500: 12, p1000: 7, peco: 9, pspa: 15, pcold: 11
  })
  const [totalDispensed, setTotalDispensed] = useState(1247)
  const [sessionCount, setSessionCount] = useState(0)

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const progressRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Simulate connection blip
  useEffect(() => {
    const t = setInterval(() => {
      setTemperature(prev => +(prev + (Math.random() - 0.5) * 0.2).toFixed(1))
      setPressure(prev => +(prev + (Math.random() - 0.5) * 0.05).toFixed(2))
    }, 2000)
    return () => clearInterval(t)
  }, [])

  const handleSelectProduct = (product: Product) => {
    if (machineState !== "IDLE" && machineState !== "SELECTING") return
    setSelected(product)
    setMachineState("SELECTING")
  }

  const handleConfirm = () => {
    if (!selected) return
    setMachineState("SCANNING")
    setTimeLeft(90)

    // Start countdown
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current!)
          // Auto-validate after 4s for demo
          return 0
        }
        return prev - 1
      })
    }, 1000)

    // Auto-validate after 4 seconds for demo
    setTimeout(() => {
      clearInterval(timerRef.current!)
      setMachineState("VALIDATING")
      setTimeout(() => {
        setMachineState("DISPENSING")
        setProgress(0)
        progressRef.current = setInterval(() => {
          setProgress(prev => {
            if (prev >= 100) {
              clearInterval(progressRef.current!)
              setMachineState("COMPLETE")
              setStockLevels(sl => ({ ...sl, [selected.id]: Math.max(0, sl[selected.id] - 1) }))
              setTotalDispensed(t => t + (selected.size))
              setSessionCount(s => s + 1)
              return 100
            }
            return prev + 2
          })
        }, (selected.size / 500) * 80) // scale duration with size
      }, 2000)
    }, 4000)
  }

  const handleReset = () => {
    clearInterval(timerRef.current!)
    clearInterval(progressRef.current!)
    setMachineState("IDLE")
    setSelected(null)
    setProgress(0)
    setTimeLeft(90)
  }

  const handleError = () => {
    clearInterval(timerRef.current!)
    clearInterval(progressRef.current!)
    setMachineState("ERROR")
    setTimeout(handleReset, 3000)
  }

  const isInteractive = machineState === "IDLE" || machineState === "SELECTING"

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,#0f172a,#020617)] text-white flex flex-col items-center justify-start px-4 py-8 pb-24 md:pl-72">
      {/* Page Header */}
      <div className="w-full max-w-5xl mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black text-white flex items-center gap-2">
              <Droplets className="h-6 w-6 text-cyan-400" />
              Smart Vending Machine
            </h1>
            <p className="text-slate-400 text-sm mt-1">Virtual ESP32 simulation · Station ID: <span className="text-cyan-400 font-mono">SIM-001</span></p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              {isOnline ? <Wifi className="h-4 w-4 text-green-400" /> : <WifiOff className="h-4 w-4 text-red-400" />}
              <span className={isOnline ? "text-green-400" : "text-red-400"}>{isOnline ? "MQTT Online" : "Offline"}</span>
            </div>
            <button
              onClick={handleReset}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-slate-300 transition-all"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Reset
            </button>
          </div>
        </div>
      </div>

      <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-8">

        {/* ═══════════ LEFT: VENDING MACHINE BODY ═══════════ */}
        <div className="flex flex-col items-center">

          {/* Machine Outer Shell */}
          <motion.div
            className="relative w-full max-w-[400px]"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            {/* Top cap */}
            <div className="h-4 bg-gradient-to-r from-slate-700 via-slate-600 to-slate-700 rounded-t-2xl border border-slate-600" />

            {/* Machine body */}
            <div className="bg-gradient-to-b from-slate-800 to-slate-900 border-x border-slate-600 shadow-2xl">

              {/* Brand strip */}
              <div className="h-10 bg-gradient-to-r from-cyan-600 via-blue-500 to-cyan-600 flex items-center justify-center gap-2 border-b border-cyan-400/30">
                <Droplets className="h-5 w-5 text-white" />
                <span className="text-white font-black tracking-[0.3em] text-sm">REFILLX</span>
                <Zap className="h-4 w-4 text-cyan-200" />
              </div>

              {/* LED status row */}
              <div className="px-4 py-2 flex items-center justify-between border-b border-slate-700/50">
                <div className="flex gap-2 items-center">
                  <LED on={isOnline} color="green" />
                  <LED on={machineState === "DISPENSING"} color="cyan" />
                  <LED on={machineState === "ERROR"} color="red" />
                  <LED on={machineState === "VALIDATING"} color="amber" />
                </div>
                <span className="text-[9px] font-mono text-slate-500 uppercase tracking-wider">
                  {new Date().toLocaleTimeString()}
                </span>
              </div>

              {/* Main body: Products (left) + Screen (right) */}
              <div className="p-4 grid grid-cols-[1fr_160px] gap-4">

                {/* Product grid (glass window) */}
                <div>
                  <div className="text-[9px] uppercase tracking-widest text-slate-500 mb-2 font-bold">Select Product</div>
                  <div className="p-2 rounded-xl border border-slate-600/50 bg-slate-950/60"
                    style={{ boxShadow: "inset 0 2px 8px rgba(0,0,0,0.6)" }}
                  >
                    <div className="grid grid-cols-2 gap-2">
                      {PRODUCTS.map(p => (
                        <ProductSlot
                          key={p.id}
                          product={p}
                          selected={selected?.id === p.id}
                          disabled={!isInteractive || stockLevels[p.id] === 0}
                          onClick={() => handleSelectProduct(p)}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Stock row */}
                  <div className="mt-3 grid grid-cols-3 gap-1.5">
                    {PRODUCTS.map(p => (
                      <div key={p.id} className="text-center">
                        <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className={`h-full bg-gradient-to-r ${p.gradient} rounded-full transition-all`}
                            style={{ width: `${(stockLevels[p.id] / 20) * 100}%` }}
                          />
                        </div>
                        <span className="text-[7px] text-slate-600">{stockLevels[p.id]} left</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Screen */}
                <div className="flex flex-col gap-3">
                  <div className="rounded-xl overflow-hidden border border-slate-600/50 shadow-[0_0_20px_rgba(34,211,238,0.08)]" style={{ height: 240 }}>
                    <MachineScreen
                      state={machineState}
                      selected={selected}
                      progress={progress}
                      timeLeft={timeLeft}
                    />
                  </div>

                  {/* Action buttons */}
                  <div className="space-y-2">
                    <AnimatePresence>
                      {machineState === "SELECTING" && (
                        <motion.button
                          key="confirm"
                          initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                          onClick={handleConfirm}
                          className="w-full py-2.5 text-xs font-black bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 rounded-xl text-white shadow-lg shadow-cyan-500/25 active:scale-95 transition-all"
                        >
                          Generate QR Token →
                        </motion.button>
                      )}
                      {machineState === "SCANNING" && (
                        <motion.button
                          key="cancel"
                          initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                          onClick={handleError}
                          className="w-full py-2 text-xs font-bold bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-xl text-slate-300 active:scale-95 transition-all flex items-center justify-center gap-1"
                        >
                          <X className="h-3 w-3" /> Cancel
                        </motion.button>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              </div>

              {/* Dispense chute */}
              <div className="mx-4 mb-3">
                <div className="h-12 bg-slate-950 rounded-xl border border-slate-700/50 flex items-center justify-center overflow-hidden relative">
                  <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-slate-600 to-transparent" />
                  <AnimatePresence>
                    {machineState === "COMPLETE" && (
                      <motion.div
                        initial={{ y: -30, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ type: "spring", stiffness: 200 }}
                        className="text-3xl"
                      >
                        {selected?.emoji}
                      </motion.div>
                    )}
                  </AnimatePresence>
                  {machineState !== "COMPLETE" && (
                    <span className="text-[9px] text-slate-700 uppercase tracking-widest">Dispense Chute</span>
                  )}
                </div>
              </div>

              {/* Payment strip */}
              <div className="mx-4 mb-4 p-3 bg-slate-950/80 rounded-xl border border-slate-700/40 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-6 bg-gradient-to-br from-amber-400 to-yellow-500 rounded border border-amber-300/50 flex items-center justify-center">
                    <QrCode className="h-3 w-3 text-amber-900" />
                  </div>
                  <span className="text-[9px] text-slate-500 font-bold uppercase">QR / UPI</span>
                </div>
                <div className="text-[9px] text-slate-600 font-mono">
                  {selected ? `₹${selected.price}` : "—"}
                </div>
              </div>
            </div>

            {/* Bottom base */}
            <div className="h-6 bg-gradient-to-r from-slate-700 via-slate-600 to-slate-700 rounded-b-2xl border border-slate-600 shadow-[0_8px_30px_rgba(0,0,0,0.8)]" />

            {/* Side shadow details */}
            <div className="absolute top-4 -left-2 bottom-6 w-2 bg-gradient-to-b from-slate-900 to-slate-950 rounded-l-md" />
            <div className="absolute top-4 -right-2 bottom-6 w-2 bg-gradient-to-b from-slate-900 to-slate-950 rounded-r-md" />
          </motion.div>
        </div>

        {/* ═══════════ RIGHT: TELEMETRY & CONTROLS ═══════════ */}
        <div className="space-y-4">

          {/* Machine Status Card */}
          <div className="bg-slate-900/80 rounded-2xl border border-slate-700/50 p-4 backdrop-blur">
            <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-3 flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${machineState === "DISPENSING" ? "bg-emerald-400 animate-pulse" : machineState === "ERROR" ? "bg-red-400" : "bg-blue-400"}`} />
              Machine Status
            </h3>
            <div className="flex items-center gap-3">
              <div className={`flex-1 py-2 px-3 rounded-xl text-center font-black text-sm border ${
                machineState === "IDLE"       ? "bg-slate-800 border-slate-600 text-slate-300" :
                machineState === "SELECTING"  ? "bg-amber-900/30 border-amber-500/40 text-amber-300" :
                machineState === "SCANNING"   ? "bg-blue-900/30 border-blue-500/40 text-blue-300" :
                machineState === "VALIDATING" ? "bg-purple-900/30 border-purple-500/40 text-purple-300" :
                machineState === "DISPENSING" ? "bg-emerald-900/30 border-emerald-500/40 text-emerald-300" :
                machineState === "COMPLETE"   ? "bg-green-900/30 border-green-500/40 text-green-300" :
                "bg-red-900/30 border-red-500/40 text-red-300"
              }`}>
                {machineState}
              </div>
            </div>
          </div>

          {/* Live Telemetry */}
          <div className="bg-slate-900/80 rounded-2xl border border-slate-700/50 p-4 backdrop-blur">
            <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-3">Live Telemetry</h3>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Temperature", value: `${temperature}°C`, color: "text-orange-400", bg: "bg-orange-500/10" },
                { label: "Pressure",    value: `${pressure} bar`,  color: "text-blue-400",   bg: "bg-blue-500/10" },
                { label: "Flow Rate",   value: machineState === "DISPENSING" ? `${(2.1 + Math.random()).toFixed(1)} L/m` : "0.0 L/m", color: "text-cyan-400", bg: "bg-cyan-500/10" },
                { label: "pH Level",    value: "7.2",              color: "text-green-400",  bg: "bg-green-500/10" },
              ].map(item => (
                <div key={item.label} className={`${item.bg} rounded-xl p-3 border border-white/5`}>
                  <div className="text-[9px] text-slate-500 uppercase font-bold">{item.label}</div>
                  <div className={`text-sm font-black ${item.color} mt-1`}>{item.value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Session Stats */}
          <div className="bg-slate-900/80 rounded-2xl border border-slate-700/50 p-4 backdrop-blur">
            <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-3">Station Stats</h3>
            <div className="space-y-2.5">
              {[
                { label: "Total Dispensed Today", value: `${(totalDispensed / 1000).toFixed(1)} L`, color: "text-cyan-400" },
                { label: "Sessions (this run)",    value: sessionCount.toString(),                 color: "text-amber-400" },
                { label: "Uptime",                 value: "99.8%",                                 color: "text-green-400" },
                { label: "Station ID",             value: "SIM-001",                               color: "text-slate-300 font-mono" },
              ].map(item => (
                <div key={item.label} className="flex justify-between items-center border-b border-slate-800 pb-2 last:border-0 last:pb-0">
                  <span className="text-xs text-slate-500">{item.label}</span>
                  <span className={`text-xs font-bold ${item.color}`}>{item.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="bg-slate-900/80 rounded-2xl border border-slate-700/50 p-4 backdrop-blur">
            <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-3">Quick Demo Actions</h3>
            <div className="space-y-2">
              <button
                onClick={() => { handleReset(); setTimeout(() => { handleSelectProduct(PRODUCTS[1]); setTimeout(handleConfirm, 300) }, 300) }}
                disabled={machineState !== "IDLE"}
                className="w-full py-2.5 text-xs font-bold bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 disabled:opacity-40 rounded-xl text-white transition-all active:scale-95"
              >
                ▶ Run Full Demo (500ml)
              </button>
              <button
                onClick={handleError}
                disabled={machineState === "IDLE" || machineState === "COMPLETE" || machineState === "ERROR"}
                className="w-full py-2 text-xs font-bold bg-red-900/30 hover:bg-red-900/50 disabled:opacity-30 border border-red-500/30 rounded-xl text-red-400 transition-all active:scale-95"
              >
                ⚠ Inject Error / QR Timeout
              </button>
              <button
                onClick={handleReset}
                className="w-full py-2 text-xs font-bold bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-slate-400 transition-all active:scale-95 flex items-center justify-center gap-1"
              >
                <RotateCcw className="h-3 w-3" /> Reset Machine
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
