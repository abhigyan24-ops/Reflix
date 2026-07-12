
    // === LOCAL CLOUD CLIENT (Replacing Firebase) ===
    const CLOUD_URL = window.location.origin;
    
    // Polyfill Firebase functions
    window.db = "LocalCloud";
    window.fbRef = (db, path) => path;
    
    const PRODUCTS = {
      water: { name: "RO Water", icon: "💧", price: 0.20, color: "#0ea5e9" },
      shampoo: { name: "Shampoo", icon: "🧴", price: 80.00, color: "#4a2b66" },
      detergent: { name: "Liquid Detergent", icon: "🫧", price: 20.00, color: "#7d4411" },
      handwash: { name: "Handwash", icon: "🤲", price: 30.00, color: "#175452" },
      oil: { name: "Cooking Oil", icon: "🫒", price: 15.00, color: "#9c7625" }
    };
    const TIERS = [
      { name: "Bronze", min: 0, discount: 0, color: "#cd7f32" },
      { name: "Silver", min: 2000, discount: 0.05, color: "#c0c0c0" },
      { name: "Gold", min: 5000, discount: 0.10, color: "#ffd700" },
      { name: "Platinum", min: 10000, discount: 0.15, color: "#e5e4e2" }
    ];

    window.USER = JSON.parse(localStorage.getItem('rxMobileUser'));
    window.ORDER = { product: 'water', quantity: 500, amount: 0 };
    window.CURRENT_SID = null;
    let isOnline = true;
    let rxHistory = []; let rxTier = TIERS[0];
    let sessionListener = null;

    // Toast System
    window.showInAppToast = function(message, type='info') {
      const colors = { success:'#3ecf7a', warning:'#f0b429', error:'#ff4d4d', info:'#3ecf7a' };
      const toast = document.createElement('div');
      toast.style.cssText = `position:fixed; top:70px; left:50%; transform:translateX(-50%) translateY(-100px); background:rgba(15,40,22,0.95); backdrop-filter:blur(16px); border-left:4px solid ${colors[type]}; border-radius:8px; padding:12px 20px; color:#f5f7f2; font-size:0.875rem; z-index:9999; max-width:320px; text-align:center; transition:transform 0.3s ease; box-shadow:0 8px 32px rgba(0,0,0,0.4);`;
      toast.textContent = message;
      document.body.appendChild(toast);
      requestAnimationFrame(() => { toast.style.transform = 'translateX(-50%) translateY(0)'; });
      setTimeout(() => { toast.style.transform = 'translateX(-50%) translateY(-100px)'; setTimeout(() => toast.remove(), 300); }, 4000);
    }

    // Offline Wrappers
    function getPending() { return JSON.parse(localStorage.getItem('rxPendingWrites') || '[]'); }
    function savePending(p) { localStorage.setItem('rxPendingWrites', JSON.stringify(p)); }

    async function safeSet(path, data) {
      try {
        if(!isOnline) throw new Error("Offline");
        await fetch(CLOUD_URL + '/api/set', { method:'POST', body: JSON.stringify({path, data}) });
      } catch(e) {
        const p = getPending(); p.push({ action: 'set', path, data }); savePending(p);
      }
    }
    
    async function safePush(path, data) {
      try {
        if(!isOnline) throw new Error("Offline");
        await fetch(CLOUD_URL + '/api/push', { method:'POST', body: JSON.stringify({path, data}) });
      } catch(e) {
        const p = getPending(); p.push({ action: 'push', path, data }); savePending(p);
      }
    }

    async function safeUpdate(path, data) {
      try {
        if(!isOnline) throw new Error("Offline");
        await fetch(CLOUD_URL + '/api/update', { method:'POST', body: JSON.stringify({path, data}) });
      } catch(e) {
        const p = getPending(); p.push({ action: 'update', path, data }); savePending(p);
      }
    }
    
    window.fbGet = async function(path) {
       const res = await fetch(CLOUD_URL + '/api/get?path=' + encodeURIComponent(path));
       const data = await res.json();
       return { exists: () => data.value !== null, val: () => data.value };
    }
    window.get = window.fbGet;
    window.ref = window.fbRef;
    window.safeUpdate = safeUpdate; window.safeSet = safeSet; window.safePush = safePush;
    
    let GLOBAL_STATE = {};
    const listeners = [];

    window.fbOnValue = function(path, callback) {
      listeners.push({ path, callback });
    }
    window.onValue = window.fbOnValue;

    function getByPath(d, p) {
      const keys = p.split('/').filter(k=>k);
      let curr = d;
      for(let k of keys) { if(curr && curr[k] !== undefined) curr = curr[k]; else return null; }
      return curr;
    }

    setInterval(async () => {
      try {
        const res = await fetch(CLOUD_URL + '/api/sync');
        if(!res.ok) throw new Error("Server error");
        const data = await res.json();
        
        if(!isOnline) {
          isOnline = true;
          const pending = getPending();
          if(pending.length > 0) {
             for(let task of pending) {
               try { await fetch(CLOUD_URL + '/api/' + task.action, { method:'POST', body: JSON.stringify({path:task.path, data:task.data}) }); } catch(e){}
             }
             savePending([]);
          }
        }
        
        GLOBAL_STATE = data;
        listeners.forEach(l => {
           const val = getByPath(data, l.path);
           if(val !== null) l.callback({ val: () => val, exists: () => val !== null });
        });
        
        document.getElementById('conn-banner').style.display = 'none';
      } catch(e) {
        isOnline = false;
        document.getElementById('conn-banner').style.display = 'block';
      }
    }, 1500);

    // Request Notification Permission on first UI tap
    async function requestNotificationPermission() {
      if ('Notification' in window && Notification.permission === 'default') {
        const permission = await Notification.requestPermission();
        localStorage.setItem('rxNotifPermission', permission);
      }
    }
    document.addEventListener('click', requestNotificationPermission, { once: true });

    // Listen to Prices
    onValue(ref(db, 'settings/prices'), (snap) => {
       const rxPrices = snap.val() || {};
       Object.keys(rxPrices).forEach(k => { if(PRODUCTS[k]) PRODUCTS[k].price = rxPrices[k]; });
       if (document.getElementById('m-prod-grid') && window.USER) initOrderScreen();
    });

    // Listen to Tanks for Restock/Low Stock alerts
    onValue(ref(db, 'stations/RFX-001/tanks'), (snap) => {
       const tanks = snap.val();
       if(!tanks) return;
       const prevTanks = JSON.parse(localStorage.getItem('rxPrevTanks') || '{}');
       
       Object.entries(tanks).forEach(([product, level]) => {
         const prevLevel = prevTanks[product] || 0;
         if (prevLevel < 500 && level >= 500) {
            const litres = (level/1000).toFixed(1);
            if(Notification.permission === 'granted') {
               new Notification('RefillX — Back in Stock! 🎉', { body: `${PRODUCTS[product].name} is now available at RFX-001 (${litres}L restocked)`, icon: '/favicon.ico' });
            }
            window.showInAppToast(`${PRODUCTS[product].name} back in stock at RFX-001!`, 'success');
         } else if (prevLevel >= 500 && level < 500 && level > 0) {
            window.showInAppToast(`⚠ ${PRODUCTS[product].name} running low at RFX-001 — refill soon`, 'warning');
         }
       });
       localStorage.setItem('rxPrevTanks', JSON.stringify(tanks));
    });

    window.onload = () => {
      if(window.USER) {
        setupUserListeners();
        initOrderScreen();
        document.getElementById('bottom-nav').style.display = 'flex';
        showScreen('order');
      }
    };

    function setupUserListeners() {
      if(!window.USER) return;
      onValue(ref(db, `users/${window.USER.uid}/history`), (snap) => {
        const histData = snap.val() || {};
        rxHistory = Object.values(histData).sort((a,b) => a.timestamp - b.timestamp);
        
        const totalVol = rxHistory.reduce((s, h) => s + h.quantity, 0);
        let nTier = TIERS[0];
        for(let i=TIERS.length-1; i>=0; i--) { if(totalVol >= TIERS[i].min) { nTier = TIERS[i]; break; } }
        rxTier = nTier;
        
        safeUpdate(`users/${window.USER.uid}/profile`, { tier: nTier.name, totalMlRefilled: totalVol });
        
        if(document.getElementById('screen-history').classList.contains('active')) renderHistory();
        if(document.getElementById('screen-eco').classList.contains('active')) renderEcoPassport();
      });
      loadSubscriptions();
    }

    window.switchNav = function(id, elem) {
      document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
      elem.classList.add('active');
      showScreen(id);
    }
    window.showScreen = function(id) {
      document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
      document.getElementById('screen-'+id).classList.add('active');
    }

    window.handleRegister = function() {
      const name = document.getElementById('reg-name').value.trim();
      const email = document.getElementById('reg-email').value.trim();
      if(!name || !email) return alert("Required");
      const uid = email.replace(/[^a-zA-Z0-9]/g, '_');
      window.USER = { uid, name, email, initials: name.substring(0,2).toUpperCase() };
      localStorage.setItem('rxMobileUser', JSON.stringify(window.USER));
      
      safeUpdate(`users/${uid}/profile`, { name, email, joinedAt: Date.now() });
      setupUserListeners();
      document.getElementById('bottom-nav').style.display = 'flex';
      initOrderScreen(); showScreen('order');
    }

    window.handleLogout = function() {
      localStorage.removeItem('rxMobileUser'); window.USER = null;
      document.getElementById('bottom-nav').style.display = 'none';
      showScreen('register');
    }

    // Ordering UI
    window.initOrderScreen = function() {
      if(!window.USER) return;
      document.getElementById('user-initials').innerText = window.USER.initials;
      const grid = document.getElementById('m-prod-grid');
      grid.innerHTML = '';
      Object.entries(PRODUCTS).forEach(([key, p]) => {
        const card = document.createElement('div');
        card.className = `prod-card ${key === window.ORDER.product ? 'selected' : ''}`;
        card.innerHTML = `<div class="prod-icon">${p.icon}</div><div class="font-bold">${p.name}</div><div class="text-xs text-gray-400 mt-1">₹${p.price.toFixed(2)}/100ml</div>`;
        card.onclick = () => {
          window.ORDER.product = key;
          document.querySelectorAll('.prod-card').forEach(c => c.classList.remove('selected'));
          card.classList.add('selected'); updatePrice();
        };
        grid.appendChild(card);
      });
      updatePrice();
    }
    
    window.updateVolume = function(val) {
      window.ORDER.quantity = parseInt(val);
      document.getElementById('m-qty-val').innerText = val + "ml";
      updatePrice();
    }
    window.updatePrice = function() {
      const basePrice = (window.ORDER.quantity / 100) * PRODUCTS[window.ORDER.product].price;
      document.getElementById('m-subtotal-val').innerText = '₹' + basePrice.toFixed(2);
      if (rxTier.discount > 0) {
        document.getElementById('discount-row').style.display = 'flex';
        document.getElementById('m-discount-label').innerText = `${rxTier.name} discount (-${rxTier.discount*100}%)`;
        document.getElementById('m-discount-val').innerText = '-₹' + (basePrice * rxTier.discount).toFixed(2);
        window.ORDER.amount = basePrice - (basePrice * rxTier.discount);
      } else {
        document.getElementById('discount-row').style.display = 'none'; window.ORDER.amount = basePrice;
      }
      document.getElementById('m-price-val').innerText = '₹' + window.ORDER.amount.toFixed(2);
    }

    // QR Dispense Logic
    window.generateOrderQR = function() {
      window.CURRENT_SID = "RFX-" + Math.random().toString(36).slice(2, 10).toUpperCase();
      const payload = {
        sid: window.CURRENT_SID, uid: window.USER.uid,
        prod: window.ORDER.product, qty: window.ORDER.quantity,
        exp: Date.now() + 3600000 
      };
      
      document.getElementById("qrcode").innerHTML = "";
      new QRCode(document.getElementById("qrcode"), { text: JSON.stringify(payload), width: 220, height: 220, colorDark: "#000", colorLight: "#fff" });
      document.getElementById('qr-desc').innerText = `${window.ORDER.quantity}ml ${PRODUCTS[window.ORDER.product].name}`;
      document.getElementById('session-display').innerText = "ID: " + window.CURRENT_SID;
      
      showScreen('qr'); listenSession(window.CURRENT_SID);
    }

    function listenSession(sid) {
      if(sessionListener) sessionListener();
      
      // Listen to specific station dispense node per Prompt 1
      sessionListener = onValue(ref(db, `stations/RFX-001/dispense`), (snap) => {
         const data = snap.val();
         if(!data) return;
         
         if(data.status === 'dispensing') {
            showScreen('payment');
            document.getElementById('payment-timer-ui').style.display = 'block';
            document.getElementById('payment-action-ui').classList.replace('flex','hidden');
            
            // Mirror progress
            const pct = data.progress || 0;
            document.getElementById('pay-timer-text').innerText = `${pct}%`;
            document.getElementById('pay-timer-circle').style.strokeDashoffset = 314 - (314 * (pct / 100));
         }
         
         if(data.status === 'complete') {
            if(sessionListener) { sessionListener(); sessionListener = null; }
            document.getElementById('payment-timer-ui').style.display = 'none';
            document.getElementById('payment-action-ui').classList.replace('hidden','flex');
            
            document.getElementById('pay-desc').innerText = `${window.ORDER.quantity}ml ${PRODUCTS[window.ORDER.product].name}`;
            document.getElementById('pay-amount-display').innerText = `₹${window.ORDER.amount.toFixed(2)}`;
            window.showInAppToast("Dispense Complete. Ready for payment.", "success");
         }
      });
    }

    window.triggerPayment = function() {
      showScreen('success');
      document.getElementById('success-desc').innerText = `${window.ORDER.quantity}ml ${PRODUCTS[window.ORDER.product].name} refilled`;
      document.getElementById('s-pts').innerText = "+" + Math.floor(window.ORDER.quantity/10);
      document.getElementById('s-co2').innerText = (window.ORDER.quantity * 0.024).toFixed(1) + "g";
      
      safeUpdate(`logs/sessions/${window.CURRENT_SID}`, { status: 'complete' });
    }
    window.finishSuccess = function() { switchNav('order', document.querySelectorAll('.nav-item')[0]); }

    // --- Subscriptions Feature (Prompt 3) ---
    let subForm = { product: 'water', quantity: 500, frequency: 'daily', day: 'mon' };
    
    window.selectSubPill = function(el, type) {
       document.querySelectorAll('.' + type).forEach(n => n.classList.remove('active'));
       el.classList.add('active');
       const val = el.getAttribute('data-val');
       if(type==='sub-prod') subForm.product = val;
       if(type==='sub-qty') subForm.quantity = parseInt(val);
       if(type==='sub-day') subForm.day = val;
       if(type==='sub-freq') {
         subForm.frequency = val;
         document.getElementById('sub-day-picker').style.display = val === 'weekly' ? 'block' : 'none';
       }
    }

    function calculateNextTrigger(frequency, dayOfWeek, timeStr) {
      const [hours, minutes] = timeStr.split(':').map(Number);
      const now = new Date();
      let next = new Date();
      next.setHours(hours, minutes, 0, 0);
      
      if (frequency === 'daily') {
        if (next <= now) next.setDate(next.getDate() + 1);
      } else if (frequency === 'weekly') {
        const targetDay = ['sun','mon','tue','wed','thu','fri','sat'].indexOf(dayOfWeek);
        const daysUntil = (targetDay - now.getDay() + 7) % 7 || 7;
        next.setDate(now.getDate() + daysUntil);
      } else if (frequency === '3days') {
        if (next <= now) next.setDate(next.getDate() + 3);
      } else if (frequency === '2weeks') {
        if (next <= now) next.setDate(next.getDate() + 14);
      }
      return next.getTime();
    }

    window.saveSubscription = async function() {
       const timeStr = document.getElementById('sub-time').value;
       const nextTrigger = calculateNextTrigger(subForm.frequency, subForm.day, timeStr);
       const data = {
         product: subForm.product, quantity: subForm.quantity, frequency: subForm.frequency,
         dayOfWeek: subForm.day, time: timeStr, createdAt: Date.now(),
         lastTriggered: null, nextTrigger: nextTrigger, isActive: true
       };
       await safePush(`users/${window.USER.uid}/subscriptions`, data);
       window.showInAppToast("Subscription Saved Successfully!", "success");
    }

    window.deleteSub = async function(id) {
       await safeSet(`users/${window.USER.uid}/subscriptions/${id}`, null);
    }
    window.toggleSub = async function(id, current) {
       await safeUpdate(`users/${window.USER.uid}/subscriptions/${id}`, { isActive: !current });
    }
    
    let userSubscriptions = {};
    function loadSubscriptions() {
       onValue(ref(db, `users/${window.USER.uid}/subscriptions`), (snap) => {
          userSubscriptions = snap.val() || {};
          renderSubList();
       });
    }
    
    function renderSubList() {
       const list = document.getElementById('sub-list');
       if(!list) return;
       const subs = Object.entries(userSubscriptions);
       if(subs.length === 0) { list.innerHTML = '<div class="text-gray-500 text-sm">No active subscriptions.</div>'; return; }
       
       list.innerHTML = subs.map(([id, s]) => {
          const nextDate = new Date(s.nextTrigger);
          return `
            <div class="bg-[#111] p-4 rounded-xl border border-[#333] ${!s.isActive ? 'opacity-50' : ''}">
               <div class="flex justify-between items-start mb-2">
                 <div class="font-bold">${PRODUCTS[s.product].icon} ${s.quantity}ml ${PRODUCTS[s.product].name}</div>
                 <button class="text-xs text-red-500 bg-red-500/10 px-2 py-1 rounded" onclick="deleteSub('${id}')">Delete</button>
               </div>
               <div class="text-xs text-gray-400 mb-3">${s.frequency.toUpperCase()} @ ${s.time}</div>
               <div class="text-xs text-[#3ecf7a] font-bold mb-3">Next: ${nextDate.toLocaleString()}</div>
               <div class="flex gap-2">
                 <button class="flex-1 text-xs border border-[#333] py-2 rounded font-bold" onclick="toggleSub('${id}', ${s.isActive})">${s.isActive ? 'Pause' : 'Resume'}</button>
                 <button class="flex-1 text-xs bg-[var(--green-bright)] text-black font-bold py-2 rounded" onclick="triggerSubscription('${id}')">Test Trigger</button>
               </div>
            </div>
          `;
       }).join('');
    }

    // Background Check Loop (Every 60s)
    setInterval(() => {
       if(!window.USER) return;
       const now = Date.now();
       Object.entries(userSubscriptions).forEach(([id, s]) => {
          if (s.isActive && s.nextTrigger <= now) triggerSubscription(id);
       });
    }, 60000);

    window.triggerSubscription = async function(id) {
       const sub = userSubscriptions[id];
       if(!sub) return;
       
       const sessionId = 'RFX-' + Date.now().toString(36).toUpperCase();
       const payload = JSON.stringify({ sid: sessionId, uid: window.USER.uid, prod: sub.product, qty: sub.quantity, exp: Date.now() + 1800000 });
       
       // Store ready QR
       await safeSet(`users/${window.USER.uid}/readyQR`, { payload, generatedAt: Date.now(), expiresAt: Date.now() + 1800000 });
       
       // Update next trigger
       await safeUpdate(`users/${window.USER.uid}/subscriptions/${id}`, {
          lastTriggered: Date.now(),
          nextTrigger: calculateNextTrigger(sub.frequency, sub.dayOfWeek, sub.time)
       });
       
       if (Notification.permission === 'granted') {
          new Notification('RefillX — Scheduled Refill Ready! ⏰', { body: `Your ${sub.quantity}ml ${sub.product} refill QR is ready.`, icon: '/favicon.ico' });
       }
       
       const b = document.getElementById('sub-ready-banner');
       document.getElementById('sub-banner-icon').innerText = PRODUCTS[sub.product].icon;
       document.getElementById('sub-banner-text').innerText = `${sub.quantity}ml ${PRODUCTS[sub.product].name} QR generated.`;
       b.classList.add('show');
    }

    window.showSubQR = async function() {
       document.getElementById('sub-ready-banner').classList.remove('show');
       const snap = await get(ref(db, `users/${window.USER.uid}/readyQR`));
       if(snap.exists()) {
          const data = snap.val();
          if(data.expiresAt > Date.now()) {
             const payloadObj = JSON.parse(data.payload);
             window.ORDER.product = payloadObj.prod;
             window.ORDER.quantity = payloadObj.qty;
             window.ORDER.amount = (payloadObj.qty/100) * PRODUCTS[payloadObj.prod].price; // assuming no discount for simplicity in sub
             
             document.getElementById("qrcode").innerHTML = "";
             new QRCode(document.getElementById("qrcode"), { text: data.payload, width: 220, height: 220, colorDark: "#000", colorLight: "#fff" });
             document.getElementById('qr-desc').innerText = `${payloadObj.qty}ml ${PRODUCTS[payloadObj.prod].name}`;
             document.getElementById('session-display').innerText = "SUB ID: " + payloadObj.sid;
             
             switchNav('qr', document.querySelectorAll('.nav-item')[0]);
             listenSession(payloadObj.sid);
          } else {
             window.showInAppToast("QR Expired", "error");
          }
       }
    }

    // Render Helpers for Stats
    window.renderHistory = function() {
      document.getElementById('h-tot-refills').innerText = rxHistory.length;
      document.getElementById('h-tot-plastic').innerText = rxHistory.reduce((s, h) => s + parseFloat(h.plasticSaved || 0), 0).toFixed(1);
      
      const list = document.getElementById('h-list');
      if (rxHistory.length === 0) list.innerHTML = `<div class="text-center p-8 mt-4 text-gray-500">No refills yet</div>`;
      else list.innerHTML = rxHistory.slice().reverse().map(h => `
          <div class="bg-[#111] p-4 rounded-xl border-l-4 border-y border-r border-[#222]" style="border-left-color: ${PRODUCTS[h.product].color}">
            <div class="flex justify-between mb-2"><span class="font-bold">${PRODUCTS[h.product].icon} ${PRODUCTS[h.product].name}</span><span class="text-[#3ecf7a] font-bold">₹${h.amount}</span></div>
            <div class="flex justify-between text-xs text-gray-400 mb-3"><span>${h.quantity}ml</span><span>${new Date(h.timestamp).toLocaleString()}</span></div>
          </div>
      `).join('');
    }

    window.renderEcoPassport = function() {
      document.getElementById('ep-name').innerText = window.USER.name;
      document.getElementById('ep-tier-badge').innerText = rxTier.name.toUpperCase();
      
      let bSaved = 0, cSaved = 0, lRefilled = 0, pts = 0;
      rxHistory.forEach(h => { bSaved+=parseFloat(h.plasticSaved||0); cSaved+=parseFloat(h.co2Saved||0); lRefilled+=h.quantity; pts+=h.pointsEarned||0; });
      
      document.getElementById('ep-bottles').innerText = bSaved.toFixed(1);
      document.getElementById('ep-co2').innerText = cSaved.toFixed(0) + "g";
      document.getElementById('ep-litres').innerText = (lRefilled/1000).toFixed(1) + "L";
      document.getElementById('ep-pts').innerText = pts;
    }
    
    window.renderRewards = function() {
       renderSubList();
    }
  