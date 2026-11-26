/**
 * RuangParkir — Aplikasi Web Responsif Penuh (PWA) + Mode Preview HP
 * Sistem Produksi PHP 8 + MySQL (db_parkir) — Autentikasi & RBAC Asli
 */

const LOGO_SRC = './assets/logo-ruangparkir.png';
const PLATFORM_FEE = 1000;
const RUANGPASS_CONFIG = {
  price: 55000,
  totalQuota: 20,
  perParkCost: 2750,
  landownerPool: 20000,
  jukirPool: 20000,
  platformMargin: 15000,
  landownerPerUse: 1000,
  jukirPerUse: 1000
};

// CENTRAL APPLICATION STATE
const state = {
  authenticated: false,
  currentScreen: 'LOGIN', // LOGIN, HOME, DETAIL, CHECKOUT, TICKET, DRIVER_HISTORY, LANDOWNER, LANDOWNER_MANAGE, ATTENDANT, ATTENDANT_LOGS, PROFILE
  userRole: null,
  currentUser: null,

  // View Mode: 'WEB' (default responsive desktop/mobile) | 'MOBILE' (desktop 390x844 phone preview)
  viewMode: (typeof localStorage !== 'undefined' && localStorage.getItem('rp_view_mode') === 'MOBILE') ? 'MOBILE' : 'WEB',
  scaleMode: 'FIT',

  // Login Form
  loginIdentifier: '',
  loginPassword: '',
  showPassword: false,

  // Live Data from MySQL db_parkir
  spots: [],
  umkmList: [],
  bookmarkedSpots: [],
  myGarages: [],
  waitingQueue: [],
  parkedVehicles: [],
  historyList: [],
  walletLogs: [],

  // Filter & Selection
  searchQuery: '',
  activeFilter: 'Semua',
  selectedSpotId: 1,

  // Real Leaflet Map & Live GPS State
  userGps: null, // { lat, lng, accuracy }
  gpsLoading: false,
  mapCenter: [-7.9460, 112.6195],
  mapZoom: 14,

  // Real Midtrans Snap Payment State
  pendingMidtransOrder: null,
  midtransBusy: false,

  // Driver Checkout & Wallet
  walletBalance: 0,
  vehicleType: 'MOBIL',
  plateNumber: 'N 1234 ABC',
  plannedDuration: 3,
  paymentMethod: 'SALDO',
  promoCode: '',
  discountAmount: 0,
  ruangPass: { active: false, remainingQuota: 0, totalQuota: 20, validUntil: '30 Hari' },
  useRuangPassCheckout: false,

  // Ticket & Live Server Argometer
  activeBooking: null,
  parkingSecondsElapsed: 0,

  // Landowner & Attendant Live Metrics
  landownerBalance: 0,
  todayRevenue: 0,
  attendantEarningsToday: 0,
  totalVehiclesManagedToday: 0,
  platformRevenueToday: 0,

  // Modals
  toastMsg: null,
  toastType: 'success', // 'success' | 'error'
  registerModal: false,
  editProfileModal: false,
  topUpModal: false,
  withdrawModal: false,
  withdrawAmount: 100000,
  overstayModal: false,
  overstayTargetBooking: null,
  overstayScenario: 'scenario_realtime', // default: real server timestamp!
  addGarageModal: false,
  editQuotaGarage: null,
  scannerModal: false,
  scannerMode: 'IN',
  scannerTargetBooking: null,
  manualCodeInput: '',
  ratingModal: false,
  ratingScore: 5,
  ratingTargetCode: null,
  selectedFeedbackTags: ['Jukir Ramah', 'Aman & Terjaga'],
  faqModal: false,
  ruangPassModal: false,
  umkmModal: null,
  contactJukirModal: false
};

// ==========================================
// RESPONSIVE MODE CONTROLLER (WEB vs MODE HP)
// ==========================================
function isMobileView() {
  if (window.innerWidth < 768) return true;
  return state.viewMode === 'MOBILE';
}

function applyViewModeClass() {
  const isPhoneScreen = window.innerWidth < 640;
  if (isPhoneScreen || state.viewMode === 'WEB') {
    document.body.classList.remove('mode-mobile');
    document.body.classList.add('mode-web');
  } else {
    document.body.classList.remove('mode-web');
    document.body.classList.add('mode-mobile');
  }
  autoScaleDevice();
}

function setViewMode(mode) {
  state.viewMode = mode === 'MOBILE' ? 'MOBILE' : 'WEB';
  try { localStorage.setItem('rp_view_mode', state.viewMode); } catch (_) { }
  applyViewModeClass();
  render();
  showToast(state.viewMode === 'MOBILE' ? 'Beralih ke tampilan Mode HP (390×844)' : 'Beralih ke tampilan Mode Web Responsif Penuh');
}

function setScaleMode(mode) {
  state.scaleMode = mode;
  const btnFit = document.getElementById('btn-scale-fit');
  const btn100 = document.getElementById('btn-scale-100');
  if (btnFit && btn100) {
    btnFit.className = 'px-2 py-0.5 text-[10px] font-semibold rounded transition cursor-pointer ' + (mode === 'FIT' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900');
    btn100.className = 'px-2 py-0.5 text-[10px] font-semibold rounded transition cursor-pointer ' + (mode === '100' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900');
  }
  autoScaleDevice();
}

function autoScaleDevice() {
  const wrapper = document.getElementById('device-wrapper');
  const container = document.getElementById('device-container');
  const scaleLabel = document.getElementById('scale-label');
  if (!wrapper) return;

  if (window.innerWidth < 640 || state.viewMode === 'WEB') {
    wrapper.style.transform = '';
    if (container) container.style.height = '';
    if (scaleLabel) scaleLabel.textContent = 'Web';
    return;
  }

  const deviceH = 844;
  const availableH = window.innerHeight - 76;
  const scale = state.scaleMode === 'FIT' ? Math.min(1, Math.max(0.6, availableH / deviceH)) : 1;
  wrapper.style.transform = `scale(${scale})`;
  wrapper.style.transformOrigin = 'top center';
  if (container) container.style.height = `${Math.round(deviceH * scale)}px`;
  if (scaleLabel) scaleLabel.textContent = `${Math.round(scale * 100)}%`;
}

// ==========================================
// API CLIENT HELPER (PHP 8 + MYSQL db_parkir)
// ==========================================
async function apiRequest(url, options = {}) {
  const cfg = {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  };
  if (cfg.body && typeof cfg.body !== 'string') {
    cfg.body = JSON.stringify(cfg.body);
  }
  const res = await fetch(url, cfg);
  const data = await res.json().catch(() => ({ ok: false, message: 'Respons server tidak valid.' }));
  if (!res.ok || data.ok === false) {
    const err = new Error(data.message || 'Permintaan gagal.');
    err.code = data.code || null;
    err.status = res.status;
    throw err;
  }
  return data;
}

// Live Argometer Tick (1 second)
setInterval(() => {
  if (state.activeBooking && state.activeBooking.status === 'ACTIVE') {
    state.parkingSecondsElapsed++;
    const el = document.getElementById('ticket-live-timer');
    if (el) el.innerText = formatDuration(state.parkingSecondsElapsed);
  }
  if (state.parkedVehicles.length > 0) {
    state.parkedVehicles.forEach(v => {
      if (v.status === 'ACTIVE') {
        v.elapsedSec = (v.elapsedSec || 0) + 1;
        const vel = document.getElementById(`veh-timer-${v.id}`);
        if (vel) vel.innerText = formatDuration(v.elapsedSec);
      }
    });
  }
}, 1000);

// Live Real-Time Sync Polling (every 8s when logged in & no modal blocking)
setInterval(async () => {
  const anyModal = state.registerModal || state.editProfileModal || state.topUpModal || state.withdrawModal ||
    state.overstayModal || state.addGarageModal || state.editQuotaGarage || state.scannerModal ||
    state.ratingModal || state.faqModal || state.ruangPassModal || state.umkmModal || state.contactJukirModal;
  if (!state.authenticated || anyModal) return;
  if (['TICKET', 'LANDOWNER', 'ATTENDANT', 'ATTENDANT_LOGS'].includes(state.currentScreen)) {
    try {
      await refreshAllData();
      render();
    } catch (_) { }
  }
}, 8000);

// ==========================================
// DATA HYDRATION FROM MYSQL (db_parkir)
// ==========================================
async function loadSpots() {
  const res = await apiRequest('./api/spots.php?action=list');
  state.spots = res.spots || [];
  state.umkmList = res.umkm || [];
  if (state.spots.length > 0 && !state.spots.find(s => s.id === state.selectedSpotId)) {
    state.selectedSpotId = state.spots[0].id;
  }
}

async function refreshAllData() {
  await loadSpots();
  const me = await apiRequest('./api/auth.php?action=me');
  state.authenticated = !!me.authenticated;
  if (me.authenticated && me.user) {
    applyAuthPayload(me);
    const reqs = [apiRequest('./api/attendant.php?action=overview')];
    if (state.userRole === 'DRIVER') {
      reqs.unshift(apiRequest('./api/bookings.php?action=list'));
    }
    const results = await Promise.all(reqs);
    if (state.userRole === 'DRIVER') {
      const bRes = results[0];
      const aRes = results[1];
      state.activeBooking = bRes.activeBooking || null;
      state.historyList = bRes.history || [];
      state.parkingSecondsElapsed = state.activeBooking ? (state.activeBooking.elapsedSec || 0) : 0;
      state.walletLogs = aRes.walletLogs || [];
    } else {
      const aRes = results[0];
      state.waitingQueue = aRes.waitingQueue || [];
      state.parkedVehicles = aRes.parkedVehicles || [];
      state.myGarages = aRes.myGarages || [];
      state.landownerBalance = aRes.landownerBalance ?? state.walletBalance;
      state.todayRevenue = aRes.todayLandownerRevenue ?? 0;
      state.attendantEarningsToday = aRes.attendantEarnings ?? state.walletBalance;
      state.totalVehiclesManagedToday = aRes.vehiclesManagedToday ?? 0;
      state.platformRevenueToday = aRes.platformRevenueToday ?? 0;
      state.walletLogs = aRes.walletLogs || [];
    }
  }
}

function applyAuthPayload(payload) {
  if (!payload || !payload.user) return;
  state.authenticated = true;
  state.currentUser = payload.user;
  state.userRole = payload.user.role;
  state.walletBalance = payload.user.wallet_balance;
  if (payload.user.default_plate) {
    state.plateNumber = payload.user.default_plate;
  }
  if (payload.ruangPass) {
    state.ruangPass = payload.ruangPass;
    if (payload.ruangPass.active && payload.ruangPass.remainingQuota > 0) {
      state.useRuangPassCheckout = true;
    }
  }
  if (Array.isArray(payload.bookmarks)) state.bookmarkedSpots = payload.bookmarks;
}

async function initApp() {
  applyViewModeClass();
  try {
    await refreshAllData();
    if (state.authenticated) {
      if (state.userRole === 'DRIVER') state.currentScreen = 'HOME';
      else if (state.userRole === 'LANDOWNER') state.currentScreen = 'LANDOWNER';
      else if (state.userRole === 'ATTENDANT') state.currentScreen = 'ATTENDANT';
    } else {
      state.currentScreen = 'LOGIN';
    }
  } catch (err) {
    console.error(err);
    showToast('Gagal memuat data server: ' + err.message, 'error');
  }
  render();
  autoScaleDevice();
}

// ==========================================
// FORMATTERS & BUSINESS HELPERS (TABEL 10.1)
// ==========================================
function escHtml(val) {
  return String(val ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatIDR(num) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(num || 0);
}

function formatDuration(sec) {
  const sTot = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(sTot / 3600);
  const m = Math.floor((sTot % 3600) / 60);
  const s = sTot % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function getBaseDepositPrice(vehicleType) {
  return vehicleType === 'MOTOR' ? 3000 : 8000;
}

function getSelectedSpot() {
  return state.spots.find(s => s.id === state.selectedSpotId) || state.spots[0] || null;
}

function getNearbyUmkmForSpot(spotId) {
  return state.umkmList.find(u => u.spotId === spotId) || state.umkmList[0] || {
    id: 1, spotId: 1, name: 'Kedai Kopi Suhat 45', category: 'Kopi & Camilan',
    distance: '50m dari Garasi Pak Budi', promoTitle: 'Diskon 15% Semua Kopi Susu',
    promoDesc: 'Tunjukkan E-Tiket aktif RuangParkir di kasir.', promoCode: 'RP-KOPI15', hours: '08.00 – 23.00 WIB'
  };
}

function calculateTransactionBreakdown(baseParkingTariff, overstayFee, platformFeeApplied, usedRuangPass) {
  if (usedRuangPass) {
    const ovL = Math.round(overstayFee * 0.4);
    const ovJ = Math.round(overstayFee * 0.4);
    const ovP = Math.round(overstayFee * 0.2);
    return {
      baseParkingTariff: 0, overstayFee, totalParkingTariff: overstayFee,
      platformFee: 0, totalUserPaid: overstayFee,
      shareLandowner: RUANGPASS_CONFIG.landownerPerUse + ovL,
      shareJukir: RUANGPASS_CONFIG.jukirPerUse + ovJ,
      platformCommission: ovP, sharePlatformTotal: ovP, usedRuangPass: true
    };
  }
  const totalParkingTariff = baseParkingTariff + overstayFee;
  const shareLandowner = Math.round(totalParkingTariff * 0.4);
  const shareJukir = Math.round(totalParkingTariff * 0.4);
  const platformCommission = Math.round(totalParkingTariff * 0.2);
  const sharePlatformTotal = platformCommission + platformFeeApplied;
  const totalUserPaid = totalParkingTariff + platformFeeApplied;
  return {
    baseParkingTariff, overstayFee, totalParkingTariff,
    platformFee: platformFeeApplied, totalUserPaid,
    shareLandowner, shareJukir, platformCommission, sharePlatformTotal, usedRuangPass: false
  };
}

function showToast(msg, type = 'success') {
  state.toastMsg = msg;
  state.toastType = type;
  render();
  setTimeout(() => {
    if (state.toastMsg === msg) {
      state.toastMsg = null;
      render();
    }
  }, 3400);
}

function setScreen(screenName) {
  state.currentScreen = screenName;
  window.scrollTo(0, 0);
  const appEl = document.getElementById('app');
  if (appEl) appEl.scrollTo({ top: 0, behavior: 'instant' });
  render();
}

// ==========================================
// SVG ICONS
// ==========================================
const Icons = {
  smartphone: '<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>',
  camera: '<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg>',
  arrowLeft: '<svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"/></svg>',
  arrowRight: '<svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/></svg>',
  chevronRight: '<svg class="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/></svg>',
  mapPin: '<svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 21c-4.418-5.836-8-9.836-8-13a8 8 0 1116 0c0 3.164-3.582 7.164-8 13z"/><circle cx="12" cy="8" r="2.5"/></svg>',
  car: '<svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 17a2 2 0 104 0 2 2 0 00-4 0zm10 0a2 2 0 104 0 2 2 0 00-4 0zM3 13h18M5 13l2.2-5.5A2 2 0 019 6h6a2 2 0 011.8 1.5L19 13M3 13v4h2m14 0h2v-4"/></svg>',
  bike: '<svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="18.5" cy="17.5" r="3.5"/><path stroke-linecap="round" stroke-linejoin="round" d="M15 6h2m-2 0l-3.5 6-3.5-6H5m7 6v5.5"/></svg>',
  clock: '<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6l4 2"/></svg>',
  shield: '<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>',
  wallet: '<svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>',
  ticket: '<svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 010 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 010-4V7a2 2 0 00-2-2H5z"/></svg>',
  home: '<svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M3 12l9-9 9 9M5 10v10a1 1 0 001 1h4v-6h4v6h4a1 1 0 001-1V10"/></svg>',
  building: '<svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><rect x="4" y="2" width="16" height="20" rx="2"/><path stroke-linecap="round" stroke-linejoin="round" d="M9 22v-4h6v4M8 6h.01M16 6h.01M8 10h.01M16 10h.01M8 14h.01M16 14h.01"/></svg>',
  history: '<svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>',
  user: '<svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>',
  userCheck: '<svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><polyline points="16 11 18 13 22 9"/></svg>',
  scan: '<svg class="w-6 h-6" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M3 7V5a2 2 0 012-2h2m10 0h2a2 2 0 012 2v2m0 10v2a2 2 0 01-2 2h-2m-10 0H5a2 2 0 01-2-2v-2"/></svg>',
  list: '<svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 12h16M4 18h16"/></svg>',
  chart: '<svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M18 20V10M12 20V4M6 20v-6"/></svg>',
  search: '<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-4.35-4.35"/></svg>',
  check: '<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>',
  plus: '<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/></svg>',
  minus: '<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M20 12H4"/></svg>',
  close: '<svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>',
  navigation: '<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>',
  star: '<svg class="w-3.5 h-3.5 fill-amber-400 stroke-amber-400" viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
  info: '<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
  bookmark: '<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"/></svg>',
  bookmarkFilled: '<svg class="w-4 h-4 fill-emerald-600 stroke-emerald-600" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"/></svg>',
  helpCircle: '<svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path stroke-linecap="round" stroke-linejoin="round" d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3m0 4h.01"/></svg>',
  lock: '<svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path stroke-linecap="round" stroke-linejoin="round" d="M7 11V7a5 5 0 0110 0v4"/></svg>',
  eye: '<svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
  eyeOff: '<svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>',
  phone: '<svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z"/></svg>',
  logOut: '<svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/></svg>',
  edit: '<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path stroke-linecap="round" stroke-linejoin="round" d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
  refresh: '<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>'
};

// ==========================================
// NAVIGATION (DESKTOP WEB NAVBAR vs MOBILE BOTTOM NAV)
// ==========================================
function renderDesktopNavbar(activeTab) {
  if (isMobileView()) return '';
  const roleLabel = state.userRole === 'DRIVER' ? 'Pengemudi' : (state.userRole === 'LANDOWNER' ? 'Pemilik Lahan' : 'Juru Parkir');
  const navItems = state.userRole === 'DRIVER'
    ? [
      { id: 'HOME', label: 'Cari Parkir' },
      { id: 'TICKET', label: 'E-Tiket' },
      { id: 'DRIVER_HISTORY', label: 'Aktivitas' },
      { id: 'PROFILE', label: 'Akun' }
    ]
    : (state.userRole === 'LANDOWNER'
      ? [
        { id: 'LANDOWNER', label: 'Ringkasan Lahan' },
        { id: 'LANDOWNER_MANAGE', label: 'Kelola Garasi' },
        { id: 'PROFILE', label: 'Akun Mitra' }
      ]
      : [
        { id: 'ATTENDANT', label: 'Pos Scanner' },
        { id: 'ATTENDANT_LOGS', label: 'Log Lapangan' },
        { id: 'PROFILE', label: 'Profil Pos' }
      ]);

  return `
    <header class="sticky top-0 z-40 w-full bg-white/95 backdrop-blur-md border-b border-slate-200/90 shadow-2xs">
      <div class="max-w-6xl mx-auto px-5 h-16 flex items-center justify-between gap-4">
        <!-- Brand -->
        <div class="flex items-center gap-3 cursor-pointer" onclick="setScreen('${state.authenticated ? navItems[0].id : 'LOGIN'}')">
          <div class="w-9 h-9 p-1 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-center">
            <img src="${LOGO_SRC}" alt="RuangParkir" class="w-full h-full object-contain">
          </div>
          <div>
            <div class="text-sm font-black text-slate-900 leading-none tracking-tight">RuangParkir</div>
            <div class="text-[10px] text-emerald-600 font-semibold mt-0.5">Berbagi Ruang, Parkir Lebih Tenang.</div>
          </div>
        </div>

        <!-- Role Navigation (Only when authenticated) -->
        ${state.authenticated ? `
          <nav class="flex items-center gap-1 bg-slate-100/80 p-1 rounded-xl border border-slate-200/80">
            ${navItems.map(item => `
              <button onclick="setScreen('${item.id}')" class="px-3.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${activeTab === item.id ? 'bg-slate-900 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'}">
                ${item.label}
              </button>
            `).join('')}
          </nav>
        ` : ''}

        <!-- Right Controls: Mode HP Toggle + User + Logout -->
        <div class="flex items-center gap-2.5">
          <button onclick="setViewMode('MOBILE')" title="Lihat dalam tampilan Mode HP (Mobile 390×844)" class="h-9 px-3 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition">
            ${Icons.smartphone}
            <span>Mode HP</span>
          </button>

          ${state.authenticated && state.currentUser ? `
            <div onclick="setScreen('PROFILE')" class="hidden lg:flex items-center gap-2 pl-2 pr-3 py-1 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-100 transition">
              <div class="w-7 h-7 rounded-lg bg-slate-900 text-white text-[10px] font-bold flex items-center justify-center">${state.currentUser.avatar_text || 'RP'}</div>
              <div class="text-left leading-tight">
                <div class="text-[11px] font-bold text-slate-900 max-w-[130px] truncate">${state.currentUser.name}</div>
                <div class="text-[9px] text-emerald-700 font-semibold">${roleLabel}</div>
              </div>
            </div>
            <button onclick="handleLogout()" title="Keluar Akun" class="h-9 px-3 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition">
              ${Icons.logOut}
              <span>Keluar</span>
            </button>
          ` : `
            <button onclick="handleResetDatabase()" title="Reset seluruh data db_parkir ke kondisi awal" class="h-9 px-3 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition">
              ${Icons.refresh}<span>Reset DB</span>
            </button>
            <button onclick="state.faqModal = true; render();" class="h-9 px-3 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition">
              ${Icons.helpCircle}<span>Panduan</span>
            </button>
          `}
        </div>
      </div>
    </header>
  `;
}

function renderToast() {
  if (!state.toastMsg) return '';
  const isErr = state.toastType === 'error';
  return `
    <div class="fixed ${isMobileView() ? 'top-11 left-3 right-3' : 'top-20 right-5 max-w-sm'} z-50 pointer-events-none transition-all">
      <div class="${isErr ? 'bg-rose-950/95 border-rose-700' : 'bg-slate-900/95 border-slate-700'} backdrop-blur-md text-white px-4 py-3 rounded-2xl shadow-xl border flex items-center gap-3">
        <span class="w-5 h-5 rounded-full ${isErr ? 'bg-rose-500/20 text-rose-300' : 'bg-emerald-600/20 text-emerald-400'} flex items-center justify-center shrink-0 text-xs">${isErr ? Icons.close : Icons.check}</span>
        <span class="text-xs font-medium leading-snug">${state.toastMsg}</span>
      </div>
    </div>
  `;
}

function renderBottomNav(activeTab) {
  if (!isMobileView()) return '';
  const tStatus = state.activeBooking ? state.activeBooking.status : 'NONE';
  if (state.userRole === 'DRIVER') {
    return `
      <nav class="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white/95 backdrop-blur-md border-t border-slate-200 pb-safe pt-2 px-4 flex justify-around items-center text-slate-400 z-40 shadow-[0_-4px_16px_rgba(0,0,0,0.03)]">
        <button onclick="setScreen('HOME')" class="flex flex-col items-center py-1 gap-1 transition-colors cursor-pointer ${activeTab === 'HOME' ? 'text-emerald-600 font-bold' : 'hover:text-slate-700'}">${Icons.home}<span class="text-[10px]">Cari Parkir</span></button>
        <button onclick="setScreen('TICKET')" class="flex flex-col items-center py-1 gap-1 transition-colors cursor-pointer ${activeTab === 'TICKET' ? 'text-emerald-600 font-bold' : 'hover:text-slate-700'}">
          <div class="relative">${Icons.ticket}<span class="absolute -top-1 -right-1 w-2 h-2 rounded-full ${tStatus === 'ACTIVE' ? 'bg-emerald-500' : (tStatus === 'WAITING_CHECKIN' ? 'bg-amber-500' : 'hidden')}"></span></div>
          <span class="text-[10px]">E-Tiket</span>
        </button>
        <button onclick="setScreen('DRIVER_HISTORY')" class="flex flex-col items-center py-1 gap-1 transition-colors cursor-pointer ${activeTab === 'DRIVER_HISTORY' ? 'text-emerald-600 font-bold' : 'hover:text-slate-700'}">${Icons.history}<span class="text-[10px]">Aktivitas</span></button>
        <button onclick="setScreen('PROFILE')" class="flex flex-col items-center py-1 gap-1 transition-colors cursor-pointer ${activeTab === 'PROFILE' ? 'text-emerald-600 font-bold' : 'hover:text-slate-700'}">${Icons.user}<span class="text-[10px]">Akun</span></button>
      </nav>
    `;
  }
  if (state.userRole === 'LANDOWNER') {
    return `
      <nav class="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white/95 backdrop-blur-md border-t border-slate-200 pb-safe pt-2 px-3 flex justify-around items-center text-slate-400 z-40 shadow-[0_-4px_16px_rgba(0,0,0,0.03)]">
        <button onclick="setScreen('LANDOWNER')" class="flex flex-col items-center py-1 gap-1 transition-colors cursor-pointer ${activeTab === 'LANDOWNER' ? 'text-emerald-600 font-bold' : 'hover:text-slate-700'}">${Icons.chart}<span class="text-[10px]">Ringkasan</span></button>
        <button onclick="setScreen('LANDOWNER_MANAGE')" class="flex flex-col items-center py-1 gap-1 transition-colors cursor-pointer ${activeTab === 'LANDOWNER_MANAGE' ? 'text-emerald-600 font-bold' : 'hover:text-slate-700'}">${Icons.building}<span class="text-[10px]">Kelola Lahan</span></button>
        <button onclick="state.withdrawModal = true; render();" class="flex flex-col items-center py-1 gap-1 transition-colors cursor-pointer hover:text-slate-700">${Icons.wallet}<span class="text-[10px]">Tarik Dana</span></button>
        <button onclick="setScreen('PROFILE')" class="flex flex-col items-center py-1 gap-1 transition-colors cursor-pointer ${activeTab === 'PROFILE' ? 'text-emerald-600 font-bold' : 'hover:text-slate-700'}">${Icons.user}<span class="text-[10px]">Akun Mitra</span></button>
      </nav>
    `;
  }
  return `
    <nav class="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white/95 backdrop-blur-md border-t border-slate-200 pb-safe pt-2 px-6 flex justify-around items-center text-slate-400 z-40 shadow-[0_-4px_16px_rgba(0,0,0,0.03)]">
      <button onclick="setScreen('ATTENDANT')" class="flex flex-col items-center py-1 gap-1 transition-colors cursor-pointer ${activeTab === 'ATTENDANT' ? 'text-emerald-600 font-bold' : 'hover:text-slate-700'}">${Icons.scan}<span class="text-[10px]">Pos Scanner</span></button>
      <button onclick="setScreen('ATTENDANT_LOGS')" class="flex flex-col items-center py-1 gap-1 transition-colors cursor-pointer ${activeTab === 'ATTENDANT_LOGS' ? 'text-emerald-600 font-bold' : 'hover:text-slate-700'}">${Icons.list}<span class="text-[10px]">Log Lapangan</span></button>
      <button onclick="setScreen('PROFILE')" class="flex flex-col items-center py-1 gap-1 transition-colors cursor-pointer ${activeTab === 'PROFILE' ? 'text-emerald-600 font-bold' : 'hover:text-slate-700'}">${Icons.user}<span class="text-[10px]">Profil Pos</span></button>
    </nav>
  `;
}

// ==========================================
// SCREEN: LOGIN & REGISTER (REAL AUTH ONLY)
// ==========================================
function togglePasswordVisibility() {
  state.showPassword = !state.showPassword;
  render();
}

async function handleLoginSubmit(e) {
  if (e) e.preventDefault();
  const identifier = (document.getElementById('login-identifier-input')?.value || state.loginIdentifier).trim();
  const password = document.getElementById('login-password-input')?.value || state.loginPassword;
  try {
    const res = await apiRequest('./api/auth.php?action=login', {
      method: 'POST',
      body: { identifier, password }
    });
    state.loginIdentifier = '';
    state.loginPassword = '';
    applyAuthPayload(res);
    await refreshAllData();
    showToast(res.message);
    if (state.userRole === 'DRIVER') setScreen('HOME');
    else if (state.userRole === 'LANDOWNER') setScreen('LANDOWNER');
    else setScreen('ATTENDANT');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function quickLoginAs(identifier, password) {
  state.loginIdentifier = identifier;
  state.loginPassword = password;
  const idEl = document.getElementById('login-identifier-input');
  const pwEl = document.getElementById('login-password-input');
  if (idEl) idEl.value = identifier;
  if (pwEl) pwEl.value = password;
  await handleLoginSubmit();
}

async function handleRegisterSubmit(e) {
  if (e) e.preventDefault();
  const name = (document.getElementById('reg-name')?.value || '').trim();
  const phone = (document.getElementById('reg-phone')?.value || '').trim();
  const email = (document.getElementById('reg-email')?.value || '').trim();
  const pin = (document.getElementById('reg-pin')?.value || '').trim();
  const detail = (document.getElementById('reg-detail')?.value || '').trim();
  const roleInputs = document.getElementsByName('reg-role');
  let role = 'DRIVER';
  for (const r of roleInputs) { if (r.checked) role = r.value; }

  try {
    const res = await apiRequest('./api/auth.php?action=register', {
      method: 'POST',
      body: { name, phone, email, pin, role, detail }
    });
    state.registerModal = false;
    applyAuthPayload(res);
    await refreshAllData();
    showToast(res.message);
    if (state.userRole === 'DRIVER') setScreen('HOME');
    else if (state.userRole === 'LANDOWNER') setScreen('LANDOWNER');
    else setScreen('ATTENDANT');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function handleLogout() {
  try {
    await apiRequest('./api/auth.php?action=logout', { method: 'POST' });
    state.authenticated = false;
    state.userRole = null;
    state.currentUser = null;
    state.activeBooking = null;
    state.historyList = [];
    state.waitingQueue = [];
    state.parkedVehicles = [];
    state.myGarages = [];
    state.pendingMidtransOrder = null;
    setScreen('LOGIN');
    showToast('Anda telah keluar dari sistem.');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function handleResetDatabase() {
  if (!confirm('Reset seluruh database db_parkir ke kondisi awal? Semua data uji coba (booking, saldo, akun baru, garasi tambahan) akan dikembalikan ke data awal.')) {
    return;
  }
  try {
    const res = await apiRequest('./api/reset_db.php', { method: 'POST' });
    state.authenticated = false;
    state.userRole = null;
    state.currentUser = null;
    state.activeBooking = null;
    state.historyList = [];
    state.waitingQueue = [];
    state.parkedVehicles = [];
    state.myGarages = [];
    state.walletLogs = [];
    state.ruangPass = { active: false, remainingQuota: 0, totalQuota: 20, validUntil: '30 Hari' };
    state.useRuangPassCheckout = false;
    state.promoCode = '';
    state.discountAmount = 0;
    state.pendingMidtransOrder = null;
    await loadSpots();
    setScreen('LOGIN');
    showToast(res.message);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function renderLogin() {
  const mob = isMobileView();
  return `
    <div class="min-h-screen flex flex-col bg-slate-50 ${mob && state.viewMode === 'MOBILE' ? 'pt-7' : ''}" id="screen-login">
      ${renderDesktopNavbar('LOGIN')}

      <div class="flex-1 flex items-center justify-center ${mob ? 'p-5 bg-white' : 'px-6 py-10'}">
        <div class="${mob ? 'w-full space-y-6' : 'w-full max-w-4xl bg-white rounded-3xl shadow-xl border border-slate-200/80 overflow-hidden grid md:grid-cols-12'}">

          <!-- Left Branding Panel -->
          <div class="${mob ? 'flex items-center gap-3.5' : 'md:col-span-5 bg-slate-900 text-white p-8 flex flex-col justify-between'}">
            ${mob ? `
              <div class="w-14 h-14 p-2 bg-slate-50 border border-slate-100 rounded-2xl flex items-center justify-center shrink-0">
                <img src="${LOGO_SRC}" alt="RuangParkir" class="w-full h-full object-contain">
              </div>
              <div>
                <h1 class="text-2xl font-black text-slate-900 tracking-tight">RuangParkir</h1>
                <p class="text-[11px] font-semibold text-emerald-600 italic">"Berbagi Ruang, Parkir Lebih Tenang."</p>
              </div>
            ` : `
              <div>
                <div class="w-16 h-16 p-2.5 bg-white rounded-2xl flex items-center justify-center shadow-md mb-5">
                  <img src="${LOGO_SRC}" alt="RuangParkir" class="w-full h-full object-contain">
                </div>
                <span class="text-[10px] font-bold uppercase tracking-widest text-emerald-400">Community Parking Marketplace</span>
                <h1 class="text-3xl font-black tracking-tight mt-1">RuangParkir</h1>
                <p class="text-xs text-emerald-300 italic mt-1">"Berbagi Ruang, Parkir Lebih Tenang."</p>
                <p class="text-xs text-slate-300 leading-relaxed mt-4">
                  Platform reservasi lahan parkir warga Kota Malang dengan sistem deposit flat 3 jam, juru parkir lokal terverifikasi, paket hemat RuangPass, dan pembagian hasil adil 40:40:20.
                </p>
              </div>
              <div class="space-y-2.5 pt-6 border-t border-slate-800 text-xs">
                <div class="flex items-center gap-2 text-slate-200"><span class="text-emerald-400">${Icons.check}</span><span>Tarif transparan: Motor Rp 3.000 • Mobil Rp 8.000 (+Fee Rp 1.000)</span></div>
                <div class="flex items-center gap-2 text-slate-200"><span class="text-emerald-400">${Icons.check}</span><span>3 Portal Terpisah: Pengemudi, Pemilik Lahan, Juru Parkir</span></div>
                <div class="flex items-center gap-2 text-slate-200"><span class="text-emerald-400">${Icons.check}</span><span>Argometer server &amp; basis data MySQL (db_parkir)</span></div>
              </div>
            `}
          </div>

          <!-- Right Real Login Form -->
          <div class="${mob ? 'space-y-5' : 'md:col-span-7 p-8 flex flex-col justify-center space-y-5'}">
            <div>
              <h2 class="text-xl font-black text-slate-900">Masuk ke Akun Anda</h2>
              <p class="text-xs text-slate-500 mt-1">Masukkan nomor HP/email dan PIN keamanan terdaftar. Sistem otomatis mengarahkan ke portal peran Anda.</p>
            </div>

            <form onsubmit="handleLoginSubmit(event)" class="space-y-4">
              <div class="space-y-1.5">
                <label class="block text-xs font-bold text-slate-700">Nomor Handphone atau Email</label>
                <div class="relative flex items-center">
                  <span class="absolute left-3.5 text-slate-400 pointer-events-none">${Icons.phone}</span>
                  <input type="text" id="login-identifier-input" required value="${state.loginIdentifier}" oninput="state.loginIdentifier = this.value" placeholder="Contoh: 081298765432" class="w-full h-12 pl-11 pr-4 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 text-sm font-medium focus:bg-white focus:border-slate-900 focus:outline-none transition" />
                </div>
              </div>

              <div class="space-y-1.5">
                <label class="block text-xs font-bold text-slate-700">PIN Keamanan / Kata Sandi</label>
                <div class="relative flex items-center">
                  <span class="absolute left-3.5 text-slate-400 pointer-events-none">${Icons.lock}</span>
                  <input type="${state.showPassword ? 'text' : 'password'}" id="login-password-input" required value="${state.loginPassword}" oninput="state.loginPassword = this.value" placeholder="Masukkan minimal 6 karakter PIN" class="w-full h-12 pl-11 pr-11 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 text-sm font-medium tracking-wide focus:bg-white focus:border-slate-900 focus:outline-none transition" />
                  <button type="button" onclick="togglePasswordVisibility()" class="absolute right-3.5 text-slate-400 hover:text-slate-600 cursor-pointer">${state.showPassword ? Icons.eyeOff : Icons.eye}</button>
                </div>
              </div>

              <button type="submit" class="h-12 w-full bg-slate-900 hover:bg-black active:scale-[0.99] text-white rounded-xl font-bold text-sm transition flex items-center justify-center gap-2 cursor-pointer shadow-md">
                <span>Masuk ke Sistem</span>
                <span>${Icons.arrowRight}</span>
              </button>
            </form>

            <div class="text-center pt-1">
              <span class="text-xs text-slate-500">Belum memiliki akun RuangParkir?</span>
              <button onclick="state.registerModal = true; render();" class="text-xs font-bold text-emerald-600 hover:underline ml-1 cursor-pointer">Daftar Akun Baru</button>
            </div>

            <!-- Tombol Akses Cepat Login (Tetap Melalui Autentikasi API PHP & Bcrypt Asli) -->
            <div class="p-3.5 bg-slate-50 border border-slate-200/90 rounded-2xl space-y-2.5">
              <div class="flex items-center justify-between">
                <span class="text-[11px] font-bold text-slate-700 uppercase tracking-wide">Akses Cepat Login (1-Klik)</span>
                <span class="text-[10px] text-emerald-700 font-semibold">Auth PHP + MySQL</span>
              </div>
              <div class="grid grid-cols-3 gap-2">
                <button type="button" onclick="quickLoginAs('081298765432', '123456')" class="p-2.5 bg-white hover:bg-slate-900 hover:text-white border border-slate-200 hover:border-slate-900 rounded-xl text-left transition cursor-pointer group shadow-2xs">
                  <div class="text-[11px] font-bold text-slate-900 group-hover:text-white flex items-center gap-1"><span>${Icons.car}</span><span>Pengemudi</span></div>
                  <div class="text-[10px] text-slate-500 group-hover:text-slate-300 mt-0.5 truncate">Budi Santoso</div>
                </button>
                <button type="button" onclick="quickLoginAs('081122334455', '123456')" class="p-2.5 bg-white hover:bg-slate-900 hover:text-white border border-slate-200 hover:border-slate-900 rounded-xl text-left transition cursor-pointer group shadow-2xs">
                  <div class="text-[11px] font-bold text-slate-900 group-hover:text-white flex items-center gap-1"><span>${Icons.building}</span><span>Pemilik</span></div>
                  <div class="text-[10px] text-slate-500 group-hover:text-slate-300 mt-0.5 truncate">Garasi Wijaya</div>
                </button>
                <button type="button" onclick="quickLoginAs('087899887766', '123456')" class="p-2.5 bg-white hover:bg-slate-900 hover:text-white border border-slate-200 hover:border-slate-900 rounded-xl text-left transition cursor-pointer group shadow-2xs">
                  <div class="text-[11px] font-bold text-slate-900 group-hover:text-white flex items-center gap-1"><span>${Icons.userCheck}</span><span>Jukir</span></div>
                  <div class="text-[10px] text-slate-500 group-hover:text-slate-300 mt-0.5 truncate">Pak Slamet</div>
                </button>
              </div>
              <div class="flex items-center justify-between gap-2 pt-0.5">
                <p class="text-[10px] text-slate-400">PIN default: <code class="font-mono text-slate-600 font-bold">123456</code></p>
                <button type="button" onclick="handleResetDatabase()" class="text-[10px] font-bold text-amber-700 hover:text-amber-900 inline-flex items-center gap-1 cursor-pointer">
                  <span>↻</span><span>Reset Database</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      ${renderRegisterModal()}
      ${renderFaqModal()}
    </div>
  `;
}

function renderRegisterModal() {
  if (!state.registerModal) return '';
  return `
    <div class="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div class="w-full max-w-md bg-white rounded-t-3xl sm:rounded-2xl p-6 space-y-4 shadow-2xl border border-slate-100 max-h-[92vh] overflow-y-auto">
        <div class="flex justify-between items-center pb-2 border-b border-slate-100">
          <div class="flex items-center gap-2">
            <div class="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">${Icons.userCheck}</div>
            <div>
              <h3 class="font-bold text-slate-900 text-sm">Pendaftaran Akun Baru</h3>
              <p class="text-[10px] text-slate-400">Pengemudi, Pemilik Lahan, atau Juru Parkir</p>
            </div>
          </div>
          <button onclick="state.registerModal = false; render();" class="p-1 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer">${Icons.close}</button>
        </div>

        <form onsubmit="handleRegisterSubmit(event)" class="space-y-3 pt-1">
          <div class="space-y-1">
            <label class="text-xs font-bold text-slate-700">Nama Lengkap *</label>
            <input type="text" id="reg-name" required placeholder="Nama sesuai KTP" class="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:border-slate-900">
          </div>
          <div class="grid grid-cols-2 gap-2">
            <div class="space-y-1">
              <label class="text-xs font-bold text-slate-700">No. WhatsApp / HP *</label>
              <input type="text" id="reg-phone" required placeholder="0857xxxxxxx" class="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:border-slate-900">
            </div>
            <div class="space-y-1">
              <label class="text-xs font-bold text-slate-700">PIN / Sandi (min. 6) *</label>
              <input type="password" id="reg-pin" required minlength="6" placeholder="Min. 6 karakter" class="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:border-slate-900">
            </div>
          </div>
          <div class="space-y-1">
            <label class="text-xs font-bold text-slate-700">Email (Opsional)</label>
            <input type="email" id="reg-email" placeholder="nama@email.com" class="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:border-slate-900">
          </div>
          <div class="space-y-1">
            <label class="text-xs font-bold text-slate-700">Peran Akun *</label>
            <div class="grid grid-cols-3 gap-1.5 pt-0.5">
              <label class="flex flex-col items-center p-2 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-50 has-checked:border-slate-900 has-checked:bg-slate-50">
                <input type="radio" name="reg-role" value="DRIVER" checked class="sr-only">
                <span class="text-xs">${Icons.car}</span><span class="text-[10px] font-bold text-slate-800 mt-1">Pengemudi</span>
              </label>
              <label class="flex flex-col items-center p-2 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-50 has-checked:border-slate-900 has-checked:bg-slate-50">
                <input type="radio" name="reg-role" value="LANDOWNER" class="sr-only">
                <span class="text-xs">${Icons.building}</span><span class="text-[10px] font-bold text-slate-800 mt-1">Pemilik Lahan</span>
              </label>
              <label class="flex flex-col items-center p-2 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-50 has-checked:border-slate-900 has-checked:bg-slate-50">
                <input type="radio" name="reg-role" value="ATTENDANT" class="sr-only">
                <span class="text-xs">${Icons.userCheck}</span><span class="text-[10px] font-bold text-slate-800 mt-1">Juru Parkir</span>
              </label>
            </div>
          </div>
          <div class="space-y-1">
            <label class="text-xs font-bold text-slate-700">Plat Kendaraan / No. Rekening Bank</label>
            <input type="text" id="reg-detail" placeholder="Contoh: N 5544 ZZZ atau BCA 8820-xxx" class="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:border-slate-900">
          </div>
          <div class="p-3 bg-emerald-50 border border-emerald-100 rounded-xl flex items-start gap-2">
            <span class="text-emerald-600 mt-0.5">${Icons.shield}</span>
            <p class="text-[10px] text-emerald-800 leading-relaxed">Kata sandi dienkripsi dengan <code>bcrypt</code> sesuai UU PDP No. 27/2022.</p>
          </div>
          <button type="submit" class="h-12 w-full bg-slate-900 hover:bg-black text-white rounded-xl font-bold text-sm transition flex items-center justify-center gap-2 cursor-pointer">
            <span>Daftar &amp; Masuk</span><span>${Icons.arrowRight}</span>
          </button>
        </form>
      </div>
    </div>
  `;
}

// ==========================================
// DRIVER: HOME (REAL LEAFLET GPS MAP + 2-COL WEB vs MOBILE)
// ==========================================
let leafletMapInstance = null;

function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = d => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function getSpotDistanceLabel(spot) {
  if (!spot) return '-';
  if (state.userGps && typeof spot.lat === 'number' && typeof spot.lng === 'number') {
    const meters = haversineMeters(state.userGps.lat, state.userGps.lng, spot.lat, spot.lng);
    return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${meters}m`;
  }
  return spot.distance || '200m';
}

function locateUserGPS() {
  if (!navigator.geolocation) {
    showToast('Browser Anda tidak mendukung fitur GPS Geolocation.', 'error');
    return;
  }
  state.gpsLoading = true;
  render();
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      state.gpsLoading = false;
      state.userGps = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: Math.round(pos.coords.accuracy || 25)
      };
      state.mapCenter = [state.userGps.lat, state.userGps.lng];
      state.mapZoom = 15;
      showToast(`GPS Aktif! Akurasi ±${state.userGps.accuracy}m. Jarak lahan diperbarui otomatis.`);
      render();
    },
    (err) => {
      state.gpsLoading = false;
      const msg = err.code === 1
        ? 'Izin lokasi GPS ditolak browser. Menampilkan peta Koridor Suhat Malang.'
        : 'Sinyal GPS belum tersedia. Menampilkan peta Koridor Suhat Malang.';
      showToast(msg, 'error');
      render();
    },
    { enableHighAccuracy: true, timeout: 9000, maximumAge: 15000 }
  );
}

function recenterMalangCorridor() {
  const sp = getSelectedSpot();
  state.mapCenter = sp && sp.lat ? [sp.lat, sp.lng] : [-7.9460, 112.6195];
  state.mapZoom = 14;
  if (leafletMapInstance) {
    leafletMapInstance.flyTo(state.mapCenter, 14, { duration: 0.7 });
  } else {
    render();
  }
  showToast('Peta dipusatkan ke Koridor Parkir Kota Malang.');
}

function openGoogleMapsRoute(spotId) {
  const spot = state.spots.find(s => s.id === Number(spotId)) || getSelectedSpot();
  if (!spot) return;
  const dest = `${spot.lat || -7.9428},${spot.lng || 112.6163}`;
  const originParam = state.userGps ? `&origin=${state.userGps.lat},${state.userGps.lng}` : '';
  const url = `https://www.google.com/maps/dir/?api=1${originParam}&destination=${dest}&travelmode=driving`;
  window.open(url, '_blank', 'noopener');
  showToast(`Membuka rute navigasi Google Maps ke ${spot.shortName}...`);
}

function selectMapSpot(id) {
  state.selectedSpotId = Number(id);
  const sp = state.spots.find(s => s.id === state.selectedSpotId);
  if (sp && typeof sp.lat === 'number' && typeof sp.lng === 'number') {
    state.mapCenter = [sp.lat, sp.lng];
  }
  render();
}

function mountLeafletMap(filteredSpots, selectedSpot) {
  if (leafletMapInstance) {
    try { leafletMapInstance.remove(); } catch (_) { }
    leafletMapInstance = null;
  }
  const mapEl = document.getElementById('rp-leaflet-map');
  if (!mapEl || typeof L === 'undefined') return;

  const map = L.map(mapEl, {
    center: state.mapCenter,
    zoom: state.mapZoom,
    zoomControl: !isMobileView(),
    attributionControl: false
  });
  leafletMapInstance = map;

  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap'
  }).addTo(map);

  map.on('moveend zoomend', () => {
    const c = map.getCenter();
    state.mapCenter = [c.lat, c.lng];
    state.mapZoom = map.getZoom();
  });

  // Live User GPS Marker + Accuracy Circle
  if (state.userGps) {
    L.circle([state.userGps.lat, state.userGps.lng], {
      radius: Math.min(state.userGps.accuracy, 250),
      color: '#059669',
      fillColor: '#10b981',
      fillOpacity: 0.16,
      weight: 1.5
    }).addTo(map);

    const gpsIcon = L.divIcon({
      className: 'rp-spot-marker',
      html: `<div class="rp-gps-dot" title="Lokasi GPS Anda"></div>`,
      iconSize: [16, 16],
      iconAnchor: [8, 8]
    });
    L.marker([state.userGps.lat, state.userGps.lng], { icon: gpsIcon, zIndexOffset: 500 })
      .addTo(map)
      .bindTooltip('Lokasi GPS Anda', { direction: 'top', offset: [0, -10] });
  }

  // Interactive Parking Spot Markers
  filteredSpots.forEach(s => {
    if (typeof s.lat !== 'number' || typeof s.lng !== 'number') return;
    const isSelected = selectedSpot && selectedSpot.id === s.id;
    const priceBadge = s.category === 'Motor' ? `Rp ${s.priceMotor / 1000}k` : `Rp ${s.priceMobil / 1000}k`;
    const dotClass = !s.isOpen ? 'bg-slate-400' : ((s.availableCar + s.availableBike) > 0 ? 'bg-emerald-500' : 'bg-rose-500');
    const pillClass = !s.isOpen
      ? 'bg-slate-200 text-slate-500 border border-slate-300'
      : (isSelected ? 'bg-slate-900 text-white ring-2 ring-emerald-500' : 'bg-white text-slate-800 border border-slate-300 hover:bg-slate-50');
    const arrowClass = !s.isOpen ? 'bg-slate-200' : (isSelected ? 'bg-slate-900' : 'bg-white border-r border-b border-slate-300');

    const icon = L.divIcon({
      className: 'rp-spot-marker',
      html: `
        <div style="position:relative; width:max-content; transform:translate(-50%,-100%); white-space:nowrap;" class="cursor-pointer">
          <div style="width:max-content;" class="px-2.5 py-1 rounded-xl text-[11px] font-bold inline-flex items-center gap-1.5 shadow-lg ${pillClass}">
            <span class="w-2 h-2 rounded-full shrink-0 ${dotClass}"></span>
            <span>${s.shortName} • ${s.isOpen ? priceBadge : 'Tutup'}</span>
          </div>
          <div class="w-2 h-2 ${arrowClass} rotate-45 mx-auto -mt-1"></div>
        </div>
      `,
      iconSize: [0, 0],
      iconAnchor: [0, 0]
    });

    L.marker([s.lat, s.lng], { icon, zIndexOffset: isSelected ? 400 : 100 })
      .addTo(map)
      .on('click', () => selectMapSpot(s.id));
  });

  setTimeout(() => {
    if (leafletMapInstance === map) map.invalidateSize();
  }, 60);
}

async function toggleBookmark(spotId) {
  try {
    const res = await apiRequest('./api/spots.php?action=bookmark', {
      method: 'POST',
      body: { spot_id: Number(spotId) }
    });
    const sid = Number(spotId);
    if (res.saved) {
      if (!state.bookmarkedSpots.includes(sid)) state.bookmarkedSpots.push(sid);
    } else {
      state.bookmarkedSpots = state.bookmarkedSpots.filter(x => x !== sid);
    }
    showToast(res.message);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function renderMapPinsHtml() {
  return `<div id="rp-leaflet-map" class="w-full h-full"></div>`;
}

function renderHome() {
  const mob = isMobileView();
  const filteredSpots = state.spots.filter(s => {
    const q = state.searchQuery.toLowerCase();
    const matchSearch = s.name.toLowerCase().includes(q) || s.address.toLowerCase().includes(q);
    if (state.activeFilter === 'Mobil') return matchSearch && s.slotsCar > 0;
    if (state.activeFilter === 'Motor') return matchSearch && s.slotsBike > 0;
    if (state.activeFilter === 'Tersedia') return matchSearch && s.isOpen && (s.availableCar + s.availableBike) > 0;
    return matchSearch;
  });

  const spot = filteredSpots.find(s => s.id === state.selectedSpotId) || filteredSpots[0] || state.spots[0];
  if (!spot) return `<div class="p-8 text-center text-xs text-slate-500">Memuat data lahan parkir dari db_parkir...</div>`;

  const isBookmarked = state.bookmarkedSpots.includes(spot.id);
  const displayBasePrice = spot.category === 'Motor' ? spot.priceMotor : spot.priceMobil;
  const nearbyUmkm = spot.umkm || getNearbyUmkmForSpot(spot.id);

  // === DESKTOP WEB RESPONSIVE LAYOUT ===
  if (!mob) {
    return `
      <div class="min-h-screen flex flex-col bg-slate-50" id="screen-home">
        ${renderDesktopNavbar('HOME')}
        <div class="max-w-6xl w-full mx-auto px-5 py-6 space-y-5">
          <!-- Top Bar: Search, Filters & RuangPay/RuangPass -->
          <div class="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs flex flex-wrap items-center justify-between gap-4">
            <div class="flex-1 min-w-[260px] flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3.5 h-11">
              <span class="text-slate-400">${Icons.search}</span>
              <input type="text" value="${state.searchQuery}" oninput="state.searchQuery = this.value; render();" placeholder="Cari garasi warga, jalan, kampus, atau area Suhat Malang..." class="w-full bg-transparent text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none border-none p-0">
              ${state.searchQuery ? `<button onclick="state.searchQuery=''; render();" class="text-slate-400 hover:text-slate-700 cursor-pointer">${Icons.close}</button>` : ''}
            </div>

            <div class="flex items-center gap-2 flex-wrap">
              ${['Semua', 'Mobil', 'Motor', 'Tersedia'].map(f => `
                <button onclick="state.activeFilter='${f}'; render();" class="px-3.5 py-2 rounded-xl text-xs font-semibold transition cursor-pointer border ${state.activeFilter === f ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}">${f}</button>
              `).join('')}
              <button onclick="state.ruangPassModal = true; render();" class="px-3.5 py-2 rounded-xl text-xs font-bold transition cursor-pointer border flex items-center gap-1.5 ${state.ruangPass.active ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'}">
                <span>★</span>
                <span>${state.ruangPass.active ? `RuangPass (${state.ruangPass.remainingQuota}/${state.ruangPass.totalQuota})` : 'RuangPass Rp 55k'}</span>
              </button>
              <div class="h-8 w-px bg-slate-200 mx-1"></div>
              <div class="flex items-center gap-2">
                <div class="text-right">
                  <div class="text-[10px] text-slate-400">Saldo RuangPay</div>
                  <div class="text-xs font-black text-emerald-600">${formatIDR(state.walletBalance)}</div>
                </div>
                <button onclick="state.topUpModal = true; render();" class="h-9 px-3 bg-slate-900 hover:bg-black text-white text-xs font-bold rounded-xl flex items-center gap-1 cursor-pointer">${Icons.plus}<span>Isi Saldo</span></button>
              </div>
            </div>
          </div>

          <!-- 2-Column Main Marketplace Grid -->
          <div class="grid lg:grid-cols-12 gap-6 items-start">
            <!-- Left 7 Cols: Real Interactive Leaflet Map + Live GPS -->
            <div class="lg:col-span-7 space-y-4">
              <div class="relative w-full h-[470px] bg-slate-200 rounded-3xl overflow-hidden border border-slate-300/70 shadow-sm">
                <div class="absolute top-3.5 left-14 z-30 bg-white/95 backdrop-blur-md px-3 py-1.5 rounded-xl border border-slate-200 shadow-xs flex items-center gap-2 pointer-events-none">
                  <span class="w-2 h-2 rounded-full ${state.userGps ? 'bg-emerald-500 animate-ping' : 'bg-emerald-500'}"></span>
                  <span class="text-[11px] font-bold text-slate-800">${state.userGps ? `GPS Aktif (±${state.userGps.accuracy}m)` : 'Peta Live OpenStreetMap • Malang'}</span>
                </div>
                <div class="absolute top-3.5 right-3.5 z-30 flex items-center gap-1.5">
                  <button type="button" onclick="locateUserGPS()" class="px-3 py-1.5 bg-slate-900 hover:bg-black text-white text-[11px] font-bold rounded-xl shadow-md flex items-center gap-1.5 cursor-pointer transition">
                    <span>${Icons.navigation}</span>
                    <span>${state.gpsLoading ? 'Mencari GPS...' : 'Lokasi Saya (GPS)'}</span>
                  </button>
                  <button type="button" onclick="recenterMalangCorridor()" class="px-2.5 py-1.5 bg-white/95 hover:bg-white text-slate-700 border border-slate-200 text-[11px] font-semibold rounded-xl shadow-xs cursor-pointer transition" title="Pusatkan ke Koridor Malang">
                    Malang
                  </button>
                </div>
                ${renderMapPinsHtml()}
              </div>

              <!-- UMKM Strip -->
              <div onclick="openUmkmModal(${nearbyUmkm.id})" class="bg-amber-50 hover:bg-amber-100/70 border border-amber-200 rounded-2xl p-4 flex items-center justify-between gap-4 cursor-pointer transition">
                <div class="flex items-center gap-3 min-w-0">
                  <span class="px-2 py-1 bg-amber-500 text-white text-[10px] font-extrabold rounded-lg uppercase shrink-0">Featured UMKM</span>
                  <div class="min-w-0">
                    <div class="text-xs font-bold text-slate-900 truncate">${nearbyUmkm.name} — <span class="text-amber-900">${nearbyUmkm.promoTitle}</span></div>
                    <div class="text-[11px] text-slate-500 truncate">${nearbyUmkm.distance} • ${nearbyUmkm.hours} • Tunjukkan E-Tiket RuangParkir</div>
                  </div>
                </div>
                <span class="px-3 py-1.5 bg-white border border-amber-300 text-amber-900 rounded-xl text-xs font-bold shrink-0">Lihat Promo</span>
              </div>
            </div>

            <!-- Right 5 Cols: Selected Garage Preview + Garage List -->
            <div class="lg:col-span-5 space-y-4">
              <div class="bg-white rounded-3xl p-5 shadow-sm border border-slate-200/80 space-y-4">
                <div class="relative rounded-2xl overflow-hidden h-44 bg-slate-900 cursor-pointer" onclick="setScreen('DETAIL')">
                  <img src="${spot.photo}" alt="${spot.name}" class="w-full h-full object-cover">
                  <div class="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent"></div>
                  <div class="absolute bottom-3 left-3 right-3 flex justify-between items-end">
                    <div>
                      <span class="px-2 py-0.5 text-[10px] font-bold text-white rounded ${spot.isOpen ? 'bg-emerald-600' : 'bg-rose-600'}">
                        ${spot.isOpen ? `${spot.availableCar} Mobil • ${spot.availableBike} Motor Kosong` : 'Ditutup Sementara'}
                      </span>
                      <h3 class="text-sm font-bold text-white mt-1">${spot.name}</h3>
                    </div>
                    <span class="px-2 py-0.5 bg-white/90 text-slate-900 text-[11px] font-bold rounded-lg">${getSpotDistanceLabel(spot)}</span>
                  </div>
                </div>

                <div class="flex items-center justify-between text-xs">
                  <div>
                    <p class="text-slate-500">${spot.address}</p>
                    <div class="flex items-center gap-1.5 mt-1 font-semibold text-slate-800">${Icons.star}<span>${spot.rating}</span><span class="text-slate-400 font-normal">(${spot.reviews} ulasan) • Jukir: ${spot.jukirName}</span></div>
                  </div>
                </div>

                <div class="p-3 bg-slate-50 rounded-2xl border border-slate-200/80 flex items-center justify-between gap-2">
                  <div>
                    <div class="text-[10px] text-slate-400 uppercase font-semibold">Tarif Flat 1–3 Jam</div>
                    <div class="text-base font-black text-emerald-600">${formatIDR(displayBasePrice)} <span class="text-[11px] font-medium text-slate-500">+ Fee Rp 1.000</span></div>
                  </div>
                  <div class="flex items-center gap-1.5">
                    <button onclick="openGoogleMapsRoute(${spot.id})" class="h-10 px-2.5 bg-white hover:bg-slate-100 rounded-xl border border-slate-200 text-slate-700 text-[11px] font-bold flex items-center gap-1 cursor-pointer" title="Buka Rute di Google Maps">${Icons.navigation}<span>Rute</span></button>
                    <button onclick="toggleBookmark(${spot.id})" class="w-10 h-10 bg-white hover:bg-slate-100 rounded-xl border border-slate-200 flex items-center justify-center cursor-pointer">${isBookmarked ? Icons.bookmarkFilled : Icons.bookmark}</button>
                  </div>
                </div>

                <button onclick="if(!getSelectedSpot().isOpen){ showToast('Garasi sedang tutup sementara','error'); return; } setScreen('DETAIL');" class="h-12 w-full ${!spot.isOpen ? 'bg-slate-300 text-slate-600' : 'bg-slate-900 hover:bg-black text-white'} font-bold text-xs rounded-xl flex items-center justify-center gap-2 cursor-pointer transition shadow-sm">
                  <span>${!spot.isOpen ? 'Lahan Sedang Tutup' : 'Lihat Detail & Reservasi Slot'}</span><span>${Icons.arrowRight}</span>
                </button>
              </div>

              <!-- Daftar Semua Lahan Sekitar -->
              <div class="bg-white rounded-3xl p-4 border border-slate-200/80 shadow-xs space-y-2.5">
                <div class="text-xs font-bold text-slate-700 uppercase tracking-wide px-1">Semua Lahan Tersedia (${filteredSpots.length})</div>
                ${filteredSpots.map(s => `
                  <div onclick="selectMapSpot(${s.id})" class="p-3 rounded-2xl border transition cursor-pointer flex items-center justify-between gap-3 ${s.id === spot.id ? 'bg-slate-900 text-white border-slate-900' : 'bg-slate-50 hover:bg-slate-100 border-slate-200/70 text-slate-800'}">
                    <div class="min-w-0">
                      <div class="text-xs font-bold truncate">${s.name}</div>
                      <div class="text-[10px] ${s.id === spot.id ? 'text-slate-300' : 'text-slate-500'}">${getSpotDistanceLabel(s)} • ${s.isOpen ? `${s.availableCar} Mobil, ${s.availableBike} Motor` : 'Tutup'}</div>
                    </div>
                    <span class="text-xs font-bold shrink-0 ${s.id === spot.id ? 'text-emerald-400' : 'text-emerald-600'}">${formatIDR(s.category === 'Motor' ? s.priceMotor : s.priceMobil)}</span>
                  </div>
                `).join('')}
              </div>
            </div>
          </div>
        </div>
        ${renderTopupModal()}
      </div>
    `;
  }

  // === MOBILE / MODE HP LAYOUT ===
  return `
    <div class="relative w-full h-full min-h-screen sm:min-h-0 sm:h-full overflow-hidden flex flex-col bg-slate-200 ${state.viewMode === 'MOBILE' ? 'pt-7' : ''}" id="screen-home">
      <div class="absolute ${state.viewMode === 'MOBILE' ? 'top-7' : 'top-0'} left-0 right-0 z-30 m-3.5 space-y-2">
        <div class="p-3 bg-white/95 backdrop-blur-md rounded-2xl shadow-sm border border-slate-200/80 flex justify-between items-center">
          <div class="flex items-center gap-2.5">
            <div class="w-8 h-8 rounded-xl bg-slate-900 text-white flex items-center justify-center font-bold text-xs">${Icons.mapPin}</div>
            <div>
              <div class="text-xs font-bold text-slate-900 flex items-center gap-1.5"><span>Cari Garasi Sekitar</span><span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span></div>
              <div class="text-[10px] text-slate-500">Lowokwaru, Kota Malang</div>
            </div>
          </div>
          <div class="flex items-center gap-2 text-right">
            <div>
              <div class="text-[10px] text-slate-400">RuangPay</div>
              <div class="font-bold text-emerald-600 text-xs">${formatIDR(state.walletBalance)}</div>
            </div>
            <button onclick="state.topUpModal = true; render();" class="h-8 px-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl flex items-center gap-1 cursor-pointer border border-slate-200"><span>${Icons.plus}</span><span>Isi</span></button>
          </div>
        </div>

        <div class="space-y-1.5">
          <div class="bg-white/95 backdrop-blur-md rounded-xl shadow-sm border border-slate-200/80 p-2.5 flex items-center gap-2">
            <span class="text-slate-400">${Icons.search}</span>
            <input type="text" value="${state.searchQuery}" oninput="state.searchQuery = this.value; render();" placeholder="Cari jalan, kampus, atau area..." class="w-full bg-transparent text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none border-none p-0">
            ${state.searchQuery ? `<button onclick="state.searchQuery=''; render();" class="text-slate-400 cursor-pointer">${Icons.close}</button>` : ''}
          </div>
          <div class="flex gap-1.5 overflow-x-auto hide-scrollbar pt-0.5">
            ${['Semua', 'Mobil', 'Motor', 'Tersedia'].map(f => `
              <button onclick="state.activeFilter='${f}'; render();" class="px-3 py-1 rounded-full text-[11px] font-medium transition cursor-pointer shrink-0 border ${state.activeFilter === f ? 'bg-slate-900 text-white border-slate-900 shadow-sm' : 'bg-white/90 text-slate-600 border-slate-200'}">${f}</button>
            `).join('')}
            <button onclick="state.ruangPassModal = true; render();" class="px-3 py-1 rounded-full text-[11px] font-bold transition cursor-pointer shrink-0 border flex items-center gap-1 ${state.ruangPass.active ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}">
              <span>★</span><span>${state.ruangPass.active ? `Pass (${state.ruangPass.remainingQuota})` : 'RuangPass'}</span>
            </button>
          </div>
        </div>
      </div>

      <div class="relative w-full h-full bg-slate-200 overflow-hidden flex items-center justify-center">
        ${renderMapPinsHtml()}
        <button type="button" onclick="locateUserGPS()" class="absolute right-3.5 bottom-[315px] z-30 h-9 px-3 bg-white/95 hover:bg-white text-slate-900 border border-slate-200 rounded-xl shadow-md text-[11px] font-bold flex items-center gap-1.5 cursor-pointer">
          <span class="text-emerald-600">${Icons.navigation}</span>
          <span>${state.gpsLoading ? 'GPS...' : (state.userGps ? 'GPS Aktif' : 'Lokasi Saya')}</span>
        </button>
      </div>

      <div class="absolute bottom-16 left-3 right-3 z-30 flex flex-col gap-2">
        <div onclick="openUmkmModal(${nearbyUmkm.id})" class="bg-amber-50/95 backdrop-blur-md border border-amber-200/90 rounded-xl px-3 py-2 shadow-sm flex items-center justify-between gap-2 cursor-pointer">
          <div class="flex items-center gap-2 min-w-0">
            <span class="px-1.5 py-0.5 bg-amber-500 text-white text-[9px] font-extrabold rounded uppercase shrink-0">UMKM</span>
            <div class="min-w-0">
              <div class="text-[11px] font-bold text-slate-900 truncate">${nearbyUmkm.name} • <span class="text-amber-800">${nearbyUmkm.promoTitle}</span></div>
              <div class="text-[9px] text-slate-500 truncate">${nearbyUmkm.distance} • Tunjukkan E-Tiket</div>
            </div>
          </div>
          <span class="text-amber-700 shrink-0">${Icons.chevronRight}</span>
        </div>

        <div class="bg-white rounded-2xl p-3.5 shadow-xl border border-slate-200/90 flex flex-col gap-2.5">
          <div class="flex items-start gap-3 cursor-pointer" onclick="setScreen('DETAIL')">
            <img src="${spot.photo}" alt="${spot.name}" class="w-20 h-20 rounded-xl object-cover shrink-0 border border-slate-100">
            <div class="flex-1 min-w-0">
              <div class="flex items-center justify-between gap-1 mb-0.5">
                <span class="px-2 py-0.5 text-[10px] font-semibold rounded ${!spot.isOpen ? 'bg-rose-50 text-rose-700' : 'bg-slate-100 text-slate-700'}">${!spot.isOpen ? 'Tutup' : `${spot.availableCar} Mbl • ${spot.availableBike} Mtr`}</span>
                <span class="text-[11px] font-medium text-slate-400">${getSpotDistanceLabel(spot)}</span>
              </div>
              <h3 class="font-bold text-slate-900 text-xs truncate leading-snug">${spot.name}</h3>
              <p class="text-[11px] text-slate-500 truncate mt-0.5">${spot.address}</p>
              <div class="flex items-center justify-between mt-1.5">
                <div class="flex items-center gap-1 text-[11px] text-slate-700 font-medium">${Icons.star}<span>${spot.rating}</span><span class="text-slate-400">(${spot.reviews})</span></div>
                <div class="text-right">
                  <span class="text-xs font-bold text-emerald-600">${formatIDR(displayBasePrice)} / 3 Jam</span>
                  <span class="block text-[9px] text-slate-400">+ Fee Rp 1.000</span>
                </div>
              </div>
            </div>
          </div>
          <div class="flex gap-2 pt-1 border-t border-slate-100">
            <button onclick="if(!getSelectedSpot().isOpen){ showToast('Garasi sedang ditutup sementara','error'); return; } setScreen('DETAIL');" class="flex-1 h-11 ${!spot.isOpen ? 'bg-slate-300 text-slate-600' : 'bg-slate-900 hover:bg-black text-white'} font-bold text-xs rounded-xl flex items-center justify-center gap-2 cursor-pointer shadow-sm">
              <span>${!spot.isOpen ? 'Lahan Tutup' : 'Pilih & Booking'}</span><span>${Icons.arrowRight}</span>
            </button>
            <button onclick="toggleBookmark(${spot.id})" class="w-11 h-11 bg-slate-100 text-slate-700 rounded-xl flex items-center justify-center cursor-pointer border border-slate-200">${isBookmarked ? Icons.bookmarkFilled : Icons.bookmark}</button>
            <button onclick="openGoogleMapsRoute(${spot.id})" class="w-11 h-11 bg-slate-100 text-slate-700 rounded-xl flex items-center justify-center cursor-pointer border border-slate-200" title="Buka Rute Google Maps">${Icons.navigation}</button>
          </div>
        </div>
      </div>

      ${renderBottomNav('HOME')}
      ${renderTopupModal()}
    </div>
  `;
}

// ==========================================
// DRIVER: DETAIL & CHECKOUT (RESPONSIVE)
// ==========================================
function renderDetail() {
  const mob = isMobileView();
  const spot = getSelectedSpot();
  if (!spot) return '';
  const umkm = spot.umkm || getNearbyUmkmForSpot(spot.id);
  return `
    <div class="flex flex-col min-h-screen bg-slate-50 ${mob && state.viewMode === 'MOBILE' ? 'pt-7' : ''}" id="screen-detail">
      ${renderDesktopNavbar('HOME')}
      ${mob ? `
        <div class="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-100 px-4 py-3 flex items-center justify-between">
          <button onclick="setScreen('HOME')" class="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-700 cursor-pointer">${Icons.arrowLeft}</button>
          <h2 class="font-bold text-slate-900 text-sm">Detail Lahan Parkir</h2>
          <div class="w-10"></div>
        </div>
      ` : ''}

      <div class="${mob ? 'p-4 space-y-4 pb-32' : 'max-w-5xl w-full mx-auto px-5 py-6 space-y-5'}">
        ${!mob ? `<button onclick="setScreen('HOME')" class="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-slate-900 cursor-pointer">${Icons.arrowLeft}<span>Kembali ke Peta Lahan</span></button>` : ''}

        <div class="${mob ? 'space-y-4' : 'grid lg:grid-cols-12 gap-6 items-start'}">
          <div class="${mob ? 'space-y-4' : 'lg:col-span-7 space-y-4'}">
            <div class="relative rounded-2xl overflow-hidden ${mob ? 'h-48' : 'h-64'} bg-slate-900 shadow-sm">
              <img src="${spot.photo}" alt="${spot.name}" class="w-full h-full object-cover">
              <div class="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent"></div>
              <div class="absolute bottom-3 left-4 right-4 flex justify-between items-end">
                <div>
                  <span class="px-2 py-0.5 text-white text-[10px] font-semibold rounded ${spot.isOpen ? 'bg-emerald-600' : 'bg-rose-600'}">
                    ${spot.isOpen ? `Buka • ${spot.availableCar} Mobil, ${spot.availableBike} Motor` : 'Ditutup Sementara'}
                  </span>
                  <h1 class="text-lg font-bold text-white mt-1 leading-snug">${spot.name}</h1>
                </div>
                <span class="px-2.5 py-1 bg-white/90 text-slate-900 text-xs font-bold rounded-lg shadow-sm">${spot.distance}</span>
              </div>
            </div>

            <div class="bg-white rounded-2xl p-4 shadow-xs border border-slate-200/80 flex items-center gap-3">
              <div class="w-10 h-10 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">${Icons.userCheck}</div>
              <div class="flex-1">
                <span class="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Petugas Lapangan Resmi</span>
                <div class="font-bold text-slate-900 text-xs mt-0.5">${spot.jukirName}</div>
                <p class="text-[11px] text-slate-500">Merapikan kendaraan, validasi QR, dan menjaga keamanan barang.</p>
              </div>
            </div>

            <div class="bg-white rounded-2xl p-4 shadow-xs border border-slate-200/80 space-y-2">
              <span class="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Fasilitas &amp; Akses Lahan</span>
              <div class="grid grid-cols-2 gap-2 text-xs text-slate-700">
                ${spot.facilities.map(f => `<div class="flex items-center gap-1.5 p-2 bg-slate-50 rounded-xl border border-slate-100"><span class="text-emerald-600">${Icons.check}</span><span class="text-[11px] font-medium">${f}</span></div>`).join('')}
              </div>
              <p class="text-[11px] text-slate-500 pt-1"><strong>Patokan Akses:</strong> ${spot.accessNote}</p>
            </div>
          </div>

          <div class="${mob ? 'space-y-4' : 'lg:col-span-5 space-y-4'}">
            <div class="bg-white rounded-2xl p-5 shadow-xs border border-slate-200/80 space-y-3">
              <div class="flex justify-between items-center">
                <span class="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Ketentuan Tarif Transparan</span>
                <button onclick="state.faqModal = true; render();" class="text-[11px] font-medium text-emerald-600 hover:underline cursor-pointer flex items-center gap-1">${Icons.info}<span>Ketentuan</span></button>
              </div>
              <div class="grid grid-cols-2 gap-2 text-xs">
                <div class="p-3 bg-slate-50 rounded-xl border border-slate-200/80">
                  <div class="font-bold text-slate-800 flex items-center gap-1.5">${Icons.bike} <span>Motor</span></div>
                  <div class="text-emerald-600 font-bold text-sm mt-1">Rp 3.000</div>
                  <div class="text-slate-500 text-[10px] mt-0.5">Flat 1–3 Jam Awal</div>
                  <div class="text-slate-400 text-[10px]">+Rp 1.000 / jam berikutnya</div>
                </div>
                <div class="p-3 bg-slate-50 rounded-xl border border-slate-200/80">
                  <div class="font-bold text-slate-800 flex items-center gap-1.5">${Icons.car} <span>Mobil</span></div>
                  <div class="text-emerald-600 font-bold text-sm mt-1">Rp 8.000</div>
                  <div class="text-slate-500 text-[10px] mt-0.5">Flat 1–3 Jam Awal</div>
                  <div class="text-slate-400 text-[10px]">+Rp 1.000 / jam berikutnya</div>
                </div>
              </div>
              <div class="p-3 bg-emerald-50/70 rounded-xl border border-emerald-200/80 flex items-center justify-between text-[11px]">
                <div>
                  <span class="font-bold text-emerald-900">Biaya Layanan Aplikasi (Platform Fee)</span>
                  <div class="text-[10px] text-emerald-700">Total awal Motor Rp 4.000 • Mobil Rp 9.000</div>
                </div>
                <span class="font-extrabold text-emerald-800 shrink-0">+Rp 1.000</span>
              </div>
              <div class="p-2.5 bg-slate-100/70 rounded-xl text-[11px] text-slate-600 leading-relaxed border border-slate-200/60">
                <strong>Aturan Flat 1–3 Jam:</strong> Tidak ada pengembalian sisa waktu bila keluar &lt; 3 jam, dan <strong>Rp 0 tambahan</strong> bila &le; 3 jam. Overstay &gt; 3 jam +Rp 1.000/jam.
              </div>
              ${!mob ? `
                <button onclick="if(getSelectedSpot().slotsCar === 0) state.vehicleType='MOTOR'; setScreen('CHECKOUT')" class="h-12 w-full rounded-xl font-bold text-sm transition active:scale-[0.99] shadow-md flex items-center justify-center gap-2 cursor-pointer bg-slate-900 hover:bg-black text-white">
                  <span>Lanjut ke Form Reservasi</span><span>${Icons.arrowRight}</span>
                </button>
              ` : ''}
            </div>

            <div onclick="openUmkmModal(${umkm.id})" class="bg-amber-50/80 border border-amber-200 rounded-2xl p-4 flex items-center justify-between gap-3 cursor-pointer">
              <div class="min-w-0">
                <span class="px-1.5 py-0.5 bg-amber-500 text-white text-[9px] font-bold rounded uppercase">Partner UMKM Sekitar</span>
                <div class="font-bold text-slate-900 text-xs mt-1 truncate">${umkm.name}</div>
                <div class="text-[11px] text-amber-900 font-medium truncate">${umkm.promoTitle}</div>
                <div class="text-[10px] text-slate-500 mt-0.5">${umkm.distance} • ${umkm.hours}</div>
              </div>
              <span class="px-2.5 py-1.5 bg-white border border-amber-200 text-amber-900 rounded-xl text-[10px] font-bold shrink-0">Detail</span>
            </div>
          </div>
        </div>
      </div>

      ${mob ? `
        <div class="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white/95 backdrop-blur-md border-t border-slate-200 p-4 z-40 shadow-lg">
          <button onclick="if(getSelectedSpot().slotsCar === 0) state.vehicleType='MOTOR'; setScreen('CHECKOUT')" class="h-14 min-h-[54px] w-full rounded-2xl font-bold text-base transition active:scale-[0.98] shadow-md flex items-center justify-center gap-2.5 cursor-pointer bg-slate-900 hover:bg-black text-white">
            <span>Lanjut ke Form Reservasi</span><span>${Icons.arrowRight}</span>
          </button>
        </div>
      ` : ''}
      ${renderFaqModal()}
    </div>
  `;
}

function applyPromoCode() {
  const code = (document.getElementById('checkout-promo-input')?.value || '').trim().toUpperCase();
  state.promoCode = code;
  if (code === 'HEMAT1K' || code === 'DISKONPARKIR') {
    state.discountAmount = PLATFORM_FEE;
    showToast('Promo valid! Bebas Biaya Layanan Aplikasi Rp 1.000.');
  } else if (code === '') {
    state.discountAmount = 0;
  } else {
    state.discountAmount = 0;
    showToast('Kode voucher tidak ditemukan (coba: HEMAT1K)', 'error');
  }
  render();
}

// ==========================================
// MIDTRANS SNAP PAYMENT GATEWAY (LIVE SANDBOX)
// ==========================================
async function startMidtransPayment(purpose, extraBody = {}) {
  if (state.midtransBusy) return;
  state.midtransBusy = true;
  render();
  try {
    const res = await apiRequest('./api/midtrans.php?action=create_token', {
      method: 'POST',
      body: { purpose, ...extraBody }
    });
    state.midtransBusy = false;
    state.topUpModal = false;
    state.ruangPassModal = false;

    const orderObj = {
      order_id: res.order_id,
      amount: res.amount,
      purpose: res.purpose,
      snap_token: res.snap_token,
      redirect_url: res.redirect_url,
      status: 'PENDING'
    };

    if (typeof window.snap !== 'undefined' && res.snap_token) {
      state.pendingMidtransOrder = orderObj;
      render();
      window.snap.pay(res.snap_token, {
        onSuccess: async () => {
          await verifyMidtransOrder(res.order_id);
        },
        onPending: () => {
          state.pendingMidtransOrder = { ...orderObj, status: 'PENDING' };
          showToast('Menunggu pembayaran Midtrans selesai. Klik Cek Status setelah membayar.');
          render();
        },
        onError: () => {
          state.pendingMidtransOrder = { ...orderObj, status: 'ERROR' };
          showToast('Pembayaran Midtrans gagal atau dibatalkan.', 'error');
          render();
        },
        onClose: () => {
          if (state.pendingMidtransOrder && state.pendingMidtransOrder.order_id === res.order_id) {
            showToast('Popup Midtrans ditutup. Anda dapat mengecek status atau membuka ulang pembayaran.');
            render();
          }
        }
      });
    } else if (res.redirect_url) {
      state.pendingMidtransOrder = orderObj;
      window.open(res.redirect_url, '_blank', 'noopener');
      showToast('Halaman pembayaran Midtrans dibuka di tab baru.');
      render();
    }
  } catch (err) {
    state.midtransBusy = false;
    showToast(err.message, 'error');
    render();
  }
}

function reopenMidtransPopup() {
  const ord = state.pendingMidtransOrder;
  if (!ord) return;
  if (typeof window.snap !== 'undefined' && ord.snap_token) {
    window.snap.pay(ord.snap_token, {
      onSuccess: async () => { await verifyMidtransOrder(ord.order_id); },
      onPending: () => { showToast('Menunggu konfirmasi Midtrans...'); render(); },
      onError: () => { showToast('Pembayaran Midtrans gagal.', 'error'); render(); },
      onClose: () => { render(); }
    });
  } else if (ord.redirect_url) {
    window.open(ord.redirect_url, '_blank', 'noopener');
  }
}

async function verifyMidtransOrder(orderId) {
  if (!orderId) return;
  try {
    const res = await apiRequest('./api/midtrans.php?action=verify', {
      method: 'POST',
      body: { order_id: orderId }
    });
    if (res.paid) {
      const purpose = res.purpose || state.pendingMidtransOrder?.purpose;
      state.pendingMidtransOrder = null;
      await refreshAllData();
      showToast(res.message);
      if (purpose === 'BOOKING') {
        setScreen('TICKET');
      } else {
        render();
      }
    } else {
      if (state.pendingMidtransOrder) {
        state.pendingMidtransOrder.status = res.midtrans_status || 'PENDING';
      }
      showToast(res.message, 'error');
      render();
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function renderMidtransPendingModal() {
  if (!state.pendingMidtransOrder) return '';
  const ord = state.pendingMidtransOrder;
  const purposeLabel = ord.purpose === 'TOPUP'
    ? 'Top Up Saldo RuangPay'
    : (ord.purpose === 'RUANGPASS' ? 'Langganan RuangPass (20x Motor)' : 'Reservasi Slot Parkir');
  return `
    <div class="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div class="bg-white rounded-3xl p-5 w-full max-w-sm text-left shadow-2xl relative space-y-3.5 border border-slate-100">
        <button onclick="state.pendingMidtransOrder = null; render();" class="absolute top-4 right-4 text-slate-400 hover:text-slate-600 cursor-pointer">${Icons.close}</button>
        <div class="flex items-center gap-2">
          <span class="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-sky-50 text-sky-700 border border-sky-200">Midtrans Snap Live</span>
          <span class="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-amber-50 text-amber-800 border border-amber-200">${ord.status || 'PENDING'}</span>
        </div>
        <div>
          <h3 class="text-base font-black text-slate-900">${purposeLabel}</h3>
          <p class="text-[11px] text-slate-500 mt-0.5">Order ID: <code class="font-mono font-bold text-slate-800">${ord.order_id}</code></p>
        </div>
        <div class="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 flex items-center justify-between">
          <span class="text-xs text-slate-600">Total Tagihan</span>
          <span class="text-lg font-black text-slate-900">${formatIDR(ord.amount)}</span>
        </div>
        <div class="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-[11px] text-emerald-900 leading-relaxed">
          Selesaikan pembayaran pada jendela Midtrans (QRIS / GoPay / VA Bank / Kartu Sandbox). Untuk QRIS/VA Sandbox, gunakan
          <a href="https://simulator.sandbox.midtrans.com/" target="_blank" rel="noopener" class="font-bold underline text-emerald-800">Midtrans Sandbox Simulator</a>
          lalu klik tombol cek status di bawah.
        </div>
        <div class="space-y-2 pt-1">
          <button onclick="verifyMidtransOrder('${ord.order_id}')" class="h-11 w-full bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs cursor-pointer shadow-sm">
            ✓ Cek Status Pembayaran Midtrans
          </button>
          <button onclick="reopenMidtransPopup()" class="h-10 w-full bg-slate-900 hover:bg-black text-white rounded-xl font-bold text-xs cursor-pointer">
            Buka Ulang Popup Midtrans Snap
          </button>
          ${ord.redirect_url ? `<a href="${ord.redirect_url}" target="_blank" rel="noopener" class="h-9 w-full bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold text-[11px] flex items-center justify-center">Buka Link Midtrans di Tab Baru ↗</a>` : ''}
        </div>
      </div>
    </div>
  `;
}

async function handleBookingPayment(usingRuangPass) {
  const spot = getSelectedSpot();
  const plateEl = document.getElementById('checkout-plate-input');
  if (plateEl && plateEl.value.trim() !== '') {
    state.plateNumber = plateEl.value.trim().toUpperCase();
  }

  // Jika memilih metode Midtrans Snap (QRIS / E-Wallet / VA) & bukan RuangPass -> panggil API Midtrans nyata!
  if (!usingRuangPass && state.paymentMethod === 'QRIS') {
    await startMidtransPayment('BOOKING', {
      spot_id: spot.id,
      vehicle_type: state.vehicleType,
      plate_number: state.plateNumber,
      planned_duration: state.plannedDuration,
      promo_code: state.promoCode
    });
    return;
  }

  try {
    const res = await apiRequest('./api/bookings.php?action=create', {
      method: 'POST',
      body: {
        spot_id: spot.id,
        vehicle_type: state.vehicleType,
        plate_number: state.plateNumber,
        planned_duration: state.plannedDuration,
        payment_method: state.paymentMethod,
        promo_code: state.promoCode,
        use_ruangpass: !!usingRuangPass
      }
    });
    await refreshAllData();
    state.promoCode = '';
    state.discountAmount = 0;
    showToast(res.message);
    setScreen('TICKET');
  } catch (err) {
    if (err.code === 'INSUFFICIENT_BALANCE') {
      state.topUpModal = true;
      render();
    }
    showToast(err.message, 'error');
  }
}

function renderCheckout() {
  const mob = isMobileView();
  const spot = getSelectedSpot();
  if (!spot) return '';
  if (state.vehicleType === 'MOBIL' && spot.availableCar <= 0 && spot.availableBike > 0) {
    state.vehicleType = 'MOTOR';
  } else if (state.vehicleType === 'MOTOR' && spot.availableBike <= 0 && spot.availableCar > 0) {
    state.vehicleType = 'MOBIL';
  }
  const baseDeposit = getBaseDepositPrice(state.vehicleType);
  const canUseRuangPass = state.vehicleType === 'MOTOR' && state.ruangPass.active && state.ruangPass.remainingQuota > 0;
  const usingRuangPass = canUseRuangPass && state.useRuangPassCheckout;
  const effectivePlatformFee = usingRuangPass ? 0 : Math.max(0, PLATFORM_FEE - state.discountAmount);
  const effectiveBaseDeposit = usingRuangPass ? 0 : baseDeposit;
  const estExtraHours = state.plannedDuration > 3 ? (state.plannedDuration - 3) : 0;
  const estExtraCost = estExtraHours * 1000;
  const finalPayNow = effectiveBaseDeposit + effectivePlatformFee;

  return `
    <div class="flex flex-col min-h-screen bg-slate-50 ${mob && state.viewMode === 'MOBILE' ? 'pt-7 pb-36' : ''}" id="screen-checkout">
      ${renderDesktopNavbar('HOME')}
      ${mob ? `
        <div class="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-100 px-4 py-3 flex items-center justify-between">
          <button onclick="setScreen('DETAIL')" class="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-700 cursor-pointer">${Icons.arrowLeft}</button>
          <h2 class="font-bold text-slate-900 text-sm">Formulir Reservasi Slot</h2>
          <div class="w-10"></div>
        </div>
      ` : ''}

      <div class="${mob ? 'p-4 space-y-3.5 pb-32' : 'max-w-5xl w-full mx-auto px-5 py-6 space-y-5'}">
        ${!mob ? `<button onclick="setScreen('DETAIL')" class="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-slate-900 cursor-pointer">${Icons.arrowLeft}<span>Kembali ke Detail Lahan</span></button>` : ''}

        <div class="${mob ? 'space-y-3.5' : 'grid lg:grid-cols-12 gap-6 items-start'}">
          <div class="${mob ? 'space-y-3.5' : 'lg:col-span-7 space-y-4'}">
            <div class="bg-white rounded-2xl p-3.5 border border-slate-200/80 shadow-xs flex items-center gap-3">
              <div class="w-10 h-10 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">${Icons.building}</div>
              <div class="truncate">
                <div class="font-bold text-slate-900 text-xs truncate">${spot.name}</div>
                <div class="text-[11px] text-slate-500 truncate">${spot.address}</div>
              </div>
            </div>

            <div class="bg-white rounded-2xl p-4 shadow-xs border border-slate-200/80 space-y-2.5">
              <label class="block text-[11px] font-semibold uppercase tracking-wide text-slate-400">1. Jenis Kendaraan</label>
              <div class="grid grid-cols-2 gap-2.5">
                <button type="button" ${spot.availableCar <= 0 ? 'disabled' : ''} onclick="state.vehicleType = 'MOBIL'; state.useRuangPassCheckout = false; render();" class="p-3 rounded-xl border text-center transition flex flex-col items-center gap-1.5 ${spot.availableCar <= 0 ? 'opacity-40 cursor-not-allowed bg-slate-50 border-slate-200' : 'cursor-pointer ' + (state.vehicleType === 'MOBIL' ? 'border-slate-900 bg-slate-50 ring-1 ring-slate-900' : 'border-slate-200 bg-white')}">
                  <div class="p-2 rounded-lg ${state.vehicleType === 'MOBIL' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}">${Icons.car}</div>
                  <div class="font-bold text-xs text-slate-900">Mobil (${spot.availableCar} sisa)</div>
                  <div class="text-[11px] font-semibold text-emerald-600">Rp 8.000 <span class="text-[10px] text-slate-400 font-normal">(Flat 3 Jam)</span></div>
                </button>
                <button type="button" ${spot.availableBike <= 0 ? 'disabled' : ''} onclick="state.vehicleType = 'MOTOR'; if(state.ruangPass.active && state.ruangPass.remainingQuota > 0){ state.useRuangPassCheckout = true; } render();" class="p-3 rounded-xl border text-center transition flex flex-col items-center gap-1.5 ${spot.availableBike <= 0 ? 'opacity-40 cursor-not-allowed bg-slate-50 border-slate-200' : 'cursor-pointer ' + (state.vehicleType === 'MOTOR' ? 'border-slate-900 bg-slate-50 ring-1 ring-slate-900' : 'border-slate-200 bg-white')}">
                  <div class="p-2 rounded-lg ${state.vehicleType === 'MOTOR' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}">${Icons.bike}</div>
                  <div class="font-bold text-xs text-slate-900">Motor (${spot.availableBike} sisa)</div>
                  <div class="text-[11px] font-semibold text-emerald-600">${state.ruangPass.active && state.ruangPass.remainingQuota > 0 ? '★ 1 Kuota Pass (Rp 0)' : 'Rp 3.000 <span class="text-[10px] text-slate-400 font-normal">(Flat 3 Jam)</span>'}</div>
                </button>
              </div>
              ${state.vehicleType === 'MOBIL' && state.ruangPass.active && state.ruangPass.remainingQuota > 0 && spot.availableBike > 0 ? `
                <div onclick="state.vehicleType = 'MOTOR'; state.useRuangPassCheckout = true; render();" class="p-3 rounded-xl bg-emerald-50 hover:bg-emerald-100/80 border border-emerald-300 flex items-center justify-between gap-2 cursor-pointer transition">
                  <div>
                    <div class="text-xs font-bold text-emerald-900">★ Anda punya RuangPass Aktif (${state.ruangPass.remainingQuota}/${state.ruangPass.totalQuota} Kuota Motor)</div>
                    <div class="text-[10px] text-emerald-700 mt-0.5">RuangPass khusus Motor. Klik di sini untuk ganti ke Motor &amp; parkir Rp 0 (Bebas Fee)!</div>
                  </div>
                  <span class="px-2.5 py-1.5 bg-emerald-600 text-white text-[10px] font-bold rounded-lg shrink-0">Pakai Pass</span>
                </div>
              ` : ''}
              ${state.vehicleType === 'MOTOR' ? (canUseRuangPass ? `
                <div onclick="state.useRuangPassCheckout = !state.useRuangPassCheckout; render();" class="p-3 rounded-xl border transition flex items-center justify-between cursor-pointer ${usingRuangPass ? 'bg-emerald-50 border-emerald-500 ring-1 ring-emerald-500' : 'bg-slate-50 border-slate-200'}">
                  <div>
                    <div class="text-xs font-bold text-emerald-900">★ Gunakan Kuota RuangPass (Sisa ${state.ruangPass.remainingQuota}/${state.ruangPass.totalQuota})</div>
                    <div class="text-[10px] text-emerald-700 mt-0.5">Potong 1 kuota motor • Rp 0 sekarang &amp; bebas biaya layanan Rp 1.000</div>
                  </div>
                  <div class="w-5 h-5 rounded-md border flex items-center justify-center ${usingRuangPass ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-white border-slate-300'}">${usingRuangPass ? Icons.check : ''}</div>
                </div>
              ` : `
                <div onclick="state.ruangPassModal = true; render();" class="p-2.5 rounded-xl bg-emerald-50/80 border border-emerald-200 flex items-center justify-between gap-2 cursor-pointer">
                  <div>
                    <div class="text-[11px] font-bold text-emerald-900">★ Hemat dengan RuangPass (Rp 55.000/bln)</div>
                    <div class="text-[10px] text-emerald-700">20x parkir motor (Rp 2.750/parkir vs Rp 4.000 reguler)</div>
                  </div>
                  <span class="px-2 py-1 bg-emerald-600 text-white text-[10px] font-bold rounded-lg shrink-0">Aktifkan</span>
                </div>
              `) : ''}
            </div>

            <div class="bg-white rounded-2xl p-4 shadow-xs border border-slate-200/80 space-y-2">
              <div class="flex justify-between items-center">
                <label class="block text-[11px] font-semibold uppercase tracking-wide text-slate-400">2. Nomor Plat Kendaraan</label>
                <span class="text-[10px] text-slate-400 font-mono">Verifikasi Pos Jukir</span>
              </div>
              <input id="checkout-plate-input" type="text" value="${state.plateNumber}" placeholder="Contoh: N 1234 ABC" oninput="state.plateNumber = this.value.toUpperCase();" class="w-full h-12 px-4 rounded-xl bg-slate-50 border border-slate-200 font-mono font-bold text-slate-900 text-sm uppercase tracking-wider focus:bg-white focus:border-slate-900">
            </div>

            <div class="bg-white rounded-2xl p-4 shadow-xs border border-slate-200/80 space-y-2.5">
              <div class="flex justify-between items-center">
                <label class="block text-[11px] font-semibold uppercase tracking-wide text-slate-400">3. Rencana Durasi Parkir</label>
                <span class="text-[11px] font-semibold px-2 py-0.5 rounded-full ${state.plannedDuration <= 3 ? 'bg-slate-100 text-slate-700' : 'bg-amber-50 text-amber-800'}">${state.plannedDuration <= 3 ? 'Paket Flat 1–3 Jam' : `Rencana Ekstra +${estExtraHours} Jam`}</span>
              </div>
              <div class="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                <button type="button" onclick="if(state.plannedDuration > 1){ state.plannedDuration--; render(); }" class="w-11 h-11 bg-white rounded-lg flex items-center justify-center font-bold text-slate-700 border border-slate-200 cursor-pointer">${Icons.minus}</button>
                <div class="text-center">
                  <div class="flex items-baseline justify-center gap-1"><span class="text-2xl font-black text-slate-900 font-mono">${state.plannedDuration}</span><span class="text-xs font-semibold text-slate-500">Jam</span></div>
                  <div class="text-[10px] text-slate-400">${state.plannedDuration <= 3 ? 'Lunas dengan deposit flat 1–3 jam' : `Estimasi overstay +${formatIDR(estExtraCost)} (saat keluar)`}</div>
                </div>
                <button type="button" onclick="if(state.plannedDuration < 12){ state.plannedDuration++; render(); }" class="w-11 h-11 bg-white rounded-lg flex items-center justify-center font-bold text-slate-700 border border-slate-200 cursor-pointer">${Icons.plus}</button>
              </div>
            </div>
          </div>

          <!-- Right Column: Payment, Promo, Summary -->
          <div class="${mob ? 'space-y-3.5' : 'lg:col-span-5 space-y-4'}">
            <div class="bg-white rounded-2xl p-4 shadow-xs border border-slate-200/80 space-y-2">
              <label class="block text-[11px] font-semibold uppercase tracking-wide text-slate-400">4. Metode Pembayaran</label>
              ${usingRuangPass ? `
                <div class="p-3.5 rounded-xl border border-emerald-500 bg-emerald-50 space-y-1.5">
                  <div class="flex items-center justify-between">
                    <span class="font-bold text-xs text-emerald-950">★ Kuota Langganan RuangPass</span>
                    <span class="px-2 py-0.5 bg-emerald-600 text-white text-[10px] font-bold rounded-lg">Rp 0 Sekarang</span>
                  </div>
                  <p class="text-[11px] text-emerald-800 leading-relaxed">
                    Memotong <strong>1 kuota motor</strong> (sisa setelah transaksi: <strong>${Math.max(0, state.ruangPass.remainingQuota - 1)}/${state.ruangPass.totalQuota}</strong>). Bebas biaya layanan Rp 1.000. Overstay &gt; 3 jam tetap +Rp 1.000/jam.
                  </p>
                  <button type="button" onclick="state.useRuangPassCheckout = false; render();" class="text-[10px] font-semibold text-emerald-700 underline cursor-pointer">Bayar reguler pakai Saldo / Midtrans saja</button>
                </div>
              ` : `
                <div onclick="state.paymentMethod = 'SALDO'; render();" class="p-3 rounded-xl border transition flex items-center justify-between cursor-pointer ${state.paymentMethod === 'SALDO' ? 'border-slate-900 bg-slate-50 ring-1 ring-slate-900' : 'border-slate-200 bg-white'}">
                  <div class="flex items-center gap-3">
                    <div class="w-9 h-9 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center">${Icons.wallet}</div>
                    <div>
                      <div class="font-bold text-xs text-slate-900">Saldo RuangPay</div>
                      <div class="text-[11px] text-slate-500">Saldo aktif: <strong class="text-emerald-600">${formatIDR(state.walletBalance)}</strong></div>
                    </div>
                  </div>
                  <div class="w-4 h-4 rounded-full border flex items-center justify-center ${state.paymentMethod === 'SALDO' ? 'border-slate-900 bg-slate-900' : 'border-slate-300'}">${state.paymentMethod === 'SALDO' ? '<div class="w-1.5 h-1.5 rounded-full bg-white"></div>' : ''}</div>
                </div>
                <div onclick="state.paymentMethod = 'QRIS'; render();" class="p-3 rounded-xl border transition flex items-center justify-between cursor-pointer ${state.paymentMethod === 'QRIS' ? 'border-slate-900 bg-slate-50 ring-1 ring-slate-900' : 'border-slate-200 bg-white'}">
                  <div class="flex items-center gap-3">
                    <div class="w-9 h-9 rounded-lg bg-sky-100 text-sky-800 flex items-center justify-center font-black text-[11px]">MT</div>
                    <div>
                      <div class="font-bold text-xs text-slate-900 flex items-center gap-1.5"><span>Midtrans Snap (QRIS / VA / E-Wallet)</span><span class="px-1.5 py-0.2 bg-sky-100 text-sky-800 text-[9px] font-bold rounded">Live API</span></div>
                      <div class="text-[11px] text-slate-500">GoPay, QRIS, ShopeePay, BCA/BRI/Mandiri VA</div>
                    </div>
                  </div>
                  <div class="w-4 h-4 rounded-full border flex items-center justify-center ${state.paymentMethod === 'QRIS' ? 'border-slate-900 bg-slate-900' : 'border-slate-300'}">${state.paymentMethod === 'QRIS' ? '<div class="w-1.5 h-1.5 rounded-full bg-white"></div>' : ''}</div>
                </div>
              `}
            </div>

            ${!usingRuangPass ? `
              <div class="bg-white rounded-2xl p-4 shadow-xs border border-slate-200/80 space-y-2">
                <label class="block text-[11px] font-semibold uppercase tracking-wide text-slate-400">5. Kode Promo (Bebas Biaya Layanan)</label>
                <div class="flex gap-2">
                  <input id="checkout-promo-input" type="text" value="${state.promoCode}" placeholder="Kode: HEMAT1K" class="flex-1 h-10 px-3 rounded-xl bg-slate-50 border border-slate-200 text-xs font-mono font-semibold uppercase">
                  <button type="button" onclick="applyPromoCode()" class="px-4 h-10 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-semibold cursor-pointer">Terapkan</button>
                </div>
                ${state.discountAmount > 0 ? `<div class="text-[11px] text-emerald-600 font-semibold flex items-center gap-1">${Icons.check} <span>Bebas Biaya Layanan Rp 1.000 diterapkan.</span></div>` : ''}
              </div>
            ` : ''}

            <div class="bg-white rounded-2xl p-5 shadow-xs border border-slate-200/80 space-y-2.5 text-xs">
              <span class="block text-[11px] font-semibold uppercase tracking-wide text-slate-400">Rincian Pembayaran Transparan</span>
              <div class="flex justify-between text-slate-600"><span>Deposit Tarif Parkir (Flat 1–3 Jam):</span><span class="font-bold text-slate-900">${usingRuangPass ? '1 Kuota RuangPass' : formatIDR(baseDeposit)}</span></div>
              <div class="flex justify-between text-slate-600"><span>Biaya Layanan Aplikasi (Platform Fee):</span><span class="font-bold ${effectivePlatformFee === 0 ? 'text-emerald-600' : 'text-slate-900'}">${effectivePlatformFee === 0 ? '<span class="line-through text-slate-400 font-normal mr-1">Rp 1.000</span>Rp 0' : formatIDR(effectivePlatformFee)}</span></div>
              <div class="flex justify-between text-slate-600"><span>Estimasi Overstay (${estExtraHours} Jam x Rp 1.000):</span><span class="font-medium text-slate-400">${estExtraCost > 0 ? `Est. +${formatIDR(estExtraCost)}` : 'Rp 0'}</span></div>
              <div class="pt-3 border-t border-slate-100 flex justify-between items-baseline">
                <div>
                  <div class="font-bold text-slate-900 text-sm">Total Bayar Sekarang</div>
                  <div class="text-[10px] text-slate-400">Slot langsung terkunci di database</div>
                </div>
                <span class="text-xl font-black text-slate-900">${formatIDR(finalPayNow)}</span>
              </div>
              ${!mob ? `
                <button onclick="handleBookingPayment(${usingRuangPass})" class="mt-2 h-12 w-full bg-slate-900 hover:bg-black text-white rounded-xl font-bold text-sm transition shadow-md flex items-center justify-center gap-2 cursor-pointer">
                  <span>${usingRuangPass ? 'Konfirmasi (1 Kuota RuangPass)' : `Bayar Sekarang (${formatIDR(finalPayNow)})`}</span><span>${Icons.arrowRight}</span>
                </button>
              ` : ''}
            </div>
          </div>
        </div>
      </div>

      ${mob ? `
        <div class="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white/95 backdrop-blur-md border-t border-slate-200 p-4 z-40 shadow-lg">
          <button onclick="handleBookingPayment(${usingRuangPass})" class="h-14 min-h-[54px] w-full bg-slate-900 hover:bg-black text-white rounded-2xl font-bold text-base transition shadow-md flex items-center justify-center gap-2.5 cursor-pointer">
            <span>${usingRuangPass ? 'Konfirmasi (1 Kuota RuangPass)' : `Bayar Sekarang (${formatIDR(finalPayNow)})`}</span><span>${Icons.arrowRight}</span>
          </button>
        </div>
      ` : ''}
      ${renderTopupModal()}
    </div>
  `;
}

// ==========================================
// DRIVER: E-TICKET (NO SIMULATION BUTTON — REAL CANCEL & REAL SYNC!)
// ==========================================
async function handleCancelBooking(bookingId) {
  if (!confirm('Batalkan reservasi ini? Slot akan dilepas dan deposit dikembalikan.')) return;
  try {
    const res = await apiRequest('./api/bookings.php?action=cancel', {
      method: 'POST',
      body: { booking_id: bookingId }
    });
    await refreshAllData();
    showToast(res.message);
    setScreen('HOME');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function renderTicket() {
  const mob = isMobileView();
  const ticket = state.activeBooking;
  if (!ticket || ticket.status === 'CANCELLED') {
    return `
      <div class="flex flex-col min-h-screen bg-slate-50 ${mob && state.viewMode === 'MOBILE' ? 'pt-7 pb-28' : ''}" id="screen-ticket">
        ${renderDesktopNavbar('TICKET')}
        <div class="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-3">
          <div class="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center text-slate-400">${Icons.ticket}</div>
          <div class="font-bold text-slate-900 text-base">Belum Ada E-Tiket Aktif</div>
          <p class="text-xs text-slate-500 max-w-xs">Silakan pilih lahan parkir warga pada menu Cari Parkir untuk membuat reservasi slot baru.</p>
          <button onclick="setScreen('HOME')" class="h-11 px-6 bg-slate-900 hover:bg-black text-white rounded-xl font-bold text-xs cursor-pointer">Cari Lahan Parkir</button>
        </div>
        ${renderBottomNav('TICKET')}
      </div>
    `;
  }

  const isWaiting = ticket.status === 'WAITING_CHECKIN';
  const isFinished = ticket.status === 'FINISHED';
  const umkm = getNearbyUmkmForSpot(ticket.spotId);

  return `
    <div class="flex flex-col min-h-screen bg-slate-50 ${mob && state.viewMode === 'MOBILE' ? 'pt-7 pb-28' : ''}" id="screen-ticket">
      ${renderDesktopNavbar('TICKET')}
      ${mob ? `
        <div class="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-100 px-4 py-3 flex items-center justify-between">
          <button onclick="setScreen('HOME')" class="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-700 cursor-pointer">${Icons.arrowLeft}</button>
          <h2 class="font-bold text-slate-900 text-sm">E-Tiket &amp; Argometer</h2>
          <button onclick="state.faqModal = true; render();" class="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-700 cursor-pointer">${Icons.helpCircle}</button>
        </div>
      ` : ''}

      <div class="${mob ? 'p-4 space-y-4' : 'max-w-4xl w-full mx-auto px-5 py-6'}">
        <div class="${mob ? 'space-y-4' : 'grid md:grid-cols-12 gap-6 items-start'}">
          <!-- QR & Timer Card -->
          <div class="${mob ? '' : 'md:col-span-6'} bg-white rounded-3xl p-6 shadow-xs border border-slate-200/80 text-center">
            ${isWaiting ? `
              <div class="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-50 text-amber-800 border border-amber-200 rounded-full text-xs font-semibold mb-4">
                <span class="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span><span>Menunggu Scan Masuk oleh Jukir</span>
              </div>
            ` : (isFinished ? `
              <div class="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-100 text-slate-700 border border-slate-200 rounded-full text-xs font-semibold mb-4"><span>Parkir Selesai • Lunas</span></div>
            ` : `
              <div class="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-full text-xs font-semibold mb-4">
                <span class="w-2 h-2 rounded-full bg-emerald-600 animate-ping"></span><span>Parkir Aktif • Argometer Server Berjalan</span>
              </div>
            `)}

            <div class="w-48 mx-auto bg-white border-2 ${isWaiting ? 'border-amber-400' : 'border-slate-900'} rounded-2xl p-3 flex flex-col items-center shadow-xs">
              <div class="text-[9px] font-mono font-bold tracking-widest text-slate-400 mb-2">RUANGPARKIR E-TICKET</div>
              <div id="ticket-qr-canvas" data-code="${escHtml(ticket.code)}" class="w-[132px] h-[132px] flex items-center justify-center bg-white"></div>
              <div class="mt-2 flex items-center gap-1.5">
                <span class="text-xs font-mono font-black text-slate-900">#${escHtml(ticket.code)}</span>
                <span class="text-[9px] font-semibold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">${isWaiting ? 'Scan Jukir' : (isFinished ? 'Selesai' : 'Aktif')}</span>
              </div>
            </div>

            <div class="text-lg font-black text-slate-900 mt-4 tracking-tight">[${ticket.vehicle}] ${ticket.plate}</div>
            <div class="text-xs text-slate-500 font-medium mt-0.5">${ticket.spotName} • ${ticket.slot}</div>
            ${ticket.usedRuangPass ? `<div class="inline-flex items-center gap-1 mt-2 px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-[10px] font-bold text-emerald-800"><span>★ Tiket RuangPass (1 Kuota Motor • Bebas Fee Rp 1.000)</span></div>` : ''}

            <div class="bg-slate-50 p-3.5 rounded-2xl border border-slate-100 mt-4">
              <div class="flex items-center justify-between text-[11px] text-slate-400 font-semibold uppercase tracking-wide">
                <span>${isWaiting ? 'Status Argometer' : 'Durasi Parkir Server'}</span>
                <span class="px-2 py-0.5 rounded text-[10px] ${isWaiting ? 'bg-amber-100 text-amber-800' : (isFinished ? 'bg-slate-200 text-slate-700' : 'bg-emerald-100 text-emerald-800')}">${isWaiting ? 'Menunggu Jukir' : (isFinished ? ticket.duration : 'Berjalan Live')}</span>
              </div>
              <div id="ticket-live-timer" class="text-3xl font-black ${isWaiting ? 'text-slate-400' : 'text-slate-900'} font-mono tracking-widest mt-1.5">${formatDuration(state.parkingSecondsElapsed)}</div>
              <div class="mt-2 pt-2 border-t border-slate-200 flex justify-between text-[11px] text-slate-500">
                <span>Batas Kuota Flat:</span><span class="font-bold text-emerald-700">03:00:00 (Flat 3 Jam)</span>
              </div>
            </div>
          </div>

          <!-- Right Actions, Status Info & UMKM -->
          <div class="${mob ? 'space-y-3.5' : 'md:col-span-6 space-y-4'}">
            <div class="bg-white rounded-3xl p-5 shadow-xs border border-slate-200/80 space-y-3">
              <div class="text-xs font-bold text-slate-800 uppercase tracking-wide">Instruksi &amp; Tindakan Tiket</div>
              ${isWaiting ? `
                <div class="p-3 bg-amber-50 border border-amber-200 rounded-2xl text-[11px] text-amber-900 leading-relaxed">
                  <strong>Langkah Berikutnya:</strong> Tiba di lokasi garasi dan tunjukkan QR Code <strong>#${ticket.code}</strong> kepada petugas <strong>${ticket.jukirName}</strong>. Status tiket otomatis berubah aktif setelah Jukir memindai QR.
                </div>
                <div class="grid grid-cols-2 gap-2">
                  <button onclick="openGoogleMapsRoute(${ticket.spotId})" class="h-11 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer transition">
                    <span>${Icons.navigation}</span><span>Rute Maps</span>
                  </button>
                  <button onclick="state.contactJukirModal = true; render();" class="h-11 bg-slate-900 hover:bg-black text-white rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer transition">
                    <span>${Icons.phone}</span><span>Hubungi Jukir</span>
                  </button>
                </div>
                <button onclick="handleCancelBooking(${ticket.id})" class="h-10 w-full bg-white hover:bg-rose-50 text-rose-600 border border-rose-200 rounded-xl font-semibold text-xs cursor-pointer transition">
                  Batalkan Pesanan &amp; Kembalikan Deposit
                </button>
              ` : (isFinished ? `
                <div class="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs space-y-1.5">
                  <div class="flex justify-between text-slate-500"><span>Durasi Aktual:</span><strong class="text-slate-900">${ticket.duration}</strong></div>
                  <div class="flex justify-between text-slate-500"><span>Total Bayar:</span><strong class="text-emerald-700">${ticket.usedRuangPass && ticket.cost === 0 ? '1 Kuota RuangPass' : formatIDR(ticket.cost)}</strong></div>
                </div>
                ${ticket.isRated ? `
                  <div class="p-3.5 bg-amber-50 border border-amber-200 rounded-2xl flex items-center justify-between">
                    <div>
                      <div class="text-xs font-bold text-amber-900">Ulasan Terkirim</div>
                      <div class="text-[10px] text-amber-700">${ticket.rating < 3 ? 'Tiket evaluasi QC operasional aktif' : 'Terima kasih atas masukan Anda!'}</div>
                    </div>
                    <span class="text-xs font-bold text-amber-900 bg-white px-2.5 py-1 rounded-lg border border-amber-200">${ticket.rating}.0 ★</span>
                  </div>
                ` : `
                  <button onclick="state.ratingTargetCode = '${ticket.code}'; state.ratingModal = true; render();" class="h-11 w-full bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer">
                    <span>★</span><span>Beri Penilaian &amp; Ulasan Bintang</span>
                  </button>
                `}
                <button onclick="setScreen('HOME')" class="h-11 w-full bg-slate-900 hover:bg-black text-white rounded-xl font-bold text-xs cursor-pointer">Cari Tempat Parkir Baru</button>
              ` : `
                <div class="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl text-[11px] text-emerald-900 leading-relaxed">
                  <strong>Kendaraan Sedang Terparkir Aman.</strong> Saat hendak keluar, tunjukkan QR <strong>#${ticket.code}</strong> kepada petugas <strong>${ticket.jukirName}</strong> untuk Scan Keluar &amp; penyelesaian otomatis.
                </div>
                <div class="grid grid-cols-2 gap-2">
                  <button onclick="openGoogleMapsRoute(${ticket.spotId})" class="h-11 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer transition">
                    <span>${Icons.navigation}</span><span>Rute Maps</span>
                  </button>
                  <button onclick="state.contactJukirModal = true; render();" class="h-11 bg-slate-900 hover:bg-black text-white rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer transition">
                    <span>${Icons.phone}</span><span>Hubungi Jukir</span>
                  </button>
                </div>
                <button onclick="refreshAllData().then(() => { render(); showToast('Status tiket diperbarui dari server.'); });" class="h-10 w-full bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold text-xs cursor-pointer transition">
                  Segarkan Status Tiket
                </button>
              `)}
            </div>

            ${!isFinished ? `
              <div onclick="openUmkmModal(${umkm.id})" class="bg-amber-50 border border-amber-200/90 rounded-2xl p-4 shadow-xs flex items-center justify-between gap-3 cursor-pointer">
                <div class="min-w-0">
                  <div class="flex items-center gap-1.5">
                    <span class="px-1.5 py-0.5 bg-amber-500 text-white text-[9px] font-bold rounded uppercase">Promo UMKM Dekat Garasi</span>
                    <span class="text-[10px] text-amber-800 font-semibold">${umkm.distance}</span>
                  </div>
                  <div class="font-bold text-slate-900 text-xs mt-1 truncate">${umkm.name}</div>
                  <div class="text-[11px] text-amber-900 font-semibold">${umkm.promoTitle}</div>
                  <div class="text-[10px] text-slate-500 mt-0.5">Tunjukkan E-Tiket #${ticket.code} di kasir</div>
                </div>
                <span class="px-3 py-1.5 bg-slate-900 text-white rounded-xl text-[10px] font-bold shrink-0">Klaim</span>
              </div>
            ` : ''}
          </div>
        </div>
      </div>

      ${renderBottomNav('TICKET')}
      ${renderFaqModal()}
    </div>
  `;
}

// ==========================================
// DRIVER: HISTORY
// ==========================================
function handleRatingHistory(code) {
  const item = state.historyList.find(h => h.code === code);
  state.ratingTargetCode = code;
  state.ratingScore = (item && item.rating) ? item.rating : 5;
  state.ratingModal = true;
  render();
}

function renderDriverHistory() {
  const mob = isMobileView();
  return `
    <div class="flex flex-col min-h-screen bg-slate-50 ${mob && state.viewMode === 'MOBILE' ? 'pt-7 pb-28' : ''}" id="screen-driver-history">
      ${renderDesktopNavbar('DRIVER_HISTORY')}
      ${mob ? `
        <div class="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-100 px-4 py-3 flex items-center justify-between">
          <button onclick="setScreen('HOME')" class="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-700 cursor-pointer">${Icons.arrowLeft}</button>
          <h2 class="font-bold text-slate-900 text-sm">Riwayat Parkir (${state.historyList.length})</h2>
          <div class="w-10"></div>
        </div>
      ` : ''}

      <div class="${mob ? 'p-4 space-y-3' : 'max-w-5xl w-full mx-auto px-5 py-6 space-y-4'}">
        ${!mob ? `<h1 class="text-lg font-black text-slate-900">Riwayat Transaksi Parkir (${state.historyList.length})</h1>` : ''}
        <div class="${mob ? 'space-y-3' : 'grid md:grid-cols-2 gap-4'}">
          ${state.historyList.length === 0 ? `<div class="bg-white rounded-2xl p-6 text-center text-xs text-slate-500 border border-slate-200/80">Belum ada riwayat transaksi.</div>` : state.historyList.map(h => {
    const stMap = { FINISHED: ['Selesai', 'bg-slate-100 text-slate-700'], ACTIVE: ['Aktif Parkir', 'bg-emerald-100 text-emerald-800'], WAITING_CHECKIN: ['Menunggu Check-in', 'bg-amber-100 text-amber-800'], CANCELLED: ['Dibatalkan', 'bg-rose-50 text-rose-700'] };
    const [stLabel, stClass] = stMap[h.status] || ['Selesai', 'bg-slate-100 text-slate-700'];
    return `
              <div class="bg-white rounded-2xl p-4 shadow-xs border border-slate-200/80 space-y-2.5">
                <div class="flex justify-between items-start">
                  <div>
                    <span class="text-[10px] font-mono text-slate-400">#${h.code} ${h.usedRuangPass ? '• ★ RuangPass' : ''}</span>
                    <h3 class="font-bold text-slate-900 text-sm mt-0.5">${h.spotName}</h3>
                    <p class="text-[11px] text-slate-500 font-medium">${h.vehicle} • ${h.plate}</p>
                  </div>
                  <span class="px-2 py-0.5 rounded-full text-[10px] font-semibold ${stClass}">${stLabel}</span>
                </div>
                <div class="pt-2 border-t border-slate-100 flex justify-between items-center text-xs">
                  <div class="text-[11px] text-slate-400">${h.date} (${h.duration})</div>
                  <div class="text-right">
                    <span class="text-slate-400 text-[10px] block">Total Bayar:</span>
                    <span class="font-bold text-slate-900 text-sm">${h.usedRuangPass && h.cost === 0 ? '1 Kuota' : formatIDR(h.cost)}</span>
                  </div>
                </div>
                ${h.status === 'FINISHED' ? `
                  <div class="pt-2 border-t border-slate-100 flex justify-between items-center">
                    <div class="text-[11px] text-slate-400">Penilaian Layanan:</div>
                    ${h.isRated ? `<span class="text-[11px] font-semibold text-amber-600 flex items-center gap-1">${Icons.star} <span>${h.rating}.0 (Tersimpan)</span></span>` : `
                      <button onclick="handleRatingHistory('${h.code}')" class="h-7 px-2.5 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 rounded-lg text-[11px] font-semibold flex items-center gap-1 cursor-pointer"><span class="text-amber-500">${Icons.star}</span><span>Beri Ulasan</span></button>
                    `}
                  </div>
                ` : ''}
              </div>
            `;
  }).join('')}
        </div>
      </div>
      ${renderBottomNav('DRIVER_HISTORY')}
    </div>
  `;
}

// ==========================================
// LANDOWNER: DASHBOARD & MANAGE
// ==========================================
async function toggleGarageOpen(garageId) {
  try {
    const res = await apiRequest('./api/spots.php?action=toggle', { method: 'POST', body: { spot_id: Number(garageId) } });
    await refreshAllData();
    showToast(res.message);
  } catch (err) { showToast(err.message, 'error'); }
}

async function handleSaveNewGarage(e) {
  e.preventDefault();
  const name = (document.getElementById('new_garage_name')?.value || '').trim();
  const address = (document.getElementById('new_garage_address')?.value || '').trim();
  const slots_car = parseInt(document.getElementById('new_garage_car_slots')?.value || '2', 10);
  const slots_bike = parseInt(document.getElementById('new_garage_bike_slots')?.value || '5', 10);
  const latRaw = parseFloat(document.getElementById('new_garage_lat')?.value || '');
  const lngRaw = parseFloat(document.getElementById('new_garage_lng')?.value || '');
  const body = { name, address, access_note: address, slots_car, slots_bike };
  if (!Number.isNaN(latRaw) && !Number.isNaN(lngRaw)) {
    body.lat = latRaw;
    body.lng = lngRaw;
  }
  try {
    const res = await apiRequest('./api/spots.php?action=create', { method: 'POST', body });
    state.addGarageModal = false;
    await refreshAllData();
    showToast(res.message);
  } catch (err) { showToast(err.message, 'error'); }
}

function fillNewGarageGps() {
  if (!navigator.geolocation) {
    showToast('GPS browser tidak tersedia.', 'error');
    return;
  }
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const latEl = document.getElementById('new_garage_lat');
      const lngEl = document.getElementById('new_garage_lng');
      if (latEl) latEl.value = pos.coords.latitude.toFixed(6);
      if (lngEl) lngEl.value = pos.coords.longitude.toFixed(6);
      showToast('Koordinat GPS garasi berhasil diambil!');
    },
    () => showToast('Gagal mengambil GPS. Anda bisa mengetik koordinat manual atau biarkan default Malang.', 'error'),
    { enableHighAccuracy: true, timeout: 8000 }
  );
}

async function handleSaveEditQuota(e) {
  e.preventDefault();
  const g = state.editQuotaGarage;
  if (!g) return;
  const slots_car = parseInt(document.getElementById('edit_quota_car')?.value || '0', 10);
  const slots_bike = parseInt(document.getElementById('edit_quota_bike')?.value || '0', 10);
  try {
    const res = await apiRequest('./api/spots.php?action=update_quota', { method: 'POST', body: { spot_id: g.id, slots_car, slots_bike } });
    state.editQuotaGarage = null;
    await refreshAllData();
    showToast(res.message);
  } catch (err) { showToast(err.message, 'error'); }
}

function renderLandowner() {
  const mob = isMobileView();
  const mainGar = state.myGarages[0] || null;
  const activeList = state.parkedVehicles;

  return `
    <div class="flex flex-col min-h-screen bg-slate-50 ${mob && state.viewMode === 'MOBILE' ? 'pt-7 pb-28' : ''}" id="screen-landowner">
      ${renderDesktopNavbar('LANDOWNER')}

      <div class="${mob ? '' : 'max-w-6xl w-full mx-auto px-5 py-6 space-y-6'}">
        <div class="${mob ? 'bg-slate-900 text-white rounded-b-3xl p-6 shadow-lg' : 'bg-slate-900 text-white rounded-3xl p-6 shadow-md grid lg:grid-cols-12 gap-6 items-center'}">
          <div class="${mob ? 'mb-5' : 'lg:col-span-5'}">
            <span class="text-[10px] font-bold uppercase tracking-wider text-emerald-400 bg-emerald-950/70 px-2 py-0.5 rounded">Portal Mitra Pemilik Lahan</span>
            <h1 class="text-xl font-black text-white mt-1.5">${mainGar ? (mainGar.shortName || mainGar.name) : state.currentUser.name}</h1>
            <p class="text-[11px] text-slate-400 mt-0.5">${mainGar ? mainGar.address : 'Belum ada lahan terdaftar — tambahkan garasi pertama Anda.'}</p>
          </div>

          ${mainGar ? `
            <div class="${mob ? 'mb-5' : 'lg:col-span-3'} bg-slate-800/90 rounded-2xl p-4 border border-slate-700 flex items-center justify-between">
              <div>
                <div class="text-[11px] text-slate-400 font-medium">Status Lahan Utama</div>
                <div class="text-xs font-bold text-white mt-0.5 flex items-center gap-1.5">
                  <span class="w-2 h-2 rounded-full ${mainGar.isOpen ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}"></span>
                  <span>${mainGar.isOpen ? 'Buka untuk Umum' : 'Ditutup Sementara'}</span>
                </div>
              </div>
              <button onclick="toggleGarageOpen(${mainGar.id})" class="relative w-14 h-7 rounded-full transition-colors p-1 flex items-center cursor-pointer ${mainGar.isOpen ? 'bg-emerald-500' : 'bg-slate-600'}">
                <div class="w-5 h-5 rounded-full bg-white shadow-md transform transition-transform flex items-center justify-center text-[8px] font-bold ${mainGar.isOpen ? 'translate-x-7 text-emerald-600' : 'translate-x-0 text-slate-700'}">${mainGar.isOpen ? 'ON' : 'OFF'}</div>
              </button>
            </div>
          ` : ''}

          <div class="${mob ? 'pt-4 border-t border-slate-800' : 'lg:col-span-4'} flex justify-between items-center gap-3">
            <div>
              <div class="text-[11px] text-slate-400 font-medium">Bagi Hasil Pemilik (40% Utuh)</div>
              <div class="text-2xl font-black text-white mt-0.5">${formatIDR(state.landownerBalance)}</div>
              <div class="text-[11px] text-emerald-400 font-medium">Pendapatan Hari Ini: ${formatIDR(state.todayRevenue)}</div>
            </div>
            <button onclick="state.withdrawModal = true; render();" class="h-10 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shrink-0"><span>Tarik Dana</span><span>${Icons.arrowRight}</span></button>
          </div>
        </div>

        <div class="${mob ? 'p-4 space-y-4' : 'grid lg:grid-cols-12 gap-6 items-start'}">
          ${mainGar ? `
            <div class="${mob ? '' : 'lg:col-span-5 space-y-4'}">
              <div class="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs flex items-center justify-between">
                <div>
                  <span class="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Kapasitas Slot Terpakai</span>
                  <div class="text-base font-bold text-slate-900 mt-0.5">${mainGar.occupiedCar}/${mainGar.slotsCar} Mobil • ${mainGar.occupiedBike}/${mainGar.slotsBike} Motor</div>
                  <div class="text-[11px] text-slate-500">Sisa ${Math.max(0, mainGar.slotsCar - mainGar.occupiedCar)} mobil &amp; ${Math.max(0, mainGar.slotsBike - mainGar.occupiedBike)} motor</div>
                </div>
                <div class="w-12 h-12 rounded-xl bg-slate-100 text-slate-800 flex items-center justify-center font-bold text-sm">
                  ${Math.round(((mainGar.occupiedCar + mainGar.occupiedBike) / Math.max(1, mainGar.slotsCar + mainGar.slotsBike)) * 100)}%
                </div>
              </div>
              ${!mob ? `
                <button onclick="setScreen('LANDOWNER_MANAGE')" class="w-full h-11 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 cursor-pointer">+ Kelola / Daftarkan Lahan Baru (${state.myGarages.length} Garasi)</button>
              ` : ''}
            </div>
          ` : ''}

          <div class="${mob ? 'space-y-2.5' : 'lg:col-span-7 space-y-3'}">
            <div class="flex justify-between items-center">
              <h2 class="font-bold text-slate-900 text-xs uppercase tracking-wide">Kendaraan Terparkir Real-Time (${activeList.length} Unit)</h2>
              <button onclick="setScreen('LANDOWNER_MANAGE')" class="text-xs font-semibold text-emerald-600 hover:underline cursor-pointer">Kelola Garasi</button>
            </div>
            ${activeList.length === 0 ? `<div class="bg-white rounded-2xl p-6 text-center text-xs text-slate-500 border border-slate-200/80">Belum ada kendaraan terparkir saat ini.</div>` : activeList.map(v => `
              <div class="bg-white p-4 rounded-2xl shadow-xs border border-slate-200/80 flex items-center justify-between">
                <div class="flex items-center gap-3">
                  <div class="w-10 h-10 rounded-xl flex items-center justify-center bg-slate-100 text-slate-700">${v.vehicleKind === 'MOTOR' ? Icons.bike : Icons.car}</div>
                  <div>
                    <div class="font-mono font-bold text-slate-900 text-sm">${v.plate}</div>
                    <div class="text-[11px] text-slate-500 font-medium">${v.type} • ${v.slot} (${v.spotName})</div>
                  </div>
                </div>
                <div class="text-right">
                  <div class="text-[10px] text-slate-400">Argometer</div>
                  <div id="veh-timer-${v.id}" class="text-xs font-mono font-bold ${v.status === 'ACTIVE' ? 'text-emerald-600' : 'text-amber-600'}">${v.status === 'ACTIVE' ? formatDuration(v.elapsedSec) : 'Menunggu Scan'}</div>
                  <span class="text-[9px] font-semibold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded inline-block mt-0.5">${v.note}</span>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>

      ${renderBottomNav('LANDOWNER')}
      ${renderWithdrawModal()}
    </div>
  `;
}

function renderLandownerManage() {
  const mob = isMobileView();
  return `
    <div class="flex flex-col min-h-screen bg-slate-50 ${mob && state.viewMode === 'MOBILE' ? 'pt-7 pb-28' : ''}" id="screen-landowner-manage">
      ${renderDesktopNavbar('LANDOWNER_MANAGE')}
      ${mob ? `
        <div class="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-100 px-4 py-3 flex items-center justify-between">
          <button onclick="setScreen('LANDOWNER')" class="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-700 cursor-pointer">${Icons.arrowLeft}</button>
          <h2 class="font-bold text-slate-900 text-sm">Kelola Lahan Garasi</h2>
          <div class="w-10"></div>
        </div>
      ` : ''}

      <div class="${mob ? 'p-4 space-y-4' : 'max-w-5xl w-full mx-auto px-5 py-6 space-y-5'}">
        <div class="bg-slate-900 rounded-2xl p-5 text-white shadow-sm flex flex-wrap items-center justify-between gap-4">
          <div>
            <span class="text-[10px] font-semibold uppercase tracking-wider text-emerald-400">Monetisasi Aset Menganggur</span>
            <h2 class="text-base font-bold mt-1">Kelola Halaman &amp; Garasi Anda</h2>
            <p class="text-xs text-slate-300 mt-0.5">Terima bagi hasil 40% utuh dari setiap transaksi parkir yang selesai.</p>
          </div>
          <button onclick="state.addGarageModal = true; render();" class="h-11 px-5 bg-white hover:bg-slate-100 text-slate-900 rounded-xl font-bold text-xs flex items-center gap-1.5 cursor-pointer">${Icons.plus}<span>Daftarkan Lahan Baru</span></button>
        </div>

        <div class="${mob ? 'space-y-3' : 'grid md:grid-cols-2 gap-4'}">
          ${state.myGarages.map(g => `
            <div class="bg-white rounded-2xl p-4 shadow-xs border border-slate-200/80 space-y-3">
              <div class="flex justify-between items-start gap-2">
                <div>
                  <div class="flex items-center gap-2 flex-wrap">
                    <h4 class="font-bold text-slate-900 text-sm">${g.name}</h4>
                    <span class="px-2 py-0.5 text-[10px] font-semibold rounded ${g.isOpen ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'}">${g.isOpen ? 'Buka' : 'Tutup'}</span>
                  </div>
                  <p class="text-xs text-slate-500 mt-0.5">${g.address}</p>
                </div>
              </div>
              <div class="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-slate-100">
                <div class="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                  <div class="text-slate-400 text-[10px]">Slot Mobil</div>
                  <div class="font-bold text-slate-800 text-sm mt-0.5">${g.occupiedCar} / ${g.slotsCar} Terpakai</div>
                  <div class="text-[10px] text-emerald-600 font-semibold">${formatIDR(g.priceFlatCar)} / 3 Jam</div>
                </div>
                <div class="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                  <div class="text-slate-400 text-[10px]">Slot Motor</div>
                  <div class="font-bold text-slate-800 text-sm mt-0.5">${g.occupiedBike} / ${g.slotsBike} Terpakai</div>
                  <div class="text-[10px] text-emerald-600 font-semibold">${formatIDR(g.priceFlatBike)} / 3 Jam</div>
                </div>
              </div>
              <div class="flex gap-2 pt-1">
                <button onclick="toggleGarageOpen(${g.id})" class="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold rounded-xl cursor-pointer">${g.isOpen ? 'Tutup Sementara' : 'Buka Garasi'}</button>
                <button onclick="state.editQuotaGarage = state.myGarages.find(x => x.id === ${g.id}); render();" class="px-3.5 py-2 bg-slate-900 hover:bg-black text-white text-xs font-semibold rounded-xl cursor-pointer">Atur Kuota</button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>

      ${renderBottomNav('LANDOWNER_MANAGE')}
      ${renderAddGarageModal()}
      ${renderEditQuotaModal()}
    </div>
  `;
}

function renderAddGarageModal() {
  if (!state.addGarageModal) return '';
  return `
    <div class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div class="bg-white rounded-3xl p-5 w-full max-w-sm text-left shadow-2xl relative">
        <button onclick="state.addGarageModal = false; render();" class="absolute top-4 right-4 text-slate-400 hover:text-slate-600 cursor-pointer">${Icons.close}</button>
        <h3 class="text-base font-bold text-slate-900">Form Pendaftaran Lahan Baru</h3>
        <form onsubmit="handleSaveNewGarage(event)" class="space-y-3 mt-4 text-xs">
          <div><label class="block font-semibold text-slate-700 mb-1">Nama Garasi / Lahan *</label><input id="new_garage_name" type="text" placeholder="Contoh: Halaman Bu Siti" required class="w-full h-10 px-3 rounded-xl bg-slate-50 border border-slate-200 font-medium"></div>
          <div><label class="block font-semibold text-slate-700 mb-1">Alamat Lengkap &amp; Patokan Gang *</label><textarea id="new_garage_address" rows="2" placeholder="Jl. Bunga Cengkeh No. 22, Lowokwaru" required class="w-full p-2.5 rounded-xl bg-slate-50 border border-slate-200 font-medium"></textarea></div>
          <div class="grid grid-cols-2 gap-2">
            <div><label class="block font-semibold text-slate-700 mb-1">Slot Mobil *</label><input id="new_garage_car_slots" type="number" min="0" max="50" value="3" required class="w-full h-10 px-3 rounded-xl bg-slate-50 border border-slate-200 font-bold"></div>
            <div><label class="block font-semibold text-slate-700 mb-1">Slot Motor *</label><input id="new_garage_bike_slots" type="number" min="0" max="100" value="6" required class="w-full h-10 px-3 rounded-xl bg-slate-50 border border-slate-200 font-bold"></div>
          </div>
          <div class="p-2.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
            <div class="flex items-center justify-between">
              <span class="text-[10px] font-bold uppercase text-slate-500">Koordinat Peta GPS (Opsional)</span>
              <button type="button" onclick="fillNewGarageGps()" class="text-[10px] font-bold text-emerald-700 hover:underline cursor-pointer">Ambil GPS Saat Ini</button>
            </div>
            <div class="grid grid-cols-2 gap-2">
              <input id="new_garage_lat" type="text" placeholder="-7.945000" class="w-full h-9 px-2.5 rounded-lg bg-white border border-slate-200 font-mono text-[11px]">
              <input id="new_garage_lng" type="text" placeholder="112.618000" class="w-full h-9 px-2.5 rounded-lg bg-white border border-slate-200 font-mono text-[11px]">
            </div>
          </div>
          <button type="submit" class="h-11 w-full bg-slate-900 hover:bg-black text-white font-bold rounded-xl cursor-pointer mt-2">Simpan &amp; Aktifkan Lahan</button>
        </form>
      </div>
    </div>
  `;
}

function renderEditQuotaModal() {
  if (!state.editQuotaGarage) return '';
  const g = state.editQuotaGarage;
  return `
    <div class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div class="bg-white rounded-3xl p-5 w-full max-w-sm text-left shadow-2xl relative">
        <button onclick="state.editQuotaGarage = null; render();" class="absolute top-4 right-4 text-slate-400 hover:text-slate-600 cursor-pointer">${Icons.close}</button>
        <h3 class="text-base font-bold text-slate-900">Atur Kuota Slot Garasi</h3>
        <p class="text-xs text-slate-500 mt-0.5 truncate">${g.name}</p>
        <form onsubmit="handleSaveEditQuota(event)" class="space-y-3 mt-4 text-xs">
          <div class="grid grid-cols-2 gap-2">
            <div><label class="block font-semibold text-slate-700 mb-1">Total Slot Mobil</label><input id="edit_quota_car" type="number" min="0" max="50" value="${g.slotsCar}" required class="w-full h-10 px-3 rounded-xl bg-slate-50 border border-slate-200 font-bold"></div>
            <div><label class="block font-semibold text-slate-700 mb-1">Total Slot Motor</label><input id="edit_quota_bike" type="number" min="0" max="100" value="${g.slotsBike}" required class="w-full h-10 px-3 rounded-xl bg-slate-50 border border-slate-200 font-bold"></div>
          </div>
          <button type="submit" class="h-11 w-full bg-slate-900 hover:bg-black text-white font-bold rounded-xl cursor-pointer">Simpan Perubahan Kuota</button>
        </form>
      </div>
    </div>
  `;
}

// ==========================================
// ATTENDANT: TERMINAL POS SCANNER & LOGS
// ==========================================
async function confirmCheckIn(bookingId = null, bookingCode = null) {
  try {
    const res = await apiRequest('./api/attendant.php?action=scan_in', {
      method: 'POST',
      body: { booking_id: bookingId || 0, booking_code: bookingCode || '' }
    });
    state.scannerModal = false;
    await refreshAllData();
    showToast(res.message);
  } catch (err) { showToast(err.message, 'error'); }
}

function openScanner(mode = 'IN', targetBooking = null) {
  state.scannerMode = mode;
  state.scannerTargetBooking = targetBooking || (mode === 'IN' ? state.waitingQueue[0] : state.parkedVehicles.find(v => v.status === 'ACTIVE'));
  state.scannerModal = true;
  render();
}

let qrScanRafId = null;

function stopQrCameraStream() {
  if (qrScanRafId) {
    cancelAnimationFrame(qrScanRafId);
    qrScanRafId = null;
  }
  if (window._activeMediaStream) {
    window._activeMediaStream.getTracks().forEach(t => t.stop());
    window._activeMediaStream = null;
  }
}

function closeScanner() {
  stopQrCameraStream();
  state.scannerModal = false;
  render();
}

async function handleScannerConfirm() {
  stopQrCameraStream();
  state.scannerModal = false;
  const target = state.scannerTargetBooking;
  if (!target) {
    showToast('Tidak ada kendaraan pada daftar antrean ini.', 'error');
    return;
  }
  if (state.scannerMode === 'IN') {
    await confirmCheckIn(target.id, target.code);
  } else {
    state.overstayTargetBooking = target;
    state.overstayScenario = 'scenario_realtime';
    state.overstayModal = true;
    render();
  }
}

async function handleManualCodeVerify() {
  const raw = (document.getElementById('scanner-manual-code')?.value || state.manualCodeInput || '').trim().toUpperCase().replace(/^#/, '');
  const list = state.scannerMode === 'IN' ? state.waitingQueue : state.parkedVehicles.filter(v => v.status === 'ACTIVE');
  const found = raw ? list.find(b => b.code.toUpperCase() === raw) : list[0];
  if (!found) {
    showToast('Kode booking tidak ditemukan pada antrean aktif.', 'error');
    return;
  }
  state.scannerTargetBooking = found;
  state.manualCodeInput = '';
  await handleScannerConfirm();
}

function startQrDecodeLoop(videoEl) {
  if (typeof jsQR === 'undefined') return;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  const tick = () => {
    if (!window._activeMediaStream || !state.scannerModal) return;
    if (videoEl && videoEl.readyState === videoEl.HAVE_ENOUGH_DATA && videoEl.videoWidth > 0) {
      canvas.width = videoEl.videoWidth;
      canvas.height = videoEl.videoHeight;
      ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const qr = jsQR(imgData.data, imgData.width, imgData.height, { inversionAttempts: 'dontInvert' });
      if (qr && qr.data) {
        const cleanCode = qr.data.trim().toUpperCase().replace(/^#/, '');
        const list = state.scannerMode === 'IN' ? state.waitingQueue : state.parkedVehicles.filter(v => v.status === 'ACTIVE');
        const matched = list.find(b => b.code.toUpperCase() === cleanCode);
        if (matched) {
          state.scannerTargetBooking = matched;
          showToast(`QR Terbaca: #${matched.code} (${matched.plate})`);
          handleScannerConfirm();
          return;
        }
      }
    }
    qrScanRafId = requestAnimationFrame(tick);
  };
  qrScanRafId = requestAnimationFrame(tick);
}

function togglePhysicalCamera() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    showToast('Kamera fisik memerlukan HTTPS/localhost. Anda tetap dapat memverifikasi lewat kode booking.');
    return;
  }
  if (window._activeMediaStream) {
    stopQrCameraStream();
    render();
    return;
  }
  navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
    .then(stream => {
      window._activeMediaStream = stream;
      const vid = document.getElementById('scanner-video-element');
      const ph = document.getElementById('scanner-hud-placeholder');
      if (vid) {
        vid.srcObject = stream;
        vid.classList.remove('hidden');
        vid.play().catch(() => {});
        startQrDecodeLoop(vid);
      }
      if (ph) ph.classList.add('opacity-30');
      showToast('Kamera pemindai QR aktif! Arahkan ke E-Tiket Pengemudi.');
    })
    .catch(() => showToast('Izin kamera tidak tersedia. Gunakan verifikasi kode booking.', 'error'));
}

function renderAttendant() {
  const mob = isMobileView();
  const waiting = state.waitingQueue[0] || null;
  const activeOnly = state.parkedVehicles.filter(v => v.status === 'ACTIVE');

  return `
    <div class="flex flex-col min-h-screen bg-slate-50 ${mob && state.viewMode === 'MOBILE' ? 'pt-7 pb-28' : ''}" id="screen-attendant">
      ${renderDesktopNavbar('ATTENDANT')}

      <div class="${mob ? 'p-5 space-y-4' : 'max-w-6xl w-full mx-auto px-5 py-6'}">
        <div class="${mob ? 'space-y-4' : 'grid lg:grid-cols-12 gap-6 items-start'}">
          <!-- Left POS Controls -->
          <div class="${mob ? 'space-y-4' : 'lg:col-span-6 space-y-4'}">
            <div>
              <span class="text-[10px] font-bold uppercase tracking-wider text-slate-500 bg-slate-200/80 px-2 py-0.5 rounded">Operasional Lapangan &amp; QC</span>
              <h1 class="text-2xl font-black text-slate-900 tracking-tight mt-1">Terminal Juru Parkir</h1>
              <p class="text-xs text-slate-500">Petugas: ${state.currentUser.name} • Pos Garasi Suhat (#JK-04)</p>
            </div>

            <div class="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs flex items-center justify-between">
              <div>
                <span class="text-[10px] font-semibold uppercase text-slate-400">Akumulasi Upah Jukir (40% Utuh)</span>
                <div class="text-xl font-black text-slate-900 mt-0.5">${formatIDR(state.attendantEarningsToday)}</div>
                <div class="text-[10px] text-slate-500">${state.totalVehiclesManagedToday} Kendaraan Dilayani</div>
              </div>
              <span class="px-2.5 py-1 bg-emerald-50 text-emerald-800 font-semibold text-xs rounded-xl border border-emerald-200">Pos Aktif</span>
            </div>

            ${waiting ? `
              <div class="p-3.5 bg-amber-50 rounded-2xl border border-amber-200 flex items-center justify-between gap-2">
                <div>
                  <span class="text-[10px] font-bold text-amber-800 uppercase tracking-wide">Antrean Check-In (${state.waitingQueue.length}):</span>
                  <div class="font-bold text-xs text-slate-900 mt-0.5">${waiting.plate} • #${waiting.code}</div>
                  <div class="text-[11px] text-amber-700">${waiting.spotName} • ${waiting.slot}</div>
                </div>
                <button onclick="openScanner('IN', state.waitingQueue[0]);" class="px-3.5 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold cursor-pointer shrink-0">Scan Masuk</button>
              </div>
            ` : `
              <div class="p-3.5 bg-slate-100 rounded-2xl border border-slate-200 text-xs text-slate-500">
                Belum ada antrean kedatangan baru (otomatis diperbarui tiap 8 detik).
              </div>
            `}

            <div class="space-y-3">
              <button onclick="openScanner('IN');" class="w-full bg-slate-900 hover:bg-black active:scale-[0.99] text-white h-24 rounded-2xl flex flex-col items-center justify-center gap-1 shadow-md transition text-center cursor-pointer">
                <div class="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center text-white">${Icons.scan}</div>
                <div class="text-sm font-bold">1. SCAN MASUK (Check-In)</div>
                <div class="text-[11px] text-slate-400">Validasi QR / kode booking &amp; mulai argometer server</div>
              </button>
              <button onclick="openScanner('OUT');" class="w-full bg-white hover:bg-slate-50 active:scale-[0.99] text-slate-900 border border-slate-200 h-24 rounded-2xl flex flex-col items-center justify-center gap-1 shadow-xs transition text-center cursor-pointer">
                <div class="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center text-slate-700">${Icons.clock}</div>
                <div class="text-sm font-bold">2. SCAN KELUAR (Check-Out)</div>
                <div class="text-[11px] text-slate-500">Hitung durasi server, bagi hasil 40:40:20 &amp; lepas slot</div>
              </button>
            </div>
          </div>

          <!-- Right Column (Desktop): Active Vehicles List -->
          ${!mob ? `
            <div class="lg:col-span-6 bg-white rounded-3xl p-5 border border-slate-200/80 shadow-xs space-y-3">
              <div class="flex justify-between items-center">
                <h2 class="text-xs font-bold text-slate-800 uppercase tracking-wide">Kendaraan Aktif di Lapangan (${activeOnly.length})</h2>
                <button onclick="refreshAllData().then(() => { render(); showToast('Data lapangan disegarkan.'); })" class="text-xs font-semibold text-emerald-600 hover:underline cursor-pointer">Segarkan</button>
              </div>
              ${state.parkedVehicles.length === 0 ? `<div class="p-6 text-center text-xs text-slate-400">Belum ada kendaraan di pos.</div>` : state.parkedVehicles.map((v, i) => `
                <div class="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 flex items-center justify-between gap-2">
                  <div>
                    <div class="font-mono font-bold text-slate-900 text-sm">${v.plate} <span class="text-[10px] font-normal text-slate-400">#${v.code}</span></div>
                    <div class="text-[11px] text-slate-500">${v.type} • ${v.slot} • ${v.spotName}</div>
                  </div>
                  <div class="flex items-center gap-3">
                    <div id="veh-timer-${v.id}" class="text-xs font-mono font-bold ${v.status === 'ACTIVE' ? 'text-emerald-600' : 'text-amber-600'}">${v.status === 'ACTIVE' ? formatDuration(v.elapsedSec) : 'Menunggu'}</div>
                    <button onclick="openScanner('${v.status === 'ACTIVE' ? 'OUT' : 'IN'}', state.parkedVehicles[${i}])" class="px-3 py-1.5 ${v.status === 'ACTIVE' ? 'bg-amber-500 text-slate-950' : 'bg-slate-900 text-white'} text-[11px] font-bold rounded-xl cursor-pointer">
                      ${v.status === 'ACTIVE' ? 'Check-Out' : 'Check-In'}
                    </button>
                  </div>
                </div>
              `).join('')}
            </div>
          ` : ''}
        </div>
      </div>

      ${renderBottomNav('ATTENDANT')}
      ${renderScannerModal()}
      ${renderOverstayModal()}
    </div>
  `;
}

function renderAttendantLogs() {
  const mob = isMobileView();
  return `
    <div class="flex flex-col min-h-screen bg-slate-50 ${mob && state.viewMode === 'MOBILE' ? 'pt-7 pb-28' : ''}" id="screen-attendant-logs">
      ${renderDesktopNavbar('ATTENDANT_LOGS')}
      ${mob ? `
        <div class="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-100 px-4 py-3 flex items-center justify-between">
          <button onclick="setScreen('ATTENDANT')" class="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-700 cursor-pointer">${Icons.arrowLeft}</button>
          <h2 class="font-bold text-slate-900 text-sm">Log Kendaraan Lapangan</h2>
          <div class="w-10"></div>
        </div>
      ` : ''}

      <div class="${mob ? 'p-4 space-y-3' : 'max-w-5xl w-full mx-auto px-5 py-6 space-y-4'}">
        <div class="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <span class="text-[10px] font-semibold text-slate-400 uppercase">Monitoring Slot Lapangan</span>
            <div class="text-xl font-bold text-slate-900 mt-0.5">${state.parkedVehicles.length} Kendaraan Terdata</div>
          </div>
          <span class="px-2.5 py-1 bg-emerald-50 text-emerald-800 font-semibold text-xs rounded-xl border border-emerald-200">Live db_parkir</span>
        </div>

        <div class="${mob ? 'space-y-2' : 'grid md:grid-cols-2 gap-3'}">
          ${state.parkedVehicles.length === 0 ? `<div class="bg-white p-6 rounded-2xl border border-slate-200/80 text-center text-xs text-slate-400 md:col-span-2">Belum ada kendaraan aktif maupun antrean di pos saat ini.</div>` : state.parkedVehicles.map((v, i) => `
            <div class="bg-white p-4 rounded-2xl shadow-xs border border-slate-200/80 flex items-center justify-between">
              <div class="flex items-center gap-3">
                <div class="w-9 h-9 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center font-bold text-xs">#0${i + 1}</div>
                <div>
                  <div class="font-mono font-bold text-slate-900 text-sm">${v.plate}</div>
                  <div class="text-[11px] text-slate-500">${v.type} • ${v.slot} (#${v.code})</div>
                </div>
              </div>
              <div class="text-right space-y-1">
                <div id="veh-timer-${v.id}" class="text-xs font-mono font-bold ${v.status === 'ACTIVE' ? 'text-emerald-600' : 'text-amber-600'}">${v.status === 'ACTIVE' ? formatDuration(v.elapsedSec) : 'Menunggu Scan'}</div>
                <button onclick="openScanner('${v.status === 'ACTIVE' ? 'OUT' : 'IN'}', state.parkedVehicles[${i}])" class="px-2.5 py-1 bg-slate-900 text-white text-[10px] font-bold rounded-lg cursor-pointer">${v.status === 'ACTIVE' ? 'Check-Out' : 'Check-In'}</button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>

      ${renderBottomNav('ATTENDANT_LOGS')}
      ${renderScannerModal()}
      ${renderOverstayModal()}
    </div>
  `;
}

// ==========================================
// PROFILE, EDIT PROFILE & WALLET LEDGER (NO ROLE SWITCHER!)
// ==========================================
async function handleProfileUpdate(e) {
  e.preventDefault();
  const name = (document.getElementById('prof-name')?.value || '').trim();
  const default_plate = (document.getElementById('prof-plate')?.value || '').trim();
  const bank_info = (document.getElementById('prof-bank')?.value || '').trim();
  const new_pin = (document.getElementById('prof-pin')?.value || '').trim();
  try {
    const res = await apiRequest('./api/auth.php?action=update_profile', {
      method: 'POST',
      body: { name, default_plate, bank_info, new_pin }
    });
    state.editProfileModal = false;
    applyAuthPayload(res);
    showToast(res.message);
    render();
  } catch (err) { showToast(err.message, 'error'); }
}

function renderEditProfileModal() {
  if (!state.editProfileModal || !state.currentUser) return '';
  const u = state.currentUser;
  return `
    <div class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div class="bg-white rounded-3xl p-5 w-full max-w-sm text-left shadow-2xl relative">
        <button onclick="state.editProfileModal = false; render();" class="absolute top-4 right-4 text-slate-400 hover:text-slate-600 cursor-pointer">${Icons.close}</button>
        <h3 class="text-base font-bold text-slate-900">Edit Profil &amp; Keamanan</h3>
        <form onsubmit="handleProfileUpdate(event)" class="space-y-3 mt-4 text-xs">
          <div><label class="block font-semibold text-slate-700 mb-1">Nama Lengkap</label><input id="prof-name" type="text" required value="${u.name}" class="w-full h-10 px-3 rounded-xl bg-slate-50 border border-slate-200 font-medium"></div>
          ${u.role === 'DRIVER' ? `<div><label class="block font-semibold text-slate-700 mb-1">Plat Nomor Default</label><input id="prof-plate" type="text" value="${u.default_plate || ''}" class="w-full h-10 px-3 rounded-xl bg-slate-50 border border-slate-200 font-mono font-bold uppercase"></div>` : ''}
          ${u.role !== 'DRIVER' ? `<div><label class="block font-semibold text-slate-700 mb-1">Rekening Bank / E-Wallet Pencairan</label><input id="prof-bank" type="text" value="${u.bank_info || ''}" class="w-full h-10 px-3 rounded-xl bg-slate-50 border border-slate-200 font-medium"></div>` : ''}
          <div><label class="block font-semibold text-slate-700 mb-1">Ganti PIN / Kata Sandi (Opsional, min. 6)</label><input id="prof-pin" type="password" placeholder="Kosongkan jika tidak ingin mengganti" class="w-full h-10 px-3 rounded-xl bg-slate-50 border border-slate-200"></div>
          <button type="submit" class="h-11 w-full bg-slate-900 hover:bg-black text-white font-bold rounded-xl cursor-pointer">Simpan Perubahan</button>
        </form>
      </div>
    </div>
  `;
}

function renderProfile() {
  const mob = isMobileView();
  const u = state.currentUser;
  if (!u) return '';
  const roleLabel = u.role === 'DRIVER' ? 'Pengemudi (Driver)' : (u.role === 'LANDOWNER' ? 'Mitra Pemilik Lahan' : 'Mitra Juru Parkir');

  return `
    <div class="flex flex-col min-h-screen bg-slate-50 ${mob && state.viewMode === 'MOBILE' ? 'pt-7 pb-28' : ''}" id="screen-profile">
      ${renderDesktopNavbar('PROFILE')}
      ${mob ? `
        <div class="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-100 px-4 py-3 flex items-center justify-between">
          <button onclick="setScreen(state.userRole === 'DRIVER' ? 'HOME' : (state.userRole === 'LANDOWNER' ? 'LANDOWNER' : 'ATTENDANT'))" class="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-700 cursor-pointer">${Icons.arrowLeft}</button>
          <h2 class="font-bold text-slate-900 text-sm">Profil Akun</h2>
          <button onclick="state.editProfileModal = true; render();" class="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-700 cursor-pointer">${Icons.edit}</button>
        </div>
      ` : ''}

      <div class="${mob ? 'p-4 space-y-4' : 'max-w-5xl w-full mx-auto px-5 py-6'}">
        <div class="${mob ? 'space-y-4' : 'grid lg:grid-cols-12 gap-6 items-start'}">
          <div class="${mob ? 'space-y-4' : 'lg:col-span-5 space-y-4'}">
            <div class="bg-white rounded-2xl p-5 shadow-xs border border-slate-200/80 space-y-3">
              <div class="flex items-center justify-between gap-3">
                <div class="flex items-center gap-3.5 min-w-0">
                  <div class="w-12 h-12 rounded-2xl bg-slate-900 text-white flex items-center justify-center font-bold text-sm shrink-0">${u.avatar_text || 'RP'}</div>
                  <div class="min-w-0">
                    <h3 class="font-bold text-slate-900 text-sm truncate">${u.name}</h3>
                    <p class="text-[11px] text-slate-500 truncate">${u.phone} • ${u.email}</p>
                    <span class="inline-block mt-1 px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded text-[10px] font-bold">${roleLabel}</span>
                  </div>
                </div>
                <button onclick="state.editProfileModal = true; render();" class="p-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-slate-700 cursor-pointer shrink-0" title="Edit Profil">${Icons.edit}</button>
              </div>
              ${u.default_plate ? `<div class="text-xs text-slate-600 pt-2 border-t border-slate-100">Plat Utama: <strong class="font-mono text-slate-900">${u.default_plate}</strong></div>` : ''}
              ${u.bank_info ? `<div class="text-xs text-slate-600 pt-2 border-t border-slate-100">Rekening Pencairan: <strong class="text-slate-900">${u.bank_info}</strong></div>` : ''}
            </div>

            <div class="bg-white rounded-2xl p-4 shadow-xs border border-slate-200/80 flex justify-between items-center">
              <div>
                <span class="text-[10px] text-slate-400 font-semibold uppercase">${u.role === 'DRIVER' ? 'Saldo Dompet RuangPay' : (u.role === 'LANDOWNER' ? 'Saldo Bagi Hasil Pemilik' : 'Akumulasi Upah Jukir')}</span>
                <div class="text-lg font-black text-slate-900">${formatIDR(state.walletBalance)}</div>
              </div>
              ${u.role === 'DRIVER' ? `<button onclick="state.topUpModal = true; render();" class="h-9 px-3 bg-slate-900 hover:bg-black text-white rounded-xl text-xs font-semibold cursor-pointer flex items-center gap-1">${Icons.plus}<span>Top Up</span></button>` : (u.role === 'LANDOWNER' ? `<button onclick="state.withdrawModal = true; render();" class="h-9 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold cursor-pointer">Tarik Dana</button>` : '')}
            </div>

            ${u.role === 'DRIVER' ? `
              <div onclick="state.ruangPassModal = true; render();" class="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex items-center justify-between gap-3 cursor-pointer">
                <div>
                  <div class="flex items-center gap-1.5">
                    <span class="text-xs font-black text-emerald-900">★ Langganan RuangPass</span>
                    <span class="px-1.5 py-0.5 text-[9px] font-bold rounded ${state.ruangPass.active ? 'bg-emerald-600 text-white' : 'bg-white text-emerald-800 border border-emerald-200'}">${state.ruangPass.active ? `Sisa ${state.ruangPass.remainingQuota}/${state.ruangPass.totalQuota}` : 'Rp 55.000/bln'}</span>
                  </div>
                  <p class="text-[10px] text-emerald-800 mt-1">${state.ruangPass.active ? `Aktif s/d ${state.ruangPass.validUntil}` : 'Hemat 20x parkir motor (Rp 2.750/parkir).'}</p>
                </div>
                <span class="px-2.5 py-1.5 bg-emerald-600 text-white rounded-xl text-[10px] font-bold shrink-0">${state.ruangPass.active ? 'Detail' : 'Beli'}</span>
              </div>
            ` : ''}

            <button onclick="state.faqModal = true; render();" class="w-full h-12 bg-white hover:bg-slate-50 rounded-2xl px-4 shadow-xs border border-slate-200/80 flex items-center justify-between text-left cursor-pointer">
              <div class="flex items-center gap-2.5"><span class="text-slate-600">${Icons.helpCircle}</span><span class="text-xs font-bold text-slate-900">Pusat Bantuan &amp; Ketentuan Tarif</span></div>
              <span>${Icons.chevronRight}</span>
            </button>

            <button onclick="handleResetDatabase()" class="w-full h-11 bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-900 rounded-2xl font-bold text-xs flex items-center justify-center gap-2 cursor-pointer transition">
              <span>${Icons.refresh}</span><span>Reset Database (db_parkir) ke Data Awal</span>
            </button>

            <button onclick="handleLogout()" class="w-full h-12 bg-white hover:bg-rose-50 border border-rose-200 text-rose-600 rounded-2xl font-bold text-xs flex items-center justify-center gap-2 cursor-pointer">
              <span>${Icons.logOut}</span><span>Keluar Akun (Logout)</span>
            </button>
          </div>

          <!-- Right Column: Wallet Transactions Audit Trail -->
          <div class="${mob ? '' : 'lg:col-span-7'} bg-white rounded-2xl p-5 shadow-xs border border-slate-200/80 space-y-3">
            <div class="flex justify-between items-center">
              <span class="text-xs font-bold uppercase tracking-wide text-slate-700">Riwayat Mutasi Keuangan</span>
              <span class="text-[10px] text-emerald-600 font-semibold">${state.walletLogs.length} Transaksi</span>
            </div>
            ${state.walletLogs.length === 0 ? `<div class="text-xs text-slate-400 py-4 text-center">Belum ada catatan mutasi keuangan.</div>` : state.walletLogs.map(tx => `
              <div class="flex justify-between items-start text-xs py-2 border-b border-slate-100 last:border-0 gap-3">
                <div class="min-w-0">
                  <div class="font-semibold text-slate-800">${tx.description}</div>
                  <div class="text-[10px] text-slate-400 mt-0.5">${tx.created_at} • Saldo akhir: ${formatIDR(Number(tx.balance_after))}</div>
                </div>
                <span class="font-mono font-bold shrink-0 ${Number(tx.amount) >= 0 ? 'text-emerald-600' : 'text-rose-600'}">
                  ${Number(tx.amount) >= 0 ? '+' : ''}${formatIDR(Number(tx.amount))}
                </span>
              </div>
            `).join('')}
          </div>
        </div>
      </div>

      ${renderBottomNav('PROFILE')}
      ${renderTopupModal()}
      ${renderWithdrawModal()}
      ${renderEditProfileModal()}
      ${renderFaqModal()}
    </div>
  `;
}

// ==========================================
// SHARED MODALS (SCANNER, OVERSTAY, TOPUP, WITHDRAW, RUANGPASS, UMKM, HUBUNGI JUKIR, RATING, FAQ)
// ==========================================
function renderScannerModal() {
  if (!state.scannerModal) return '';
  const isExit = state.scannerMode === 'OUT';
  const booking = state.scannerTargetBooking || { code: '—', plate: 'Tidak ada antrean', vehicleKind: 'MOBIL', slot: '-' };
  return `
    <div class="fixed inset-0 bg-slate-950/85 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div class="bg-white rounded-3xl p-5 w-full max-w-sm text-center shadow-2xl relative border border-slate-100">
        <button onclick="closeScanner()" class="absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-1 cursor-pointer">${Icons.close}</button>
        <span class="text-[10px] font-bold uppercase tracking-wider ${isExit ? 'text-amber-800 bg-amber-50 border-amber-200' : 'text-emerald-800 bg-emerald-50 border-emerald-200'} px-2.5 py-0.5 rounded-full border">${isExit ? 'Validasi Check-Out Keluar' : 'Validasi Check-In Masuk'}</span>
        <h3 class="font-bold text-slate-900 text-base mt-2">${isExit ? 'Pemindai QR Tiket Keluar' : 'Pemindai QR Tiket Masuk'}</h3>

        <div class="mt-3 py-2 px-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between text-left text-xs">
          <div>
            <div class="font-bold text-slate-900 text-xs">${booking.plate}</div>
            <div class="text-[10px] text-slate-400">${booking.slot} • #${booking.code}</div>
          </div>
          <span class="text-[9px] font-mono font-bold px-2 py-0.5 bg-slate-200 text-slate-700 rounded">${isExit ? 'Aktif' : 'Antrean'}</span>
        </div>

        <div class="relative w-48 h-48 mx-auto my-3.5 bg-slate-950 rounded-2xl overflow-hidden flex items-center justify-center border-2 ${isExit ? 'border-amber-400/80' : 'border-emerald-400/80'}">
          <video id="scanner-video-element" autoplay playsinline class="hidden absolute inset-0 w-full h-full object-cover"></video>
          <div id="scanner-hud-placeholder" class="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <div class="w-20 h-20 border border-dashed ${isExit ? 'border-amber-400/60' : 'border-emerald-400/60'} rounded-xl flex items-center justify-center text-white/40">${Icons.scan}</div>
          </div>
          <div class="absolute inset-x-3 h-0.5 ${isExit ? 'bg-amber-400' : 'bg-emerald-400'} scan-line"></div>
        </div>

        <div class="space-y-2">
          <div class="flex gap-1.5">
            <input id="scanner-manual-code" type="text" value="${state.manualCodeInput || ''}" oninput="state.manualCodeInput = this.value.toUpperCase();" placeholder="Input kode: ${booking.code}" class="flex-1 h-9 px-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[11px] font-mono font-bold uppercase">
            <button type="button" onclick="handleManualCodeVerify()" class="px-2.5 h-9 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-[10px] font-bold cursor-pointer shrink-0">Verifikasi</button>
          </div>
          <button type="button" onclick="togglePhysicalCamera()" class="h-8 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-[11px] font-semibold inline-flex items-center gap-1.5 cursor-pointer">${Icons.camera}<span>Aktifkan Kamera</span></button>
          <button onclick="handleScannerConfirm()" class="h-11 w-full ${isExit ? 'bg-amber-500 hover:bg-amber-600 text-slate-950 font-black' : 'bg-slate-900 hover:bg-black text-white font-bold'} rounded-xl text-xs shadow-md cursor-pointer">
            ${isExit ? '✓ Konfirmasi QR Keluar (Lanjut Settlement)' : '✓ Konfirmasi QR Masuk (Mulai Argometer)'}
          </button>
        </div>
      </div>
    </div>
  `;
}

async function handleCheckoutSettlement() {
  const b = state.overstayTargetBooking;
  if (!b) return;
  try {
    const res = await apiRequest('./api/attendant.php?action=scan_out', {
      method: 'POST',
      body: { booking_id: b.id, booking_code: b.code, scenario: state.overstayScenario }
    });
    state.overstayModal = false;
    state.overstayTargetBooking = null;
    await refreshAllData();
    showToast(res.message);
  } catch (err) { showToast(err.message, 'error'); }
}

function renderOverstayModal() {
  if (!state.overstayModal || !state.overstayTargetBooking) return '';
  const b = state.overstayTargetBooking;
  const baseTariff = typeof b.baseParkingTariff === 'number' ? b.baseParkingTariff : getBaseDepositPrice(b.vehicleKind || 'MOBIL');
  const feeApplied = typeof b.platformFee === 'number' ? b.platformFee : (b.usedRuangPass ? 0 : PLATFORM_FEE);

  let actualDurationText = '';
  let fineAmount = 0;
  let isOverstay = false;

  if (state.overstayScenario === 'scenario_realtime') {
    const sec = b.elapsedSec || 0;
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    actualDurationText = (h > 0 || m > 0) ? `${h}j ${m}m (Server Live)` : '< 1 Menit (Server Live)';
    if (sec > 10800) {
      fineAmount = Math.ceil((sec - 10800) / 3600) * 1000;
      isOverstay = true;
    }
  } else if (state.overstayScenario === 'scenario_1h45m') {
    actualDurationText = '1 Jam 45 Menit'; fineAmount = 0;
  } else if (state.overstayScenario === 'scenario_4h') {
    actualDurationText = '4 Jam'; fineAmount = 1000; isOverstay = true;
  } else if (state.overstayScenario === 'scenario_5h') {
    actualDurationText = '5 Jam'; fineAmount = 2000; isOverstay = true;
  } else if (state.overstayScenario === 'scenario_6h') {
    actualDurationText = '6 Jam'; fineAmount = 3000; isOverstay = true;
  }

  const split = calculateTransactionBreakdown(baseTariff, fineAmount, feeApplied, !!b.usedRuangPass);

  return `
    <div class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div class="bg-white rounded-3xl p-5 w-full max-w-sm text-center shadow-xl relative max-h-[92vh] overflow-y-auto">
        <button onclick="state.overstayModal = false; render();" class="absolute top-4 right-4 text-slate-400 hover:text-slate-600 cursor-pointer">${Icons.close}</button>
        <div class="${isOverstay ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-700'} p-3 rounded-2xl w-fit mx-auto mb-2">${isOverstay ? Icons.clock : Icons.check}</div>
        <h3 class="text-base font-bold text-slate-900">Settlement Check-Out (#${b.code})</h3>
        <p class="text-xs text-slate-500 mt-0.5">${b.plate} • ${b.slot}</p>

        <div class="mt-3 space-y-1.5 text-xs text-left bg-slate-50 p-3.5 rounded-2xl border border-slate-100">
          <div class="flex justify-between"><span class="text-slate-500">Tarif Parkir Awal (Flat 1–3 Jam):</span><span class="font-bold text-slate-800">${split.usedRuangPass ? '1 Kuota RuangPass' : formatIDR(split.baseParkingTariff)}</span></div>
          <div class="flex justify-between"><span class="text-slate-500">Durasi Aktual &amp; Overstay:</span><span class="font-bold ${isOverstay ? 'text-amber-600' : 'text-emerald-600'}">${actualDurationText} (${formatIDR(split.overstayFee)})</span></div>
          <div class="flex justify-between"><span class="text-slate-500">Biaya Layanan Aplikasi (Fee):</span><span class="font-bold text-slate-800">${formatIDR(split.platformFee)}</span></div>
          <div class="pt-2 border-t border-slate-200 flex justify-between items-center">
            <span class="font-bold text-slate-900">Total Bayar Pengendara:</span>
            <span class="font-black text-sm text-slate-900">${split.usedRuangPass ? `1 Kuota + ${formatIDR(split.totalUserPaid)}` : formatIDR(split.totalUserPaid)}</span>
          </div>
        </div>

        <div class="my-2.5 p-3 bg-emerald-50/70 rounded-2xl border border-emerald-200 text-left text-[11px] space-y-1">
          <div class="font-bold text-emerald-950 text-[10px] uppercase">
            ${split.usedRuangPass ? 'Alokasi Pool RuangPass (Rp 1.000/pihak + Overstay 40:40:20):' : 'Alokasi Bagi Hasil 40:40:20 + Fee:'}
          </div>
          <div class="flex justify-between text-slate-700"><span>• ${split.usedRuangPass ? 'Pemilik Lahan (Pool Rp 1k + 40% ov)' : 'Pemilik Lahan (40%)'}:</span><span class="font-bold text-slate-900">${formatIDR(split.shareLandowner)}</span></div>
          <div class="flex justify-between text-slate-700"><span>• ${split.usedRuangPass ? 'Mitra Jukir (Pool Rp 1k + 40% ov)' : 'Mitra Jukir (40%)'}:</span><span class="font-bold text-slate-900">${formatIDR(split.shareJukir)}</span></div>
          <div class="flex justify-between text-emerald-900"><span>• ${split.usedRuangPass ? 'Platform (Margin Paket + 20% ov)' : 'Platform (20% + Fee)'}:</span><span class="font-black text-emerald-800">${formatIDR(split.sharePlatformTotal)}</span></div>
        </div>

        <!-- Penyesuaian Manual / Uji Overstay (Collapsible agar tidak mengganggu alur utama) -->
        <details class="my-2.5 p-2.5 bg-slate-100 rounded-xl text-left border border-slate-200">
          <summary class="text-[10px] font-bold text-slate-600 cursor-pointer select-none">Penyesuaian Durasi Manual / Uji Overstay</summary>
          <div class="grid grid-cols-5 gap-1 text-[9.5px] font-semibold text-center mt-2">
            <button onclick="state.overstayScenario = 'scenario_realtime'; render();" class="py-1.5 rounded-lg cursor-pointer ${state.overstayScenario === 'scenario_realtime' ? 'bg-emerald-600 text-white' : 'bg-white text-slate-700'}">Live</button>
            <button onclick="state.overstayScenario = 'scenario_1h45m'; render();" class="py-1.5 rounded-lg cursor-pointer ${state.overstayScenario === 'scenario_1h45m' ? 'bg-slate-900 text-white' : 'bg-white text-slate-700'}">1j 45m</button>
            <button onclick="state.overstayScenario = 'scenario_4h'; render();" class="py-1.5 rounded-lg cursor-pointer ${state.overstayScenario === 'scenario_4h' ? 'bg-slate-900 text-white' : 'bg-white text-slate-700'}">4 Jam</button>
            <button onclick="state.overstayScenario = 'scenario_5h'; render();" class="py-1.5 rounded-lg cursor-pointer ${state.overstayScenario === 'scenario_5h' ? 'bg-slate-900 text-white' : 'bg-white text-slate-700'}">5 Jam</button>
            <button onclick="state.overstayScenario = 'scenario_6h'; render();" class="py-1.5 rounded-lg cursor-pointer ${state.overstayScenario === 'scenario_6h' ? 'bg-slate-900 text-white' : 'bg-white text-slate-700'}">6 Jam</button>
          </div>
        </details>

        <button onclick="handleCheckoutSettlement()" class="mt-2 h-12 w-full bg-slate-900 hover:bg-black text-white rounded-xl font-bold text-xs shadow-md cursor-pointer">
          Selesaikan &amp; Salurkan Bagi Hasil (${isOverstay ? `Overstay ${formatIDR(fineAmount)}` : 'Rp 0 Tambahan'})
        </button>
      </div>
    </div>
  `;
}

async function handleTopUp(amount) {
  try {
    const res = await apiRequest('./api/wallet.php?action=topup', { method: 'POST', body: { amount } });
    state.topUpModal = false;
    await refreshAllData();
    showToast(res.message);
  } catch (err) { showToast(err.message, 'error'); }
}

function renderTopupModal() {
  if (!state.topUpModal) return '';
  return `
    <div class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div class="bg-white rounded-3xl p-6 w-full max-w-sm text-center shadow-xl relative space-y-4">
        <button onclick="state.topUpModal = false; render();" class="absolute top-4 right-4 text-slate-400 hover:text-slate-600 cursor-pointer">${Icons.close}</button>
        <div class="w-12 h-12 bg-sky-50 text-sky-700 border border-sky-200 rounded-2xl flex items-center justify-center mx-auto">${Icons.wallet}</div>
        <div>
          <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-50 text-sky-700 border border-sky-200">Midtrans Payment Gateway</span>
          <h3 class="text-base font-bold text-slate-900 mt-1.5">Isi Saldo RuangPay</h3>
          <p class="text-xs text-slate-500 mt-0.5">Pilih nominal untuk membayar via Midtrans Snap (QRIS / GoPay / VA):</p>
        </div>
        <div class="grid grid-cols-3 gap-2">
          ${[20000, 50000, 100000].map(n => `
            <button onclick="startMidtransPayment('TOPUP', { amount: ${n} })" ${state.midtransBusy ? 'disabled' : ''} class="p-3 bg-slate-50 hover:bg-slate-900 hover:text-white border border-slate-200 hover:border-slate-900 rounded-xl text-center cursor-pointer transition group">
              <div class="font-bold text-slate-900 group-hover:text-white text-sm">+${n / 1000}k</div>
              <div class="text-[10px] text-slate-400 group-hover:text-slate-300">${formatIDR(n)}</div>
            </button>
          `).join('')}
        </div>
        <div class="pt-2 border-t border-slate-100">
          <button onclick="handleTopUp(50000)" class="text-[11px] font-semibold text-slate-500 hover:text-slate-900 underline cursor-pointer">
            Atau isi langsung Rp 50.000 (Tanpa Popup Midtrans)
          </button>
        </div>
      </div>
    </div>
  `;
}

async function handleWithdrawSubmit(amount) {
  try {
    const res = await apiRequest('./api/wallet.php?action=withdraw', { method: 'POST', body: { amount } });
    state.withdrawModal = false;
    await refreshAllData();
    showToast(res.message);
  } catch (err) { showToast(err.message, 'error'); }
}

function renderWithdrawModal() {
  if (!state.withdrawModal) return '';
  const bal = state.landownerBalance;
  const amt = Math.min(state.withdrawAmount || 100000, Math.max(50000, bal));
  return `
    <div class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div class="bg-white rounded-3xl p-6 w-full max-w-sm text-center shadow-xl relative">
        <button onclick="state.withdrawModal = false; render();" class="absolute top-4 right-4 text-slate-400 hover:text-slate-600 cursor-pointer">${Icons.close}</button>
        <h3 class="text-base font-bold text-slate-900">Tarik Saldo Garasi</h3>
        <p class="text-xs text-slate-500 mt-1">Saldo tersedia: <strong class="text-emerald-600">${formatIDR(bal)}</strong></p>
        <div class="my-4 text-left space-y-3">
          <div><label class="block text-[10px] font-semibold uppercase text-slate-400 mb-1">Rekening Pencairan</label><div class="p-3 bg-slate-100 rounded-xl text-xs font-semibold text-slate-800">${state.currentUser?.bank_info || 'Belum diatur'}</div></div>
          <div>
            <label class="block text-[10px] font-semibold uppercase text-slate-400 mb-1.5">Pilih Nominal (Min. Rp 50.000)</label>
            <div class="grid grid-cols-3 gap-1.5">
              ${[50000, 100000, bal].map((val, idx) => `<button type="button" onclick="state.withdrawAmount = ${val}; render();" class="py-2 rounded-xl text-[11px] font-bold border cursor-pointer ${state.withdrawAmount === val ? 'bg-slate-900 text-white border-slate-900' : 'bg-slate-50 text-slate-700 border-slate-200'}">${idx === 2 ? 'Semua' : `Rp ${val / 1000}k`}</button>`).join('')}
            </div>
          </div>
        </div>
        <button onclick="handleWithdrawSubmit(${amt})" class="h-11 w-full bg-slate-900 hover:bg-black text-white rounded-xl font-bold text-xs cursor-pointer">Konfirmasi Tarik ${formatIDR(amt)}</button>
      </div>
    </div>
  `;
}

async function purchaseRuangPass(method) {
  try {
    const res = await apiRequest('./api/wallet.php?action=buy_ruangpass', { method: 'POST', body: { payment_method: method } });
    state.ruangPassModal = false;
    if (state.vehicleType === 'MOTOR') state.useRuangPassCheckout = true;
    await refreshAllData();
    showToast(res.message);
  } catch (err) {
    if (err.code === 'INSUFFICIENT_BALANCE') { state.ruangPassModal = false; state.topUpModal = true; render(); }
    showToast(err.message, 'error');
  }
}

function useRuangPassNow() {
  state.ruangPassModal = false;
  state.activeFilter = 'Motor';
  state.vehicleType = 'MOTOR';
  state.useRuangPassCheckout = true;
  if (state.currentScreen === 'CHECKOUT') {
    render();
  } else {
    setScreen('HOME');
  }
  showToast('Filter Motor & Kuota RuangPass diaktifkan! Pilih garasi lalu lanjut Reservasi.');
}

function renderRuangPassModal() {
  if (!state.ruangPassModal) return '';
  const active = state.ruangPass.active;
  return `
    <div class="fixed inset-0 bg-slate-900/65 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div class="bg-white rounded-3xl p-5 w-full max-w-sm text-left shadow-2xl relative max-h-[90vh] overflow-y-auto">
        <button onclick="state.ruangPassModal = false; render();" class="absolute top-4 right-4 text-slate-400 hover:text-slate-600 cursor-pointer">${Icons.close}</button>
        <span class="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-emerald-50 text-emerald-700 border border-emerald-200">Langganan Bulanan Motor</span>
        <h3 class="text-lg font-black text-slate-900 mt-1.5">RuangPass — 20x Parkir Motor</h3>
        <div class="mt-3 p-4 bg-slate-900 text-white rounded-2xl flex items-center justify-between">
          <div>
            <div class="text-[10px] text-emerald-400 font-semibold uppercase">Harga Paket / 30 Hari</div>
            <div class="text-2xl font-black mt-0.5">Rp 55.000</div>
            <div class="text-[11px] text-slate-300 mt-0.5">Setara <strong>Rp 2.750 / parkir</strong> (hemat Rp 1.250/x)</div>
          </div>
          <div class="text-right"><div class="text-xl font-black text-emerald-400">20x</div><div class="text-[9px] text-slate-400">Kuota Motor</div></div>
        </div>
        ${active ? `
          <div class="mt-3 p-3 bg-emerald-50 border border-emerald-200 rounded-2xl space-y-2 text-xs">
            <div class="flex items-center justify-between">
              <span class="font-bold text-emerald-900">Aktif s/d ${state.ruangPass.validUntil}</span>
              <span class="font-black text-emerald-700">${state.ruangPass.remainingQuota}/${state.ruangPass.totalQuota} Kuota</span>
            </div>
            <button onclick="useRuangPassNow()" class="h-10 w-full bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs cursor-pointer shadow-xs">
              ★ Gunakan RuangPass Sekarang → Cari Parkir Motor
            </button>
          </div>
        ` : ''}
        <div class="mt-3 p-3 bg-slate-50 border border-slate-200 rounded-2xl text-[11px] space-y-1.5 text-slate-600">
          <div class="font-bold text-slate-800 text-[10px] uppercase">Cara Kerja &amp; Keterkaitan RuangPass:</div>
          <div>• <strong>Saat Checkout Motor:</strong> Rp 0 di kasir (potong 1 kuota, bebas Fee Rp 1.000) untuk flat 1–3 jam.</div>
          <div>• <strong>Overstay &gt; 3 Jam:</strong> Tetap dikenakan +Rp 1.000/jam saat Check-Out Jukir.</div>
          <div>• <strong>Batal sebelum Check-In:</strong> Kuota otomatis kembali (+1).</div>
          <div class="pt-1.5 border-t border-slate-200 space-y-0.5">
            <div class="font-bold text-slate-700 text-[10px] uppercase">Alokasi Dana Paket (Rp 55.000):</div>
            <div class="flex justify-between"><span>• Pool Pemilik Lahan (Rp 1.000/parkir):</span><strong>Rp 20.000</strong></div>
            <div class="flex justify-between"><span>• Pool Juru Parkir (Rp 1.000/parkir):</span><strong>Rp 20.000</strong></div>
            <div class="flex justify-between text-emerald-800"><span>• Margin Platform RuangParkir:</span><strong>Rp 15.000</strong></div>
          </div>
        </div>
        <div class="mt-4 space-y-2">
          <button onclick="purchaseRuangPass('SALDO')" class="h-11 w-full bg-slate-900 hover:bg-black text-white rounded-xl font-bold text-xs cursor-pointer">${active ? 'Perpanjang +20 Kuota (Saldo RuangPay)' : 'Aktifkan — Saldo RuangPay (Rp 55.000)'}</button>
          <button onclick="startMidtransPayment('RUANGPASS', {})" class="h-10 w-full bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs cursor-pointer">Bayar via Midtrans Snap (QRIS / VA — Rp 55.000)</button>
        </div>
      </div>
    </div>
  `;
}

function openUmkmModal(umkmId) {
  state.umkmModal = state.umkmList.find(u => u.id === Number(umkmId)) || state.umkmList[0];
  render();
}

function renderUmkmModal() {
  if (!state.umkmModal) return '';
  const u = state.umkmModal;
  return `
    <div class="fixed inset-0 bg-slate-900/65 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div class="bg-white rounded-3xl p-5 w-full max-w-sm text-left shadow-2xl relative">
        <button onclick="state.umkmModal = null; render();" class="absolute top-4 right-4 text-slate-400 hover:text-slate-600 cursor-pointer">${Icons.close}</button>
        <span class="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-amber-100 text-amber-900">Featured Merchant • Partner UMKM</span>
        <h3 class="text-base font-black text-slate-900 mt-2">${u.name}</h3>
        <p class="text-[11px] text-slate-500">${u.category} • ${u.distance} • ${u.hours}</p>
        <div class="mt-3 p-4 bg-amber-50 border border-amber-200 rounded-2xl space-y-1.5">
          <div class="text-sm font-black text-amber-950">${u.promoTitle}</div>
          <p class="text-[11px] text-amber-900 leading-relaxed">${u.promoDesc}</p>
          <div class="pt-2 flex items-center justify-between border-t border-amber-200/80 text-xs">
            <span class="text-amber-800 text-[10px] font-semibold">Kode Kasir:</span>
            <span class="font-mono font-black text-slate-900 bg-white px-2.5 py-0.5 rounded-lg border border-amber-300">${u.promoCode}</span>
          </div>
        </div>
        <button onclick="state.umkmModal = null; showToast('Kode ${u.promoCode} disalin! Tunjukkan E-Tiket di ${u.name}.'); render();" class="mt-4 h-11 w-full bg-slate-900 hover:bg-black text-white rounded-xl font-bold text-xs cursor-pointer">Salin Kode Promo</button>
      </div>
    </div>
  `;
}

function renderContactJukirModal() {
  if (!state.contactJukirModal) return '';
  const t = state.activeBooking || {};
  const jukirName = t.jukirName || 'Slamet Riyadi (ID: JK-04)';
  const jukirPhone = t.jukirPhone || '0878-9988-7766';
  const accessNote = t.accessNote || 'Masuk 30m dari Jl. Soekarno Hatta sebelah minimarket, pagar hijau berplang resmi RuangParkir.';
  const cleanWa = jukirPhone.replace(/[^0-9]/g, '').replace(/^0/, '62');
  return `
    <div class="fixed inset-0 bg-slate-900/65 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div class="bg-white rounded-3xl p-5 w-full max-w-sm text-left shadow-2xl relative">
        <button onclick="state.contactJukirModal = false; render();" class="absolute top-4 right-4 text-slate-400 hover:text-slate-600 cursor-pointer">${Icons.close}</button>
        <div class="flex items-center gap-3">
          <div class="w-11 h-11 rounded-2xl bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center justify-center shrink-0">${Icons.userCheck}</div>
          <div>
            <span class="text-[10px] font-bold uppercase text-emerald-700">Petugas Lapangan Resmi</span>
            <h3 class="text-sm font-black text-slate-900">${jukirName}</h3>
            <div class="text-[11px] text-slate-500 font-mono">${jukirPhone}</div>
          </div>
        </div>
        <div class="mt-3 p-3 bg-slate-50 border border-slate-200 rounded-2xl text-[11px] text-slate-600 leading-relaxed">
          <div class="font-bold text-slate-800 text-[10px] uppercase mb-0.5">Patokan Akses Gang / Garasi:</div>${accessNote}
        </div>
        <div class="grid grid-cols-2 gap-2 mt-4">
          <a href="https://wa.me/${cleanWa}" target="_blank" rel="noopener" onclick="state.contactJukirModal = false; render();" class="h-11 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-1.5">${Icons.phone}<span>WhatsApp</span></a>
          <a href="tel:${jukirPhone}" onclick="state.contactJukirModal = false; render();" class="h-11 bg-slate-900 hover:bg-black text-white rounded-xl font-bold text-xs flex items-center justify-center gap-1.5">${Icons.phone}<span>Telepon</span></a>
        </div>
      </div>
    </div>
  `;
}

function toggleFeedbackTag(tag) {
  if (state.selectedFeedbackTags.includes(tag)) state.selectedFeedbackTags = state.selectedFeedbackTags.filter(t => t !== tag);
  else state.selectedFeedbackTags.push(tag);
  render();
}

async function submitRatingModal() {
  const code = state.ratingTargetCode || (state.activeBooking && state.activeBooking.code);
  const score = state.ratingScore || 5;
  try {
    const res = await apiRequest('./api/reviews.php', { method: 'POST', body: { booking_code: code, rating: score, tags: state.selectedFeedbackTags } });
    state.ratingModal = false;
    state.ratingTargetCode = null;
    await refreshAllData();
    showToast(res.message);
  } catch (err) { showToast(err.message, 'error'); }
}

function renderRatingModal() {
  if (!state.ratingModal) return '';
  const score = state.ratingScore || 5;
  return `
    <div class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div class="bg-white rounded-3xl p-6 w-full max-w-sm text-center shadow-2xl relative">
        <button onclick="state.ratingModal = false; render();" class="absolute top-4 right-4 text-slate-400 hover:text-slate-600 cursor-pointer">${Icons.close}</button>
        <div class="w-12 h-12 bg-amber-50 text-amber-500 rounded-2xl mx-auto flex items-center justify-center mb-2 border border-amber-200">${Icons.star}</div>
        <h3 class="font-bold text-slate-900 text-base">Beri Penilaian &amp; Ulasan</h3>
        <div class="flex items-center justify-center gap-2 py-3">
          ${[1, 2, 3, 4, 5].map(st => `<button type="button" onclick="state.ratingScore = ${st}; render();" class="p-1 cursor-pointer"><svg class="w-8 h-8 ${st <= score ? 'fill-amber-400 stroke-amber-400' : 'fill-slate-100 stroke-slate-300'}" viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg></button>`).join('')}
        </div>
        <div class="flex flex-wrap justify-center gap-1.5 mb-3">
          ${['Jukir Ramah', 'Garasi Bersih', 'Aman & Terjaga', 'Akses Mudah'].map(tag => {
    const active = state.selectedFeedbackTags.includes(tag);
    return `<button type="button" onclick="toggleFeedbackTag('${tag}')" class="text-[10px] font-medium px-2.5 py-1 rounded-full border cursor-pointer ${active ? 'bg-slate-900 text-white border-slate-900' : 'bg-slate-50 border-slate-200 text-slate-600'}">${active ? '✓ ' : '+ '}${tag}</button>`;
  }).join('')}
        </div>
        ${score < 3 ? `<div class="mb-3 p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-[10px] text-rose-800 text-left"><strong>SOP QC:</strong> Rating &lt; 3 bintang otomatis ditandai untuk ditinjau tim operasional dalam 24 jam.</div>` : ''}
        <button onclick="submitRatingModal()" class="h-11 w-full bg-slate-900 hover:bg-black text-white rounded-xl font-bold text-xs cursor-pointer">Kirim Penilaian</button>
      </div>
    </div>
  `;
}

function renderFaqModal() {
  if (!state.faqModal) return '';
  return `
    <div class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div class="bg-white rounded-3xl p-5 w-full max-w-sm text-left shadow-2xl relative max-h-[85vh] overflow-y-auto">
        <button onclick="state.faqModal = false; render();" class="absolute top-4 right-4 text-slate-400 hover:text-slate-600 cursor-pointer">${Icons.close}</button>
        <h3 class="text-base font-bold text-slate-900">Ketentuan &amp; Alur RuangParkir</h3>
        <div class="space-y-2.5 mt-4 text-xs text-slate-700">
          <div class="p-3 bg-slate-50 rounded-xl border border-slate-100"><div class="font-bold text-slate-900">1. Tarif Flat 1–3 Jam + Fee Rp 1.000</div><div class="text-[11px] text-slate-500 mt-1">Motor Rp 3.000, Mobil Rp 8.000 (flat 1–3 jam) + Biaya Layanan Rp 1.000. Tidak ada refund bila keluar &lt; 3 jam.</div></div>
          <div class="p-3 bg-slate-50 rounded-xl border border-slate-100"><div class="font-bold text-slate-900">2. Argometer Server &amp; Overstay</div><div class="text-[11px] text-slate-500 mt-1">Argometer dimulai saat Jukir Scan Masuk. Overstay &gt; 3 jam dikenakan +Rp 1.000/jam (dibulatkan ke atas).</div></div>
          <div class="p-3 bg-slate-50 rounded-xl border border-slate-100"><div class="font-bold text-slate-900">3. Bagi Hasil 40% : 40% : 20%</div><div class="text-[11px] text-slate-500 mt-1">Pemilik Lahan 40%, Juru Parkir 40%, Platform 20% (+ Fee Rp 1.000).</div></div>
          <div class="p-3 bg-emerald-50 rounded-xl border border-emerald-100"><div class="font-bold text-emerald-900">4. Paket RuangPass (Rp 55.000/bln)</div><div class="text-[11px] text-emerald-800 mt-1">Kuota 20x parkir motor (bebas biaya layanan). Alokasi Rp 20rb Pemilik, Rp 20rb Jukir, Rp 15rb Platform.</div></div>
        </div>
        <button onclick="state.faqModal = false; render();" class="mt-4 h-11 w-full bg-slate-900 text-white rounded-xl text-xs font-semibold cursor-pointer">Tutup</button>
      </div>
    </div>
  `;
}

// ==========================================
// MAIN RENDER & BOOTSTRAP
// ==========================================
function render() {
  const app = document.getElementById('app');
  if (!app) return;

  // Enforce authentication & role boundaries on UI
  if (!state.authenticated && state.currentScreen !== 'LOGIN') {
    state.currentScreen = 'LOGIN';
  }

  let content = '';
  switch (state.currentScreen) {
    case 'LOGIN': content = renderLogin(); break;
    case 'HOME': content = renderHome(); break;
    case 'DETAIL': content = renderDetail(); break;
    case 'CHECKOUT': content = renderCheckout(); break;
    case 'TICKET': content = renderTicket(); break;
    case 'DRIVER_HISTORY': content = renderDriverHistory(); break;
    case 'LANDOWNER': content = renderLandowner(); break;
    case 'LANDOWNER_MANAGE': content = renderLandownerManage(); break;
    case 'ATTENDANT': content = renderAttendant(); break;
    case 'ATTENDANT_LOGS': content = renderAttendantLogs(); break;
    case 'PROFILE': content = renderProfile(); break;
    default: content = renderLogin();
  }

  app.innerHTML = `
    ${renderToast()}
    ${renderRatingModal()}
    ${renderRuangPassModal()}
    ${renderUmkmModal()}
    ${renderContactJukirModal()}
    ${renderMidtransPendingModal()}
    ${content}
  `;

  // Mount QR Code unik sungguhan di E-Tiket (dapat dibaca langsung oleh kamera Jukir / jsQR)
  if (state.currentScreen === 'TICKET' && state.authenticated) {
    const qrHost = document.getElementById('ticket-qr-canvas');
    if (qrHost && typeof QRCode !== 'undefined') {
      const qrText = qrHost.getAttribute('data-code') || '';
      qrHost.innerHTML = '';
      if (qrText) {
        new QRCode(qrHost, {
          text: qrText,
          width: 132,
          height: 132,
          colorDark: '#0f172a',
          colorLight: '#ffffff',
          correctLevel: QRCode.CorrectLevel.M
        });
      }
    }
  }

  // Mount atau bersihkan peta Leaflet nyata
  if (state.currentScreen === 'HOME' && state.authenticated) {
    const filteredSpots = state.spots.filter(s => {
      const q = state.searchQuery.toLowerCase();
      const matchSearch = s.name.toLowerCase().includes(q) || s.address.toLowerCase().includes(q);
      if (state.activeFilter === 'Mobil') return matchSearch && s.slotsCar > 0;
      if (state.activeFilter === 'Motor') return matchSearch && s.slotsBike > 0;
      if (state.activeFilter === 'Tersedia') return matchSearch && s.isOpen && (s.availableCar + s.availableBike) > 0;
      return matchSearch;
    });
    const selSpot = filteredSpots.find(s => s.id === state.selectedSpotId) || filteredSpots[0] || state.spots[0];
    mountLeafletMap(filteredSpots, selSpot);
  } else if (leafletMapInstance) {
    try { leafletMapInstance.remove(); } catch (_) { }
    leafletMapInstance = null;
  }
}

function updatePhoneClock() {
  const el = document.getElementById('phone-clock');
  if (el) {
    const now = new Date();
    el.textContent = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  }
}
setInterval(updatePhoneClock, 1000);
updatePhoneClock();

let resizeTimer = null;
window.addEventListener('resize', () => {
  applyViewModeClass();
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => render(), 120);
});

window.addEventListener('DOMContentLoaded', initApp);
