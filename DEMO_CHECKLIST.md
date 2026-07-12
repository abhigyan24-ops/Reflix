# RefillX — PWA Demo Verification & Execution Checklist

This checklist describes the steps to initialize, verify, and demonstrate the RefillX Smart Water Refilling platform across all layers.

---

## 1. System Setup & Initialization

### A. Database Seeding
Populate Firestore with dispensers, demo users, transaction logs, forecasts, and impact metrics.
- Ensure your Firebase CLI is logged in, or configure the Firestore emulator.
- Place `serviceAccountKey.json` inside the `backend/` folder (only if running against a live production project).
- Run the seeding script in the project root:
  ```bash
  node seed_demo_data.js
  ```
- **Validation**: Open Firebase Console (or Emulator UI) and verify collections are populated:
  - `users`: Includes `usr_test_savior`, `usr_test_rahul`, and `usr_test_vendor`.
  - `dispensers`: Includes `sim-001`, `sim-002`, `sim-003`.
  - `transactions`: Includes 20 historical documents.
  - `forecasts`: Includes ARIMA/LSTM predicted demand coordinates.
  - `ecoPassports`: Contains a detailed impact passport for Priya Sharma.

### B. Start Edge Simulator
Launch the virtual ESP32 simulator to broadcast telemetry heartbeats and listen for secure commands.
- Run the python script in the root directory:
  ```bash
  python virtual_esp32.py
  ```
- **Validation**: Verify output prints: `Subscribed to: refillx/dispensers/sim-001/command`. The virtual dispenser will enter `IDLE` state and start sending periodic status heartbeats.

### C. Run Web Application
Boot the React Vite dev server:
- Change directory to `frontend/` and start:
  ```bash
  npm run dev
  ```
- **Validation**: Open the browser console and check that there are no console errors and the service worker/IndexedDB database persistent cache loads cleanly.

---

## 2. Interactive Walkthrough Script (6 Steps)

Run through these stages inside the **Walkthrough Timer / Edge Simulator** screen (`/simulation`) to present the live flow:

| Elapsed Time | Walkthrough Stage | Key Visuals & Interactions |
| :--- | :--- | :--- |
| **0:00 - 0:20** | **Step 1: Open PWA & Login** | Open `/login` tab. Authenticate using Priya's test profile (`usr_test_savior`). Show that dark mode class switches harmoniously. |
| **0:20 - 0:45** | **Step 2: Authenticate & Wallet** | Navigate to `/wallet`. Observe real-time Firestore sync of current balance (₹250.00). Simulate a UPI Top-Up of ₹200 and verify instant balance increase. |
| **0:45 - 1:15** | **Step 3: Station & QR** | Navigate to `/refill`. Select nearest dispenser sorted by Haversine GPS. Pick 500ml preset volume. Click **Generate QR** and verify 90s expiring ring timer starts. |
| **1:15 - 1:45** | **Step 4: Live Dispensing** | Start Simulated Dispense in the Edge Simulator. In the Refill tab, watch the dispenser status instantly transition to `Dispensing`. Observe the wave bottle fill animation. |
| **1:45 - 2:15** | **Step 5: Wallet Check & History** | Dispensing finishes. Status reverts to `Active` with a green checkmark. Navigate to `/history` and verify the new transaction row was added with a downloadable PDF. |
| **2:15 - 3:00** | **Step 6: Vendor & AI Analytics** | Open `/vendor/dashboard`. View ARIMA peak forecasting plots. View the user segments K-means clusters. Check Priya's completed Eco Passport badge. |

---

## 3. Systems Integration Checks

- [ ] **Offline Resilience**: Turn Network state to Offline in Chrome DevTools. Check that the red banner renders at the top of the PWA. Open the History tab and check that previous logs still load instantly from IndexedDB cache.
- [ ] **Rate Limiting**: Attempt to hit **Top-Up** more than 5 times in 60s. Confirm request is blocked with `resource-exhausted` code.
- [ ] **HMAC Signature**: Ensure the Edge Simulator rejects scan triggers if the QR payload contains modified or falsified signatures.
- [ ] **Responsive View**: Collapse browser window to mobile width. Verify top header folds away and bottom 5-tab bar appears.
