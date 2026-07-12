import { initializeApp } from "firebase/app"
import { getAuth } from "firebase/auth"
import { getFirestore } from "firebase/firestore"
import { getStorage } from "firebase/storage"
import { getMessaging, isSupported } from "firebase/messaging"

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyDummyKeyForRefillxSimulation_999",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "refillx-smart.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "refillx-smart",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "refillx-smart.appspot.com",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "000000000000",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:000000000000:web:0000000000000000000000",
}

// Initialize Firebase
const app = initializeApp(firebaseConfig)

export const auth = getAuth(app)
export const db = getFirestore(app)

import { enableIndexedDbPersistence } from "firebase/firestore"
enableIndexedDbPersistence(db).catch((err) => {
  if (err.code === "failed-precondition") {
    console.warn("Firestore offline persistence failed: Multiple tabs open.")
  } else if (err.code === "unimplemented") {
    console.warn("Firestore offline persistence not supported by browser.")
  }
})
export const storage = getStorage(app)

// FCM requires browser compatibility check
export const getFCM = async () => {
  const supported = await isSupported()
  if (supported) {
    return getMessaging(app)
  }
  console.warn("Firebase Messaging is not supported in this browser.")
  return null
}

export default app
