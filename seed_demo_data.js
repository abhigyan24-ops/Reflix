const admin = require("firebase-admin")
const fs = require("fs")
const path = require("path")

// Initialize Firebase Admin SDK
const serviceAccountPath = path.join(__dirname, "backend", "serviceAccountKey.json")
const hasServiceAccount = fs.existsSync(serviceAccountPath)

if (process.env.FIRESTORE_EMULATOR_HOST) {
  admin.initializeApp({
    projectId: "refillx-smart"
  })
  console.log("Seeding against local Firestore emulator: " + process.env.FIRESTORE_EMULATOR_HOST)
} else if (hasServiceAccount || process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  try {
    if (hasServiceAccount) {
      admin.initializeApp({
        credential: admin.credential.cert(require(serviceAccountPath))
      })
    } else {
      admin.initializeApp()
    }
    console.log("Firebase Admin SDK initialized successfully with credentials.")
  } catch (e) {
    console.warn("Failed to initialize Firebase Admin SDK:", e.message)
    process.exit(1)
  }
} else {
  console.log("Error: Neither serviceAccountKey.json, GOOGLE_APPLICATION_CREDENTIALS, nor FIRESTORE_EMULATOR_HOST detected.")
  console.log("Please place serviceAccountKey.json in the backend/ folder, run the emulator, or log in with Firebase CLI.")
  process.exit(1)
}

const db = admin.firestore()

async function seedData() {
  console.log("Starting RefillX database seeding...")

  // 1. Seed Dispensers
  const dispensers = {
    "sim-001": {
      name: "Metro Station Gate 2",
      location: "Central Noida Tech Zone",
      latitude: 12.9279,
      longitude: 77.6271,
      productType: "Purified Alkaline Water",
      stockLevel: 85,
      status: "Active",
      pricePerLitre: 30,
      updatedAt: new Date()
    },
    "sim-002": {
      name: "Tech Park Main Entrance",
      location: "Sector 62 Outer Gate",
      latitude: 12.9350,
      longitude: 77.6180,
      productType: "Chilled Mineral Water",
      stockLevel: 45,
      status: "Maintenance",
      pricePerLitre: 30,
      updatedAt: new Date()
    },
    "sim-003": {
      name: "Central Mall Level 1",
      location: "Near Food Court Area",
      latitude: 12.9150,
      longitude: 77.6350,
      productType: "Sparkling Infused Water",
      stockLevel: 92,
      status: "Active",
      pricePerLitre: 30,
      updatedAt: new Date()
    }
  }

  for (const [id, data] of Object.entries(dispensers)) {
    await db.collection("dispensers").doc(id).set(data)
    console.log(`[Seeder] Seeded dispenser: ${id}`)
  }

  // 2. Seed Users
  const users = {
    "usr_test_savior": {
      name: "Priya Sharma",
      phone: "+91 9876543210",
      walletBalance: 250.00,
      ecoPoints: 420,
      tier: "Eco-Hero",
      createdAt: new Date(),
      role: "customer"
    },
    "usr_test_rahul": {
      name: "Rahul Verma",
      phone: "+91 9123456789",
      walletBalance: 45.00,
      ecoPoints: 85,
      tier: "Regular",
      createdAt: new Date(),
      role: "customer"
    },
    "usr_test_vendor": {
      name: "Admin Vendor",
      phone: "+91 9999999999",
      walletBalance: 1200.00,
      ecoPoints: 0,
      tier: "Occasional",
      createdAt: new Date(),
      role: "vendor"
    }
  }

  for (const [uid, data] of Object.entries(users)) {
    await db.collection("users").doc(uid).set(data)
    console.log(`[Seeder] Seeded user profile: ${uid} (${data.name})`)
  }

  // 3. Seed 20 Transactions
  console.log("Generating 20 historical transaction records...")
  const uids = ["usr_test_savior", "usr_test_rahul"]
  const machineIds = ["sim-001", "sim-003"]
  const products = ["Purified Alkaline Water", "Sparkling Infused Water"]
  const locations = ["Central Noida Tech Zone", "Near Food Court Area"]

  for (let i = 1; i <= 20; i++) {
    const uid = uids[i % 2]
    const mId = machineIds[i % 2]
    const volumeMl = [250, 500, 1000, 1500, 2000][i % 5]
    const cost = (volumeMl / 1000) * 30
    const pointsEarned = Math.floor(volumeMl / 100)
    const date = new Date(Date.now() - i * 8 * 3600000) // spread out over the last week

    const txnData = {
      uid,
      machineId: mId,
      volume: `${volumeMl} ml`,
      cost: cost,
      productType: products[i % 2],
      location: locations[i % 2],
      timestamp: date,
      receiptUrl: "https://refillx-smart.appspot.com/receipts/dummy.pdf",
      ecoPointsEarned: pointsEarned,
      status: "complete",
      type: "debit",
      method: "Refill Session"
    }

    await db.collection("transactions").doc(`txn_seed_${i}`).set(txnData)
  }
  console.log("[Seeder] Seeded 20 completed transactions.")

  // 4. Seed Forecasts
  const forecasts = {
    "sim-001": {
      nextRefillAt: new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString(),
      predictedDemand: [15.2, 18.0, 14.5, 21.0, 25.5, 29.0, 19.8],
      updatedAt: new Date()
    },
    "sim-002": {
      nextRefillAt: new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString(),
      predictedDemand: [8.5, 11.2, 10.0, 9.8, 14.0, 15.5, 12.0],
      updatedAt: new Date()
    },
    "sim-003": {
      nextRefillAt: new Date(Date.now() + 2 * 24 * 3600 * 1000).toISOString(),
      predictedDemand: [22.4, 25.8, 28.0, 31.2, 35.0, 39.5, 30.1],
      updatedAt: new Date()
    }
  }

  for (const [id, data] of Object.entries(forecasts)) {
    await db.collection("forecasts").doc(id).set(data)
    console.log(`[Seeder] Seeded AI forecasts: ${id}`)
  }

  // 5. Seed Eco Passports
  const passports = {
    "usr_test_savior": {
      uid: "usr_test_savior",
      userName: "Priya Sharma",
      totalVolume: 28.5, // Litres
      totalTransactions: 15,
      totalCO2Saved: 14.25, // 0.5kg per Litre
      totalPlasticSaved: 798, // 28g per Litre
      ecoPoints: 420,
      tier: "Eco-Hero",
      ecoPassportUrl: "https://refillx-smart.appspot.com/receipts/dummy.pdf",
      generatedAt: Date.now()
    }
  }

  for (const [uid, data] of Object.entries(passports)) {
    await db.collection("ecoPassports").doc(uid).set(data)
    console.log(`[Seeder] Seeded Eco Passport: ${uid}`)
  }

  console.log("RefillX Firestore database seeding complete! Ready for demo.")
}

seedData().catch((err) => {
  console.error("Database seeding failed:", err)
})
