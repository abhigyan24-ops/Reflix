import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { collection, query, where, orderBy, limit, onSnapshot, doc } from "firebase/firestore"
import { getFunctions, httpsCallable } from "firebase/functions"
import { db } from "../lib/firebase"
import { useAuthStore } from "../store/useAuthStore"
import Navbar from "../components/Navbar"
import { Wallet as WalletIcon, ArrowUpRight, ArrowDownLeft, ShieldCheck, Plus, Sparkles, X, History, Award, Leaf, RefreshCw } from "lucide-react"
import { ResponsiveContainer, AreaChart, Area, Tooltip } from "recharts"
import { toast, Toaster } from "react-hot-toast"

interface TransactionLog {
  id: string
  uid: string
  machineId: string
  volume: string
  cost: number
  timestamp: any
  receiptUrl: string
  type: "credit" | "debit"
  method: string
}

export default function Wallet() {
  const navigate = useNavigate()
  const { currentUser, userProfile, setUserProfile } = useAuthStore()

  const [topupAmount, setTopupAmount] = useState<string>("200")
  const [modalOpen, setModalOpen] = useState<boolean>(false)
  const [loading, setLoading] = useState<boolean>(false)
  const [transactions, setTransactions] = useState<TransactionLog[]>([])

  // 1. Subscribe to User Profile in real time
  useEffect(() => {
    if (!currentUser) return
    const docRef = doc(db, "users", currentUser.uid)
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        setUserProfile(docSnap.data() as any)
      }
    })
    return () => unsubscribe()
  }, [currentUser, setUserProfile])

  // 2. Subscribe to Transaction Logs in real time (last 10)
  useEffect(() => {
    if (!currentUser) return
    
    // Query last 10 transactions
    const q = query(
      collection(db, "transactions"),
      where("uid", "==", currentUser.uid),
      orderBy("timestamp", "desc"),
      limit(10)
    )

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list: TransactionLog[] = []
        snapshot.forEach((doc) => {
          const data = doc.data()
          list.push({
            id: doc.id,
            uid: data.uid,
            machineId: data.machineId,
            volume: data.volume || "0 ml",
            cost: data.cost || 0,
            timestamp: data.timestamp,
            receiptUrl: data.receiptUrl || "",
            type: data.type || (data.machineId === "wallet_topup" ? "credit" : "debit"),
            method: data.method || (data.machineId === "wallet_topup" ? "UPI Deposit" : "Refill Session"),
          })
        })
        setTransactions(list)
      },
      (error) => {
        console.error("Transactions query error (possibly missing index):", error)
        // Fallback to simpler query without order if index is not ready yet
        const fallbackQ = query(
          collection(db, "transactions"),
          where("uid", "==", currentUser.uid),
          limit(10)
        )
        onSnapshot(fallbackQ, (snapshot) => {
          const list: TransactionLog[] = []
          snapshot.forEach((doc) => {
            const data = doc.data()
            list.push({
              id: doc.id,
              uid: data.uid,
              machineId: data.machineId,
              volume: data.volume || "0 ml",
              cost: data.cost || 0,
              timestamp: data.timestamp,
              receiptUrl: data.receiptUrl || "",
              type: data.type || (data.machineId === "wallet_topup" ? "credit" : "debit"),
              method: data.method || (data.machineId === "wallet_topup" ? "UPI Deposit" : "Refill Session"),
            })
          })
          // Sort client-side
          list.sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0))
          setTransactions(list)
        })
      }
    )
    return () => unsubscribe()
  }, [currentUser])

  const handleSimulatedTopup = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!currentUser) {
      toast.error("Please login first.")
      navigate("/login")
      return
    }
    const amountVal = parseFloat(topupAmount)
    if (isNaN(amountVal) || amountVal <= 0) {
      toast.error("Please enter a valid amount.")
      return
    }

    setLoading(true)
    try {
      const functionsInstance = getFunctions()
      const topUpWalletCall = httpsCallable(functionsInstance, "topUpWallet")

      const result: any = await topUpWalletCall({
        uid: currentUser.uid,
        amount: amountVal,
      })

      if (result.data?.status === "success") {
        setModalOpen(false)
        setTopupAmount("200")
        toast.success(`Wallet successfully credited with ₹${amountVal.toFixed(2)}!`)
      } else {
        throw new Error(result.data?.message || "Deposit transaction rejected.")
      }
    } catch (error: any) {
      console.error(error)
      toast.error(error.message || "Failed to trigger simulated wallet top-up.")
    } finally {
      setLoading(false)
    }
  }

  // Calculate sparkline data representing deposits over 30 days
  const getSparklineData = () => {
    // Extract credit transactions and group them
    const credits = transactions.filter((t) => t.type === "credit")
    if (credits.length === 0) {
      // Return default curve if no transactions yet
      return [
        { day: "1", amount: 0 },
        { day: "10", amount: 100 },
        { day: "20", amount: 150 },
        { day: "30", amount: userProfile?.walletBalance || 0 },
      ]
    }
    return credits
      .map((c, i) => ({
        day: String(i + 1),
        amount: c.cost,
      }))
      .reverse()
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white md:pl-64">
      <Toaster position="top-right" />
      <Navbar />

      <main className="max-w-6xl mx-auto px-4 py-8 space-y-8 pb-24">
        
        {/* Upper stats grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          {/* Wallet Balance Card */}
          <div className="glass-card p-6 rounded-2xl border border-white/5 bg-gradient-to-br from-blue-950/20 to-slate-900/40 relative overflow-hidden group hover:border-blue-500/30 transition-all duration-300">
            <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity">
              <WalletIcon className="h-20 w-20 text-blue-400" />
            </div>
            <div className="flex justify-between items-start mb-4">
              <span className="text-slate-400 text-xs font-bold uppercase tracking-wider">Wallet Balance</span>
              <button 
                onClick={() => setModalOpen(true)}
                className="bg-blue-500 hover:bg-blue-600 p-2 rounded-xl border border-blue-500/30 text-white transition-all shadow-md active:scale-95"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
            <h2 className="text-3xl font-extrabold tracking-tight">₹{(userProfile?.walletBalance || 0).toFixed(2)}</h2>
            <div className="mt-4 flex items-center space-x-1.5 text-xs text-slate-450">
              <ShieldCheck className="h-4 w-4 text-emerald-450" />
              <span>Real-Time Firestore Sync</span>
            </div>
          </div>

          {/* Eco Points */}
          <div className="glass-card p-6 rounded-2xl border border-white/5 bg-gradient-to-br from-emerald-950/10 to-slate-900/40 relative overflow-hidden group hover:border-emerald-500/30 transition-all duration-300">
            <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity">
              <Leaf className="h-20 w-20 text-emerald-400" />
            </div>
            <div className="flex justify-between items-start mb-4">
              <span className="text-slate-400 text-xs font-bold uppercase tracking-wider">Eco Points</span>
              <div className="bg-emerald-500/10 p-2 rounded-lg border border-emerald-500/20">
                <Leaf className="h-4 w-4 text-emerald-400" />
              </div>
            </div>
            <h2 className="text-3xl font-extrabold tracking-tight text-emerald-400">{userProfile?.ecoPoints || 0}</h2>
            <div className="mt-4 text-[10px] text-emerald-500/80 font-semibold uppercase tracking-wider">
              {((userProfile?.ecoPoints || 0) * 0.01).toFixed(2)} kg CO2 Offset
            </div>
          </div>

          {/* Eco Tier */}
          <div className="glass-card p-6 rounded-2xl border border-white/5 bg-gradient-to-br from-amber-950/10 to-slate-900/40 relative overflow-hidden group hover:border-amber-500/30 transition-all duration-300">
            <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity">
              <Award className="h-20 w-20 text-amber-400" />
            </div>
            <div className="flex justify-between items-start mb-4">
              <span className="text-slate-400 text-xs font-bold uppercase tracking-wider">Eco Tier</span>
              <div className="bg-amber-500/10 p-2 rounded-lg border border-amber-500/20">
                <Award className="h-4 w-4 text-amber-400" />
              </div>
            </div>
            <h2 className="text-3xl font-extrabold tracking-tight text-amber-450">{userProfile?.tier || "Occasional"}</h2>
            <div className="mt-4 text-[10px] text-amber-500/80 font-semibold uppercase tracking-wider">
              Member Level Profile
            </div>
          </div>

        </div>

        {/* Lower layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Recent Transactions List */}
          <div className="lg:col-span-2 glass-card p-6 rounded-2xl border border-white/5 flex flex-col justify-between space-y-4">
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <h3 className="text-base font-bold flex items-center space-x-2">
                <History className="h-4 w-4 text-blue-400" />
                <span>Recent Operations (Last 10)</span>
              </h3>
              <span className="text-[10px] text-slate-500 font-mono">Real-time update</span>
            </div>

            <div className="space-y-3 flex-1 overflow-y-auto max-h-[360px] pr-1">
              {transactions.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-550">No operations logged. Top up to start!</div>
              ) : (
                transactions.map((txn) => (
                  <div key={txn.id} className="p-3 bg-slate-900/30 rounded-xl border border-white/5 flex items-center justify-between transition-colors hover:bg-slate-900/50">
                    <div className="flex items-center space-x-3">
                      <div className={`p-2 rounded-lg border ${
                        txn.type === "credit"
                          ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-450"
                          : "bg-blue-500/10 border-blue-500/20 text-blue-440"
                      }`}>
                        {txn.type === "credit" ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
                      </div>
                      <div>
                        <h4 className="text-xs font-bold">{txn.method}</h4>
                        <p className="text-[9px] text-slate-450 mt-0.5">
                          {txn.timestamp ? new Date(txn.timestamp.seconds * 1000).toLocaleString() : "Syncing..."} • Station: {txn.machineId}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className={`text-xs font-extrabold ${txn.type === "credit" ? "text-emerald-450" : "text-white"}`}>
                        {txn.type === "credit" ? "+" : "-"} ₹{txn.cost.toFixed(2)}
                      </span>
                      {txn.volume !== "0 ml" && (
                        <p className="text-[8px] text-slate-555 mt-0.5">{txn.volume}</p>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Sparkline trend representation */}
          <div className="glass-card p-6 rounded-2xl border border-white/5 space-y-4 flex flex-col justify-between">
            <div>
              <h3 className="text-sm font-bold flex items-center space-x-2">
                <Sparkles className="h-4 w-4 text-emerald-400" />
                <span>Deposit Growth (30 Days)</span>
              </h3>
              <p className="text-[10px] text-slate-450">Sparkline representation of credit top-up metrics</p>
            </div>
            
            <div className="h-32 w-full pt-4">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={getSparklineData()}>
                  <defs>
                    <linearGradient id="sparklineColor" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <Tooltip 
                    contentStyle={{ background: "#020617", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "6px" }}
                    labelStyle={{ display: "none" }}
                  />
                  <Area type="monotone" dataKey="amount" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#sparklineColor)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

        </div>

      </main>

      {/* Simulated Deposit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-sm glass-panel p-6 rounded-2xl border border-white/10 space-y-5 shadow-2xl">
            <div className="flex justify-between items-center">
              <h3 className="text-base font-bold flex items-center space-x-2">
                <Plus className="h-5 w-5 text-blue-400" />
                <span>Simulate UPI Top Up</span>
              </h3>
              <button 
                onClick={() => setModalOpen(false)}
                className="text-slate-450 hover:text-white p-1"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSimulatedTopup} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Deposit Amount (INR)</label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-500 font-extrabold text-sm">₹</span>
                  <input
                    type="number"
                    value={topupAmount}
                    onChange={(e) => setTopupAmount(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 pl-7 pr-4 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 text-sm font-extrabold"
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white font-bold rounded-xl transition-all shadow-lg shadow-blue-500/20 flex items-center justify-center space-x-1.5 active:scale-95 text-sm"
              >
                {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                <span>{loading ? "Simulating Gateway..." : "Verify & Credit Wallet"}</span>
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
