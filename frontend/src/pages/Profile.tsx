import { useState, useEffect } from "react"
import Navbar from "../components/Navbar"
import { useAuthStore } from "../store/useAuthStore"
import { useThemeStore } from "../store/useThemeStore"
import { db, auth } from "../lib/firebase"
import { doc, updateDoc, onSnapshot } from "firebase/firestore"
import { signOut } from "firebase/auth"
import { useNavigate } from "react-router-dom"
import { 
  Phone, 
  Award, 
  Leaf, 
  Shield, 
  Bell, 
  LogOut, 
  Edit2, 
  Check, 
  FileDown, 
  Sun, 
  Moon 
} from "lucide-react"
import { toast } from "react-hot-toast"

export default function Profile() {
  const { currentUser, userProfile, setUserProfile } = useAuthStore()
  const { theme, toggleTheme } = useThemeStore()
  const navigate = useNavigate()

  const [isEditingName, setIsEditingName] = useState(false)
  const [editedName, setEditedName] = useState("")
  const [savingName, setSavingName] = useState(false)

  // Notification Preferences
  const [notifComplete, setNotifComplete] = useState(true)
  const [notifLowWallet, setNotifLowWallet] = useState(true)
  const [notifTips, setNotifTips] = useState(false)

  // Sign out confirmation dialog
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false)

  // Animated counters state
  const [co2Saved, setCo2Saved] = useState(0)
  const [plasticSaved, setPlasticSaved] = useState(0)
  const [totalRefills, setTotalRefills] = useState(0)

  const userTier = userProfile?.tier || "Occasional"
  const userPoints = userProfile?.ecoPoints || 0

  // Calculate points needed for next tier
  let nextTier = "Regular"
  let pointsNeeded = 100
  let prevTierPoints = 0
  if (userPoints >= 1000) {
    nextTier = "Max Tier (Champion)"
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

  const tierProgress = nextTier.includes("Max") 
    ? 100 
    : Math.min(100, Math.max(0, ((userPoints - prevTierPoints) / (pointsNeeded - prevTierPoints)) * 100))

  const tierBenefits = {
    Occasional: "Occasional: Standard water tariffs apply.",
    Regular: "Regular: Unlock 2% discount on dispenser refills.",
    "Eco-Hero": "Eco-Hero: Unlock 5% discount on dispenser refills.",
    Champion: "Champion: Unlock 10% discount on dispenser refills + priority AI alerts."
  }[userTier] || "Standard tariffs apply."

  // Load defaults
  useEffect(() => {
    if (userProfile) {
      setEditedName(userProfile.name || "")
      const prefs = userProfile.notificationPrefs || {}
      setNotifComplete(prefs.dispenseComplete ?? true)
      setNotifLowWallet(prefs.lowWallet ?? true)
      setNotifTips(prefs.ecoTips ?? false)
    }
  }, [userProfile])

  // Count-up animation on load
  useEffect(() => {
    if (!userProfile) return

    // Derive totals
    const targetCo2 = userPoints * 0.05
    const targetPlastic = Math.round(userPoints * 2.8)
    const targetRefills = Math.round(userPoints / 15) || 1

    let co2Val = 0
    let plasticVal = 0
    let refillsVal = 0

    const interval = setInterval(() => {
      let done = true
      
      if (co2Val < targetCo2) {
        co2Val = Math.min(targetCo2, co2Val + targetCo2 / 15)
        setCo2Saved(Number(co2Val.toFixed(1)))
        done = false
      }
      if (plasticVal < targetPlastic) {
        plasticVal = Math.min(targetPlastic, plasticVal + Math.ceil(targetPlastic / 15))
        setPlasticSaved(plasticVal)
        done = false
      }
      if (refillsVal < targetRefills) {
        refillsVal = Math.min(targetRefills, refillsVal + Math.ceil(targetRefills / 15))
        setTotalRefills(refillsVal)
        done = false
      }

      if (done) clearInterval(interval)
    }, 40)

    return () => clearInterval(interval)
  }, [userProfile, userPoints])

  // Listen to profile updates dynamically
  useEffect(() => {
    if (!currentUser) return
    const unsub = onSnapshot(doc(db, "users", currentUser.uid), (docSnap) => {
      if (docSnap.exists()) {
        setUserProfile(docSnap.data() as any)
      }
    })
    return () => unsub()
  }, [currentUser, setUserProfile])

  // Save profile name
  const handleSaveName = async () => {
    if (!currentUser) return
    if (!editedName.trim()) {
      toast.error("Name cannot be empty.")
      return
    }

    setSavingName(true)
    try {
      const userRef = doc(db, "users", currentUser.uid)
      await updateDoc(userRef, { name: editedName.trim() })
      setIsEditingName(false)
      toast.success("Name updated successfully!")
    } catch (err: any) {
      toast.error("Failed to update name: " + err.message)
    } finally {
      setSavingName(false)
    }
  }

  // Save notification preferences
  const handleTogglePref = async (key: string, value: boolean) => {
    if (!currentUser) return
    
    // Optimistic local toggle
    if (key === "complete") setNotifComplete(value)
    if (key === "lowWallet") setNotifLowWallet(value)
    if (key === "tips") setNotifTips(value)

    try {
      const userRef = doc(db, "users", currentUser.uid)
      await updateDoc(userRef, {
        [`notificationPrefs.${key}`]: value
      })
    } catch (err: any) {
      toast.error("Failed to save preference: " + err.message)
    }
  }

  const handleSignOut = async () => {
    try {
      await signOut(auth)
      toast.success("Signed out successfully.")
      navigate("/login")
    } catch (err: any) {
      toast.error("Sign out failed: " + err.message)
    }
  }

  const initials = userProfile?.name 
    ? userProfile.name.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2)
    : "Savior"

  return (
    <div className="min-h-screen bg-slate-950 text-white transition-colors duration-200 md:pl-64">
      <Navbar />

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-8 pb-24">
        
        {/* Header Profile Card */}
        <section className="glass-panel p-6 rounded-3xl border border-white/5 flex flex-col sm:flex-row items-center justify-between gap-6 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 h-24 w-24 bg-teal-500/5 rounded-full filter blur-xl" />
          
          <div className="flex flex-col sm:flex-row items-center gap-4 text-center sm:text-left">
            {/* Avatar */}
            <div className="h-16 w-16 bg-gradient-to-tr from-teal-400 to-blue-500 rounded-full flex items-center justify-center font-bold text-lg text-slate-950 border-2 border-white/10 shadow-lg select-none">
              {initials}
            </div>

            {/* Name / Info */}
            <div className="space-y-1">
              <div className="flex items-center justify-center sm:justify-start gap-2">
                {isEditingName ? (
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={editedName}
                      onChange={(e) => setEditedName(e.target.value)}
                      disabled={savingName}
                      className="bg-slate-900 border border-white/10 rounded-lg px-2.5 py-1 text-sm focus:outline-none focus:border-teal-400 text-white"
                    />
                    <button
                      onClick={handleSaveName}
                      disabled={savingName}
                      className="p-1 bg-teal-500 hover:bg-teal-600 rounded text-slate-950 transition-all"
                    >
                      <Check className="h-4.5 w-4.5" />
                    </button>
                  </div>
                ) : (
                  <>
                    <h2 className="text-xl font-extrabold text-white">{userProfile?.name || "Savior Customer"}</h2>
                    <button 
                      onClick={() => setIsEditingName(true)}
                      className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/5 transition-all"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </button>
                  </>
                )}
              </div>
              
              <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 text-xs text-slate-400">
                <span className="flex items-center gap-1"><Phone className="h-3 w-3" /> {userProfile?.phone || "No Phone linked"}</span>
                <span className="hidden sm:inline">·</span>
                <span className="flex items-center gap-1"><Shield className="h-3 w-3 text-teal-400" /> Member since {userProfile?.createdAt?.toMillis ? new Date(userProfile.createdAt.toMillis()).toLocaleDateString() : "2026"}</span>
              </div>
            </div>
          </div>

          {/* Theme & Settings Toggle */}
          <div className="flex items-center gap-3">
            <button
              onClick={toggleTheme}
              className="p-2 border border-white/5 bg-slate-900/60 hover:bg-slate-800 rounded-xl transition-all"
              title="Toggle Light/Dark Theme"
            >
              {theme === "dark" ? <Sun className="h-4.5 w-4.5 text-yellow-400" /> : <Moon className="h-4.5 w-4.5 text-blue-400" />}
            </button>
          </div>
        </section>

        {/* Tier & Eco point progression */}
        <section className="glass-card p-6 rounded-3xl border border-white/5 space-y-6 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 left-0 h-1 w-full bg-gradient-to-r from-teal-400 to-emerald-400" />
          
          <div className="flex justify-between items-start">
            <div className="space-y-1">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                <Award className="h-4 w-4 text-teal-400" />
                <span>Loyalty Tier Standings</span>
              </h3>
              <div className="flex items-center gap-2 pt-1">
                <span className="text-2xl font-black bg-clip-text text-transparent bg-gradient-to-r from-teal-400 to-emerald-400">
                  {userTier}
                </span>
                <span className="text-slate-500 font-bold">({userPoints} points)</span>
              </div>
            </div>
            
            <div className="text-right text-xs text-slate-400">
              <span className="block font-semibold">Next Milestone:</span>
              <span className="font-bold text-white uppercase">{nextTier}</span>
            </div>
          </div>

          {/* Tier Progress Bar */}
          <div className="space-y-2">
            <div className="h-2 w-full bg-slate-900 rounded-full overflow-hidden border border-white/5">
              <div 
                className="h-full bg-gradient-to-r from-teal-400 to-emerald-400 rounded-full transition-all duration-700"
                style={{ width: `${tierProgress}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-slate-500">
              <span>{prevTierPoints} pts</span>
              <span>{tierProgress.toFixed(0)}% Completed</span>
              <span>{pointsNeeded} pts</span>
            </div>
          </div>

          <div className="p-3 bg-teal-500/5 border border-teal-500/10 rounded-2xl text-xs text-teal-300">
            <strong>Benefit Tier Perks: </strong> {tierBenefits}
          </div>
        </section>

        {/* Eco Passport Impact section */}
        <section className="glass-card p-6 rounded-3xl border border-white/5 space-y-6 shadow-xl">
          <div className="flex justify-between items-center border-b border-white/5 pb-4">
            <h3 className="text-sm font-bold flex items-center gap-2">
              <Leaf className="h-4 w-4 text-emerald-400" />
              <span>Eco Passport Statistics</span>
            </h3>
            
            {userProfile?.ecoPassportUrl ? (
              <a
                href={userProfile.ecoPassportUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3.5 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold rounded-xl text-xs flex items-center gap-1 transition-all shadow-md"
              >
                <FileDown className="h-3.5 w-3.5" />
                <span>Download Passport</span>
              </a>
            ) : (
              <span className="text-[10px] text-slate-500 italic">Passport generates after 3 refills</span>
            )}
          </div>

          <div className="grid grid-cols-3 gap-4 text-center">
            <div className="space-y-1 bg-slate-950/40 p-4 rounded-2xl border border-white/5">
              <span className="text-2xl font-black text-emerald-400">{co2Saved} kg</span>
              <span className="text-[10px] text-slate-500 block uppercase">CO2 Offset</span>
            </div>

            <div className="space-y-1 bg-slate-950/40 p-4 rounded-2xl border border-white/5">
              <span className="text-2xl font-black text-teal-400">{plasticSaved} g</span>
              <span className="text-[10px] text-slate-500 block uppercase">PET Saved</span>
            </div>

            <div className="space-y-1 bg-slate-950/40 p-4 rounded-2xl border border-white/5">
              <span className="text-2xl font-black text-white">{totalRefills}</span>
              <span className="text-[10px] text-slate-500 block uppercase">Refill Sessions</span>
            </div>
          </div>
        </section>

        {/* Notification preferences */}
        <section className="glass-card p-6 rounded-3xl border border-white/5 space-y-4 shadow-xl">
          <h3 className="text-sm font-bold flex items-center gap-2">
            <Bell className="h-4 w-4 text-teal-400" />
            <span>Alert Preferences</span>
          </h3>

          <div className="divide-y divide-white/5">
            <div className="py-3.5 flex justify-between items-center">
              <div className="space-y-0.5">
                <span className="text-xs font-semibold block">Refill Complete Alerts</span>
                <span className="text-[10px] text-slate-500">Receive Push warnings when Solenoid cycles complete.</span>
              </div>
              <input
                type="checkbox"
                checked={notifComplete}
                onChange={(e) => handleTogglePref("complete", e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500 cursor-pointer"
              />
            </div>

            <div className="py-3.5 flex justify-between items-center">
              <div className="space-y-0.5">
                <span className="text-xs font-semibold block">Low Wallet Warnings</span>
                <span className="text-[10px] text-slate-500">Alert me when credits drop below ₹20.</span>
              </div>
              <input
                type="checkbox"
                checked={notifLowWallet}
                onChange={(e) => handleTogglePref("lowWallet", e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500 cursor-pointer"
              />
            </div>

            <div className="py-3.5 flex justify-between items-center">
              <div className="space-y-0.5">
                <span className="text-xs font-semibold block">Sustainable Eco Tips</span>
                <span className="text-[10px] text-slate-500">Weekly platform tips to reduce single-use plastic.</span>
              </div>
              <input
                type="checkbox"
                checked={notifTips}
                onChange={(e) => handleTogglePref("tips", e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500 cursor-pointer"
              />
            </div>
          </div>
        </section>

        {/* Logout button */}
        <section className="flex justify-center pt-4">
          {showSignOutConfirm ? (
            <div className="glass-panel p-4 rounded-2xl border border-red-500/20 text-center space-y-3 shadow-lg max-w-sm w-full">
              <span className="text-xs font-bold block text-red-400">Confirm Sign Out?</span>
              <div className="flex gap-3 justify-center">
                <button
                  onClick={handleSignOut}
                  className="px-4 py-1.5 bg-red-500 text-white hover:bg-red-600 text-xs font-bold rounded-lg transition-all"
                >
                  Yes, Log out
                </button>
                <button
                  onClick={() => setShowSignOutConfirm(false)}
                  className="px-4 py-1.5 bg-slate-900 border border-white/10 hover:bg-slate-800 text-xs text-slate-300 font-bold rounded-lg transition-all"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowSignOutConfirm(true)}
              className="px-6 py-2.5 bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 text-red-400 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-md"
            >
              <LogOut className="h-4 w-4" />
              <span>Log out profile</span>
            </button>
          )}
        </section>

      </main>
    </div>
  )
}
