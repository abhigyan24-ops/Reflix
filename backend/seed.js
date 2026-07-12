const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");

const serviceAccountPath = path.join(__dirname, "serviceAccountKey.json");
const hasServiceAccount = fs.existsSync(serviceAccountPath);

if (hasServiceAccount || process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  try {
    if (hasServiceAccount) {
      admin.initializeApp({
        credential: admin.credential.cert(require(serviceAccountPath))
      });
    } else {
      admin.initializeApp();
    }
    console.log("Firebase Admin SDK initialized with credentials.");
  } catch (e) {
    console.warn("Failed to initialize Firebase Admin SDK:", e.message);
  }
} else {
  console.log("Running in LOCAL SIMULATION mode (no serviceAccountKey.json or GOOGLE_APPLICATION_CREDENTIALS detected).");
}

const seedData = JSON.parse(fs.readFileSync(path.join(__dirname, "seed-data.json"), "utf8"));

async function seed() {
  const db = (admin.apps.length > 0) ? admin.firestore() : null;

  for (const [colName, docs] of Object.entries(seedData)) {
    console.log(`Processing collection: ${colName}`);
    for (const [docId, docData] of Object.entries(docs)) {
      if (db) {
        await db.collection(colName).doc(docId).set(docData);
        console.log(`[Firestore] Successfully seeded ${colName}/${docId}`);
      } else {
        console.log(`[Simulated] Would seed ${colName}/${docId} with data:`, docData);
      }
    }
  }
  console.log("Firestore seeding operation completed.");
}

seed().catch(err => {
  console.error("Seeding failed:", err);
});
