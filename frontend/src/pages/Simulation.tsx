import { useState, useEffect, useRef } from "react"
import Navbar from "../components/Navbar"
import mqtt from "mqtt"
import { motion, AnimatePresence } from "framer-motion"
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts"
import { toast, Toaster } from "react-hot-toast"
import { Play, Activity, ShieldAlert, Cpu, AlertTriangle, Search, Trash2, Pause, RotateCcw, CheckCircle, Clock, Sparkles, Download, Gauge, AlertCircle } from "lucide-react"

// Interface definitions
interface TelemetryPoint {
  time: string
  flowRate: number
  distance: number
  temperature: number
  tankLevel: number
  tds: number
}

interface ErrorLog {
  id: string
  type: string
  severity: string
  timestamp: string
}

interface MqttMessage {
  id: string
  topic: string
  payload: string
  timestamp: string
  timeRaw: Date
  qos: number
}

export default function Simulation() {
  // MQTT Client state
  const [mqttClient, setMqttClient] = useState<mqtt.MqttClient | null>(null)
  const [connected, setConnected] = useState<boolean>(false)

  // Panel 1: Sensor Dashboard
  const [currentState, setCurrentState] = useState<string>("IDLE")
  const [telemetry, setTelemetry] = useState<TelemetryPoint[]>([])
  const [currentFlow, setCurrentFlow] = useState<number>(0.0)
  const [currentTankLevel, setCurrentTankLevel] = useState<number>(85.0)
  const [currentTds, setCurrentTds] = useState<number>(120.0)
  const [currentTemp, setCurrentTemp] = useState<number>(24.0)
  const [totalVolume, setTotalVolume] = useState<number>(0)
  const [targetVolume, setTargetVolume] = useState<number>(0)
  const [uptime, setUptime] = useState<number>(0)

  // Analytics state
  const [anomalyAlert, setAnomalyAlert] = useState<string | null>(null)
  const [healthScore, setHealthScore] = useState<number>(100)
  const [sessionLog, setSessionLog] = useState<TelemetryPoint[]>([])

  // Panel 2: Error Injection
  const [errorsActive, setErrorsActive] = useState({
    low_stock: false,
    valve_jam: false,
    tamper: false,
    network_dropout: false,
  })
  const [severities, setSeverities] = useState<Record<string, string>>({
    low_stock: "Medium",
    valve_jam: "Critical",
    tamper: "Critical",
    network_dropout: "Low",
  })
  const [errorLogs, setErrorLogs] = useState<ErrorLog[]>([])
  const [activeBanner, setActiveBanner] = useState<string | null>(null)

  // Panel 3: MQTT Explorer
  const [messages, setMessages] = useState<MqttMessage[]>([])
  const [filterKeyword, setFilterKeyword] = useState<string>("")
  const [feedPaused, setFeedPaused] = useState<boolean>(false)
  const [autoScroll, setAutoScroll] = useState<boolean>(true)
  const explorerEndRef = useRef<HTMLDivElement | null>(null)

  // Panel 4: Demo Script Timer
  const [stopwatchTime, setStopwatchTime] = useState<number>(180) // 3 mins
  const [timerRunning, setTimerRunning] = useState<boolean>(false)
  const stopwatchIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const demoSteps = [
    { range: [160, 180], label: "Step 1: Open PWA & show Login", desc: "0:00–0:20" },
    { range: [135, 160], label: "Step 2: Authenticate & view Wallet", desc: "0:20–0:45" },
    { range: [105, 135], label: "Step 3: Select Dispenser & generate QR", desc: "0:45–1:15" },
    { range: [75, 105], label: "Step 4: Dispense & watch flow graphs", desc: "1:15–1:45" },
    { range: [45, 75], label: "Step 5: Show Wallet balances & History", desc: "1:45–2:15" },
    { range: [0, 45], label: "Step 6: Show Vendor Analytics & AI Passport", desc: "2:15–3:00" },
  ]

  // --- MQTT connection ---
  useEffect(() => {
    // Connect to EMQX public secure WebSockets broker
    const client = mqtt.connect("wss://broker.emqx.io:8084/mqtt", {
      keepalive: 60,
      reconnectPeriod: 5000,
    })

    client.on("connect", () => {
      setConnected(true)
      client.subscribe("refillx/#")
      setMqttClient(client)
      toast.success("Connected to EMQX Broker via WebSockets!")
    })

    client.on("close", () => {
      setConnected(false)
    })

    client.on("message", (topic, payload) => {
      const payloadStr = payload.toString()
      const timeNow = new Date()

      // Log in Message Explorer if not paused
      if (!feedPaused) {
        setMessages((prev) => {
          const newMsgs = [
            {
              id: Math.random().toString(),
              topic,
              payload: payloadStr,
              timestamp: timeNow.toLocaleTimeString(),
              timeRaw: timeNow,
              qos: 1,
            },
            ...prev,
          ]
          return newMsgs.slice(0, 100) // limit to 100
        })
      }

      // Handle Sim status message parsing
      if (topic === "refillx/dispensers/sim-001/status") {
        try {
          const data = JSON.parse(payloadStr)
          setCurrentState(data.status || "IDLE")
          setTotalVolume(data.volume || 0)
          setTargetVolume(data.targetVolume || 0)
          setUptime(data.uptime || 0)
          setCurrentFlow(data.flowRate || 0.0)
          setCurrentTankLevel(data.tankLevel || 85.0)
          setCurrentTds(data.tds || 120.0)
          setCurrentTemp(data.temperature || 24.0)

          // Check for anomalies
          if (data.flowRate > 2.5) {
            setAnomalyAlert(`Flow rate spike: ${data.flowRate.toFixed(2)} L/min at ${timeNow.toLocaleTimeString()}`)
            setTimeout(() => setAnomalyAlert(null), 5000)
          }
          if (data.tds > 200) {
            setAnomalyAlert(`TDS alert: ${data.tds.toFixed(1)} ppm at ${timeNow.toLocaleTimeString()}`)
            setTimeout(() => setAnomalyAlert(null), 5000)
          }

          // Calculate health score (0-100)
          let score = 100
          if (data.flowRate > 2.5) score -= 15
          if (data.tds > 200) score -= 20
          if (data.temperature > 30 || data.temperature < 18) score -= 10
          if (data.tankLevel < 20) score -= 15
          setHealthScore(Math.max(0, score))

          // Add to rolling line charts (last 30 points)
          if (data.status === "DISPENSING") {
            const newPoint = {
              time: timeNow.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
              flowRate: data.flowRate || 0.0,
              distance: data.distance || 0.0,
              temperature: data.temperature || 24.0,
              tankLevel: data.tankLevel || 85.0,
              tds: data.tds || 120.0,
            }
            setTelemetry((prev) => [...prev, newPoint].slice(-30))
            setSessionLog((prev) => [...prev, newPoint])
          }
        } catch (e) {
          console.error("Failed to parse sim status payload", e)
        }
      }
    })

    return () => {
      client.end()
    }
  }, [feedPaused])

  // Scroll to bottom of message explorer
  useEffect(() => {
    if (autoScroll && explorerEndRef.current) {
      explorerEndRef.current.scrollIntoView({ behavior: "smooth" })
    }
  }, [messages, autoScroll])

  // --- Start Simulation Command ---
  const handleStartSimulation = () => {
    if (!mqttClient || !connected) {
      toast.error("MQTT broker disconnected.")
      return
    }

    const payload = {
      command: "start_simulation",
      amount: 500,
      uid: "usr_abhig99",
    }
    mqttClient.publish("refillx/dispensers/sim-001/command", JSON.stringify(payload), { qos: 1 })
    toast.success("Dispense start simulation command published!")
    setTelemetry([]) // reset local graph cache
  }

  // --- CSV Export Handler ---
  const handleExportCSV = () => {
    if (sessionLog.length === 0) {
      toast.error("No session data to export")
      return
    }

    const headers = ["Time", "Flow Rate (L/min)", "Distance (cm)", "Temperature (°C)", "Tank Level (%)", "TDS (ppm)"]
    const rows = sessionLog.map((point) => [
      point.time,
      point.flowRate.toFixed(2),
      point.distance.toFixed(2),
      point.temperature.toFixed(1),
      point.tankLevel.toFixed(1),
      point.tds.toFixed(1),
    ])

    const csvContent = [
      headers.join(","),
      ...rows.map((row) => row.join(",")),
    ].join("\n")

    const blob = new Blob([csvContent], { type: "text/csv" })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `refillx_session_${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    window.URL.revokeObjectURL(url)
    toast.success("Session log exported as CSV")
  }

  // --- Reset All Command ---
  const handleResetAll = () => {
    if (!mqttClient || !connected) return

    mqttClient.publish("refillx/dispensers/sim-001/command", JSON.stringify({ command: "reset" }), { qos: 1 })
    setErrorsActive({
      low_stock: false,
      valve_jam: false,
      tamper: false,
      network_dropout: false,
    })
    setActiveBanner(null)
    setErrorLogs([])
    setTelemetry([])
    setSessionLog([])
    setCurrentState("IDLE")
    setHealthScore(100)
    setAnomalyAlert(null)
    toast.success("Simulations and active errors reset.")
  }

  // --- Handle Error Toggles ---
  const handleToggleError = (type: "low_stock" | "valve_jam" | "tamper" | "network_dropout") => {
    if (!mqttClient || !connected) {
      toast.error("MQTT client disconnected.")
      return
    }

    const nextState = !errorsActive[type]
    setErrorsActive((prev) => ({ ...prev, [type]: nextState }))

    if (nextState) {
      // Publish to inject error
      const payload = {
        type,
        severity: severities[type],
        timestamp: Math.floor(Date.now() / 1000),
      }
      mqttClient.publish("refillx/sim/inject_error", JSON.stringify(payload), { qos: 1 })
      
      setActiveBanner(type)
      
      // Add to logs
      const logEntry: ErrorLog = {
        id: Math.random().toString(),
        type,
        severity: severities[type],
        timestamp: new Date().toLocaleTimeString(),
      }
      setErrorLogs((prev) => [logEntry, ...prev].slice(0, 5))
      toast.error(`Injected: ${type.toUpperCase()} alert`)

      // Auto turn-off toggle after 5s (but state script handles entering error)
      setTimeout(() => {
        setErrorsActive((prev) => ({ ...prev, [type]: false }))
        setActiveBanner(null)
      }, 5000)
    }
  }

  // --- Stopwatch Controls ---
  const startTimer = () => {
    if (timerRunning) return
    setTimerRunning(true)
    stopwatchIntervalRef.current = setInterval(() => {
      setStopwatchTime((t) => {
        if (t <= 1) {
          if (stopwatchIntervalRef.current) clearInterval(stopwatchIntervalRef.current)
          setTimerRunning(false)
          return 0
        }
        return t - 1
      })
    }, 1000)
  }

  const pauseTimer = () => {
    if (stopwatchIntervalRef.current) {
      clearInterval(stopwatchIntervalRef.current)
      stopwatchIntervalRef.current = null
    }
    setTimerRunning(false)
  }

  const resetTimer = () => {
    pauseTimer()
    setStopwatchTime(180)
  }

  useEffect(() => {
    return () => {
      if (stopwatchIntervalRef.current) clearInterval(stopwatchIntervalRef.current)
    }
  }, [])

  // Helper formatting for timer
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`
  }

  // Get active step index based on stopwatch countdown
  const getActiveStepIndex = () => {
    if (stopwatchTime === 0) return -1
    return demoSteps.findIndex(
      (step) => stopwatchTime >= step.range[0] && stopwatchTime <= step.range[1]
    )
  }

  const activeStep = getActiveStepIndex()

  return (
    <div className="min-h-screen bg-slate-950 text-white md:pl-64">
      <Toaster position="top-right" />
      <Navbar />

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6 pb-24">
        
        {/* Banner for Injected Errors */}
        <AnimatePresence>
          {activeBanner && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="bg-red-500/15 border border-red-500/35 p-3 rounded-xl flex items-center space-x-2 text-red-300 text-xs font-semibold"
            >
              <AlertTriangle className="h-4 w-4 animate-bounce shrink-0" />
              <span>INJECTING ACTIVE FAULT: {activeBanner.toUpperCase()} (Severity: {severities[activeBanner]})</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Demo Timer & Stopwatch Header */}
        <div className="glass-card p-5 rounded-2xl border border-white/5 grid grid-cols-1 md:grid-cols-4 gap-6 items-center">
          <div className="md:col-span-1 space-y-2 border-r border-white/5 pr-4">
            <h2 className="text-base font-extrabold flex items-center space-x-1.5 text-cyan-400">
              <Clock className="h-5 w-5 text-cyan-400" />
              <span>Walkthrough Timer</span>
            </h2>
            <div className="flex items-center space-x-4">
              <span className={`text-3xl font-mono font-extrabold ${stopwatchTime <= 30 && stopwatchTime > 0 ? "text-amber-500 animate-pulse" : "text-white"}`}>
                {formatTime(stopwatchTime)}
              </span>
              <div className="flex space-x-1">
                {timerRunning ? (
                  <button onClick={pauseTimer} className="p-1 bg-slate-900 border border-white/5 hover:bg-slate-800 rounded text-slate-400 hover:text-white">
                    <Pause className="h-4 w-4" />
                  </button>
                ) : (
                  <button onClick={startTimer} className="p-1 bg-slate-900 border border-white/5 hover:bg-slate-800 rounded text-slate-400 hover:text-white">
                    <Play className="h-4 w-4" />
                  </button>
                )}
                <button onClick={resetTimer} className="p-1 bg-slate-900 border border-white/5 hover:bg-slate-800 rounded text-slate-400 hover:text-white">
                  <RotateCcw className="h-4 w-4" />
                </button>
              </div>
            </div>
            {stopwatchTime === 0 && (
              <div className="text-emerald-450 font-bold text-xs flex items-center space-x-1 pt-1">
                <CheckCircle className="h-4 w-4 animate-scale" />
                <span>Demo Complete</span>
              </div>
            )}
          </div>

          <div className="md:col-span-3">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
              {demoSteps.map((step, idx) => (
                <div
                  key={idx}
                  className={`p-2.5 rounded-lg border text-center transition-all ${
                    activeStep === idx
                      ? "bg-cyan-500/10 border-cyan-500 text-cyan-400 font-bold"
                      : "bg-slate-900/30 border-white/5 text-slate-400"
                  }`}
                >
                  <p className="text-[9px] uppercase tracking-wider">{step.desc}</p>
                  <p className="text-[10px] leading-tight mt-1 truncate" title={step.label}>{step.label.split(":")[1].trim()}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Active Step Talking Points Card */}
        {activeStep !== -1 && (
          <div className="glass-card p-5 rounded-2xl border border-cyan-500/20 bg-cyan-500/5 space-y-1.5 shadow-lg">
            <h4 className="text-xs font-bold text-cyan-400 uppercase tracking-widest flex items-center space-x-1.5">
              <Sparkles className="h-4 w-4 animate-pulse" />
              <span>Presenter Guide & Instructions — {demoSteps[activeStep].label}</span>
            </h4>
            <p className="text-xs text-slate-300 leading-relaxed">
              {
                [
                  "Action: Open RefillX on '/login'. Authenticate with test user usr_test_savior. Toggle the light/dark theme icon in the sidebar. Note: System media preferences are respected by default and transitions use smooth HSL color shifts.",
                  "Action: Navigate to the '/wallet' screen. Explain that the wallet balance syncs in real-time from Firestore. Click the '+' button, input ₹200, and top up. Show that the ledger instantly registers a UPI Deposit.",
                  "Action: Go to the '/refill' tab. Use the search bar to filter stations. Select a dispenser; show that the list is sorted using a GPS-based Haversine distance. Pick 500ml and click 'Generate Secure QR' to start the 90s ring timer.",
                  "Action: In the simulation panel below, click 'Start Simulated Dispense'. On the /refill screen, the status will automatically change to Dispensing. Highlight the wave container progress fill and telemetry flow rate curves.",
                  "Action: Wait for the solenoid cycle to finish and show the complete checkmark. Go back to '/wallet' and '/history'. Expand the history row, review the debit transaction log, and download the compiled water bill PDF.",
                  "Action: Log in as a vendor. Open '/vendor/dashboard'. Point to the ARIMA predictions (7-day forecast), LSTM water stockout warnings, K-Means customer segment distributions, and Priya Sharma's Eco Passport."
                ][activeStep]
              }
            </p>
          </div>
        )}

        {/* 3-Column Panels Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Panel 1: Sensor Dashboard */}
          <div className="glass-card p-5 rounded-2xl border border-white/5 space-y-4 flex flex-col justify-between">
            <div className="flex justify-between items-center border-b border-white/5 pb-3">
              <h3 className="text-sm font-bold flex items-center space-x-2">
                <Activity className="h-4 w-4 text-cyan-400" />
                <span>Sensor Dashboard</span>
              </h3>
              
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                currentState === "IDLE" ? "bg-slate-500/10 text-slate-400 border border-slate-500/20" :
                currentState === "QR_SCAN" ? "bg-blue-500/10 text-blue-400 border border-blue-500/20" :
                currentState === "VALIDATING" ? "bg-amber-500/10 text-amber-400 border border-amber-500/20" :
                currentState === "DISPENSING" ? "bg-teal-500/10 text-teal-400 border border-teal-500/20 animate-pulse" :
                currentState === "COMPLETE" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" :
                "bg-red-500/10 text-red-400 border border-red-500/20"
              }`}>
                {currentState}
              </span>
            </div>

            {/* Dashboard Live metrics */}
            <div className="grid grid-cols-2 gap-2 text-center">
              <div className="bg-slate-900/40 p-2.5 rounded-xl border border-white/5">
                <span className="text-[9px] text-slate-500 block uppercase font-semibold">Flow Rate</span>
                <span className={`text-sm font-extrabold ${currentFlow > 2.5 ? "text-red-400" : "text-amber-400"}`}>{currentFlow.toFixed(1)} L/m</span>
              </div>
              <div className="bg-slate-900/40 p-2.5 rounded-xl border border-white/5">
                <span className="text-[9px] text-slate-500 block uppercase font-semibold">Temp</span>
                <span className="text-sm font-extrabold text-blue-400">{currentTemp.toFixed(1)}°C</span>
              </div>
              <div className="bg-slate-900/40 p-2.5 rounded-xl border border-white/5">
                <span className="text-[9px] text-slate-500 block uppercase font-semibold">Tank</span>
                <span className="text-sm font-extrabold text-emerald-400">{currentTankLevel.toFixed(0)}%</span>
              </div>
              <div className="bg-slate-900/40 p-2.5 rounded-xl border border-white/5">
                <span className="text-[9px] text-slate-500 block uppercase font-semibold">TDS</span>
                <span className={`text-sm font-extrabold ${currentTds > 200 ? "text-red-400" : "text-teal-400"}`}>{currentTds.toFixed(0)} ppm</span>
              </div>
              <div className="bg-slate-900/40 p-2.5 rounded-xl border border-white/5">
                <span className="text-[9px] text-slate-500 block uppercase font-semibold">Volume</span>
                <span className="text-sm font-extrabold text-cyan-400">{totalVolume} ml</span>
              </div>
              <div className="bg-slate-900/40 p-2.5 rounded-xl border border-white/5">
                <span className="text-[9px] text-slate-500 block uppercase font-semibold">Uptime</span>
                <span className="text-sm font-extrabold text-slate-300">{uptime}s</span>
              </div>
            </div>

            {/* Recharts graphs */}
            <div className="h-56 w-full pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={telemetry.length === 0 ? [{ time: "", flowRate: 0, distance: 0, temperature: 0 }] : telemetry}>
                  <XAxis dataKey="time" stroke="#475569" fontSize={9} tickLine={false} />
                  <YAxis stroke="#475569" fontSize={9} tickLine={false} />
                  <Tooltip contentStyle={{ background: "#020617", border: "1px solid rgba(255,255,255,0.08)", fontSize: 10 }} />
                  <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                  <Line type="monotone" dataKey="flowRate" stroke="#f59e0b" strokeWidth={1.5} dot={false} name="Flow (L/m)" />
                  <Line type="monotone" dataKey="distance" stroke="#3b82f6" strokeWidth={1.5} dot={false} name="Distance (cm)" />
                  <Line type="monotone" dataKey="temperature" stroke="#14b8a6" strokeWidth={1.5} dot={false} name="Temp (°C)" />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <button
              onClick={handleStartSimulation}
              disabled={currentState === "DISPENSING"}
              className="w-full py-2.5 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white font-bold rounded-xl text-xs transition-all shadow-md active:scale-95 flex items-center justify-center space-x-1.5"
            >
              <Play className="h-4 w-4" />
              <span>Start Simulated Dispense</span>
            </button>
          </div>

          {/* Panel 2: Error Injection UI */}
          <div className="glass-card p-5 rounded-2xl border border-white/5 space-y-4 flex flex-col justify-between">
            <div className="flex justify-between items-center border-b border-white/5 pb-3">
              <h3 className="text-sm font-bold flex items-center space-x-2">
                <ShieldAlert className="h-4 w-4 text-red-400" />
                <span>Error Injection</span>
              </h3>
              <button 
                onClick={handleResetAll}
                className="text-[10px] text-slate-400 hover:text-white px-2 py-0.5 border border-white/10 hover:border-white/20 rounded-md"
              >
                Reset All
              </button>
            </div>

            {/* Toggle Switches */}
            <div className="space-y-3 flex-1 pt-2">
              {Object.keys(errorsActive).map((key) => {
                const isSwitched = errorsActive[key as keyof typeof errorsActive]
                const nameLabel = key.replace("_", " ").toUpperCase()
                return (
                  <div key={key} className="flex items-center justify-between p-2.5 bg-slate-900/30 rounded-xl border border-white/5">
                    <div className="space-y-0.5">
                      <span className="text-xs font-bold text-white">{nameLabel}</span>
                      {/* Severity selector */}
                      <div className="flex space-x-1.5 pt-0.5">
                        {["Low", "Medium", "Critical"].map((sev) => (
                          <button
                            key={sev}
                            onClick={() => setSeverities(prev => ({ ...prev, [key]: sev }))}
                            className={`text-[8px] font-bold px-1.5 py-0.5 rounded border transition-all ${
                              severities[key] === sev
                                ? "bg-red-500/20 border-red-500/40 text-red-450"
                                : "bg-slate-950 border-white/5 text-slate-500"
                            }`}
                          >
                            {sev}
                          </button>
                        ))}
                      </div>
                    </div>
                    
                    {/* Toggle Slider Switch */}
                    <button
                      onClick={() => handleToggleError(key as any)}
                      className={`w-10 h-6 flex items-center rounded-full p-0.5 transition-colors duration-200 focus:outline-none ${
                        isSwitched ? "bg-red-500" : "bg-slate-800"
                      }`}
                    >
                      <div
                        className={`bg-white w-5 h-5 rounded-full shadow-md transform transition-transform duration-200 ${
                          isSwitched ? "translate-x-4" : "translate-x-0"
                        }`}
                      ></div>
                    </button>
                  </div>
                )
              })}
            </div>

            {/* Error logs */}
            <div className="space-y-2 border-t border-white/5 pt-3">
              <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider block">Injection History</span>
              <div className="space-y-1.5 max-h-[85px] overflow-y-auto">
                {errorLogs.length === 0 ? (
                  <span className="text-[10px] text-slate-500 italic block">No errors logged.</span>
                ) : (
                  errorLogs.map((log) => (
                    <div key={log.id} className="text-[9px] flex justify-between items-center text-slate-400">
                      <span>Injected <strong className="text-red-400">{log.type}</strong> ({log.severity})</span>
                      <span>{log.timestamp}</span>
                    </div>
                  ))
                )}
              </div>
            </div>

          </div>

          {/* Panel 3: MQTT Explorer */}
          <div className="glass-card p-5 rounded-2xl border border-white/5 space-y-4 flex flex-col justify-between">
            
            <div className="flex flex-col space-y-2 border-b border-white/5 pb-3">
              <div className="flex justify-between items-center">
                <h3 className="text-sm font-bold flex items-center space-x-2">
                  <Cpu className="h-4 w-4 text-blue-400" />
                  <span>Live MQTT Explorer</span>
                </h3>
                <div className="flex space-x-1">
                  <button
                    onClick={() => setFeedPaused(!feedPaused)}
                    className="p-1 text-slate-450 hover:text-white"
                    title={feedPaused ? "Resume Feed" : "Pause Feed"}
                  >
                    <Pause className={`h-3.5 w-3.5 ${feedPaused ? "text-amber-500 animate-pulse" : ""}`} />
                  </button>
                  <button
                    onClick={() => { setMessages([]); }}
                    className="p-1 text-slate-450 hover:text-white"
                    title="Clear Logs"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              
              {/* Filter */}
              <div className="relative">
                <Search className="h-3.5 w-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Filter by topic keyword..."
                  value={filterKeyword}
                  onChange={(e) => setFilterKeyword(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg py-1.5 pl-8 pr-4 text-[10px] text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Message Feed List */}
            <div className="flex-1 overflow-y-auto max-h-[220px] space-y-2 pr-1 pt-1 text-[10px]">
              {messages.filter((m) => m.topic.toLowerCase().includes(filterKeyword.toLowerCase())).length === 0 ? (
                <div className="text-center text-slate-550 py-12">No messages listening on refillx/#</div>
              ) : (
                messages
                  .filter((m) => m.topic.toLowerCase().includes(filterKeyword.toLowerCase()))
                  .map((msg) => {
                    const isDispense = msg.topic.includes("dispense")
                    const isAlert = msg.topic.includes("alert")
                    const isCommand = msg.topic.includes("command")
                    
                    let topicColor = "text-slate-400 bg-slate-900/80 border-slate-800"
                    if (isDispense) topicColor = "text-teal-400 bg-teal-950/20 border-teal-900/30"
                    if (isAlert) topicColor = "text-red-400 bg-red-950/20 border-red-900/30"
                    if (isCommand) topicColor = "text-blue-400 bg-blue-950/20 border-blue-900/30"
                    
                    return (
                      <div key={msg.id} className={`p-2 rounded-lg border space-y-1 ${topicColor}`}>
                        <div className="flex justify-between items-center text-[8px] font-bold uppercase">
                          <span className="truncate max-w-[150px]">{msg.topic}</span>
                          <span className="opacity-75">{msg.timestamp}</span>
                        </div>
                        <pre className="text-[9px] font-mono text-slate-300 bg-slate-950/40 p-1.5 rounded overflow-x-auto">
                          {msg.payload}
                        </pre>
                      </div>
                    )
                  })
              )}
              <div ref={explorerEndRef} />
            </div>

            {/* Count Footer */}
            <div className="border-t border-white/5 pt-2 flex justify-between items-center text-[8px] text-slate-500 font-bold uppercase tracking-wider">
              <span>Auto-scroll: {autoScroll ? "Active" : "Paused"}</span>
              <button 
                onClick={() => setAutoScroll(!autoScroll)}
                className="text-blue-400 hover:underline"
              >
                Toggle scroll
              </button>
            </div>

          </div>

        </div>

        {/* Anomaly Detection Alert */}
        <AnimatePresence>
          {anomalyAlert && (
            <motion.div
              initial={{ x: -400, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -400, opacity: 0 }}
              className="bg-gradient-to-r from-red-500/20 via-red-500/10 to-transparent border-2 border-red-500/50 p-4 rounded-2xl flex items-center space-x-3 shadow-lg shadow-red-500/20 animate-pulse"
            >
              <AlertCircle className="h-6 w-6 text-red-400 flex-shrink-0 animate-bounce" />
              <div className="flex-1">
                <p className="text-sm font-bold text-red-300">{anomalyAlert}</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Analytics Dashboard */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          
          {/* Health Score Gauge */}
          <div className="glass-card p-6 rounded-2xl border border-white/5 space-y-4 flex flex-col items-center justify-center">
            <h3 className="text-sm font-bold text-center flex items-center space-x-2">
              <Gauge className="h-4 w-4 text-green-400" />
              <span>Station Health</span>
            </h3>
            <div className="relative w-32 h-32 flex items-center justify-center">
              {/* Outer circle background */}
              <svg className="absolute inset-0 w-full h-full" viewBox="0 0 120 120">
                <circle cx="60" cy="60" r="55" fill="none" stroke="#1e293b" strokeWidth="8" />
                {/* Animated health score arc */}
                <motion.circle
                  cx="60"
                  cy="60"
                  r="55"
                  fill="none"
                  strokeWidth="8"
                  stroke={healthScore >= 75 ? "#10b981" : healthScore >= 50 ? "#f59e0b" : "#ef4444"}
                  strokeDasharray={`${(healthScore / 100) * 345.575} 345.575`}
                  strokeDashoffset={-86.394}
                  strokeLinecap="round"
                  transform="rotate(-90 60 60)"
                  animate={{ strokeDasharray: [`${(healthScore / 100) * 345.575} 345.575`] }}
                  transition={{ duration: 1 }}
                />
              </svg>
              {/* Center text */}
              <div className="text-center z-10">
                <motion.div
                  key={healthScore}
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className={`text-3xl font-extrabold ${
                    healthScore >= 75 ? "text-green-400" : healthScore >= 50 ? "text-amber-400" : "text-red-400"
                  }`}
                >
                  {healthScore}
                </motion.div>
                <p className="text-[10px] text-slate-500 uppercase font-bold mt-1">Score</p>
              </div>
            </div>
            <div className="text-center text-[10px] text-slate-400">
              {healthScore >= 75 ? "🟢 Optimal" : healthScore >= 50 ? "🟡 Fair" : "🔴 Critical"}
            </div>
          </div>

          {/* Real-Time Sensor Charts */}
          <div className="lg:col-span-3 glass-card p-6 rounded-2xl border border-white/5 space-y-4">
            <h3 className="text-sm font-bold flex items-center space-x-2">
              <Activity className="h-4 w-4 text-cyan-400" />
              <span>Real-Time Sensor Trends (Last 30 points)</span>
            </h3>
            
            {/* Four-chart grid with SVG sparklines */}
            <div className="grid grid-cols-2 gap-4">
              {/* Flow Rate Chart */}
              <div className="bg-slate-950/40 p-3 rounded-lg border border-amber-500/20">
                <p className="text-[10px] text-amber-400 font-bold uppercase mb-2">Flow Rate (L/min)</p>
                <svg className="w-full h-16" viewBox="0 0 100 40" preserveAspectRatio="none">
                  <polyline
                    points={telemetry.map((p, i) => `${(i / (telemetry.length - 1 || 1)) * 100},${40 - (p.flowRate / 4) * 40}`).join(" ")}
                    fill="none"
                    stroke="#f59e0b"
                    strokeWidth="1.5"
                    vectorEffect="non-scaling-stroke"
                  />
                  {telemetry.map((p, i) => (
                    <circle
                      key={`flow-${i}`}
                      cx={(i / (telemetry.length - 1 || 1)) * 100}
                      cy={40 - (p.flowRate / 4) * 40}
                      r="1"
                      fill={p.flowRate > 2.5 ? "#ef4444" : "#f59e0b"}
                    />
                  ))}
                </svg>
                <p className="text-[9px] text-slate-400 mt-1">Latest: {currentFlow.toFixed(2)} L/min</p>
              </div>

              {/* Temperature Chart */}
              <div className="bg-slate-950/40 p-3 rounded-lg border border-blue-500/20">
                <p className="text-[10px] text-blue-400 font-bold uppercase mb-2">Temperature (°C)</p>
                <svg className="w-full h-16" viewBox="0 0 100 40" preserveAspectRatio="none">
                  <polyline
                    points={telemetry.map((p, i) => `${(i / (telemetry.length - 1 || 1)) * 100},${40 - ((p.temperature - 15) / 20) * 40}`).join(" ")}
                    fill="none"
                    stroke="#3b82f6"
                    strokeWidth="1.5"
                    vectorEffect="non-scaling-stroke"
                  />
                  {telemetry.map((p, i) => (
                    <circle
                      key={`temp-${i}`}
                      cx={(i / (telemetry.length - 1 || 1)) * 100}
                      cy={40 - ((p.temperature - 15) / 20) * 40}
                      r="1"
                      fill="#3b82f6"
                    />
                  ))}
                </svg>
                <p className="text-[9px] text-slate-400 mt-1">Latest: {currentTemp.toFixed(1)}°C</p>
              </div>

              {/* Tank Level Chart */}
              <div className="bg-slate-950/40 p-3 rounded-lg border border-emerald-500/20">
                <p className="text-[10px] text-emerald-400 font-bold uppercase mb-2">Tank Level (%)</p>
                <svg className="w-full h-16" viewBox="0 0 100 40" preserveAspectRatio="none">
                  <polyline
                    points={telemetry.map((p, i) => `${(i / (telemetry.length - 1 || 1)) * 100},${40 - (p.tankLevel / 100) * 40}`).join(" ")}
                    fill="none"
                    stroke="#10b981"
                    strokeWidth="1.5"
                    vectorEffect="non-scaling-stroke"
                  />
                  {telemetry.map((p, i) => (
                    <circle
                      key={`tank-${i}`}
                      cx={(i / (telemetry.length - 1 || 1)) * 100}
                      cy={40 - (p.tankLevel / 100) * 40}
                      r="1"
                      fill="#10b981"
                    />
                  ))}
                </svg>
                <p className="text-[9px] text-slate-400 mt-1">Latest: {currentTankLevel.toFixed(0)}%</p>
              </div>

              {/* TDS Chart */}
              <div className="bg-slate-950/40 p-3 rounded-lg border border-teal-500/20">
                <p className="text-[10px] text-teal-400 font-bold uppercase mb-2">TDS (ppm)</p>
                <svg className="w-full h-16" viewBox="0 0 100 40" preserveAspectRatio="none">
                  <polyline
                    points={telemetry.map((p, i) => `${(i / (telemetry.length - 1 || 1)) * 100},${40 - (p.tds / 250) * 40}`).join(" ")}
                    fill="none"
                    stroke="#14b8a6"
                    strokeWidth="1.5"
                    vectorEffect="non-scaling-stroke"
                  />
                  {telemetry.map((p, i) => (
                    <circle
                      key={`tds-${i}`}
                      cx={(i / (telemetry.length - 1 || 1)) * 100}
                      cy={40 - (p.tds / 250) * 40}
                      r="1"
                      fill={p.tds > 200 ? "#ef4444" : "#14b8a6"}
                    />
                  ))}
                </svg>
                <p className="text-[9px] text-slate-400 mt-1">Latest: {currentTds.toFixed(0)} ppm</p>
              </div>
            </div>
          </div>
        </div>

        {/* Dispense Accuracy & Export Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          
          {/* Dispense Accuracy Meter */}
          <div className="glass-card p-6 rounded-2xl border border-white/5 space-y-4">
            <h3 className="text-sm font-bold flex items-center space-x-2">
              <CheckCircle className="h-4 w-4 text-emerald-400" />
              <span>Dispense Accuracy</span>
            </h3>
            
            {totalVolume === 0 ? (
              <div className="text-center py-8 text-slate-500">
                <p className="text-sm">Run a dispense to see accuracy metrics</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-400">Delivered vs Target:</span>
                  <span className="text-lg font-bold text-emerald-400">{totalVolume}ml / {targetVolume}ml</span>
                </div>

                {/* Progress bar */}
                <div className="bg-slate-950/40 p-4 rounded-lg border border-emerald-500/20">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] uppercase font-bold text-slate-500">Accuracy</span>
                    <motion.span
                      key={Math.round((totalVolume / targetVolume) * 100)}
                      initial={{ scale: 0.8 }}
                      animate={{ scale: 1 }}
                      className="text-sm font-extrabold text-emerald-400"
                    >
                      {Math.round((totalVolume / targetVolume) * 100)}%
                    </motion.span>
                  </div>
                  <div className="w-full bg-slate-900 rounded-full h-3 overflow-hidden border border-emerald-500/20">
                    <motion.div
                      className="h-full bg-gradient-to-r from-emerald-400 to-teal-400 rounded-full"
                      initial={{ width: "0%" }}
                      animate={{ width: `${Math.min(100, (totalVolume / targetVolume) * 100)}%` }}
                      transition={{ duration: 0.5 }}
                    />
                  </div>

                  {/* Deviation info */}
                  <div className="mt-3 p-2 bg-slate-900/60 rounded-lg">
                    <p className="text-[9px] text-slate-400">
                      <strong>Deviation:</strong> {Math.abs(targetVolume - totalVolume)}ml ({Math.abs(Math.round((totalVolume / targetVolume) * 100) - 100).toFixed(1)}% {totalVolume > targetVolume ? "over" : "under"})
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Export & Session Summary */}
          <div className="glass-card p-6 rounded-2xl border border-white/5 space-y-4">
            <h3 className="text-sm font-bold flex items-center space-x-2">
              <Download className="h-4 w-4 text-blue-400" />
              <span>Session Export</span>
            </h3>

            <div className="space-y-3">
              <div className="bg-slate-950/40 p-4 rounded-lg border border-white/5 space-y-2">
                <p className="text-[10px] uppercase font-bold text-slate-500">Session Summary</p>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-slate-500">Data Points:</span>
                    <p className="font-bold text-cyan-400">{sessionLog.length}</p>
                  </div>
                  <div>
                    <span className="text-slate-500">Duration:</span>
                    <p className="font-bold text-cyan-400">{(sessionLog.length * 0.5).toFixed(1)}s</p>
                  </div>
                  <div>
                    <span className="text-slate-500">Avg Flow Rate:</span>
                    <p className="font-bold text-amber-400">
                      {sessionLog.length > 0 
                        ? (sessionLog.reduce((sum, p) => sum + p.flowRate, 0) / sessionLog.length).toFixed(2)
                        : "0.00"} L/min
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-500">Avg Temp:</span>
                    <p className="font-bold text-blue-400">
                      {sessionLog.length > 0
                        ? (sessionLog.reduce((sum, p) => sum + p.temperature, 0) / sessionLog.length).toFixed(1)
                        : "0.0"}°C
                    </p>
                  </div>
                </div>
              </div>

              <button
                onClick={handleExportCSV}
                className="w-full py-3 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-bold rounded-xl text-sm transition-all shadow-lg active:scale-95 flex items-center justify-center space-x-2"
              >
                <Download className="h-4 w-4" />
                <span>Export Session as CSV</span>
              </button>

              <p className="text-[9px] text-slate-500 text-center italic">
                Download full telemetry data with all sensor readings for offline analysis
              </p>
            </div>
          </div>
        </div>

      </main>
    </div>
  )
}
