import React, { useState, useEffect } from "react"
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  limit, 
  startAfter, 
  endBefore, 
  getDocs, 
  limitToLast,
  onSnapshot,
  Timestamp 
} from "firebase/firestore"
import { db } from "../lib/firebase"
import { useAuthStore } from "../store/useAuthStore"
import Navbar from "../components/Navbar"
import { Droplet, FileDown, Leaf, Calendar, Info, ChevronDown, ChevronUp, BarChart2, DollarSign, RefreshCw } from "lucide-react"
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

export default function History() {
  const { currentUser } = useAuthStore()

  // Detailed page transactions
  const [pageTransactions, setPageTransactions] = useState<TransactionLog[]>([])
  
  // Real-time aggregates cache (lightweight subset)
  const [allTxnsCache, setAllTxnsCache] = useState<{ cost: number; volume: string; type: string }[]>([])
  
  // Pagination Cursors
  const [currentPage, setCurrentPage] = useState<number>(1)
  const [firstDoc, setFirstDoc] = useState<any>(null)
  const [lastDoc, setLastDoc] = useState<any>(null)
  const [hasNext, setHasNext] = useState<boolean>(false)
  const [loading, setLoading] = useState<boolean>(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // Filters
  const [startDate, setStartDate] = useState<string>("")
  const [endDate, setEndDate] = useState<string>("")

  const itemsPerPage = 10

  // 1. Subscribe to lightweight aggregates list for totals
  useEffect(() => {
    if (!currentUser) return

    const q = query(
      collection(db, "transactions"),
      where("uid", "==", currentUser.uid)
    )

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: { cost: number; volume: string; type: string }[] = []
      snapshot.forEach((doc) => {
        const data = doc.data()
        list.push({
          cost: data.cost || 0,
          volume: data.volume || "0 ml",
          type: data.type || (data.machineId === "wallet_topup" ? "credit" : "debit"),
        })
      })
      setAllTxnsCache(list)
    })

    return () => unsubscribe()
  }, [currentUser])

  // 2. Fetch page-by-page detailed transactions with cursor query
  const fetchPage = async (direction: "first" | "next" | "prev", startDocRef?: any, endDocRef?: any) => {
    if (!currentUser) return
    setLoading(true)
    try {
      let q = query(
        collection(db, "transactions"),
        where("uid", "==", currentUser.uid),
        orderBy("timestamp", "desc")
      )

      // Apply date constraints to cursor query
      if (startDate) {
        const start = Timestamp.fromDate(new Date(startDate))
        q = query(q, where("timestamp", ">=", start))
      }
      if (endDate) {
        const end = new Date(endDate)
        end.setHours(23, 59, 59, 999)
        q = query(q, where("timestamp", "<=", Timestamp.fromDate(end)))
      }

      let paginatedQuery = query(q, limit(itemsPerPage))

      if (direction === "next" && startDocRef) {
        paginatedQuery = query(q, startAfter(startDocRef), limit(itemsPerPage))
      } else if (direction === "prev" && endDocRef) {
        paginatedQuery = query(q, endBefore(endDocRef), limitToLast(itemsPerPage))
      }

      const snap = await getDocs(paginatedQuery)
      const list: TransactionLog[] = []
      snap.forEach((doc) => {
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

      // If page was empty or had items
      if (list.length > 0) {
        setFirstDoc(snap.docs[0])
        setLastDoc(snap.docs[snap.docs.length - 1])
        setPageTransactions(list)

        // Check if there is a next document for pagination button disabling
        const nextCheckQuery = query(
          q,
          startAfter(snap.docs[snap.docs.length - 1]),
          limit(1)
        )
        const nextCheckSnap = await getDocs(nextCheckQuery)
        setHasNext(!nextCheckSnap.empty)
      } else {
        setPageTransactions([])
        setHasNext(false)
      }
    } catch (error: any) {
      console.error("Firestore Paginated Query Failed (composite index may be compiling):", error)
      // Fallback: Fetch all transactions client-side style
      fallbackFetch()
    } finally {
      setLoading(false)
    }
  }

  // Fallback client-side slicing if composite query throws missing index error
  const fallbackFetch = async () => {
    if (!currentUser) return
    try {
      const q = query(
        collection(db, "transactions"),
        where("uid", "==", currentUser.uid)
      )
      const snap = await getDocs(q)
      const list: TransactionLog[] = []
      snap.forEach((doc) => {
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

      // Filter
      const filtered = list.filter((t) => {
        if (!t.timestamp) return true
        const txnDate = new Date(t.timestamp.seconds * 1000)
        txnDate.setHours(0, 0, 0, 0)
        if (startDate) {
          const sDate = new Date(startDate)
          sDate.setHours(0, 0, 0, 0)
          if (txnDate < sDate) return false
        }
        if (endDate) {
          const eDate = new Date(endDate)
          eDate.setHours(23, 59, 59, 999)
          if (txnDate > eDate) return false
        }
        return true
      })

      // Slice
      const startIndex = (currentPage - 1) * itemsPerPage
      const sliced = filtered.slice(startIndex, startIndex + itemsPerPage)
      setPageTransactions(sliced)
      setHasNext(filtered.length > startIndex + itemsPerPage)
    } catch (e) {
      toast.error("Failed to fetch transaction logs.")
    }
  }

  // Trigger page fetch on filters or page change
  useEffect(() => {
    fetchPage("first")
  }, [currentUser, startDate, endDate])

  const handleNextPage = () => {
    if (hasNext && lastDoc) {
      setCurrentPage((p) => p + 1)
      fetchPage("next", lastDoc)
    }
  }

  const handlePrevPage = () => {
    if (currentPage > 1 && firstDoc) {
      setCurrentPage((p) => p - 1)
      fetchPage("prev", undefined, firstDoc)
    }
  }

  // Summary statistics from aggregates cache
  const totalVolumeLitres = allTxnsCache
    .filter((t) => t.type === "debit")
    .reduce((sum, t) => {
      const parsed = parseFloat(t.volume.replace(/[^\d.]/g, ""))
      return sum + (isNaN(parsed) ? 0 : parsed)
    }, 0) / 1000

  const totalSpent = allTxnsCache
    .filter((t) => t.type === "debit")
    .reduce((sum, t) => sum + t.cost, 0)

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id)
  }

  const handleDownloadReceipt = (txn: TransactionLog) => {
    if (!txn.receiptUrl) {
      toast.error("Receipt compilation is pending for this session.")
      return
    }
    toast.success(`Opening receipt for transaction ${txn.id}`)
    window.open(txn.receiptUrl, "_blank")
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white md:pl-64">
      <Toaster position="top-right" />
      <Navbar />

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-8 pb-24">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-teal-400 to-cyan-400">
              Operation History
            </h1>
            <p className="text-slate-400 text-xs mt-1">Review all your previous dispenser refills, eco logs, and receipts.</p>
          </div>
          {loading && <RefreshCw className="h-5 w-5 text-teal-450 animate-spin" />}
        </div>

        {/* Summary Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="glass-card p-5 rounded-xl border border-white/5 flex items-center space-x-4">
            <div className="bg-teal-500/10 p-3 rounded-lg border border-teal-500/20 text-teal-400">
              <BarChart2 className="h-6 w-6" />
            </div>
            <div>
              <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider block">Total Volume Refilled</span>
              <h3 className="text-2xl font-extrabold">{totalVolumeLitres.toFixed(1)} L</h3>
            </div>
          </div>

          <div className="glass-card p-5 rounded-xl border border-white/5 flex items-center space-x-4">
            <div className="bg-emerald-500/10 p-3 rounded-lg border border-emerald-500/20 text-emerald-450">
              <DollarSign className="h-6 w-6" />
            </div>
            <div>
              <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider block">Total Dispensation Spent</span>
              <h3 className="text-2xl font-extrabold">₹{totalSpent.toFixed(2)}</h3>
            </div>
          </div>

          <div className="glass-card p-5 rounded-xl border border-white/5 flex items-center space-x-4">
            <div className="bg-amber-500/10 p-3 rounded-lg border border-amber-500/20 text-amber-450">
              <Leaf className="h-6 w-6" />
            </div>
            <div>
              <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider block">Eco Carbon Saved</span>
              <h3 className="text-2xl font-extrabold">{(totalVolumeLitres * 0.1).toFixed(2)} kg</h3>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="glass-card p-4 rounded-xl border border-white/5 flex flex-wrap items-center gap-4 text-xs">
          <div className="flex items-center space-x-2">
            <span className="text-slate-455">Start Date:</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => { setStartDate(e.target.value); setCurrentPage(1); }}
              className="bg-slate-900 border border-slate-800 rounded-lg p-2 text-white focus:outline-none focus:ring-1 focus:ring-teal-500"
            />
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-slate-455">End Date:</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => { setEndDate(e.target.value); setCurrentPage(1); }}
              className="bg-slate-900 border border-slate-800 rounded-lg p-2 text-white focus:outline-none focus:ring-1 focus:ring-teal-500"
            />
          </div>
          {(startDate || endDate) && (
            <button
              onClick={() => { setStartDate(""); setEndDate(""); setCurrentPage(1); }}
              className="text-red-400 hover:underline font-semibold ml-auto"
            >
              Reset Filters
            </button>
          )}
        </div>

        {/* Table */}
        <div className="glass-card rounded-2xl border border-white/5 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/10 bg-slate-900/60 text-slate-400 text-[10px] font-bold uppercase tracking-wider">
                  <th className="py-4 px-6">Operation</th>
                  <th className="py-4 px-6">Volume</th>
                  <th className="py-4 px-6">Cost</th>
                  <th className="py-4 px-6">Timestamp</th>
                  <th className="py-4 px-6 text-center">Receipt</th>
                  <th className="py-4 px-6"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-xs">
                {pageTransactions.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-500">No transactions match your search parameters.</td>
                  </tr>
                ) : (
                  pageTransactions.map((txn) => {
                    const isExpanded = expandedId === txn.id
                    return (
                      <React.Fragment key={txn.id}>
                        <tr 
                          onClick={() => toggleExpand(txn.id)}
                          className="hover:bg-slate-900/30 transition-colors cursor-pointer"
                        >
                          <td className="py-4 px-6 flex items-center space-x-3">
                            <div className={`p-2 rounded-lg border ${
                              txn.type === "credit"
                                ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                                : "bg-teal-500/10 border-teal-500/20 text-teal-400"
                            }`}>
                              <Droplet className="h-4 w-4" />
                            </div>
                            <div>
                              <h4 className="font-bold text-white leading-tight">{txn.method}</h4>
                              <span className="text-[9px] text-slate-500 font-mono">{txn.id}</span>
                            </div>
                          </td>
                          <td className="py-4 px-6 text-slate-300 font-medium">{txn.volume}</td>
                          <td className="py-4 px-6 font-extrabold text-white">₹{txn.cost.toFixed(2)}</td>
                          <td className="py-4 px-6 text-slate-400">
                            <span className="flex items-center">
                              <Calendar className="h-3.5 w-3.5 mr-1.5 text-slate-500" />
                              {txn.timestamp ? new Date(txn.timestamp.seconds * 1000).toLocaleString() : "Syncing..."}
                            </span>
                          </td>
                          <td className="py-4 px-6 text-center">
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDownloadReceipt(txn); }}
                              disabled={txn.type === "credit"}
                              className="p-1.5 bg-slate-900/60 border border-white/5 rounded-lg text-slate-400 hover:text-teal-400 hover:border-teal-500/20 transition-all disabled:opacity-30 disabled:pointer-events-none"
                            >
                              <FileDown className="h-3.5 w-3.5" />
                            </button>
                          </td>
                          <td className="py-4 px-6 text-slate-400">
                            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </td>
                        </tr>
                        
                        {/* Expanded details */}
                        {isExpanded && (
                          <tr className="bg-slate-900/20 border-b border-white/5">
                            <td colSpan={6} className="py-4 px-8 text-xs text-slate-450 space-y-2">
                              <div className="grid grid-cols-2 gap-4 max-w-md">
                                <div>
                                  <span className="text-slate-500 block">Dispenser ID:</span>
                                  <span className="font-mono text-white">{txn.machineId}</span>
                                </div>
                                <div>
                                  <span className="text-slate-500 block">Transaction Type:</span>
                                  <span className="capitalize font-semibold text-white">{txn.type}</span>
                                </div>
                                <div>
                                  <span className="text-slate-500 block">UPI Reference ID:</span>
                                  <span className="font-mono text-white">{txn.id}_REF</span>
                                </div>
                                <div>
                                  <span className="text-slate-500 block">Eco impact:</span>
                                  <span className="text-emerald-400 font-bold flex items-center">
                                    <Leaf className="h-3 w-3 mr-1" />
                                    +{Math.floor(parseFloat(txn.volume) / 10 || 0)} Eco Points
                                  </span>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          <div className="p-4 bg-slate-900/20 border-t border-white/5 flex items-center justify-between text-xs">
            <span className="text-slate-450">Page {currentPage}</span>
            <div className="flex space-x-2">
              <button
                onClick={handlePrevPage}
                disabled={currentPage === 1 || loading}
                className="px-3 py-1.5 bg-slate-900 border border-white/5 hover:border-slate-700 rounded-lg disabled:opacity-40"
              >
                Previous
              </button>
              <button
                onClick={handleNextPage}
                disabled={!hasNext || loading}
                className="px-3 py-1.5 bg-slate-900 border border-white/5 hover:border-slate-700 rounded-lg disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </div>

        {/* Informative block */}
        <div className="glass-card p-4 rounded-xl border border-white/5 flex items-start space-x-3 bg-blue-950/15">
          <Info className="h-5 w-5 text-blue-400 shrink-0 mt-0.5" />
          <p className="text-xs text-slate-450 leading-relaxed">
            Carbon credit metrics are generated using environmental baseline formulas calculated from local PET plastic avoidance rates. Receipts are archived for 90 days.
          </p>
        </div>
      </main>
    </div>
  )
}
