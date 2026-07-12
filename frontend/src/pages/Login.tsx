import React, { useState, useEffect, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { RecaptchaVerifier, signInWithPhoneNumber, GoogleAuthProvider, signInWithPopup } from "firebase/auth"
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore"
import { auth, db } from "../lib/firebase"
import { useAuthStore } from "../store/useAuthStore"
import { Droplet, Phone, Globe, Sparkles } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { toast, Toaster } from "react-hot-toast"

export default function Login() {
  const navigate = useNavigate()
  const { setUser, setUserProfile } = useAuthStore()

  const [phone, setPhone] = useState("")
  const [countryCode, setCountryCode] = useState("+91")
  const [otpValues, setOtpValues] = useState<string[]>(Array(6).fill(""))
  const [step, setStep] = useState<"phone" | "otp">("phone")
  const [loading, setLoading] = useState(false)
  const [confirmationResult, setConfirmationResult] = useState<any>(null)

  const otpInputsRef = useRef<HTMLInputElement[]>([])
  const recaptchaVerifierRef = useRef<RecaptchaVerifier | null>(null)

  useEffect(() => {
    // Initialize Invisible Recaptcha Verifier
    if (!recaptchaVerifierRef.current) {
      try {
        recaptchaVerifierRef.current = new RecaptchaVerifier(auth, "recaptcha-container", {
          size: "invisible",
          callback: () => {
            // Recaptcha resolved
          },
          "expired-callback": () => {
            toast.error("reCAPTCHA verification expired. Please try again.")
          }
        })
      } catch (err: any) {
        console.error("Failed to initialize RecaptchaVerifier:", err)
      }
    }

    return () => {
      if (recaptchaVerifierRef.current) {
        try {
          recaptchaVerifierRef.current.clear()
        } catch (e) {}
        recaptchaVerifierRef.current = null
      }
    }
  }, [])

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!phone || phone.trim().length < 10) {
      toast.error("Please enter a valid phone number.")
      return
    }

    setLoading(true)
    try {
      const fullPhone = `${countryCode}${phone.trim()}`
      const appVerifier = recaptchaVerifierRef.current

      if (!appVerifier) {
        throw new Error("Invisible reCAPTCHA has not been initialized.")
      }

      const confirmation = await signInWithPhoneNumber(auth, fullPhone, appVerifier)
      setConfirmationResult(confirmation)
      setStep("otp")
      toast.success("OTP sent to your mobile device!")
      
      // Auto focus first OTP digit
      setTimeout(() => {
        otpInputsRef.current[0]?.focus()
      }, 300)

    } catch (error: any) {
      console.error("Phone OTP error:", error)
      toast.error(error.message || "Failed to trigger OTP verification.")
      
      // Reset Recaptcha Verifier on failure
      if (recaptchaVerifierRef.current) {
        try {
          recaptchaVerifierRef.current.clear()
        } catch (e) {}
        recaptchaVerifierRef.current = new RecaptchaVerifier(auth, "recaptcha-container", {
          size: "invisible"
        })
      }
    } finally {
      setLoading(false)
    }
  }

  const handleOtpChange = (index: number, value: string) => {
    if (value && isNaN(Number(value))) return
    
    const newOtp = [...otpValues]
    newOtp[index] = value.slice(-1)
    setOtpValues(newOtp)

    // Focus next box
    if (value && index < 5) {
      otpInputsRef.current[index + 1]?.focus()
    }
  }

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !otpValues[index] && index > 0) {
      const newOtp = [...otpValues]
      newOtp[index - 1] = ""
      setOtpValues(newOtp)
      otpInputsRef.current[index - 1]?.focus()
    }
  }

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    const otpCode = otpValues.join("")
    if (otpCode.length !== 6) {
      toast.error("Please enter the complete 6-digit OTP.")
      return
    }

    setLoading(true)
    try {
      const result = await confirmationResult.confirm(otpCode)
      const user = result.user

      // Read profile or create one
      const userDocRef = doc(db, "users", user.uid)
      const userSnap = await getDoc(userDocRef)
      
      let profile: any
      if (!userSnap.exists()) {
        profile = {
          name: "Savior_" + user.uid.substring(0, 5),
          phone: user.phoneNumber || `${countryCode}${phone}`,
          walletBalance: 0,
          ecoPoints: 0,
          tier: "Occasional",
          createdAt: serverTimestamp()
        }
        await setDoc(userDocRef, profile)
      } else {
        profile = userSnap.data()
      }

      setUser(user)
      setUserProfile(profile)
      toast.success("Welcome to RefillX!")
      navigate("/home")
    } catch (error: any) {
      console.error("OTP Verification failed:", error)
      toast.error("Invalid verification code. Please check and try again.")
    } finally {
      setLoading(false)
    }
  }

  const handleGoogleLogin = async () => {
    setLoading(true)
    try {
      const provider = new GoogleAuthProvider()
      const result = await signInWithPopup(auth, provider)
      const user = result.user

      const userDocRef = doc(db, "users", user.uid)
      const userSnap = await getDoc(userDocRef)
      
      let profile: any
      if (!userSnap.exists()) {
        profile = {
          name: user.displayName || "Eco Champion",
          phone: user.phoneNumber || "",
          walletBalance: 0,
          ecoPoints: 0,
          tier: "Occasional",
          createdAt: serverTimestamp()
        }
        await setDoc(userDocRef, profile)
      } else {
        profile = userSnap.data()
      }

      setUser(user)
      setUserProfile(profile)
      toast.success("Logged in with Google!")
      navigate("/home")
    } catch (error: any) {
      console.error("Google Auth error:", error)
      toast.error(error.message || "Google authentication failed.")
    } finally {
      setLoading(false)
    }
  }

  const handleBypassLogin = () => {
    const mockUser = {
      uid: "usr_test_savior",
      email: "priya@example.com",
      phoneNumber: "+919876543210",
      displayName: "Priya Sharma",
    } as any

    const mockProfile = {
      name: "Priya Sharma",
      phone: "+91 9876543210",
      walletBalance: 250.0,
      ecoPoints: 420,
      tier: "Eco-Hero",
      role: "vendor",
      notificationPrefs: {
        dispenseComplete: true,
        lowWallet: true,
        ecoTips: false,
      },
    }

    setUser(mockUser)
    setUserProfile(mockProfile)
    toast.success("Logged in (Demo Bypass Mode)!")
    navigate("/home")
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 relative overflow-hidden bg-slate-950 text-white">
      <Toaster position="top-right" />
      <div id="recaptcha-container"></div>

      {/* Decorative Glow Elements */}
      <div className="absolute top-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-blue-600/15 rounded-full blur-3xl"></div>
      <div className="absolute bottom-1/4 right-1/4 translate-x-1/2 translate-y-1/2 w-80 h-80 bg-cyan-600/15 rounded-full blur-3xl"></div>

      <div className="w-full max-w-md glass-panel p-8 rounded-2xl shadow-2xl relative z-10 border border-white/10">
        <div className="flex flex-col items-center mb-8">
          <div className="bg-blue-500/20 p-4 rounded-full border border-blue-500/30 mb-3 animate-pulse">
            <Droplet className="h-8 w-8 text-blue-400" />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-cyan-400">
            RefillX
          </h1>
          <p className="text-slate-400 text-xs mt-1">Smart Refill Infrastructure Platform</p>
        </div>

        <AnimatePresence mode="wait">
          {step === "phone" ? (
            <motion.div
              key="phone-screen"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.2 }}
            >
              <form onSubmit={handleSendOtp} className="space-y-5">
                <div>
                  <label className="block text-xs font-semibold text-slate-350 uppercase tracking-wider mb-2">
                    Phone Number
                  </label>
                  <div className="flex space-x-2">
                    {/* Country Code Select */}
                    <div className="relative">
                      <select
                        value={countryCode}
                        onChange={(e) => setCountryCode(e.target.value)}
                        className="bg-slate-900/60 border border-slate-700/50 rounded-xl py-3 pl-3 pr-8 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 text-sm appearance-none cursor-pointer"
                      >
                        <option value="+91">+91 (IN)</option>
                        <option value="+1">+1 (US)</option>
                        <option value="+44">+44 (UK)</option>
                        <option value="+971">+971 (AE)</option>
                      </select>
                      <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none text-xs">▼</span>
                    </div>

                    <div className="relative flex-1">
                      <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-450">
                        <Phone className="h-4 w-4" />
                      </span>
                      <input
                        type="tel"
                        placeholder="9876543210"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        className="w-full bg-slate-900/60 border border-slate-700/50 rounded-xl py-3 pl-9 pr-4 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 text-sm transition-all"
                        required
                      />
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white font-bold rounded-xl transition-all shadow-lg hover:shadow-blue-500/20 active:scale-[0.98] disabled:opacity-50 text-sm"
                >
                  {loading ? "Requesting OTP..." : "Send Verification OTP"}
                </button>
              </form>
            </motion.div>
          ) : (
            <motion.div
              key="otp-screen"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
            >
              <form onSubmit={handleVerifyOtp} className="space-y-6">
                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-slate-350 uppercase tracking-wider text-center">
                    Enter Verification Code
                  </label>
                  <p className="text-[10px] text-slate-400 text-center">We sent a 6-digit code to {countryCode} {phone}</p>
                  
                  {/* individual boxes */}
                  <div className="flex justify-between gap-2 max-w-[280px] mx-auto pt-2">
                    {otpValues.map((digit, index) => (
                      <input
                        key={index}
                        type="text"
                        maxLength={1}
                        value={digit}
                        ref={(el) => (otpInputsRef.current[index] = el as HTMLInputElement)}
                        onChange={(e) => handleOtpChange(index, e.target.value)}
                        onKeyDown={(e) => handleOtpKeyDown(index, e)}
                        className="w-10 h-12 bg-slate-900/80 border border-slate-700/60 rounded-lg text-center text-lg font-bold text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all"
                      />
                    ))}
                  </div>
                </div>

                <div className="flex justify-between items-center text-xs px-2">
                  <span className="text-slate-400">Didn't receive the SMS?</span>
                  <button
                    type="button"
                    onClick={() => { setStep("phone"); setOtpValues(Array(6).fill("")); }}
                    className="text-blue-400 hover:underline font-semibold"
                  >
                    Change phone
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white font-bold rounded-xl transition-all shadow-lg hover:shadow-blue-500/20 active:scale-[0.98] disabled:opacity-50 text-sm"
                >
                  {loading ? "Validating..." : "Verify & Authenticate"}
                </button>
              </form>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-slate-800"></div>
          </div>
          <div className="relative flex justify-center text-[10px] uppercase">
            <span className="bg-slate-950 px-3 text-slate-500 font-bold tracking-wider">Or authenticate with</span>
          </div>
        </div>

        <button
          onClick={handleGoogleLogin}
          disabled={loading}
          className="w-full py-2.5 bg-slate-900/60 hover:bg-slate-900 border border-slate-800 hover:border-slate-700 text-white font-medium rounded-xl flex items-center justify-center space-x-3 transition-all text-xs"
        >
          <Globe className="h-4 w-4 text-blue-400 animate-spin-slow" />
          <span>Sign in with Google</span>
        </button>

        <button
          onClick={handleBypassLogin}
          className="w-full mt-3 py-2.5 bg-teal-500/10 hover:bg-teal-500/20 border border-teal-500/20 hover:border-teal-500/40 text-teal-400 font-extrabold rounded-xl flex items-center justify-center space-x-2 transition-all text-xs"
        >
          <Sparkles className="h-4.5 w-4.5 animate-pulse" />
          <span>Demo Bypass (Direct Access)</span>
        </button>
      </div>
    </div>
  )
}
