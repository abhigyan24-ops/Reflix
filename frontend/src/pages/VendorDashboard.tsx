import { useState, useEffect } from "react"
import Navbar from "../components/Navbar"
import { db } from "../lib/firebase"
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  limit,
  doc,
  setDoc,
  deleteDoc,
  writeBatch
} from "firebase/firestore"
import mqtt from "mqtt"
import {
  LayoutDashboard,
  Server,
  Receipt,
  BrainCircuit,
  Leaf,
  AlertTriangle,
  Play,
  Square,
  RotateCcw,
  FileText,
  Download,
  TrendingUp,
  Sparkles,
  Users,
  Thermometer,
  Droplet,
  RefreshCw,
  Search,
  CheckCircle,
  Plus,
  Trash2,
  Cpu
} from "lucide-react"
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  LineChart,
  Line,
  CartesianGrid,
  PieChart,
  Pie,
  Cell
} from "recharts"
import { toast, Toaster } from "react-hot-toast"

interface Dispenser {
  id: string
  location: string
  stockLevel: number
  capacity: number
  temperature: number
  status: string
  pricePerLitre: number
  productType: string
}

interface Alert {
  id: string
  type: string
  machineId: string
  location: string
  timestamp: any
}

interface Transaction {
  id: string
  uid: string
  machineId: string
  volume: string
  cost: number
  location: string
  timestamp: any
  receiptUrl: string
  ecoPointsEarned?: number
  status?: string
  type?: string
  method?: string
}

interface Forecast {
  id: string
  nextRefillAt: string
  predictedDemand: number[]
  updatedAt: any
}

interface UserProfile {
  id: string
  name: string
  phone: string
  walletBalance: number
  ecoPoints: number
  tier: string
}

const PIE_COLORS = ["#06b6d4", "#3b82f6", "#10b981", "#f59e0b"]

export default function VendorDashboard() {
  const [activeTab, setActiveTab] = useState<"overview" | "dispensers" | "transactions" | "ai" | "eco">("overview")
  const [dispensers, setDispensers] = useState<Dispenser[]>([])
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [forecasts, setForecasts] = useState<Forecast[]>([])
  const [topSaviors, setTopSaviors] = useState<UserProfile[]>([])

  // MQTT Connection state
  const [mqttClient, setMqttClient] = useState<mqtt.MqttClient | null>(null)
  const [mqttConnected, setMqttConnected] = useState<boolean>(false)

  // Fleet controls & creation panel
  const [expandedDispenser, setExpandedDispenser] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState<boolean>(false)
  const [newDispId, setNewDispId] = useState("")
  const [newDispLocation, setNewDispLocation] = useState("")
  const [newDispProduct, setNewDispProduct] = useState("Purified Water")
  const [newDispStock, setNewDispStock] = useState(100)
  const [newDispCapacity, setNewDispCapacity] = useState(120)
  const [newDispPrice, setNewDispPrice] = useState(30)
  const [newDispTemp, setNewDispTemp] = useState(18.5)

  // Filtering / Search states
  const [txnSearch, setTxnSearch] = useState("")
  const [txnTypeFilter, setTxnTypeFilter] = useState<"all" | "dispense" | "deposit">("all")
  const [selectedForecastDisp, setSelectedForecastDisp] = useState<string>("")
  const [aiSyncing, setAiSyncing] = useState(false)

  // --- MQTT WebSockets Client Setup ---
  useEffect(() => {
    const client = mqtt.connect("wss://broker.emqx.io:8084/mqtt", {
      keepalive: 60,
      reconnectPeriod: 5000,
    })

    client.on("connect", () => {
      setMqttConnected(true)
      setMqttClient(client)
    })

    client.on("close", () => {
      setMqttConnected(false)
    })

    client.on("error", (err) => {
      console.error("MQTT connection error:", err)
      setMqttConnected(false)
    })

    return () => {
      client.end()
    }
  }, [])

  // --- Firestore Live Subscriptions ---
  useEffect(() => {
    // 1. Listen to dispensers
    const unsubDispensers = onSnapshot(collection(db, "dispensers"), (snap) => {
      const list: Dispenser[] = []
      snap.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() } as Dispenser)
      })
      setDispensers(list)
      // Pick first dispenser default for AI view if not set
      if (list.length > 0 && !selectedForecastDisp) {
        setSelectedForecastDisp(list[0].id)
      }
    }, (err) => console.error("Error listening to dispensers:", err))

    // 2. Listen to alerts
    const qAlerts = query(collection(db, "alerts"), orderBy("timestamp", "desc"), limit(20))
    const unsubAlerts = onSnapshot(qAlerts, (snap) => {
      const list: Alert[] = []
      snap.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() } as Alert)
      })
      setAlerts(list)
    }, (err) => console.error("Error listening to alerts:", err))

    // 3. Listen to transactions
    const qTxns = query(collection(db, "transactions"), orderBy("timestamp", "desc"), limit(100))
    const unsubTxns = onSnapshot(qTxns, (snap) => {
      const list: Transaction[] = []
      snap.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() } as Transaction)
      })
      setTransactions(list)
    }, (err) => console.error("Error listening to transactions:", err))

    // 4. Listen to forecasts
    const unsubForecasts = onSnapshot(collection(db, "forecasts"), (snap) => {
      const list: Forecast[] = []
      snap.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() } as Forecast)
      })
      setForecasts(list)
    }, (err) => console.error("Error listening to forecasts:", err))

    // 5. Listen to top saviors (top 10 users ranked by ecoPoints)
    const qSaviors = query(collection(db, "users"), orderBy("ecoPoints", "desc"), limit(10))
    const unsubSaviors = onSnapshot(qSaviors, (snap) => {
      const list: UserProfile[] = []
      snap.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() } as UserProfile)
      })
      setTopSaviors(list)
    }, (err) => console.error("Error listening to users:", err))

    return () => {
      unsubDispensers()
      unsubAlerts()
      unsubTxns()
      unsubForecasts()
      unsubSaviors()
    }
  }, [selectedForecastDisp])

  // --- Seeder Database Utility (3A.1 support) ---
  const seedDemoDatabase = async () => {
    try {
      const batch = writeBatch(db)

      const fleet = [
        {
          id: "sim-001",
          location: "Metro Station Gate 2",
          stockLevel: 62.4,
          capacity: 100,
          temperature: 18.2,
          status: "Active",
          pricePerLitre: 30,
          productType: "Purified Alkaline Water",
        },
        {
          id: "sim-002",
          location: "Central Tech Park",
          stockLevel: 10.8,
          capacity: 100,
          temperature: 20.5,
          status: "low_stock",
          pricePerLitre: 40,
          productType: "Mineral Spring Water",
        },
        {
          id: "sim-003",
          location: "Downtown Shopping Mall",
          stockLevel: 85.0,
          capacity: 120,
          temperature: 17.5,
          status: "Active",
          pricePerLitre: 25,
          productType: "Infused Lemon Water",
        }
      ]

      fleet.forEach((d) => {
        const dRef = doc(db, "dispensers", d.id)
        batch.set(dRef, {
          location: d.location,
          stockLevel: d.stockLevel,
          capacity: d.capacity,
          temperature: d.temperature,
          status: d.status,
          pricePerLitre: d.pricePerLitre,
          productType: d.productType
        })

        // Initial Forecast
        const fRef = doc(db, "forecasts", d.id)
        batch.set(fRef, {
          nextRefillAt: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString(),
          predictedDemand: [12.5, 14.2, 11.8, 15.0, 16.5, 18.0, 13.9],
          updatedAt: new Date()
        })
      })

      // Active Alert
      const alertRef = doc(collection(db, "alerts"))
      batch.set(alertRef, {
        type: "low_stock",
        machineId: "sim-002",
        location: "Central Tech Park",
        timestamp: new Date()
      })

      // Add a test user if none exists
      const testUserRef = doc(db, "users", "usr_test_savior")
      batch.set(testUserRef, {
        name: "Abhigyan Savior",
        phone: "+91 9876543210",
        walletBalance: 250,
        ecoPoints: 420,
        tier: "Eco-Hero",
        createdAt: new Date()
      })

      // Add couple of transactions
      const txn1Ref = doc(db, "transactions", "txn_seeding_1")
      batch.set(txn1Ref, {
        uid: "usr_test_savior",
        machineId: "sim-001",
        volume: "500 ml",
        cost: 15.0,
        productType: "Purified Alkaline Water",
        location: "Metro Station Gate 2",
        timestamp: new Date(Date.now() - 4 * 3600000),
        receiptUrl: "https://refillx-smart.appspot.com/receipts/dummy.pdf",
        ecoPointsEarned: 5,
        status: "complete"
      })

      const txn2Ref = doc(db, "transactions", "txn_seeding_2")
      batch.set(txn2Ref, {
        uid: "usr_test_savior",
        machineId: "sim-003",
        volume: "1000 ml",
        cost: 25.0,
        productType: "Infused Lemon Water",
        location: "Downtown Shopping Mall",
        timestamp: new Date(Date.now() - 24 * 3600000),
        receiptUrl: "https://refillx-smart.appspot.com/receipts/dummy.pdf",
        ecoPointsEarned: 10,
        status: "complete"
      })

      await batch.commit()
      toast.success("Telemetry Database seeded successfully!")
    } catch (err: any) {
      toast.error(`Database seeding failed: ${err.message}`)
    }
  }

  // --- MQTT Remote Commands Publisher ---
  const publishMqttCommand = (machineId: string, action: string, valAmount?: number) => {
    if (!mqttClient || !mqttConnected) {
      toast.error("MQTT Broker disconnected. Remote actions offline.")
      return
    }

    const topic = `refillx/dispensers/${machineId}/command`
    let payload: any = { action }
    if (action === "open") {
      payload = {
        action: "open",
        uid: "admin_override",
        amount: valAmount || 1000
      }
    }

    mqttClient.publish(topic, JSON.stringify(payload), { qos: 1 }, (err) => {
      if (err) {
        toast.error(`MQTT command failed: ${err.message}`)
      } else {
        toast.success(`Published '${action.toUpperCase()}' override to ${machineId}`)
      }
    })
  }

  // --- Create Dispenser fleet node ---
  const handleCreateDispenser = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newDispId.trim() || !newDispLocation.trim()) {
      toast.error("Please fill in Machine ID and Location.")
      return
    }

    try {
      await setDoc(doc(db, "dispensers", newDispId.trim()), {
        location: newDispLocation.trim(),
        stockLevel: Number(newDispStock),
        capacity: Number(newDispCapacity),
        temperature: Number(newDispTemp),
        status: "Active",
        pricePerLitre: Number(newDispPrice),
        productType: newDispProduct
      })

      // Add dummy AI forecast
      await setDoc(doc(db, "forecasts", newDispId.trim()), {
        nextRefillAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
        predictedDemand: [10, 12, 11, 14, 15, 13, 12],
        updatedAt: new Date()
      })

      toast.success(`Dispenser ${newDispId} registered successfully!`)
      setShowAddForm(false)
      setNewDispId("")
      setNewDispLocation("")
    } catch (err: any) {
      toast.error(`Failed to register dispenser: ${err.message}`)
    }
  }

  // --- Delete Dispenser fleet node ---
  const handleDeleteDispenser = async (id: string) => {
    if (!confirm(`Are you sure you want to remove dispenser ${id}?`)) return
    try {
      await deleteDoc(doc(db, "dispensers", id))
      await deleteDoc(doc(db, "forecasts", id))
      toast.success(`Dispenser ${id} removed.`)
    } catch (err: any) {
      toast.error(`Delete failed: ${err.message}`)
    }
  }

  // --- Dismiss Alert document ---
  const handleDismissAlert = async (alertId: string) => {
    try {
      await deleteDoc(doc(db, "alerts", alertId))
      toast.success("Alert dismissed.")
    } catch (err: any) {
      toast.error(`Dismiss failed: ${err.message}`)
    }
  }

  // --- Triggers mock AI forecast retrain ---
  const triggerAISync = async () => {
    setAiSyncing(true)
    setTimeout(async () => {
      try {
        for (const disp of dispensers) {
          const fRef = doc(db, "forecasts", disp.id)
          // Randomize forecast
          const predictions = Array.from({ length: 7 }, () => Math.round((Math.random() * 15 + 8) * 10) / 10)
          await setDoc(fRef, {
            nextRefillAt: new Date(Date.now() + (Math.random() * 8 + 2) * 24 * 60 * 60 * 1000).toISOString(),
            predictedDemand: predictions,
            updatedAt: new Date()
          })
        }
        toast.success("ARIMA & Demand forecast retrained successfully.")
      } catch (e: any) {
        toast.error("AI Sync failed: " + e.message)
      } finally {
        setAiSyncing(false)
      }
    }, 1500)
  }

  // --- Export Visible Transactions to CSV ---
  const exportToCSV = () => {
    const headers = ["Txn ID", "Type", "Timestamp", "User ID", "Dispenser ID", "Location", "Dispensed", "Revenue (INR)"]
    const rows = filteredTxns.map((t) => [
      t.id,
      t.type === "credit" ? "Deposit" : "Dispense",
      t.timestamp?.toMillis ? new Date(t.timestamp.toMillis()).toLocaleString() : new Date().toLocaleString(),
      t.uid,
      t.machineId,
      t.location,
      t.volume,
      t.cost.toFixed(2)
    ])

    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(","), ...rows.map(e => e.map(val => `"${val}"`).join(","))].join("\n")

    const encodedUri = encodeURI(csvContent)
    const link = document.createElement("a")
    link.setAttribute("href", encodedUri)
    link.setAttribute("download", `refillx-transactions-${Date.now()}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    toast.success("CSV file downloaded!")
  }

  // --- Computations for Metrics ---
  const totalVolumeL = transactions
    .filter((t) => t.type !== "credit" && t.volume)
    .reduce((acc, curr) => {
      const num = parseFloat(curr.volume.replace(/[^\d.]/g, ""))
      return acc + (isNaN(num) ? 0 : num)
    }, 0) / 1000.0

  const totalRevenue = transactions.reduce((acc, curr) => acc + (curr.cost || 0), 0)

  const activeDispensersCount = dispensers.length
  const lowStockCount = dispensers.filter(d => d.stockLevel < 15 || d.status === "low_stock").length
  const activeAlertsCount = alerts.length

  // Filtered transactions for Page 3
  const filteredTxns = transactions.filter((t) => {
    const isMatchSearch = 
      t.uid.toLowerCase().includes(txnSearch.toLowerCase()) || 
      t.machineId.toLowerCase().includes(txnSearch.toLowerCase()) ||
      t.id.toLowerCase().includes(txnSearch.toLowerCase()) ||
      (t.location && t.location.toLowerCase().includes(txnSearch.toLowerCase()))

    if (!isMatchSearch) return false

    if (txnTypeFilter === "dispense") return t.type !== "credit"
    if (txnTypeFilter === "deposit") return t.type === "credit"
    return true
  })

  // Group transactions by day for Overview chart
  const getChartData = () => {
    // If no transactions exist, load mock charts that look beautiful
    if (transactions.length === 0) {
      return [
        { name: "Mon", volume: 15.2, revenue: 456 },
        { name: "Tue", volume: 22.4, revenue: 672 },
        { name: "Wed", volume: 18.9, revenue: 567 },
        { name: "Thu", volume: 30.1, revenue: 903 },
        { name: "Fri", volume: 32.5, revenue: 975 },
        { name: "Sat", volume: 45.8, revenue: 1374 },
        { name: "Sun", volume: 55.0, revenue: 1650 },
      ]
    }

    // Dynamic grouping of last 7 days from transactions
    const groups: Record<string, { volume: number; revenue: number }> = {}
    const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
    
    // Seed groups with last 7 days so they show in order
    for (let i = 6; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      groups[weekdays[d.getDay()]] = { volume: 0, revenue: 0 }
    }

    transactions.forEach((t) => {
      if (!t.timestamp) return
      const date = t.timestamp.toMillis ? new Date(t.timestamp.toMillis()) : new Date()
      const dayName = weekdays[date.getDay()]
      if (groups[dayName] !== undefined) {
        if (t.type !== "credit" && t.volume) {
          const ml = parseFloat(t.volume.replace(/[^\d.]/g, ""))
          if (!isNaN(ml)) groups[dayName].volume += ml / 1000.0
        }
        groups[dayName].revenue += t.cost || 0
      }
    })

    return Object.keys(groups).map((day) => ({
      name: day,
      volume: Math.round(groups[day].volume * 10) / 10,
      revenue: Math.round(groups[day].revenue)
    }))
  }

  const chartData = getChartData()

  // Selected forecast dispenser calculations
  const activeForecast = forecasts.find(f => f.id === selectedForecastDisp)
  const currentDispenserObject = dispensers.find(d => d.id === selectedForecastDisp)
  
  // Calculate if dispenser is at risk (predicted demand for next 2 days > current stock)
  const next2DayDemand = activeForecast?.predictedDemand ? activeForecast.predictedDemand.slice(0, 2).reduce((a,b)=>a+b, 0) : 0
  const isStockoutRisk = currentDispenserObject && currentDispenserObject.stockLevel < next2DayDemand

  // Customer segmentation calculations (Mocked representation based on topSaviors/Mock values)
  const pieData = [
    { name: "Champion", value: topSaviors.filter(u => u.tier === "Champion").length || 3 },
    { name: "Eco-Hero", value: topSaviors.filter(u => u.tier === "Eco-Hero").length || 5 },
    { name: "Regular", value: topSaviors.filter(u => u.tier === "Regular").length || 8 },
    { name: "Occasional", value: topSaviors.filter(u => u.tier === "Occasional" || !u.tier).length || 12 },
  ]

  // Render main content based on tab
  return (
    <div className="min-h-screen bg-slate-950 text-white font-sans md:pl-64">
      <Toaster position="top-right" />
      <Navbar />

      <div className="flex flex-col lg:flex-row min-h-[calc(100vh-64px)]">
        {/* Sidebar Navigation */}
        <aside className="w-full lg:w-64 bg-slate-900/60 border-r border-white/5 p-6 flex flex-col space-y-8">
          <div>
            <div className="flex items-center space-x-2 px-2">
              <Cpu className="h-6 w-6 text-cyan-400" />
              <span className="text-lg font-bold tracking-wider bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 to-blue-400">
                Vendor Console
              </span>
            </div>
            <p className="text-slate-500 text-[10px] uppercase tracking-widest mt-2 px-2">Fleet Management</p>
          </div>

          <nav className="flex flex-col space-y-1">
            <button
              onClick={() => setActiveTab("overview")}
              className={`flex items-center space-x-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                activeTab === "overview"
                  ? "bg-gradient-to-r from-cyan-500/20 to-blue-500/10 text-cyan-400 border-l-2 border-cyan-400"
                  : "text-slate-400 hover:bg-white/5 hover:text-white"
              }`}
            >
              <LayoutDashboard className="h-4 w-4" />
              <span>Overview</span>
            </button>

            <button
              onClick={() => setActiveTab("dispensers")}
              className={`flex items-center space-x-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                activeTab === "dispensers"
                  ? "bg-gradient-to-r from-cyan-500/20 to-blue-500/10 text-cyan-400 border-l-2 border-cyan-400"
                  : "text-slate-400 hover:bg-white/5 hover:text-white"
              }`}
            >
              <Server className="h-4 w-4" />
              <span>Dispensers</span>
            </button>

            <button
              onClick={() => setActiveTab("transactions")}
              className={`flex items-center space-x-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                activeTab === "transactions"
                  ? "bg-gradient-to-r from-cyan-500/20 to-blue-500/10 text-cyan-400 border-l-2 border-cyan-400"
                  : "text-slate-400 hover:bg-white/5 hover:text-white"
              }`}
            >
              <Receipt className="h-4 w-4" />
              <span>Transactions</span>
            </button>

            <button
              onClick={() => setActiveTab("ai")}
              className={`flex items-center space-x-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                activeTab === "ai"
                  ? "bg-gradient-to-r from-cyan-500/20 to-blue-500/10 text-cyan-400 border-l-2 border-cyan-400"
                  : "text-slate-400 hover:bg-white/5 hover:text-white"
              }`}
            >
              <BrainCircuit className="h-4 w-4" />
              <span>AI Insights</span>
            </button>

            <button
              onClick={() => setActiveTab("eco")}
              className={`flex items-center space-x-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                activeTab === "eco"
                  ? "bg-gradient-to-r from-cyan-500/20 to-blue-500/10 text-cyan-400 border-l-2 border-cyan-400"
                  : "text-slate-400 hover:bg-white/5 hover:text-white"
              }`}
            >
              <Leaf className="h-4 w-4" />
              <span>Eco Impact</span>
            </button>
          </nav>

          <div className="pt-8 border-t border-white/5 flex flex-col space-y-4">
            <div className="flex items-center justify-between text-xs text-slate-400 px-2">
              <span>MQTT Link</span>
              <span className="flex items-center space-x-1.5">
                <span className={`h-2 w-2 rounded-full ${mqttConnected ? "bg-emerald-500 animate-pulse" : "bg-red-500"}`}></span>
                <span className={mqttConnected ? "text-emerald-400" : "text-red-400"}>
                  {mqttConnected ? "Online" : "Offline"}
                </span>
              </span>
            </div>

            {dispensers.length === 0 && (
              <button
                onClick={seedDemoDatabase}
                className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold flex items-center justify-center space-x-1 transition-all"
              >
                <RefreshCw className="h-3 w-3" />
                <span>Seed Demo Fleet</span>
              </button>
            )}
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 p-6 lg:p-10 overflow-y-auto space-y-8 max-w-7xl mx-auto w-full">
          {/* Top Info Bar */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-white/5 pb-6">
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white via-slate-100 to-slate-400">
                {activeTab.toUpperCase()} OVERVIEW
              </h1>
              <p className="text-slate-400 text-xs mt-1">Smart Refill Infrastructure telemetry & monitoring</p>
            </div>
            
            <div className="flex items-center space-x-3">
              {dispensers.length > 0 && (
                <button
                  onClick={seedDemoDatabase}
                  className="px-3 py-1.5 bg-slate-900 border border-white/10 hover:bg-slate-800 rounded-lg text-xs text-slate-300 flex items-center space-x-1 transition-all"
                  title="Overwrite/Restock dummy telemetry"
                >
                  <RefreshCw className="h-3 w-3" />
                  <span>Sync/Seed Data</span>
                </button>
              )}
              <span className="text-xs font-mono text-slate-500">Broker: broker.emqx.io</span>
            </div>
          </div>

          {/* PAGE 1: OVERVIEW */}
          {activeTab === "overview" && (
            <div className="space-y-8 animate-fadeIn">
              {/* Telemetry Stat Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="glass-card p-6 rounded-2xl border border-white/5 flex items-center justify-between shadow-2xl relative overflow-hidden group">
                  <div className="absolute top-0 left-0 h-1 w-full bg-gradient-to-r from-cyan-400 to-blue-500" />
                  <div className="space-y-2">
                    <span className="text-xs text-slate-400 uppercase font-semibold">Active Fleet</span>
                    <h3 className="text-3xl font-black">{activeDispensersCount} Nodes</h3>
                    <p className="text-[10px] text-slate-500">Dispensers registered online</p>
                  </div>
                  <div className="bg-cyan-500/10 p-3.5 rounded-xl border border-cyan-500/20 text-cyan-400">
                    <Server className="h-6 w-6" />
                  </div>
                </div>

                <div className="glass-card p-6 rounded-2xl border border-white/5 flex items-center justify-between shadow-2xl relative overflow-hidden">
                  <div className="absolute top-0 left-0 h-1 w-full bg-gradient-to-r from-amber-500 to-red-500" />
                  <div className="space-y-2">
                    <span className="text-xs text-slate-400 uppercase font-semibold">Low Stock Warn</span>
                    <h3 className="text-3xl font-black text-amber-400">{lowStockCount} Stations</h3>
                    <p className="text-[10px] text-slate-500">Capacity below 15%</p>
                  </div>
                  <div className={`p-3.5 rounded-xl border ${lowStockCount > 0 ? "bg-amber-500/15 border-amber-500/30 text-amber-400 animate-pulse" : "bg-slate-900 border-white/5 text-slate-500"}`}>
                    <AlertTriangle className="h-6 w-6" />
                  </div>
                </div>

                <div className="glass-card p-6 rounded-2xl border border-white/5 flex items-center justify-between shadow-2xl relative overflow-hidden">
                  <div className="absolute top-0 left-0 h-1 w-full bg-gradient-to-r from-blue-400 to-emerald-400" />
                  <div className="space-y-2">
                    <span className="text-xs text-slate-400 uppercase font-semibold">Total Dispensed</span>
                    <h3 className="text-3xl font-black">{totalVolumeL.toFixed(1)} Litres</h3>
                    <p className="text-[10px] text-slate-500">Ecological savings volume</p>
                  </div>
                  <div className="bg-blue-500/10 p-3.5 rounded-xl border border-blue-500/20 text-blue-400">
                    <Droplet className="h-6 w-6" />
                  </div>
                </div>

                <div className="glass-card p-6 rounded-2xl border border-white/5 flex items-center justify-between shadow-2xl relative overflow-hidden">
                  <div className="absolute top-0 left-0 h-1 w-full bg-gradient-to-r from-emerald-400 to-teal-500" />
                  <div className="space-y-2">
                    <span className="text-xs text-slate-400 uppercase font-semibold">Consolidated Rev</span>
                    <h3 className="text-3xl font-black text-emerald-400">₹{totalRevenue.toFixed(2)}</h3>
                    <p className="text-[10px] text-slate-500">Total processed revenue</p>
                  </div>
                  <div className="bg-emerald-500/10 p-3.5 rounded-xl border border-emerald-500/20 text-emerald-400">
                    <TrendingUp className="h-6 w-6" />
                  </div>
                </div>
              </div>

              {/* Charts Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Rolling Volume Bar Chart */}
                <div className="lg:col-span-2 glass-card p-6 rounded-2xl border border-white/5 space-y-4 shadow-2xl">
                  <div className="flex justify-between items-center">
                    <div>
                      <h3 className="text-base font-bold flex items-center space-x-2">
                        <Droplet className="h-5 w-5 text-cyan-400" />
                        <span>Daily Dispensed Volume (Litres)</span>
                      </h3>
                      <p className="text-xs text-slate-500">Refill volumes recorded over the last 7 calendar days</p>
                    </div>
                  </div>
                  <div className="h-72 w-full pt-4">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                        <XAxis dataKey="name" stroke="#64748b" fontSize={11} tickLine={false} />
                        <YAxis stroke="#64748b" fontSize={11} tickLine={false} />
                        <Tooltip
                          contentStyle={{ background: "#0f172a", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "12px" }}
                          labelStyle={{ color: "#94a3b8", fontWeight: "bold" }}
                        />
                        <Bar dataKey="volume" fill="url(#colorVolume)" radius={[6, 6, 0, 0]}>
                          <defs>
                            <linearGradient id="colorVolume" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.8}/>
                              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.2}/>
                            </linearGradient>
                          </defs>
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Live Event Ticker */}
                <div className="glass-card p-6 rounded-2xl border border-white/5 space-y-4 shadow-2xl flex flex-col max-h-[360px]">
                  <h3 className="text-base font-bold flex items-center space-x-2 text-red-400 border-b border-white/5 pb-3">
                    <AlertTriangle className="h-5 w-5 animate-pulse" />
                    <span>Real-time Ticker ({activeAlertsCount})</span>
                  </h3>

                  <div className="flex-1 overflow-y-auto space-y-3 pr-2 scrollbar-thin scrollbar-thumb-slate-800">
                    {alerts.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-slate-500 py-12 text-center">
                        <CheckCircle className="h-8 w-8 text-emerald-500/40 mb-2" />
                        <p className="text-xs font-semibold">Fleet Healthy</p>
                        <p className="text-[10px] text-slate-600">No active alerts recorded.</p>
                      </div>
                    ) : (
                      alerts.map((alert) => (
                        <div
                          key={alert.id}
                          className={`p-3 rounded-xl border text-xs flex justify-between items-start transition-all duration-300 ${
                            alert.type === "tamper" || alert.type === "valve_jam"
                              ? "bg-red-500/10 border-red-500/20 text-red-300"
                              : "bg-amber-500/10 border-amber-500/20 text-amber-300"
                          }`}
                        >
                          <div className="space-y-1 pr-2">
                            <div className="flex items-center space-x-1.5 font-bold uppercase tracking-wider text-[10px]">
                              <span>{alert.type}</span>
                              <span className="text-[9px] opacity-60">·</span>
                              <span className="opacity-80 text-white font-mono">{alert.machineId}</span>
                            </div>
                            <p className="opacity-90">{alert.location}</p>
                            <span className="text-[9px] opacity-60 block">
                              {alert.timestamp?.toMillis ? new Date(alert.timestamp.toMillis()).toLocaleTimeString() : "Just now"}
                            </span>
                          </div>
                          <button
                            onClick={() => handleDismissAlert(alert.id)}
                            className="text-slate-500 hover:text-white p-1 hover:bg-white/5 rounded-lg transition-all"
                            title="Resolve Event"
                          >
                            <CheckCircle className="h-4 w-4 text-emerald-400" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* Revenue Flow Chart */}
              <div className="glass-card p-6 rounded-2xl border border-white/5 space-y-4 shadow-2xl">
                <div>
                  <h3 className="text-base font-bold flex items-center space-x-2">
                    <TrendingUp className="h-5 w-5 text-emerald-400" />
                    <span>Fleet Revenue Flow (INR)</span>
                  </h3>
                  <p className="text-xs text-slate-500">Gross revenue trend across all transaction sessions</p>
                </div>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                      <XAxis dataKey="name" stroke="#64748b" fontSize={11} tickLine={false} />
                      <YAxis stroke="#64748b" fontSize={11} tickLine={false} />
                      <Tooltip
                        contentStyle={{ background: "#0f172a", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "12px" }}
                        labelStyle={{ color: "#94a3b8", fontWeight: "bold" }}
                      />
                      <Line
                        type="monotone"
                        dataKey="revenue"
                        stroke="#10b981"
                        strokeWidth={3}
                        dot={{ fill: "#10b981", strokeWidth: 2, r: 4 }}
                        activeDot={{ r: 6 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}

          {/* PAGE 2: DISPENSERS */}
          {activeTab === "dispensers" && (
            <div className="space-y-8 animate-fadeIn">
              {/* Register Form Header */}
              <div className="flex justify-between items-center">
                <h3 className="text-base font-bold flex items-center space-x-2">
                  <Server className="h-5 w-5 text-cyan-400" />
                  <span>Dispenser Node Registry</span>
                </h3>
                <button
                  onClick={() => setShowAddForm(!showAddForm)}
                  className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white rounded-xl text-xs font-bold flex items-center space-x-1.5 transition-all shadow-lg"
                >
                  <Plus className="h-4 w-4" />
                  <span>{showAddForm ? "Cancel Registration" : "Register Dispenser"}</span>
                </button>
              </div>

              {/* Register Dispenser Inline Form */}
              {showAddForm && (
                <form onSubmit={handleCreateDispenser} className="glass-panel p-6 rounded-2xl border border-white/10 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 animate-slideDown">
                  <div className="space-y-1">
                    <label className="text-xs text-slate-400 block">Machine ID (Unique Node ID)</label>
                    <input
                      type="text"
                      placeholder="e.g. sim-004"
                      value={newDispId}
                      onChange={(e) => setNewDispId(e.target.value)}
                      className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-cyan-400 text-white font-mono"
                    />
                  </div>
                  
                  <div className="space-y-1">
                    <label className="text-xs text-slate-400 block">Location Name</label>
                    <input
                      type="text"
                      placeholder="e.g. City Mall Food Court"
                      value={newDispLocation}
                      onChange={(e) => setNewDispLocation(e.target.value)}
                      className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-cyan-400 text-white"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs text-slate-400 block">Product/Fluid Type</label>
                    <select
                      value={newDispProduct}
                      onChange={(e) => setNewDispProduct(e.target.value)}
                      className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-cyan-400 text-white"
                    >
                      <option>Purified Water</option>
                      <option>Mineral Spring Water</option>
                      <option>Purified Alkaline Water</option>
                      <option>Infused Lemon Water</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs text-slate-400 block">Capacity Limit (Litres)</label>
                    <input
                      type="number"
                      value={newDispCapacity}
                      onChange={(e) => setNewDispCapacity(Number(e.target.value))}
                      className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-cyan-400 text-white"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs text-slate-400 block">Current Stock (Litres)</label>
                    <input
                      type="number"
                      value={newDispStock}
                      onChange={(e) => setNewDispStock(Number(e.target.value))}
                      className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-cyan-400 text-white"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs text-slate-400 block">Price Per Litre (INR)</label>
                    <input
                      type="number"
                      value={newDispPrice}
                      onChange={(e) => setNewDispPrice(Number(e.target.value))}
                      className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-cyan-400 text-white"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs text-slate-400 block">Initial Temp (°C)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={newDispTemp}
                      onChange={(e) => setNewDispTemp(Number(e.target.value))}
                      className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-cyan-400 text-white"
                    />
                  </div>

                  <div className="sm:col-span-2 md:col-span-3 flex justify-end pt-2">
                    <button
                      type="submit"
                      className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-md"
                    >
                      Add & Register Node
                    </button>
                  </div>
                </form>
              )}

              {/* Dispensers Fleet Grid */}
              {dispensers.length === 0 ? (
                <div className="glass-card p-12 rounded-2xl border border-white/5 text-center py-20 flex flex-col items-center justify-center">
                  <Server className="h-12 w-12 text-slate-600 mb-4 animate-pulse" />
                  <h4 className="text-base font-bold text-slate-400">No Fleet Nodes Registered</h4>
                  <p className="text-slate-500 text-xs mt-1 max-w-sm">Use the seeder bridge or add dispenser inline to register IoT dispensers.</p>
                  <button
                    onClick={seedDemoDatabase}
                    className="mt-6 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition-all"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    <span>Seed Demo Fleet</span>
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {dispensers.map((disp) => {
                    const isExpanded = expandedDispenser === disp.id
                    const stockPercentage = Math.min(100, Math.max(0, (disp.stockLevel / (disp.capacity || 100)) * 100))
                    
                    return (
                      <div
                        key={disp.id}
                        className={`glass-card rounded-2xl border transition-all duration-300 overflow-hidden shadow-xl flex flex-col ${
                          isExpanded 
                            ? "border-cyan-500/40 shadow-cyan-900/10" 
                            : "border-white/5 hover:border-slate-800"
                        }`}
                      >
                        <div
                          onClick={() => setExpandedDispenser(isExpanded ? null : disp.id)}
                          className="p-6 cursor-pointer flex flex-col justify-between flex-1 space-y-4"
                        >
                          <div className="flex justify-between items-start">
                            <div className="space-y-1">
                              <span className="text-[10px] text-cyan-400 font-mono tracking-wider font-extrabold uppercase bg-cyan-950/40 px-2 py-0.5 rounded border border-cyan-900/40">
                                {disp.id}
                              </span>
                              <h4 className="text-base font-extrabold pt-1">{disp.location}</h4>
                              <p className="text-[11px] text-slate-400 flex items-center space-x-1">
                                <Droplet className="h-3 w-3 text-blue-400" />
                                <span>{disp.productType}</span>
                              </p>
                            </div>
                            
                            <span className={`text-[10px] font-extrabold px-3 py-1 rounded-full ${
                              disp.status === "Active" || disp.status === "Dispensing"
                                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/25"
                                : disp.status === "low_stock"
                                ? "bg-amber-500/10 text-amber-400 border border-amber-500/25 animate-pulse"
                                : "bg-red-500/10 text-red-400 border border-red-500/25"
                            }`}>
                              {disp.status.toUpperCase()}
                            </span>
                          </div>

                          {/* Capacity Progress Bar */}
                          <div className="space-y-1.5">
                            <div className="flex justify-between text-xs font-semibold">
                              <span className="text-slate-400">Current Stock</span>
                              <span className={stockPercentage < 15 ? "text-amber-400 animate-pulse font-extrabold" : "text-slate-200"}>
                                {disp.stockLevel.toFixed(1)} / {disp.capacity || 100} Litres ({Math.round(stockPercentage)}%)
                              </span>
                            </div>
                            <div className="h-2 w-full bg-slate-900 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all duration-500 ${
                                  stockPercentage < 15 
                                    ? "bg-gradient-to-r from-amber-500 to-red-500 animate-pulse" 
                                    : "bg-gradient-to-r from-cyan-400 to-blue-500"
                                }`}
                                style={{ width: `${stockPercentage}%` }}
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-3 gap-2 pt-2 text-center">
                            <div className="bg-slate-950/40 p-2 rounded-xl border border-white/5">
                              <span className="text-[10px] text-slate-500 block">Temperature</span>
                              <span className="text-sm font-extrabold text-white flex items-center justify-center space-x-1">
                                <Thermometer className="h-3.5 w-3.5 text-red-400" />
                                <span>{disp.temperature}°C</span>
                              </span>
                            </div>

                            <div className="bg-slate-950/40 p-2 rounded-xl border border-white/5">
                              <span className="text-[10px] text-slate-500 block">Tariff Rate</span>
                              <span className="text-sm font-extrabold text-white">₹{disp.pricePerLitre}/L</span>
                            </div>

                            <div className="bg-slate-950/40 p-2 rounded-xl border border-white/5 flex flex-col justify-center">
                              <span className="text-[10px] text-slate-500 block">Telemetry Link</span>
                              <span className="text-[10px] font-bold text-slate-300">MQTT Active</span>
                            </div>
                          </div>
                        </div>

                        {/* Collapsible Details & Remote Command Controls */}
                        {isExpanded && (
                          <div className="bg-slate-900/40 border-t border-white/5 p-5 space-y-4 animate-slideDown">
                            <div className="flex justify-between items-center text-xs text-slate-450 border-b border-white/5 pb-2">
                              <span>Topic: <code className="text-cyan-400 font-mono">refillx/dispensers/{disp.id}/command</code></span>
                              <button
                                onClick={() => handleDeleteDispenser(disp.id)}
                                className="text-red-400 hover:text-red-300 hover:bg-red-500/10 p-1.5 rounded-lg transition-all flex items-center space-x-1"
                                title="Remove dispenser"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                <span className="text-[10px]">Remove</span>
                              </button>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                              <button
                                onClick={() => publishMqttCommand(disp.id, "open", 1000)}
                                className="px-4 py-2.5 bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20 text-emerald-400 rounded-xl text-xs font-extrabold transition-all flex items-center justify-center space-x-1.5"
                              >
                                <Play className="h-4 w-4" />
                                <span>Pulse Valve Open</span>
                              </button>

                              <button
                                onClick={() => publishMqttCommand(disp.id, "close")}
                                className="px-4 py-2.5 bg-amber-500/10 border border-amber-500/20 hover:bg-amber-500/20 text-amber-400 rounded-xl text-xs font-extrabold transition-all flex items-center justify-center space-x-1.5"
                              >
                                <Square className="h-4 w-4" />
                                <span>Force Valve Close</span>
                              </button>

                              <button
                                onClick={() => publishMqttCommand(disp.id, "reboot")}
                                className="px-4 py-2.5 bg-slate-800 border border-white/10 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-extrabold transition-all flex items-center justify-center space-x-1.5"
                              >
                                <RotateCcw className="h-4 w-4" />
                                <span>Reboot Firmware</span>
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* PAGE 3: TRANSACTIONS LOG */}
          {activeTab === "transactions" && (
            <div className="space-y-8 animate-fadeIn">
              {/* Filter controls */}
              <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
                <div className="relative w-full md:w-80">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                  <input
                    type="text"
                    placeholder="Search User ID, Machine ID, or Txn..."
                    value={txnSearch}
                    onChange={(e) => setTxnSearch(e.target.value)}
                    className="w-full bg-slate-900 border border-white/5 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white focus:outline-none focus:border-cyan-400"
                  />
                </div>

                <div className="flex items-center justify-between w-full md:w-auto gap-4">
                  <div className="flex items-center bg-slate-900 border border-white/5 p-1 rounded-xl">
                    <button
                      onClick={() => setTxnTypeFilter("all")}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        txnTypeFilter === "all" ? "bg-cyan-500 text-slate-950 shadow-md" : "text-slate-400 hover:text-white"
                      }`}
                    >
                      All
                    </button>
                    <button
                      onClick={() => setTxnTypeFilter("dispense")}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        txnTypeFilter === "dispense" ? "bg-cyan-500 text-slate-950 shadow-md" : "text-slate-400 hover:text-white"
                      }`}
                    >
                      Dispense
                    </button>
                    <button
                      onClick={() => setTxnTypeFilter("deposit")}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        txnTypeFilter === "deposit" ? "bg-cyan-500 text-slate-950 shadow-md" : "text-slate-400 hover:text-white"
                      }`}
                    >
                      Deposits
                    </button>
                  </div>

                  <button
                    onClick={exportToCSV}
                    disabled={filteredTxns.length === 0}
                    className="px-4 py-2.5 bg-slate-900 border border-white/10 hover:border-slate-800 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center space-x-1.5 transition-all shadow-md"
                  >
                    <Download className="h-4 w-4" />
                    <span className="hidden sm:inline">Export CSV</span>
                  </button>
                </div>
              </div>

              {/* Transactions Table */}
              <div className="glass-card rounded-2xl border border-white/5 shadow-2xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-white/5 text-[11px] font-extrabold uppercase tracking-wider text-slate-400 bg-slate-950/40">
                        <th className="py-4 px-6">Transaction ID</th>
                        <th className="py-4 px-6">Session Type</th>
                        <th className="py-4 px-6">Timestamp</th>
                        <th className="py-4 px-6">Customer (UID)</th>
                        <th className="py-4 px-6">Dispenser</th>
                        <th className="py-4 px-6 text-right">Cost (INR)</th>
                        <th className="py-4 px-6 text-center">Receipt PDF</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 text-xs">
                      {filteredTxns.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="py-12 text-center text-slate-500 font-semibold">
                            No matching transaction logs found.
                          </td>
                        </tr>
                      ) : (
                        filteredTxns.map((t) => (
                          <tr key={t.id} className="hover:bg-white/5 transition-all">
                            <td className="py-4 px-6 font-mono text-[10px] text-slate-450">{t.id}</td>
                            <td className="py-4 px-6">
                              <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-extrabold border ${
                                t.type === "credit"
                                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                  : "bg-blue-500/10 text-blue-400 border-blue-500/20"
                              }`}>
                                {t.type === "credit" ? "Deposit" : "Dispense"}
                              </span>
                            </td>
                            <td className="py-4 px-6 text-slate-300">
                              {t.timestamp?.toMillis
                                ? new Date(t.timestamp.toMillis()).toLocaleString()
                                : "Just now"}
                            </td>
                            <td className="py-4 px-6 font-mono text-[10px] text-slate-300" title={t.uid}>
                              {t.uid.slice(0, 15)}...
                            </td>
                            <td className="py-4 px-6 font-semibold">
                              <div className="space-y-0.5">
                                <span className="block font-mono text-[10px] text-cyan-400">{t.machineId}</span>
                                <span className="block text-[10px] text-slate-450">{t.location}</span>
                              </div>
                            </td>
                            <td className={`py-4 px-6 text-right font-extrabold ${t.type === "credit" ? "text-emerald-400" : "text-white"}`}>
                              {t.type === "credit" ? "+" : "-"}₹{t.cost.toFixed(2)}
                            </td>
                            <td className="py-4 px-6 text-center">
                              {t.receiptUrl ? (
                                <a
                                  href={t.receiptUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex p-2 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 text-blue-400 rounded-lg transition-all"
                                  title="Open PDF"
                                >
                                  <FileText className="h-4 w-4" />
                                </a>
                              ) : (
                                <span className="text-slate-600 text-[10px] font-semibold">None</span>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* PAGE 4: AI DEMAND FORECAST */}
          {activeTab === "ai" && (
            <div className="space-y-8 animate-fadeIn">
              {/* Header options */}
              <div className="flex flex-col sm:flex-row gap-4 items-center justify-between bg-slate-900/40 p-4 rounded-2xl border border-white/5">
                <div className="flex items-center space-x-3 w-full sm:w-auto">
                  <label className="text-xs text-slate-400 whitespace-nowrap">Target Dispenser:</label>
                  <select
                    value={selectedForecastDisp}
                    onChange={(e) => setSelectedForecastDisp(e.target.value)}
                    className="bg-slate-950 border border-white/10 rounded-xl px-4 py-2 text-xs focus:outline-none focus:border-cyan-400 text-white font-mono"
                  >
                    {dispensers.map(d => (
                      <option key={d.id} value={d.id}>{d.id} ({d.location})</option>
                    ))}
                  </select>
                </div>

                <button
                  onClick={triggerAISync}
                  disabled={aiSyncing || dispensers.length === 0}
                  className="w-full sm:w-auto px-4 py-2 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center justify-center space-x-1.5 transition-all shadow-md"
                >
                  {aiSyncing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <BrainCircuit className="h-4 w-4" />}
                  <span>Retrain ARIMA Models</span>
                </button>
              </div>

              {dispensers.length === 0 ? (
                <div className="glass-card p-12 rounded-2xl border border-white/5 text-center py-20 flex flex-col items-center justify-center">
                  <BrainCircuit className="h-12 w-12 text-slate-600 mb-4" />
                  <h4 className="text-base font-bold text-slate-400">No ML Forecast Data Available</h4>
                  <p className="text-slate-500 text-xs mt-1">Register/Seed dispensers to view forecasted demand curves.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  {/* ARIMA Line Chart */}
                  <div className="lg:col-span-2 glass-card p-6 rounded-2xl border border-white/5 space-y-4 shadow-2xl">
                    <div>
                      <h3 className="text-base font-bold flex items-center space-x-2">
                        <TrendingUp className="h-5 w-5 text-cyan-400" />
                        <span>7-Day Predictive Demand Curve (Litres)</span>
                      </h3>
                      <p className="text-xs text-slate-500 font-mono text-cyan-400">Next Estimated Refill: {activeForecast?.nextRefillAt ? new Date(activeForecast.nextRefillAt).toLocaleDateString() : "Pending"}</p>
                    </div>

                    <div className="h-72 w-full pt-4">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart
                          data={
                            activeForecast?.predictedDemand
                              ? activeForecast.predictedDemand.map((val, idx) => ({
                                  day: `Day ${idx + 1}`,
                                  demand: val
                                }))
                              : [
                                  { day: "Day 1", demand: 12.5 },
                                  { day: "Day 2", demand: 14.0 },
                                  { day: "Day 3", demand: 11.2 },
                                  { day: "Day 4", demand: 15.5 },
                                  { day: "Day 5", demand: 16.0 },
                                  { day: "Day 6", demand: 18.2 },
                                  { day: "Day 7", demand: 14.5 }
                                ]
                          }
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                          <XAxis dataKey="day" stroke="#64748b" fontSize={11} tickLine={false} />
                          <YAxis stroke="#64748b" fontSize={11} tickLine={false} />
                          <Tooltip
                            contentStyle={{ background: "#0f172a", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "12px" }}
                            labelStyle={{ color: "#94a3b8", fontWeight: "bold" }}
                          />
                          <Line
                            type="monotone"
                            dataKey="demand"
                            stroke="#06b6d4"
                            strokeWidth={3}
                            dot={{ fill: "#06b6d4", r: 4 }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Stockout warning & segmentation */}
                  <div className="space-y-6 flex flex-col justify-between">
                    {/* Stockout Risk Indicator Card */}
                    <div className={`p-6 rounded-2xl border shadow-xl ${
                      isStockoutRisk
                        ? "bg-red-500/10 border-red-500/25 text-red-200"
                        : "bg-slate-900/40 border-white/5 text-slate-300"
                    }`}>
                      <h4 className="text-sm font-bold flex items-center space-x-2">
                        <AlertTriangle className={`h-5 w-5 ${isStockoutRisk ? "text-red-400 animate-bounce" : "text-slate-400"}`} />
                        <span>Stockout Threat Metric</span>
                      </h4>

                      <div className="mt-4 space-y-2">
                        <p className="text-xs leading-relaxed">
                          {isStockoutRisk 
                            ? "CRITICAL: Solenoid dispenser current inventory is projected to deplete within the next 48 hours based on demand curves. Refill crew dispatch recommended."
                            : "Dispenser inventory levels are healthy. Projected consumption is within acceptable bounds."
                          }
                        </p>
                        
                        <div className="pt-2 flex justify-between text-xs">
                          <span>Current Stock:</span>
                          <span className="font-extrabold">{currentDispenserObject?.stockLevel?.toFixed(1) || 0} L</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span>48hr Consumption Forecast:</span>
                          <span className="font-extrabold">{next2DayDemand.toFixed(1)} L</span>
                        </div>
                      </div>
                    </div>

                    {/* Segmentation Pie Chart */}
                    <div className="glass-card p-6 rounded-2xl border border-white/5 space-y-4 shadow-xl flex-1 flex flex-col justify-between">
                      <div>
                        <h4 className="text-sm font-bold flex items-center space-x-2">
                          <Users className="h-4.5 w-4.5 text-blue-400" />
                          <span>Customer Tier Breakdown</span>
                        </h4>
                        <p className="text-[10px] text-slate-500">Distribution of users in the active system</p>
                      </div>

                      <div className="flex items-center justify-between gap-4 py-2">
                        <div className="h-32 w-32">
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie
                                data={pieData}
                                cx="50%"
                                cy="50%"
                                innerRadius={28}
                                outerRadius={42}
                                paddingAngle={3}
                                dataKey="value"
                              >
                                {pieData.map((_, index) => (
                                  <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                                ))}
                              </Pie>
                            </PieChart>
                          </ResponsiveContainer>
                        </div>

                        <div className="text-[10px] space-y-1.5 flex-1">
                          {pieData.map((item, idx) => (
                            <div key={item.name} className="flex items-center justify-between">
                              <span className="flex items-center space-x-1.5 text-slate-400">
                                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: PIE_COLORS[idx] }}></span>
                                <span>{item.name}</span>
                              </span>
                              <span className="font-bold text-white">{item.value} users</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* PAGE 5: ECO IMPACT */}
          {activeTab === "eco" && (
            <div className="space-y-8 animate-fadeIn">
              {/* Grand Totals */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                <div className="glass-card p-6 rounded-2xl border border-white/5 relative overflow-hidden shadow-2xl">
                  <div className="absolute top-0 left-0 h-1 w-full bg-gradient-to-r from-emerald-400 to-green-500" />
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <span className="text-xs text-slate-400 uppercase font-semibold">Carbon Offset</span>
                      <h3 className="text-3xl font-black text-emerald-400">{(totalVolumeL * 0.5).toFixed(2)} kg</h3>
                      <p className="text-[9px] text-slate-500">0.5kg CO2 offset per Litre</p>
                    </div>
                    <Leaf className="h-10 w-10 text-emerald-500/20" />
                  </div>
                </div>

                <div className="glass-card p-6 rounded-2xl border border-white/5 relative overflow-hidden shadow-2xl">
                  <div className="absolute top-0 left-0 h-1 w-full bg-gradient-to-r from-cyan-400 to-blue-500" />
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <span className="text-xs text-slate-400 uppercase font-semibold">PET Plastic Avoided</span>
                      <h3 className="text-3xl font-black text-cyan-400">{Math.round(totalVolumeL * 2).toFixed(0)} Bottles</h3>
                      <p className="text-[9px] text-slate-500">Assuming 500ml single-use bottles</p>
                    </div>
                    <Sparkles className="h-10 w-10 text-cyan-500/25" />
                  </div>
                </div>

                <div className="glass-card p-6 rounded-2xl border border-white/5 relative overflow-hidden shadow-2xl">
                  <div className="absolute top-0 left-0 h-1 w-full bg-gradient-to-r from-amber-400 to-yellow-500" />
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <span className="text-xs text-slate-400 uppercase font-semibold">Forest Equivalent</span>
                      <h3 className="text-3xl font-black text-amber-400">
                        {((totalVolumeL * 0.5) / 22.0).toFixed(4)} Trees
                      </h3>
                      <p className="text-[9px] text-slate-500">22kg carbon absorption per tree/yr</p>
                    </div>
                    <TrendingUp className="h-10 w-10 text-amber-500/20" />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Leaderboard Table */}
                <div className="lg:col-span-2 glass-card p-6 rounded-2xl border border-white/5 space-y-4 shadow-2xl flex flex-col">
                  <h3 className="text-base font-bold flex items-center space-x-2 text-cyan-400 border-b border-white/5 pb-3">
                    <Users className="h-5 w-5" />
                    <span>Top 10 Saviors Leaderboard</span>
                  </h3>

                  <div className="flex-1 overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-white/5 font-extrabold text-slate-400">
                          <th className="pb-3 pr-4">Rank</th>
                          <th className="pb-3 px-4">Name</th>
                          <th className="pb-3 px-4">Phone</th>
                          <th className="pb-3 px-4 text-center">Eco Points</th>
                          <th className="pb-3 pl-4 text-right">Class Tier</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {topSaviors.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="py-6 text-center text-slate-500 font-semibold">
                              No active user leaderboard entries.
                            </td>
                          </tr>
                        ) : (
                          topSaviors.map((savior, index) => (
                            <tr key={savior.id} className="hover:bg-white/5 transition-all">
                              <td className="py-3.5 pr-4 font-bold text-slate-400">
                                {index + 1 === 1 ? "🥇" : index + 1 === 2 ? "🥈" : index + 1 === 3 ? "🥉" : `#${index + 1}`}
                              </td>
                              <td className="py-3.5 px-4 font-extrabold text-white">{savior.name || "Eco Defender"}</td>
                              <td className="py-3.5 px-4 font-mono text-slate-400">
                                {savior.phone ? `${savior.phone.slice(0, 6)}*****${savior.phone.slice(-2)}` : "Private"}
                              </td>
                              <td className="py-3.5 px-4 text-center text-cyan-400 font-black">{savior.ecoPoints || 0}</td>
                              <td className="py-3.5 pl-4 text-right">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                                  savior.tier === "Champion"
                                    ? "bg-purple-500/10 text-purple-400 border border-purple-500/25"
                                    : savior.tier === "Eco-Hero"
                                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/25"
                                    : "bg-blue-500/10 text-blue-400 border border-blue-500/25"
                                }`}>
                                  {savior.tier || "Occasional"}
                                </span>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Offset Curve */}
                <div className="glass-card p-6 rounded-2xl border border-white/5 space-y-4 shadow-2xl flex flex-col justify-between">
                  <div>
                    <h3 className="text-sm font-bold">Eco Offset Progress</h3>
                    <p className="text-[10px] text-slate-550">Cumulative CO2 and plastics curves</p>
                  </div>

                  <div className="h-44 w-full pt-4">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData}>
                        <XAxis dataKey="name" stroke="#64748b" fontSize={10} tickLine={false} />
                        <YAxis stroke="#64748b" fontSize={10} tickLine={false} />
                        <Tooltip
                          contentStyle={{ background: "#0f172a", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "8px" }}
                        />
                        <Bar dataKey="volume" fill="#10b981" radius={[4, 4, 0, 0]} name="CO2 Saved (kg)" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="bg-slate-950/40 p-4 rounded-xl border border-white/5 space-y-1.5 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-450">Current Carbon Saved:</span>
                      <span className="font-bold text-emerald-400">{(totalVolumeL * 0.5).toFixed(2)} kg CO2</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-450">Avoided plastic mass:</span>
                      <span className="font-bold text-cyan-400">{(totalVolumeL * 56).toFixed(0)} grams</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
