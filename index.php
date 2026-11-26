<?php
/**
 * RuangParkir — Sistem Web Responsif (PWA) Marketplace Parkir Komunitas
 * "Berbagi Ruang, Parkir Lebih Tenang."
 * Mode Default: Aplikasi Web Responsif Penuh (Desktop & Mobile)
 * Mode Opsional: Preview Mode HP (390x844) lewat tombol toggle 1-klik di navbar
 */
declare(strict_types=1);
require_once __DIR__ . '/config/database.php';

$dbConnected = false;
try {
    getDB()->query('SELECT 1');
    $dbConnected = true;
} catch (Throwable $e) {
    $dbConnected = false;
}
?>
<!DOCTYPE html>
<html lang="id">

<head>
  <meta charset="utf-8" />
  <meta name="viewport"
    content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />
  <meta name="theme-color" content="#0F2A4A" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="default" />
  <title>RuangParkir — Marketplace Parkir Komunitas Warga</title>
  <link rel="manifest" href="./manifest.json" />
  <link rel="icon" type="image/png" href="./assets/logo-ruangparkir.png" />
  <link rel="apple-touch-icon" href="./assets/logo-ruangparkir.png" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js"></script>
  <script src="<?= htmlspecialchars(MIDTRANS_SNAP_JS, ENT_QUOTES, 'UTF-8') ?>" data-client-key="<?= htmlspecialchars(MIDTRANS_CLIENT_KEY, ENT_QUOTES, 'UTF-8') ?>"></script>
  <script src="https://cdn.tailwindcss.com?plugins=forms"></script>
  <script>
    window.__RUANGPARKIR_DB_ONLINE__ = <?= $dbConnected ? 'true' : 'false' ?>;
    window.__MIDTRANS_CLIENT_KEY__ = <?= json_encode(MIDTRANS_CLIENT_KEY) ?>;
    window.__MIDTRANS_IS_PROD__ = <?= MIDTRANS_IS_PRODUCTION ? 'true' : 'false' ?>;
  </script>
  <style>
    body {
      background-color: #f8fafc;
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      -webkit-tap-highlight-color: transparent;
    }

    .pb-safe {
      padding-bottom: env(safe-area-inset-bottom, 1.25rem);
    }

    .hide-scrollbar::-webkit-scrollbar {
      display: none;
    }

    .hide-scrollbar {
      -ms-overflow-style: none;
      scrollbar-width: none;
    }

    .scan-line {
      animation: scanMove 2s infinite ease-in-out;
    }

    /* === LEAFLET REAL MAP CUSTOM STYLING === */
    .leaflet-container {
      font-family: inherit !important;
      z-index: 10 !important;
    }
    .leaflet-pane,
    .leaflet-top,
    .leaflet-bottom {
      z-index: 10 !important;
    }
    .rp-spot-marker {
      background: transparent !important;
      border: none !important;
    }
    .rp-gps-dot {
      width: 16px;
      height: 16px;
      border-radius: 9999px;
      background: #059669;
      border: 3px solid #ffffff;
      box-shadow: 0 0 0 6px rgba(16, 185, 129, 0.28), 0 2px 8px rgba(0, 0, 0, 0.35);
    }

    @keyframes scanMove {
      0%, 100% { top: 8%; opacity: 0.3; }
      50% { top: 88%; opacity: 1; }
    }

    /* === MODE WEB RESPONSIF PENUH (DEFAULT) === */
    body.mode-web {
      background-color: #f8fafc;
      min-height: 100vh;
    }
    body.mode-web #mobile-preview-bar,
    body.mode-web .phone-only-el {
      display: none !important;
    }
    body.mode-web #device-container,
    body.mode-web #device-wrapper,
    body.mode-web #phone-frame,
    body.mode-web .phone-screen,
    body.mode-web #app {
      width: 100% !important;
      max-width: 100% !important;
      height: auto !important;
      min-height: 100vh !important;
      border: none !important;
      border-radius: 0 !important;
      padding: 0 !important;
      margin: 0 !important;
      box-shadow: none !important;
      background: transparent !important;
      overflow: visible !important;
      transform: none !important;
    }

    /* === MODE PREVIEW HP (DESKTOP TOGGLE 390x844) === */
    @media (min-width: 640px) {
      body.mode-mobile {
        background-color: #e2e8f0;
        min-height: 100vh;
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 16px;
        overflow-x: hidden;
      }
      body.mode-mobile #mobile-preview-bar {
        display: flex !important;
      }
      body.mode-mobile .phone-screen {
        transform: translate3d(0, 0, 0);
        -webkit-transform: translate3d(0, 0, 0);
      }
      body.mode-mobile .phone-screen .min-h-screen {
        min-height: 100%;
      }
      body.mode-mobile .phone-screen .h-screen {
        height: 100%;
      }
    }

    /* Di layar HP asli (<640px), selalu fullscreen native */
    @media (max-width: 639px) {
      #mobile-preview-bar, .phone-only-el {
        display: none !important;
      }
      #device-container, #device-wrapper, #phone-frame, .phone-screen, #app {
        width: 100% !important;
        max-width: 100% !important;
        min-height: 100dvh !important;
        border: none !important;
        border-radius: 0 !important;
        padding: 0 !important;
        box-shadow: none !important;
        transform: none !important;
      }
    }
  </style>
</head>

<body class="mode-web antialiased text-slate-800">

  <!-- Toolbar Khusus Saat Mode Preview HP Aktif di Desktop -->
  <div id="mobile-preview-bar" class="hidden items-center justify-between w-full max-w-[420px] mb-2.5 px-2 text-slate-600 z-20">
    <div class="flex items-center gap-2">
      <button onclick="setViewMode('WEB')" class="px-2.5 py-1 bg-slate-900 hover:bg-black text-white rounded-lg text-[11px] font-bold cursor-pointer flex items-center gap-1 shadow-xs transition">
        <span>←</span>
        <span>Kembali ke Mode Web</span>
      </button>
      <span class="text-[10px] px-1.5 py-0.5 rounded bg-white text-emerald-700 border border-emerald-200 font-mono font-semibold">
        <?= $dbConnected ? 'db_parkir Live' : 'DB Offline' ?>
      </span>
    </div>
    <div class="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-0.5 shadow-2xs">
      <button onclick="setScaleMode('FIT')" id="btn-scale-fit" class="px-2 py-0.5 text-[10px] font-semibold rounded transition cursor-pointer bg-slate-900 text-white">Auto Fit</button>
      <button onclick="setScaleMode('100')" id="btn-scale-100" class="px-2 py-0.5 text-[10px] font-semibold rounded transition cursor-pointer text-slate-600 hover:text-slate-900">100%</button>
      <span id="scale-label" class="text-[10px] text-slate-400 font-mono px-1">Fit</span>
    </div>
  </div>

  <!-- Container Utama (Otomatis Penuh di Mode Web, Frame 390x844 di Mode HP) -->
  <div id="device-container" class="relative flex justify-center w-full sm:w-[420px] transition-all">
    <div id="device-wrapper" class="origin-top transition-transform duration-150 w-full">

      <div id="phone-frame"
        class="relative w-full sm:w-[390px] h-screen sm:h-[844px] bg-slate-900 sm:rounded-[54px] sm:p-[10px] sm:shadow-[0_25px_60px_-15px_rgba(0,0,0,0.35),0_10px_25px_-5px_rgba(0,0,0,0.15)] sm:ring-1 sm:ring-slate-950 flex flex-col justify-between transition-all">

        <!-- Phone Hardware Buttons (Mode HP Only) -->
        <div class="phone-only-el hidden sm:block absolute -left-[13px] top-28 w-[3px] h-8 bg-slate-700 rounded-l-xs"></div>
        <div class="phone-only-el hidden sm:block absolute -left-[13px] top-40 w-[3px] h-12 bg-slate-700 rounded-l-xs"></div>
        <div class="phone-only-el hidden sm:block absolute -left-[13px] top-56 w-[3px] h-12 bg-slate-700 rounded-l-xs"></div>
        <div class="phone-only-el hidden sm:block absolute -right-[13px] top-36 w-[3px] h-16 bg-slate-700 rounded-r-xs"></div>

        <!-- Screen Inner Container -->
        <div class="phone-screen relative w-full h-full bg-slate-50 sm:rounded-[44px] overflow-hidden flex flex-col shadow-inner">

          <!-- Status Bar & Dynamic Island (Mode HP Only) -->
          <div id="phone-status-bar"
            class="phone-only-el w-full bg-transparent absolute top-0 left-0 right-0 z-50 pointer-events-none px-6 pt-2.5 pb-2 hidden sm:flex justify-between items-center text-slate-800 text-[11px] font-semibold select-none">
            <span id="phone-clock" class="tracking-tight font-medium pl-1">09:41</span>
            <div class="w-24 h-5 bg-black rounded-full flex items-center justify-end pr-2.5 shadow-sm">
              <div class="w-2 h-2 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center">
                <div class="w-0.5 h-0.5 bg-blue-950 rounded-full"></div>
              </div>
            </div>
            <div class="flex items-center gap-1.5 pr-1">
              <svg class="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24"><path d="M2 17h2v3H2zm4-3h2v6H6zm4-3h2v9h-2zm4-4h2v13h-2zm4-4h2v17h-2z" /></svg>
              <svg class="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24"><path d="M12 4C7.31 4 3.07 5.9 0 8.98L12 21 24 8.98A16.88 16.88 0 0012 4zm0 4c3.34 0 6.43 1.14 8.92 3.05L12 19.77 3.08 11.05C5.57 9.14 8.66 8 12 8z" /></svg>
              <div class="flex items-center">
                <div class="w-5 h-2.5 border border-current rounded-xs p-0.5 flex items-center"><div class="h-full w-full bg-current rounded-2xs"></div></div>
                <div class="w-0.5 h-1 bg-current rounded-r-2xs ml-0.5"></div>
              </div>
            </div>
          </div>

          <!-- App Content Mount -->
          <div id="app" class="w-full h-full overflow-y-auto overflow-x-hidden hide-scrollbar relative flex flex-col text-slate-800">
            <div class="flex-1 min-h-screen flex flex-col items-center justify-center p-8 text-center">
              <img src="./assets/logo-ruangparkir.png" alt="RuangParkir" class="w-16 h-16 object-contain mb-3 animate-pulse" />
              <div class="text-sm font-bold text-slate-800">Memuat RuangParkir...</div>
              <div class="text-xs text-slate-400 mt-1">Menghubungkan ke server PHP &amp; MySQL (db_parkir)</div>
            </div>
          </div>

          <!-- Gesture Home Bar (Mode HP Only) -->
          <div class="phone-only-el absolute bottom-1 left-0 right-0 z-50 pointer-events-none hidden sm:flex justify-center pb-1">
            <div class="w-32 h-1 bg-slate-900/30 rounded-full"></div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <script src="./assets/app.js"></script>
</body>
</html>
