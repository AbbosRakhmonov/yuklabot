export const getDashboardHtml = (): string => {
  return `<!DOCTYPE html>
<html lang="uz" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <base href="/admin/">
  <title>YuklaBot - Monitoring Dashboard</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
  <script>
    tailwind.config = {
      darkMode: 'class',
      theme: {
        extend: {
          colors: {
            brand: {
              50: '#eef2ff',
              500: '#6366f1',
              600: '#4f46e5',
              700: '#4338ca',
            },
            dark: {
              800: '#1e293b',
              850: '#172033',
              900: '#0f172a',
              950: '#0b0f19',
            }
          }
        }
      }
    }
  </script>
  <style>
    body { font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    .pulse-glow {
      box-shadow: 0 0 15px rgba(99, 102, 241, 0.4);
    }
    .custom-scroll::-webkit-scrollbar {
      width: 6px;
      height: 6px;
    }
    .custom-scroll::-webkit-scrollbar-track {
      background: #0f172a;
    }
    .custom-scroll::-webkit-scrollbar-thumb {
      background: #334155;
      border-radius: 4px;
    }
    .custom-scroll::-webkit-scrollbar-thumb:hover {
      background: #475569;
    }
  </style>
</head>
<body class="bg-dark-950 text-slate-100 min-h-screen flex flex-col custom-scroll">

  <!-- LOGIN MODAL -->
  <div id="loginModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
    <div class="bg-dark-900 border border-slate-800 rounded-2xl p-8 w-full max-w-md shadow-2xl">
      <div class="text-center mb-6">
        <div class="w-16 h-16 bg-brand-600/20 text-brand-500 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-brand-500/30">
          <i class="fa-solid fa-bolt-lightning text-3xl"></i>
        </div>
        <h2 class="text-2xl font-bold tracking-tight text-white">YuklaBot Admin</h2>
        <p class="text-sm text-slate-400 mt-1">Boshqaruv paneliga kirish uchun parolingizni kiriting</p>
      </div>
      <form id="loginForm" class="space-y-4">
        <div>
          <label class="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Foydalanuvchi nomi</label>
          <div class="relative">
            <i class="fa-solid fa-user absolute left-3.5 top-3.5 text-slate-500"></i>
            <input type="text" id="loginUsername" required class="w-full bg-dark-850 border border-slate-700/60 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500" placeholder="admin">
          </div>
        </div>
        <div>
          <label class="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Parol</label>
          <div class="relative">
            <i class="fa-solid fa-lock absolute left-3.5 top-3.5 text-slate-500"></i>
            <input type="password" id="loginPassword" required class="w-full bg-dark-850 border border-slate-700/60 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500" placeholder="••••••••">
          </div>
        </div>
        <div id="loginError" class="text-xs text-rose-400 hidden bg-rose-500/10 border border-rose-500/20 p-2.5 rounded-lg"></div>
        <button type="submit" class="w-full bg-brand-600 hover:bg-brand-500 text-white font-medium py-2.5 rounded-xl transition duration-150 flex items-center justify-center gap-2 shadow-lg shadow-brand-600/30">
          <span>Kirish</span>
          <i class="fa-solid fa-arrow-right text-xs"></i>
        </button>
      </form>
    </div>
  </div>

  <!-- SEND TO TELEGRAM MODAL -->
  <div id="sendTelegramModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm hidden">
    <div class="bg-dark-900 border border-slate-800 rounded-2xl p-6 w-full max-w-lg shadow-2xl">
      <div class="flex items-center justify-between border-b border-slate-800 pb-4 mb-4">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-sky-500/20 text-sky-400 flex items-center justify-center border border-sky-500/30">
            <i class="fa-brands fa-telegram text-xl"></i>
          </div>
          <div>
            <h3 class="font-semibold text-white">Telegramga jo'natish</h3>
            <p class="text-xs text-slate-400">Faylni o'zingizning Telegram chatiga qabul qiling</p>
          </div>
        </div>
        <button onclick="closeSendModal()" class="text-slate-500 hover:text-white text-lg">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>

      <div class="space-y-4">
        <div class="bg-dark-850 border border-slate-800 p-3 rounded-xl text-xs space-y-1.5">
          <div class="text-slate-400">Fayl nomi: <span id="modalFileName" class="text-white font-medium"></span></div>
          <div class="text-slate-400">Platforma: <span id="modalPlatform" class="text-white font-medium"></span></div>
          <div class="text-slate-400 truncate">URL: <span id="modalUrl" class="text-sky-400 font-mono"></span></div>
        </div>

        <div>
          <label class="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Telegram Chat ID (Sizning profilingiz)</label>
          <input type="text" id="targetChatId" class="w-full bg-dark-850 border border-slate-700/60 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-brand-500" placeholder="Masalan: 123456789">
          <p class="text-[11px] text-slate-500 mt-1">Standart sozlama bo'yicha ADMIN_CHAT_ID o'rnatilgan.</p>
        </div>

        <div id="sendModalResult" class="hidden text-xs p-3 rounded-lg"></div>

        <div class="flex items-center justify-end gap-3 pt-2">
          <button onclick="closeSendModal()" class="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white bg-slate-800/60 hover:bg-slate-800 transition">
            Bekor qilish
          </button>
          <button id="confirmSendBtn" onclick="executeSendFile()" class="px-5 py-2 rounded-xl text-xs font-medium text-white bg-sky-600 hover:bg-sky-500 transition flex items-center gap-2 shadow-lg shadow-sky-600/30">
            <i class="fa-solid fa-paper-plane"></i>
            <span>Yuborish</span>
          </button>
        </div>
      </div>
    </div>
  </div>

  <!-- APP CONTENT -->
  <div id="appContainer" class="flex flex-col flex-1">
    <!-- TOP NAVIGATION BAR -->
    <header class="bg-dark-900 border-b border-slate-800/80 sticky top-0 z-40 backdrop-blur-md bg-dark-900/90">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 bg-gradient-to-tr from-brand-600 to-indigo-400 rounded-xl flex items-center justify-center text-white shadow-md shadow-brand-500/20">
            <i class="fa-solid fa-cloud-arrow-down text-lg"></i>
          </div>
          <div>
            <div class="flex items-center gap-2">
              <h1 class="text-base font-bold text-white tracking-tight">YuklaBot</h1>
              <span class="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-brand-500/10 text-brand-400 border border-brand-500/20">Live Monitor</span>
            </div>
            <p class="text-[11px] text-slate-400 -mt-0.5">Real-vaqt monitoring va tahlil boshqaruvi</p>
          </div>
        </div>

        <!-- TABS -->
        <nav class="hidden md:flex items-center gap-1 bg-dark-950/80 border border-slate-800 p-1 rounded-xl">
          <button onclick="switchTab('live')" id="tabBtn-live" class="tab-btn px-4 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-2 bg-brand-600 text-white">
            <i class="fa-solid fa-wave-square"></i>
            <span>Jonli Jarayonlar</span>
            <span id="navLiveBadge" class="w-2 h-2 rounded-full bg-emerald-400 animate-ping ml-1 hidden"></span>
          </button>
          <button onclick="switchTab('stats')" id="tabBtn-stats" class="tab-btn px-4 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-white transition flex items-center gap-2">
            <i class="fa-solid fa-chart-pie"></i>
            <span>Statistika</span>
          </button>
          <button onclick="switchTab('history')" id="tabBtn-history" class="tab-btn px-4 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-white transition flex items-center gap-2">
            <i class="fa-solid fa-clock-rotate-left"></i>
            <span>Tarix</span>
          </button>
          <button onclick="switchTab('users')" id="tabBtn-users" class="tab-btn px-4 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-white transition flex items-center gap-2">
            <i class="fa-solid fa-users"></i>
            <span>Foydalanuvchilar</span>
          </button>
        </nav>

        <!-- STATUS & ACTIONS -->
        <div class="flex items-center gap-3">
          <div id="connectionStatus" class="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
            <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span class="hidden sm:inline">SSE Bog'langan</span>
          </div>
          <button onclick="logout()" class="px-3 py-1.5 rounded-xl text-xs text-slate-400 hover:text-rose-400 bg-slate-800/40 hover:bg-slate-800 border border-slate-800 transition flex items-center gap-1.5">
            <i class="fa-solid fa-arrow-right-from-bracket"></i>
            <span class="hidden sm:inline">Chiqish</span>
          </button>
        </div>
      </div>

      <!-- MOBILE TABS -->
      <div class="flex md:hidden border-t border-slate-800/60 overflow-x-auto px-4 py-2 gap-2">
        <button onclick="switchTab('live')" class="mobile-tab-btn text-xs px-3 py-1.5 rounded-lg bg-brand-600 text-white whitespace-nowrap">Jonli</button>
        <button onclick="switchTab('stats')" class="mobile-tab-btn text-xs px-3 py-1.5 rounded-lg text-slate-400 whitespace-nowrap">Statistika</button>
        <button onclick="switchTab('history')" class="mobile-tab-btn text-xs px-3 py-1.5 rounded-lg text-slate-400 whitespace-nowrap">Tarix</button>
        <button onclick="switchTab('users')" class="mobile-tab-btn text-xs px-3 py-1.5 rounded-lg text-slate-400 whitespace-nowrap">Foydalanuvchilar</button>
      </div>
    </header>

    <!-- MAIN BODY -->
    <main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex-1 w-full space-y-6">

      <!-- TOP METRIC CARDS (Always visible) -->
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <!-- Active Tasks -->
        <div class="bg-dark-900 border border-slate-800/80 rounded-2xl p-4 flex items-center justify-between">
          <div>
            <div class="text-xs font-semibold text-slate-400 uppercase tracking-wider">Hozir Yuklanmoqda</div>
            <div class="text-2xl font-black text-white mt-1 flex items-baseline gap-2">
              <span id="metricActiveTasks">0</span>
              <span id="metricStuckBadge" class="text-[11px] font-medium px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20 hidden">
                0 qotgan
              </span>
            </div>
            <div class="text-[11px] text-slate-500 mt-1" id="metricActiveSpeed">0 KB/s umumiy tezlik</div>
          </div>
          <div class="w-12 h-12 rounded-2xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center border border-indigo-500/20">
            <i class="fa-solid fa-arrows-rotate text-xl animate-spin" style="animation-duration: 3s;"></i>
          </div>
        </div>

        <!-- Today Downloads -->
        <div class="bg-dark-900 border border-slate-800/80 rounded-2xl p-4 flex items-center justify-between">
          <div>
            <div class="text-xs font-semibold text-slate-400 uppercase tracking-wider">Bugungi Yuklamalar</div>
            <div class="text-2xl font-black text-white mt-1" id="metricTodayDownloads">0</div>
            <div class="text-[11px] text-slate-500 mt-1" id="metricWeekDownloads">7 kunda: 0</div>
          </div>
          <div class="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center border border-emerald-500/20">
            <i class="fa-solid fa-download text-xl"></i>
          </div>
        </div>

        <!-- Users -->
        <div class="bg-dark-900 border border-slate-800/80 rounded-2xl p-4 flex items-center justify-between">
          <div>
            <div class="text-xs font-semibold text-slate-400 uppercase tracking-wider">Jami Foydalanuvchilar</div>
            <div class="text-2xl font-black text-white mt-1" id="metricTotalUsers">0</div>
            <div class="text-[11px] text-slate-500 mt-1" id="metricTodayUsers">Bugun faol: 0</div>
          </div>
          <div class="w-12 h-12 rounded-2xl bg-sky-500/10 text-sky-400 flex items-center justify-center border border-sky-500/20">
            <i class="fa-solid fa-users text-xl"></i>
          </div>
        </div>

        <!-- System Memory / Disk -->
        <div class="bg-dark-900 border border-slate-800/80 rounded-2xl p-4 flex items-center justify-between">
          <div>
            <div class="text-xs font-semibold text-slate-400 uppercase tracking-wider">Tizim (RAM / Disk)</div>
            <div class="text-2xl font-black text-white mt-1" id="metricMemoryPercent">0%</div>
            <div class="text-[11px] text-slate-500 mt-1" id="metricDiskInfo">Disk: bo'sh joy...</div>
          </div>
          <div class="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-400 flex items-center justify-center border border-amber-500/20">
            <i class="fa-solid fa-microchip text-xl"></i>
          </div>
        </div>
      </div>

      <!-- TAB 1: LIVE TASKS MONITOR -->
      <div id="tabContent-live" class="space-y-6">
        <div class="flex items-center justify-between">
          <div>
            <h2 class="text-lg font-bold text-white flex items-center gap-2">
              <span>Hozir bajarilayotgan jarayonlar</span>
              <span id="activeCountPill" class="text-xs px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono">0</span>
            </h2>
            <p class="text-xs text-slate-400">Kim nimani qanday formatda yuklayapti, progress va qotib qolish holatlari</p>
          </div>
          <button onclick="refreshActiveTasks()" class="px-3 py-1.5 rounded-xl text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 transition flex items-center gap-1.5">
            <i class="fa-solid fa-rotate-right"></i>
            <span>Yangilash</span>
          </button>
        </div>

        <!-- Active Tasks Cards Container -->
        <div id="activeTasksContainer" class="space-y-3">
          <!-- Dynamically populated or empty state -->
          <div class="bg-dark-900 border border-slate-800/80 rounded-2xl p-12 text-center">
            <div class="w-12 h-12 rounded-2xl bg-slate-800 text-slate-500 flex items-center justify-center mx-auto mb-3">
              <i class="fa-solid fa-inbox text-xl"></i>
            </div>
            <h4 class="text-sm font-semibold text-white">Hozirda faol jarayonlar yo'q</h4>
            <p class="text-xs text-slate-400 mt-1">Foydalanuvchilar botga link yuborganda bu yerda real-vaqtda ko'rinadi.</p>
          </div>
        </div>

        <!-- Recent Completed Downloads Section -->
        <div class="pt-4">
          <h3 class="text-sm font-bold text-white mb-3 flex items-center gap-2">
            <i class="fa-solid fa-circle-check text-emerald-400"></i>
            <span>Yaqinda yakunlangan yuklamalar</span>
          </h3>
          <div id="platformTimingSummary" class="mb-3 text-xs text-slate-400"></div>
          <div id="recentCompletedContainer" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            <!-- Dynamic items -->
          </div>
        </div>
      </div>

      <!-- TAB 2: OVERALL STATISTICS & CHARTS -->
      <div id="tabContent-stats" class="hidden space-y-6">
        <p id="statsError" role="alert" hidden>Statistikani yuklab bo‘lmadi. Birozdan keyin qayta urinib ko‘ring.</p>
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <!-- Platform Distribution Chart -->
          <div class="bg-dark-900 border border-slate-800/80 rounded-2xl p-5">
            <h3 class="text-sm font-bold text-white mb-4 flex items-center gap-2">
              <i class="fa-solid fa-chart-pie text-brand-400"></i>
              <span>Platformalar bo'yicha taqsimot</span>
            </h3>
            <div class="relative h-64">
              <canvas id="platformChart"></canvas>
            </div>
          </div>

          <!-- Media Types Chart -->
          <div class="bg-dark-900 border border-slate-800/80 rounded-2xl p-5">
            <h3 class="text-sm font-bold text-white mb-4 flex items-center gap-2">
              <i class="fa-solid fa-chart-column text-emerald-400"></i>
              <span>Media turlari bo'yicha taqsimot</span>
            </h3>
            <div class="relative h-64">
              <p id="statsChartFallback" hidden></p>
              <canvas id="mediaChart"></canvas>
            </div>
          </div>
        </div>

        <section class="bg-dark-900 border border-slate-800 rounded-2xl p-5">
          <h3 class="text-sm font-bold mb-2">Oxirgi 24 soatdagi yuklash natijalari</h3>
          <p class="text-xs text-slate-400 mb-3">Muvaffaqiyat foizi yakunlangan va xato bilan tugagan so‘rovlar bo‘yicha hisoblanadi.</p>
          <div class="overflow-x-auto"><table class="w-full text-left text-sm">
            <thead><tr><th>Platforma</th><th>Jami</th><th>Yetkazildi</th><th>Xato</th><th>Bekor qilindi</th><th>Muvaffaqiyat</th><th>Xato sabablari</th></tr></thead>
            <tbody id="deliveryOutcomes"></tbody>
          </table></div>
        </section>
        <section class="bg-dark-900 border border-slate-800 rounded-2xl p-5">
          <h3 class="text-sm font-bold mb-2">Tezlik · oxirgi 24 soat</h3>
          <p class="text-xs text-slate-400 mb-3">Yetkazilgan so‘rovlar. Vaqtlar soniyada: mediana / p95. Tayyorlash botning media jo‘natishdan tashqari ishlagan vaqtini ham qamrab oladi. Eng sekin so‘rovni aniqlashda foydalanuvchining tanlash vaqti chiqariladi.</p>
          <p id="speedStatus" role="status"></p>
          <div class="overflow-x-auto"><table class="w-full text-left text-sm">
          <thead><tr><th>Platforma</th><th>Manba</th><th>Soni</th><th>Navbat</th><th>Tayyorlash</th><th>Telegram</th><th>Tanlov</th><th>Eng sekin</th></tr></thead>
          <tbody id="speedRows"></tbody></table></div>
        </section>
        <!-- Summary Stats Table -->
        <div class="bg-dark-900 border border-slate-800/80 rounded-2xl p-5">
          <h3 class="text-sm font-bold text-white mb-4">Statistika hisoboti</h3>
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
            <div class="bg-dark-850 p-4 rounded-xl border border-slate-800">
              <div class="text-xs text-slate-400">YouTube Yuklamalar</div>
              <div class="text-xl font-bold text-red-400 mt-1" id="statYoutubeCount">0</div>
            </div>
            <div class="bg-dark-850 p-4 rounded-xl border border-slate-800">
              <div class="text-xs text-slate-400">Instagram Yuklamalar</div>
              <div class="text-xl font-bold text-pink-400 mt-1" id="statInstagramCount">0</div>
            </div>
            <div class="bg-dark-850 p-4 rounded-xl border border-slate-800">
              <div class="text-xs text-slate-400">TikTok Yuklamalar</div>
              <div class="text-xl font-bold text-cyan-400 mt-1" id="statTiktokCount">0</div>
            </div>
            <div class="bg-dark-850 p-4 rounded-xl border border-slate-800">
              <div class="text-xs text-slate-400">Bugungi yangi userlar</div>
              <div class="text-xl font-bold text-emerald-400 mt-1" id="statTodayNewUsers">0</div>
            </div>
          </div>
        </div>
      </div>

      <!-- TAB 3: HISTORY & FILTERS -->
      <div id="tabContent-history" class="hidden space-y-4">
        <div id="recipientFilter" hidden><strong id="recipientLabel"></strong>
          <button type="button" onclick="showRecipient()" class="ml-3 text-sm text-sky-400">Barcha yuklamalar</button>
        </div>
        <dialog id="previewDialog" aria-labelledby="previewTitle" class="m-auto bg-slate-900 text-white rounded-2xl p-4 w-[min(95vw,760px)]">
          <div class="flex justify-between items-center gap-3"><strong id="previewTitle"></strong>
            <button onclick="document.getElementById('previewDialog').close()" autofocus>Yopish</button></div>
          <div id="previewBody" class="my-3"></div>
          <a id="previewSource" target="_blank" rel="noopener noreferrer" class="text-sky-400">Manbada ochish</a>
        </dialog>
        <!-- FILTER BAR -->
        <div class="bg-dark-900 border border-slate-800/80 rounded-2xl p-4 space-y-3">
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <!-- Search -->
            <div class="lg:col-span-2">
              <label class="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Qidiruv (Nom yoki URL)</label>
              <div class="relative">
                <i class="fa-solid fa-magnifying-glass absolute left-3 top-3 text-slate-500 text-xs"></i>
                <input type="text" id="historySearch" oninput="debounceHistorySearch()" placeholder="Video nomi yoki URL..." class="w-full bg-dark-850 border border-slate-700/60 rounded-xl pl-9 pr-3 py-2 text-xs text-white focus:outline-none focus:border-brand-500">
              </div>
            </div>

            <!-- Platform -->
            <div>
              <label class="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Platforma</label>
              <select id="historyPlatform" onchange="fetchHistory(1)" class="w-full bg-dark-850 border border-slate-700/60 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-brand-500">
                <option value="all">Barchasi</option>
                <option value="youtube">YouTube</option>
                <option value="instagram">Instagram</option>
                <option value="tiktok">TikTok</option>
              </select>
            </div>

            <!-- Media Type -->
            <div>
              <label class="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Media turi</label>
              <select id="historyMediaType" onchange="fetchHistory(1)" class="w-full bg-dark-850 border border-slate-700/60 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-brand-500">
                <option value="all">Barchasi</option>
                <option value="video">Video</option>
                <option value="audio">Audio / Qo'shiq</option>
                <option value="image">Rasm</option>
                <option value="reel">Reel / Shorts</option>
              </select>
            </div>

            <!-- Date Presets -->
            <div>
              <label class="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Sana bo'yicha</label>
              <select id="historyDatePreset" onchange="handleDatePresetChange()" class="w-full bg-dark-850 border border-slate-700/60 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-brand-500">
                <option value="all">Barcha vaqt</option>
                <option value="today">Bugun</option>
                <option value="yesterday">Kecha</option>
                <option value="week">Oxirgi 7 kun</option>
                <option value="custom">Oraliq belgilash...</option>
              </select>
            </div>
          </div>

          <!-- Custom Date Range picker (hidden unless custom selected) -->
          <div id="customDateRangeRow" class="hidden grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-800">
            <div>
              <label class="block text-[11px] text-slate-400 mb-1">Boshlanish sanasi</label>
              <input type="date" id="historyStartDate" class="w-full bg-dark-850 border border-slate-700/60 rounded-xl px-3 py-1.5 text-xs text-white">
            </div>
            <div>
              <label class="block text-[11px] text-slate-400 mb-1">Tugash sanasi</label>
              <input type="date" id="historyEndDate" class="w-full bg-dark-850 border border-slate-700/60 rounded-xl px-3 py-1.5 text-xs text-white">
            </div>
          </div>
        </div>

        <!-- HISTORY TABLE -->
        <div class="bg-dark-900 border border-slate-800/80 rounded-2xl overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full text-left text-xs">
              <thead class="bg-dark-850 text-slate-400 border-b border-slate-800 text-[11px] uppercase tracking-wider">
                <tr>
                  <th class="py-3 px-4">Vaqt</th>
                  <th class="py-3 px-4">Foydalanuvchi</th>
                  <th class="py-3 px-4">Platforma & Turi</th>
                  <th class="py-3 px-4">Fayl nomi / URL</th>
                  <th class="py-3 px-4">Hajmi & Sifat</th>
                  <th class="py-3 px-4 text-right">Amal</th>
                </tr>
              </thead>
              <tbody id="historyTableBody" class="divide-y divide-slate-800/60 text-slate-300">
                <!-- Dynamic rows -->
              </tbody>
            </table>
          </div>

          <!-- Pagination -->
          <div class="p-4 border-t border-slate-800/80 flex items-center justify-between">
            <div class="text-xs text-slate-400" id="historyPaginationInfo">
              Ko'rsatilmoqda: 0 / 0
            </div>
            <div class="flex items-center gap-2" id="historyPaginationBtns">
              <!-- Prev / Next buttons -->
            </div>
          </div>
        </div>
      </div>

      <!-- TAB 4: USERS LIST -->
      <div id="tabContent-users" class="hidden space-y-4">
        <div class="bg-dark-900 border border-slate-800/80 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div class="w-full sm:w-80 relative">
            <i class="fa-solid fa-magnifying-glass absolute left-3 top-3 text-slate-500 text-xs"></i>
            <input type="text" id="userSearch" oninput="debounceUserSearch()" placeholder="ID yoki username bo'yicha qidirish..." class="w-full bg-dark-850 border border-slate-700/60 rounded-xl pl-9 pr-3 py-2 text-xs text-white focus:outline-none focus:border-brand-500">
          </div>
          <div class="text-xs text-slate-400" id="usersTotalCount">
            Jami: 0 ta foydalanuvchi
          </div>
        </div>

        <div class="bg-dark-900 border border-slate-800/80 rounded-2xl overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full text-left text-xs">
              <thead class="bg-dark-850 text-slate-400 border-b border-slate-800 text-[11px] uppercase tracking-wider">
                <tr>
                  <th class="py-3 px-4">Telegram ID</th>
                  <th class="py-3 px-4">Ism & Username</th>
                  <th class="py-3 px-4">Xabarlar soni</th>
                  <th class="py-3 px-4">Birinchi ko'rilgan</th>
                  <th class="py-3 px-4">Oxirgi faollik</th>
                </tr>
              </thead>
              <tbody id="usersTableBody" class="divide-y divide-slate-800/60 text-slate-300">
                <!-- Dynamic rows -->
              </tbody>
            </table>
          </div>
          <div class="p-4 border-t border-slate-800/80 flex items-center justify-between">
            <div class="text-xs text-slate-400" id="usersPaginationInfo">
              0 / 0
            </div>
            <div class="flex items-center gap-2" id="usersPaginationBtns">
              <!-- Prev / Next buttons -->
            </div>
          </div>
        </div>
      </div>

    </main>
  </div>

  <!-- CLIENT-SIDE SCRIPT -->
  <dialog id="failureDialog" aria-labelledby="failureTitle" class="m-auto bg-slate-900 text-white rounded-2xl p-5 w-[min(95vw,760px)] max-h-[85vh]">
    <div class="flex justify-between"><h2 id="failureTitle"></h2><button onclick="failureDialog.close()">Yopish</button></div>
    <p id="failureStatus" role="status" class="my-3 text-sm text-slate-400"></p>
    <ul id="failureList"></ul>
    <button id="moreFailures" hidden class="text-sky-400">Yana ko‘rsatish</button>
  </dialog>
  <dialog id="requestsDialog" aria-labelledby="requestsTitle" class="m-auto bg-slate-900 text-white rounded-2xl p-5 w-[min(95vw,760px)] max-h-[85vh]">
    <div class="flex justify-between gap-4"><h2 id="requestsTitle"></h2><button onclick="requestsDialog.close()">Yopish</button></div>
    <button onclick="loadRequests(true)" class="text-sky-400">Yangilash</button>
    <div id="requestList"></div><p id="requestStatus" role="status"></p>
    <button id="olderRequests" hidden onclick="loadRequests(false)" class="text-sky-400">Oldingilari</button>
  </dialog>
  <script>
    // State
    let statsTimer;
    localStorage.removeItem("yuklabot_admin_token");
    let adminChatId = '';
    let currentTab = 'live';
    let sseSource = null;
    let platformChartInstance = null;
    let mediaChartInstance = null;
    let activeTasksCache = [];
    let currentSendItem = null;

    // History Pagination State
    let historyPage = 1;
    let recipientId = '';
    let historyRequest = 0;
    let historyItems = [];
    let listedUsers = [];
    function showRecipient(index) {
      const user = listedUsers[index];
      recipientId = user?._id || '';
      document.getElementById('recipientFilter').hidden = !user;
      document.getElementById('recipientLabel').textContent = user
        ? (user.username ? '@' + user.username : user.firstName || '') + ' · ID ' + user.telegramId : '';
      switchTab('history');
    }
    const requestsDialog = document.getElementById('requestsDialog');
    const requestList = document.getElementById('requestList');
    const olderRequests = document.getElementById('olderRequests');
    const requestLabels = { replaced:'Keyingi link bilan almashtirildi', queued:'Navbatda', running:'Bajarilmoqda', waiting:'Tanlov kutilmoqda', ended:'Bosqich tugadi', done:'Bosqich tugadi', success:'Yetkazildi', failed:'Xato', cancelled:'Bekor qilindi', interrupted:'Bot qayta ishga tushdi', queue_full:'Navbat to‘la', rate_limit:'Tezlik cheklovi', source:'Manbaga murojaat', processing:'Fayl tayyorlash', telegram:'Telegram orqali yetkazish', reply:'Bot javobi', choice:'Tanlov', received:'Qabul qilindi', started:'Navbatdan chiqdi' };
    let requestUser, beforeRequest, requestVersion = 0;
    requestsDialog.addEventListener('close', () => { requestVersion++; requestList.replaceChildren(); });
    let exactRequest = null;
    const failureDialog = document.getElementById('failureDialog');
    let failureVersion = 0;
    failureDialog.addEventListener('close', () => {
      failureVersion++;
      document.getElementById('failureList').replaceChildren();
    });
    function openFailureGroup(button) {
      const { platform, reason, asof } = button.dataset;
      const version = ++failureVersion;
      document.getElementById('failureTitle').textContent = platform + ' · ' + button.textContent;
      const list = document.getElementById('failureList');
      const status = document.getElementById('failureStatus');
      const more = document.getElementById('moreFailures');
      list.replaceChildren();
      failureDialog.showModal();
      let page = 1;
      async function load() {
        more.hidden = true;
        status.textContent = 'Yuklanmoqda…';
        try {
          const res = await authFetch('/admin/api/failures?' + new URLSearchParams({ platform, reason, asOf:asof, page }));
          if (!res.ok) throw Error();
          const data = await res.json();
          if (version !== failureVersion) return;
          status.textContent = 'Jami xatolar: ' + data.total + ' · Aniqlangan foydalanuvchilar: ' + data.users + ' · Turli havolalar: ' + data.links;
          for (const row of data.items) {
            const li = document.createElement('li');
            li.className = 'py-3 border-b border-slate-700 break-all';
            li.textContent = [new Date(row.finishedAt).toLocaleString(), row.userId && 'ID ' + row.userId,
              requestLabels[row.stage], row.url].filter(Boolean).join(' · ');
            if (row.requestId != null && row.userId != null) {
              const history = document.createElement('button');
              history.className = 'block text-sky-400';
              history.textContent = 'So‘rov tarixini ochish';
              history.onclick = () => {
                requestUser = row.userId;
                exactRequest = row.requestId;
                document.getElementById('requestsTitle').textContent = 'So‘rov #' + exactRequest;
                requestsDialog.showModal();
                loadRequests(true);
              };
              li.append(history);
            } else {
              li.append(' · Bog‘langan tarix mavjud emas');
            }
            list.append(li);
          }
          page++;
          more.hidden = list.childElementCount >= data.total;
          more.textContent = 'Yana ko‘rsatish';
        } catch {
          if (version !== failureVersion) return;
          status.textContent = 'Xatolarni yuklab bo‘lmadi.';
          more.textContent = 'Qayta urinish';
          more.hidden = false;
        }
      }
      more.onclick = load;
      load();
    }
    function openRequests(index) {
      exactRequest = null;
      requestUser = listedUsers[index].telegramId;
      document.getElementById('requestsTitle').textContent = 'So‘rovlar · ' + requestUser;
      requestsDialog.showModal();
      loadRequests(true);
    }
    async function loadRequests(reset) {
      const version = ++requestVersion;
      if (reset) { beforeRequest = null; requestList.replaceChildren(); }
      olderRequests.hidden = true;
      const status = document.getElementById('requestStatus');
      status.textContent = 'Yuklanmoqda…';
      try {
        const res = await authFetch('/admin/api/requests?userId=' + requestUser + (exactRequest == null ? '' : '&id=' + exactRequest) + (beforeRequest == null ? '' : '&before=' + beforeRequest));
        if (!res.ok) throw Error();
        const data = await res.json();
        if (version !== requestVersion) return;
        for (const row of data.items) {
          const details = document.createElement('details');
          details.open = exactRequest != null;
          details.className = 'border-b border-slate-700 py-3 break-all';
          const summary = document.createElement('summary');
          summary.textContent = new Date(row.receivedAt).toLocaleString() + ' · ' + (requestLabels[row.outcome || row.state] || row.state) + ' · ' + row.url;
          details.append(summary);
          const events = [{ at:row.receivedAt, kind:'received' }, ...(row.events || [])];
          if (row.startedAt) events.push({ at:row.startedAt, kind:'started', detail: ((new Date(row.startedAt)-new Date(row.receivedAt))/1000).toFixed(1) + ' s navbatda' });
          if (row.noticeAt) events.push({ at:row.noticeAt, kind:'reply', detail:row.notice });
          if (row.acceptedNoticeAt) events.push({ at:row.acceptedNoticeAt, kind:'reply', detail:row.acceptedNotice || 'Havolangiz qabul qilindi. Tekshirilmoqda.' });
          for (const e of events.sort((a,b) => new Date(a.at)-new Date(b.at))) {
            const line = document.createElement('p');
            line.className = 'ml-3 mt-1 text-sm text-slate-300';
            line.textContent = new Date(e.at).toLocaleTimeString() + ' · ' + (requestLabels[e.kind] || e.kind) + (e.detail ? ' · ' + e.detail : '');
            details.append(line);
          }
          requestList.append(details);
          beforeRequest = row._id;
        }
        olderRequests.hidden = !data.more;
        status.textContent = requestList.childElementCount ? '' : 'Bu foydalanuvchi uchun so‘rov tarixi bo‘sh.';
      } catch {
        if (version === requestVersion) { status.textContent = 'Tarixni yuklab bo‘lmadi.'; olderRequests.hidden = beforeRequest == null; }
      }
    }
    const previewDialog = document.getElementById('previewDialog');
    previewDialog.addEventListener('close', () => document.getElementById('previewBody').replaceChildren());
    function openPreview(index) {
      const item = historyItems[index];
      if (!item) return;
      const body = document.getElementById('previewBody');
      body.replaceChildren();
      document.getElementById('previewTitle').textContent = item.fileName || 'Material';
      const link = document.getElementById('previewSource');
      const source = safeSource(item.url);
      link.hidden = !source;
      if (source) link.href = source; else link.removeAttribute('href');
      if (item.preview) {
        const frame = document.createElement('iframe');
        frame.title = item.fileName || 'Material';
        frame.src = item.preview;
        frame.allowFullscreen = true;
        frame.referrerPolicy = 'strict-origin-when-cross-origin';
        frame.style.cssText = 'width:100%;height:min(64vh,520px);border:0';
        body.append(frame);
      } else body.textContent = 'Bu havolani panel ichida ko‘rib bo‘lmaydi.';
      previewDialog.showModal();
    }
    function safeSource(value) {
      try {
        const url = new URL(value);
        return ['https:', 'http:'].includes(url.protocol) ? url.href : '';
      } catch { return ''; }
    }
    let historyLimit = 20;
    let searchDebounceTimeout = null;

    // Users Pagination State
    let usersPage = 1;
    let usersLimit = 25;
    let userSearchTimeout = null;

    // Init
    window.addEventListener('DOMContentLoaded', () => {
      checkAuth();
    });

    async function checkAuth() {
      const res = await fetch('/admin/api/session').catch(() => null);
      if (!res?.ok) {
        document.getElementById('loginModal').classList.remove('hidden');
        return;
      }
      adminChatId = (await res.json()).adminChatId || '';
      document.getElementById('loginModal').classList.add('hidden');
      initDashboard();
    }

    // Login Form Handler
    document.getElementById('loginForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const u = document.getElementById('loginUsername').value.trim();
      const p = document.getElementById('loginPassword').value;
      const errBox = document.getElementById('loginError');

      errBox.classList.add('hidden');

      try {
        const res = await fetch('/admin/api/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: u, password: p }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          adminChatId = data.adminChatId || '';
          document.getElementById('loginModal').classList.add('hidden');
          initDashboard();
        } else {
          errBox.textContent = data.error || "Noto'g'ri foydalanuvchi nomi yoki parol";
          errBox.classList.remove('hidden');
        }
      } catch (err) {
        errBox.textContent = 'Serverga ulanishda xatolik yuz berdi';
        errBox.classList.remove('hidden');
      }
    });

    async function logout(forced = false) {
      if (forced || confirm("Boshqaruv panelidan chiqmoqchimisiz?")) {
        if (!forced) {
          const res = await fetch('/admin/api/logout', { method: 'POST' }).catch(() => null);
          if (!res || (!res.ok && res.status !== 401)) {
            showToast("Chiqish amalga oshmadi. Qayta urinib ko‘ring.", 'error');
            return;
          }
        }
        requestsDialog.close();
        failureDialog.close();
        previewDialog.close();
        clearInterval(statsTimer);
        if (sseSource) {
          sseSource.close();
          sseSource = null;
        }
        document.getElementById('loginModal').classList.remove('hidden');
      }
    }

    function initDashboard() {
      connectSSE();
      fetchStats();
      fetchActiveTasks();
      clearInterval(statsTimer);
      statsTimer = setInterval(fetchStats, 30000); // 30s poll for stats
    }

    // SSE Realtime Connection
    function connectSSE() {
      if (sseSource) {
        sseSource.close();
      }

      const statusEl = document.getElementById('connectionStatus');
      sseSource = new EventSource("/admin/api/events");

      sseSource.onopen = () => {
        statusEl.className = 'flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs bg-emerald-500/10 border border-emerald-500/20 text-emerald-400';
        statusEl.innerHTML = '<span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span><span class="hidden sm:inline">SSE Bog\\'langan</span>';
      };

      sseSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.active) {
            renderActiveTasks(data.active);
          }
          if (data.recent) renderRecentCompleted(data.recent);
          if (data.summary) {
            updateLiveMetrics(data.summary);
          }
        } catch (e) {
          console.error('SSE JSON error', e);
        }
      };

      sseSource.onerror = () => {
        statusEl.className = 'flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs bg-rose-500/10 border border-rose-500/20 text-rose-400';
        statusEl.innerHTML = '<span class="w-2 h-2 rounded-full bg-rose-400"></span><span class="hidden sm:inline">Qayta ulanmoqda...</span>';
      };
    }

    // Tab switcher
    function switchTab(tab) {
      currentTab = tab;
      ['live', 'stats', 'history', 'users'].forEach((t) => {
        const content = document.getElementById(\`tabContent-\${t}\`);
        const btn = document.getElementById(\`tabBtn-\${t}\`);
        if (content) {
          if (t === tab) content.classList.remove('hidden');
          else content.classList.add('hidden');
        }
        if (btn) {
          if (t === tab) {
            btn.className = 'tab-btn px-4 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-2 bg-brand-600 text-white';
          } else {
            btn.className = 'tab-btn px-4 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-white transition flex items-center gap-2';
          }
        }
      });

      document.querySelectorAll('.mobile-tab-btn').forEach((mbtn, idx) => {
        const tabs = ['live', 'stats', 'history', 'users'];
        if (tabs[idx] === tab) {
          mbtn.className = 'mobile-tab-btn text-xs px-3 py-1.5 rounded-lg bg-brand-600 text-white whitespace-nowrap';
        } else {
          mbtn.className = 'mobile-tab-btn text-xs px-3 py-1.5 rounded-lg text-slate-400 whitespace-nowrap';
        }
      });

      if (tab === 'stats') {
        fetchSpeed();
        fetchStats();
      } else if (tab === 'history') {
        fetchHistory(1);
      } else if (tab === 'users') {
        fetchUsers(1);
      }
    }

    // Auth Fetch helper
    async function authFetch(url, options = {}) {
      const res = await fetch(url, options);
      if (res.status === 401) {
        logout(true);
        throw new Error('Unauthorized');
      }
      return res;
    }

    let speedVersion = 0;
    async function fetchSpeed() {
      const version = ++speedVersion;
      const body = document.getElementById('speedRows');
      const status = document.getElementById('speedStatus');
      body.replaceChildren();
      status.textContent = 'Yuklanmoqda…';
      const seconds = ms => (ms / 1000).toLocaleString('uz-UZ', { maximumFractionDigits: 2 });
      try {
        const res = await authFetch('/admin/api/speed');
        if (!res.ok) throw Error();
        const rows = await res.json();
        if (version !== speedVersion) return;
        for (const row of rows) {
          const tr = body.insertRow();
          const values = [row.platform, row.mode === 'cached' ? 'Kesh' : 'Yangi', row.count];
          for (const stage of ['queue','preparation','telegram','choice']) {
            const pair = row.stages[stage];
            values.push(seconds(pair.median) + ' / ' + seconds(pair.p95));
          }
          for (const value of values) tr.insertCell().textContent = value;
          const link = document.createElement('button');
          link.className = 'text-sky-400';
          link.textContent = seconds(row.slowest.ms) + ' s ↗';
          link.onclick = () => {
            requestUser = row.slowest.userId;
            exactRequest = row.slowest.id;
            document.getElementById('requestsTitle').textContent = 'So‘rov #' + exactRequest;
            requestsDialog.showModal();
            loadRequests(true);
          };
          tr.insertCell().append(link);
        }
        status.textContent = rows.length ? '' : 'Hozircha o‘lchangan muvaffaqiyatli so‘rovlar yo‘q.';
      } catch {
        if (version === speedVersion) status.textContent = 'Tezlik hisobotini yuklab bo‘lmadi.';
      }
    }
    // Fetch Stats
    async function fetchStats() {
      try {
        const res = await authFetch('/admin/api/stats');
        if (!res.ok) throw new Error('Stats HTTP ' + res.status);
        const data = await res.json();
        renderStats(data);
        document.getElementById('statsError').hidden = true;
      } catch (err) {
        document.getElementById('statsError').hidden = false;
        console.error('Failed to fetch stats', err);
      }
    }

    function renderStats(data) {
      if (!data?.downloads?.byPlatform || !data.downloads.byMediaType || !data.users || !data.system) throw new Error("Invalid stats response");

      document.getElementById('metricTotalUsers').textContent = Number(data.users?.total || 0).toLocaleString();
      document.getElementById('metricTodayUsers').textContent = \`Bugun faol: \${data.users?.todayActive || 0}\`;
      document.getElementById('metricTodayDownloads').textContent = Number(data.downloads?.today || 0).toLocaleString();
      document.getElementById('metricWeekDownloads').textContent = \`7 kunda: \${Number(data.downloads?.thisWeek || 0).toLocaleString()}\`;

      document.getElementById('metricMemoryPercent').textContent = \`\${data.system?.memoryPercent || 0}%\`;
      document.getElementById('metricDiskInfo').textContent = \`Bo'sh disk: \${data.system?.diskFreeGB || 0} GB / \${data.system?.diskTotalGB || 0} GB\`;

      document.getElementById('statYoutubeCount').textContent = Number(data.downloads.byPlatform.youtube || 0).toLocaleString();
      document.getElementById('statInstagramCount').textContent = Number(data.downloads.byPlatform.instagram || 0).toLocaleString();
      document.getElementById('statTiktokCount').textContent = Number(data.downloads.byPlatform.tiktok || 0).toLocaleString();
      document.getElementById('statTodayNewUsers').textContent = Number(data.users?.todayNew || 0).toLocaleString();

      const reasons = { source: 'Manbadan olish', processing: 'Faylga ishlov berish', telegram: 'Telegramga yuborish', partial: 'Qisman yetkazildi', timeout: 'Vaqt tugadi', missing: 'Media topilmadi', private: 'Yopiq post', live: 'Jonli efir', too_large: 'Fayl juda katta', telegram_limit: 'Telegram limiti', telegram_forbidden: 'Chatga yuborish taqiqlangan' };
      document.getElementById('deliveryOutcomes').innerHTML = ['youtube', 'instagram', 'tiktok'].map(platform => {
        const rows = (data.outcomes24h || []).filter(row => row.platform === platform);
        const count = outcome => rows.filter(row => row.outcome === outcome).reduce((sum, row) => sum + row.count, 0);
        const ok = count('success'), failed = count('failed');
        const percent = ok + failed ? (100 * ok / (ok + failed)).toFixed(1) + '%' : '—';
        const breakdown = rows.filter(row => row.outcome === 'failed').sort((a,b) => b.count - a.count)
          .map(row => {
            const label = (Object.hasOwn(reasons, row.reason) ? reasons[row.reason] : 'Boshqa') + ': ' + Number(row.count);
            if (!/^[a-z_]{1,40}$/.test(row.reason)) return label;
            return '<button type="button" class="text-sky-400 hover:underline" onclick="openFailureGroup(this)" data-platform="' + platform + '" data-asof="' + Number(data.outcomesAsOf) + '" data-reason="' + row.reason + '">' + label + '</button>';
          }).join(', ');
        return '<tr><td>' + platform + '</td><td>' + (ok + failed + count('cancelled')) + '</td><td>' + ok + '</td><td>' + failed + '</td><td>' + count('cancelled') + '</td><td>' + percent + '</td><td>' + (breakdown || '—') + '</td></tr>';
      }).join('');
      renderCharts(data);
    }

    function renderCharts(data) {
      const pYt = data.downloads.byPlatform.youtube || 0;
      const pIg = data.downloads.byPlatform.instagram || 0;
      const pTt = data.downloads.byPlatform.tiktok || 0;

      const types = { video: 'Video', audio: 'Audio', image: 'Rasm', reel: 'Reel', post: 'Post', story: 'Story', document: 'Hujjat' };
      const labels = Object.values(types);
      const values = Object.keys(types).map(key => data.downloads.byMediaType[key] || 0);
      const fallback = document.getElementById('statsChartFallback');
      fallback.hidden = typeof Chart !== 'undefined';
      if (!fallback.hidden) {
        fallback.textContent = labels.map((label, i) => label + ': ' + values[i]).join(' · ');
        return;
      }

      // Platform chart
      const ctxP = document.getElementById('platformChart');
      if (ctxP) {
        if (platformChartInstance) platformChartInstance.destroy();
        platformChartInstance = new Chart(ctxP, {
          type: 'doughnut',
          data: {
            labels: ['YouTube', 'Instagram', 'TikTok'],
            datasets: [{
              data: [pYt, pIg, pTt],
              backgroundColor: ['#ef4444', '#ec4899', '#06b6d4'],
              borderWidth: 0,
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { position: 'bottom', labels: { color: '#94a3b8', boxWidth: 12 } }
            }
          }
        });
      }

      // Media types chart
      const ctxM = document.getElementById('mediaChart');
      if (ctxM) {
        if (mediaChartInstance) mediaChartInstance.destroy();
        mediaChartInstance = new Chart(ctxM, {
          type: 'bar',
          data: {
            labels,
            datasets: [{
              label: 'Yuklamalar',
              data: values,
              backgroundColor: ['#6366f1', '#10b981', '#f59e0b'],
              borderRadius: 8,
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
              x: { ticks: { color: '#94a3b8' }, grid: { display: false } },
              y: { ticks: { color: '#94a3b8' }, grid: { color: '#1e293b' } }
            }
          }
        });
      }
    }

    // Active Tasks Logic
    async function fetchActiveTasks() {
      try {
        const res = await authFetch('/admin/api/active');
        const data = await res.json();
        renderActiveTasks(data.active || []);
        renderRecentCompleted(data.recent || []);
      } catch (err) {
        console.error('Failed to fetch active tasks', err);
      }
    }

    function refreshActiveTasks() {
      fetchActiveTasks();
    }

    function updateLiveMetrics(summary) {
      if (!summary) return;
      const count = summary.activeCount ?? summary.totalActive ?? 0;
      document.getElementById('metricActiveTasks').textContent = count;
      document.getElementById('activeCountPill').textContent = count;

      const stuckBadge = document.getElementById('metricStuckBadge');
      if (summary.stuckCount > 0) {
        stuckBadge.textContent = \`\${summary.stuckCount} qotgan\`;
        stuckBadge.classList.remove('hidden');
      } else {
        stuckBadge.classList.add('hidden');
      }

      const speedKB = summary.totalSpeedBytesPerSec ? (summary.totalSpeedBytesPerSec / 1024).toFixed(0) : 0;
      const speedMB = (speedKB / 1024).toFixed(1);
      document.getElementById('metricActiveSpeed').textContent = speedKB > 1024 ? \`\${speedMB} MB/s tezlik\` : \`\${speedKB} KB/s tezlik\`;
    }

    function renderActiveTasks(tasks) {
      activeTasksCache = tasks;
      const container = document.getElementById('activeTasksContainer');
      const badge = document.getElementById('navLiveBadge');

      if (tasks.length > 0) {
        if (badge) badge.classList.remove('hidden');
      } else {
        if (badge) badge.classList.add('hidden');
      }

      if (!tasks || tasks.length === 0) {
        container.innerHTML = \`
          <div class="bg-dark-900 border border-slate-800/80 rounded-2xl p-12 text-center">
            <div class="w-12 h-12 rounded-2xl bg-slate-800 text-slate-500 flex items-center justify-center mx-auto mb-3">
              <i class="fa-solid fa-inbox text-xl"></i>
            </div>
            <h4 class="text-sm font-semibold text-white">Hozirda faol jarayonlar yo'q</h4>
            <p class="text-xs text-slate-400 mt-1">Foydalanuvchilar botga link yuborganda bu yerda real-vaqtda ko'rinadi.</p>
          </div>
        \`;
        return;
      }

      container.innerHTML = tasks.map(task => {
        const platformColor = task.platform === 'youtube' ? 'text-red-400 bg-red-500/10 border-red-500/20' :
                              task.platform === 'instagram' ? 'text-pink-400 bg-pink-500/10 border-pink-500/20' :
                              'text-cyan-400 bg-cyan-500/10 border-cyan-500/20';

        const platformIcon = task.platform === 'youtube' ? 'fa-brands fa-youtube' :
                             task.platform === 'instagram' ? 'fa-brands fa-instagram' :
                             'fa-brands fa-tiktok';

        const stageText = task.stage === 'queued' ? 'Navbatda' : task.stage === 'analyzing' ? '🔍 Tahlil qilinmoqda...' :
                          task.stage === 'downloading' ? '⬇️ Yuklanmoqda...' :
                          task.stage === 'splitting' ? '✂️ Qismlarga bo\\'linmoqda...' :
                          '⬆️ Telegramga yuklanmoqda...';

        const prog = task.progress || {};
        const percent = Math.min(100, Math.max(0, prog.percent ?? task.progressPercent ?? 0));
        const downloadedMB = prog.downloaded ? (prog.downloaded / (1024 * 1024)).toFixed(1) : (task.downloadedBytes ? (task.downloadedBytes / (1024 * 1024)).toFixed(1) : '0');
        const totalMB = prog.total ? (prog.total / (1024 * 1024)).toFixed(1) : (task.totalBytes ? (task.totalBytes / (1024 * 1024)).toFixed(1) : '?');
        const speedMB = prog.speed ? (prog.speed / (1024 * 1024)).toFixed(2) + ' MB/s' : (task.speedBytesPerSec ? (task.speedBytesPerSec / (1024 * 1024)).toFixed(2) + ' MB/s' : '');
        const etaText = prog.eta ? \`ETA: \${prog.eta}s\` : (task.etaSeconds ? \`ETA: \${task.etaSeconds}s\` : '');

        const elapsedSec = Math.floor((Date.now() - new Date(task.startedAt).getTime()) / 1000);
        const elapsedText = elapsedSec < 60 ? \`\${elapsedSec} soniya\` : \`\${Math.floor(elapsedSec / 60)} daqiqa \${elapsedSec % 60}s\`;

        const isStuck = task.isStuck;

        return \`
          <div class="bg-dark-900 border \${isStuck ? 'border-rose-500/60 pulse-glow bg-rose-950/20' : 'border-slate-800/80'} rounded-2xl p-4 transition-all">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <!-- Left: Platform, Info, User -->
              <div class="flex items-start gap-3 min-w-0">
                <div class="w-10 h-10 rounded-xl \${platformColor} border flex items-center justify-center text-lg flex-shrink-0">
                  <i class="\${platformIcon}"></i>
                </div>
                <div class="min-w-0 space-y-0.5">
                  <div class="flex items-center gap-2 flex-wrap">
                    <h4 class="text-sm font-semibold text-white truncate max-w-md" title="\${escapeHtml(task.title || 'Nomsiz')}">
                      \${escapeHtml(task.title || 'Yuklanmoqda...')}
                    </h4>
                    <span class="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md bg-slate-800 text-slate-300">
                      \${escapeHtml(task.quality || task.format || task.mediaType)}
                    </span>
                    \${isStuck ? \`
                      <span class="text-[10px] font-bold px-2 py-0.5 rounded-md bg-rose-500/20 text-rose-300 border border-rose-500/30 flex items-center gap-1 animate-pulse">
                        <i class="fa-solid fa-triangle-exclamation"></i> Qotib qolgan (Stuck)
                      </span>
                    \` : ''}
                  </div>

                  <div class="flex items-center gap-3 text-xs text-slate-400 flex-wrap">
                    <span class="text-slate-300 font-mono">
                      <i class="fa-solid fa-user text-slate-500 mr-1"></i>\${task.username ? '@' + task.username : 'ID: ' + task.userId}
                    </span>
                    <span>•</span>
                    <a href="\${escapeHtml(task.url)}" target="_blank" class="text-sky-400 hover:underline truncate max-w-xs flex items-center gap-1">
                      <i class="fa-solid fa-arrow-up-right-from-square text-[10px]"></i> Linkni ochish
                    </a>
                    <span>•</span>
                    <span class="text-slate-400"><i class="fa-regular fa-clock mr-1"></i>\${elapsedText} avval</span>
                  </div>
                </div>
              </div>

              <!-- Right: Stage Badge & Kill Button -->
              <div class="flex items-center gap-3 justify-between sm:justify-end flex-shrink-0">
                <div class="text-right">
                  <div class="text-xs font-medium text-brand-400">\${stageText}</div>
                  <div class="text-[11px] text-slate-500 font-mono">\${downloadedMB} MB / \${totalMB} MB \${speedMB ? '• ' + speedMB : ''}</div>
                </div>
                <button onclick="killTask('\${task.id || task.taskId}')" class="px-3 py-1.5 rounded-xl text-xs font-medium bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 transition flex items-center gap-1.5">
                  <i class="fa-solid fa-ban"></i>
                  <span>To'xtatish</span>
                </button>
              </div>
            </div>

            <!-- Progress Bar -->
            <div class="mt-3">
              <div class="flex justify-between text-[11px] text-slate-400 mb-1 font-mono">
                <span>Progress: \${percent}%</span>
                <span>\${etaText}</span>
              </div>
              <div class="w-full bg-dark-850 h-2 rounded-full overflow-hidden border border-slate-800">
                <div class="bg-gradient-to-r \${isStuck ? 'from-rose-500 to-amber-500' : 'from-brand-600 to-indigo-400'} h-full rounded-full transition-all duration-300" style="width: \${percent}%"></div>
              </div>
            </div>
          </div>
        \`;
      }).join('');
    }

    function renderRecentCompleted(items) {
      const container = document.getElementById('recentCompletedContainer');
      const averages = [];
      for (const platform of ['youtube', 'instagram', 'tiktok']) {
        const sample = (items || []).filter(item => item.platform === platform && item.stage === 'completed');
        if (!sample.length) continue;
        const seconds = stage => Math.round(sample.reduce((sum, item) => sum + (item.timings?.[stage] || 0), 0) / sample.length / 1000);
        averages.push(platform + ' (' + sample.length + ' ta): navbat ' + seconds('queued') + ' s, yuklash ' + seconds('downloading') + ' s, yuborish ' + seconds('uploading') + ' s');
      }
      document.getElementById('platformTimingSummary').textContent = averages.length ? 'Yaqindagi muvaffaqiyatli yuklamalar, o‘rtacha: ' + averages.join(' · ') : '';
      if (!items || items.length === 0) {
        container.innerHTML = '<div class="text-xs text-slate-500 italic col-span-3">Hali yakunlanganlar mavjud emas</div>';
        return;
      }

      container.innerHTML = items.map(item => \`
        <div class="bg-dark-900 border border-slate-800/60 p-3 rounded-xl flex items-center justify-between text-xs">
          <div class="min-w-0 pr-2">
            <div class="font-medium text-white truncate" title="\${escapeHtml(item.title || '')}">\${escapeHtml(item.title || 'Fayl')}</div>
            <div class="text-[11px] text-slate-400 mt-0.5">\${item.platform.toUpperCase()} • \${item.mediaType}</div>
          </div>
          <div class="text-xs text-slate-400">Navbat \${Math.round((item.timings?.queued || 0)/1000)} s · Yuklash \${Math.round((item.timings?.downloading || 0)/1000)} s · Yuborish \${Math.round((item.timings?.uploading || 0)/1000)} s</div>
          <span class="text-emerald-400 text-xs flex-shrink-0 flex items-center gap-1">
            \${item.stage === 'completed' ? 'Tugadi' : item.stage === 'cancelled' ? 'Bekor qilindi' : 'Xatolik'}
          </span>
        </div>
      \`).join('');
    }

    async function killTask(taskId) {
      if (!confirm('Ushbu yuklash jarayonini majburiy to\\'xtatmoqchimisiz?')) return;

      try {
        const res = await authFetch(\`/admin/api/kill/\${taskId}\`, { method: 'POST' });
        const data = await res.json();
        if (res.ok) {
          showToast(data.message || "Jarayon to'xtatildi", 'success');
          fetchActiveTasks();
        } else {
          showToast(data.error || "To'xtatib bo'lmadi", 'error');
        }
      } catch (err) {
        showToast('Server xatosi', 'error');
      }
    }

    // HISTORY LOGIC
    function handleDatePresetChange() {
      const preset = document.getElementById('historyDatePreset').value;
      const customRow = document.getElementById('customDateRangeRow');
      if (preset === 'custom') {
        customRow.classList.remove('hidden');
      } else {
        customRow.classList.add('hidden');
        fetchHistory(1);
      }
    }

    function debounceHistorySearch() {
      clearTimeout(searchDebounceTimeout);
      searchDebounceTimeout = setTimeout(() => {
        fetchHistory(1);
      }, 400);
    }

    async function fetchHistory(page = 1) {
      const request = ++historyRequest;
      historyPage = page;
      historyItems = [];
      document.getElementById("historyTableBody").innerHTML = '<tr><td colspan="6">Yuklanmoqda…</td></tr>';
      document.getElementById("historyPaginationBtns").replaceChildren();
      document.getElementById("historyPaginationInfo").textContent = "";
      const search = document.getElementById('historySearch').value.trim();
      const platform = document.getElementById('historyPlatform').value;
      const mediaType = document.getElementById('historyMediaType').value;
      const datePreset = document.getElementById('historyDatePreset').value;

      let startDate = '';
      let endDate = '';

      const today = new Date();
      const formatDate = (d) => d.toISOString().split('T')[0];

      if (datePreset === 'today') {
        startDate = formatDate(today);
        endDate = formatDate(today);
      } else if (datePreset === 'yesterday') {
        const y = new Date(today);
        y.setDate(y.getDate() - 1);
        startDate = formatDate(y);
        endDate = formatDate(y);
      } else if (datePreset === 'week') {
        const w = new Date(today);
        w.setDate(w.getDate() - 7);
        startDate = formatDate(w);
        endDate = formatDate(today);
      } else if (datePreset === 'custom') {
        startDate = document.getElementById('historyStartDate').value;
        endDate = document.getElementById('historyEndDate').value;
      }

      const params = new URLSearchParams({
        page: historyPage,
        limit: historyLimit,
        platform,
        mediaType,
      });

      if (search) params.append('search', search);
      if (recipientId) params.set('userId', recipientId);
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);

      try {
        const res = await authFetch(\`/admin/api/history?\${params.toString()}\`);
        const data = await res.json();
        if (request !== historyRequest) return;
        if (!res.ok) throw new Error('History HTTP ' + res.status);
        renderHistoryTable(data.items || [], data.pagination || {});
      } catch (err) {
        if (request !== historyRequest) return;
        document.getElementById('historyTableBody').innerHTML = '<tr><td colspan="6">Yuklamalar tarixini olishda xato yuz berdi.</td></tr>';
        console.error('History fetch error', err);
      }
    }

    function renderHistoryTable(items, pagination) {
      const tbody = document.getElementById('historyTableBody');
      if (!items || items.length === 0) {
        tbody.innerHTML = \`
          <tr>
            <td colspan="6" class="text-center py-10 text-slate-500">Hech qanday ma'lumot topilmadi</td>
          </tr>
        \`;
        document.getElementById('historyPaginationInfo').textContent = '0 / 0';
        document.getElementById('historyPaginationBtns').innerHTML = '';
        return;
      }

      historyItems = items;
      tbody.innerHTML = items.map((item, index) => {
        const dateStr = new Date(item.createdAt).toLocaleString('uz-UZ', {
          month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
        });

        const platformBadge = item.platform === 'youtube' ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                              item.platform === 'instagram' ? 'bg-pink-500/10 text-pink-400 border-pink-500/20' :
                              'bg-cyan-500/10 text-cyan-400 border-cyan-500/20';

        const sizeMB = item.fileSize ? (item.fileSize / (1024 * 1024)).toFixed(1) + ' MB' : '-';
        const userObj = item.user;
        const userText = userObj ? (userObj.username ? '@' + userObj.username : userObj.firstName || userObj.telegramId) : item.chatId;

        return \`
          <tr class="hover:bg-dark-850/50 transition">
            <td class="py-3 px-4 font-mono text-[11px] text-slate-400">\${dateStr}</td>
            <td class="py-3 px-4">
              <span class="font-medium text-white">\${escapeHtml(String(userText))}</span>
              <div class="text-[10px] text-slate-500 font-mono">ID: \${userObj?.telegramId ?? item.chatId}</div>
            </td>
            <td class="py-3 px-4">
              <span class="inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase border \${platformBadge}">
                \${item.platform}
              </span>
              <span class="text-slate-400 ml-1">\${item.mediaType}</span>
            </td>
            <td class="py-3 px-4 max-w-xs">
              <div class="truncate font-medium text-white" title="\${escapeHtml(item.fileName || '')}">\${escapeHtml(item.fileName || 'Fayl')}</div>
              <a href="\${escapeHtml(safeSource(item.url))}" target="_blank" class="truncate text-sky-400 hover:underline block text-[11px]">
                \${escapeHtml(item.url)}
              </a>
            </td>
            <td class="py-3 px-4 font-mono text-[11px]">
              <div>\${sizeMB}</div>
              <div class="text-slate-500">\${escapeHtml(item.quality || '')}</div>
            </td>
            <td class="py-3 px-4 text-right">
              <button onclick="openPreview(\${index})" class="px-2 py-1 text-sky-400">Ko‘rish</button>
              <button onclick="openSendModal(historyItems[\${index}])" class="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/30 transition flex items-center gap-1 ml-auto" title="Admin Telegram chatiga yuborish">
                <i class="fa-brands fa-telegram"></i>
                <span class="hidden sm:inline">TG ga olish</span>
              </button>
            </td>
          </tr>
        \`;
      }).join('');

      // Update Pagination
      const { page, total, pages } = pagination;
      document.getElementById('historyPaginationInfo').textContent = \`Ko'rsatilmoqda: \${(page - 1) * historyLimit + 1} - \${Math.min(page * historyLimit, total)} / Jami \${total}\`;

      let btns = '';
      if (page > 1) {
        btns += \`<button onclick="fetchHistory(\${page - 1})" class="px-3 py-1 bg-dark-850 hover:bg-slate-800 rounded-lg text-slate-300">Oldingi</button>\`;
      }
      if (page < pages) {
        btns += \`<button onclick="fetchHistory(\${page + 1})" class="px-3 py-1 bg-dark-850 hover:bg-slate-800 rounded-lg text-slate-300">Keyingi</button>\`;
      }
      document.getElementById('historyPaginationBtns').innerHTML = btns;
    }

    // SEND TO TELEGRAM MODAL
    function openSendModal(item) {
      currentSendItem = item;
      document.getElementById('modalFileName').textContent = item.fileName || 'Nomsiz';
      document.getElementById('modalPlatform').textContent = (item.platform || '').toUpperCase();
      document.getElementById('modalUrl').textContent = item.url || '';
      document.getElementById('targetChatId').value = adminChatId || '';
      document.getElementById('sendModalResult').classList.add('hidden');
      document.getElementById('sendTelegramModal').classList.remove('hidden');
    }

    function closeSendModal() {
      document.getElementById('sendTelegramModal').classList.add('hidden');
      currentSendItem = null;
    }

    async function executeSendFile() {
      if (!currentSendItem) return;
      const chatId = document.getElementById('targetChatId').value.trim();
      const resBox = document.getElementById('sendModalResult');
      const btn = document.getElementById('confirmSendBtn');

      if (!chatId) {
        resBox.className = 'text-xs p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 block';
        resBox.textContent = 'Iltimos, Telegram Chat ID kiriting';
        return;
      }

      btn.disabled = true;
      btn.innerHTML = '<i class="fa-solid fa-spinner animate-spin"></i><span>Yuborilmoqda...</span>';
      resBox.classList.add('hidden');

      try {
        const res = await authFetch('/admin/api/send-file', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            downloadId: currentSendItem._id,
            chatId: chatId,
          }),
        });

        const data = await res.json();
        if (res.ok && data.success) {
          resBox.className = 'text-xs p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 block';
          resBox.textContent = '✅ Fayl muvaffaqiyatli Telegram profilingizga jo\\'natildi!';
          showToast('Fayl Telegramga yuborildi', 'success');
          setTimeout(() => {
            closeSendModal();
          }, 1500);
        } else {
          resBox.className = 'text-xs p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 block';
          resBox.textContent = data.error || 'Yuborishda xatolik yuz berdi';
        }
      } catch (err) {
        resBox.className = 'text-xs p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 block';
        resBox.textContent = 'Server bilan aloqa uzildi';
      } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i><span>Yuborish</span>';
      }
    }

    // USERS LIST LOGIC
    function debounceUserSearch() {
      clearTimeout(userSearchTimeout);
      userSearchTimeout = setTimeout(() => {
        fetchUsers(1);
      }, 400);
    }

    async function fetchUsers(page = 1) {
      usersPage = page;
      const search = document.getElementById('userSearch').value.trim();
      const params = new URLSearchParams({
        page: usersPage,
        limit: usersLimit,
      });
      if (search) params.append('search', search);

      try {
        const res = await authFetch(\`/admin/api/users?\${params.toString()}\`);
        const data = await res.json();
        renderUsersTable(data.users || [], data.pagination || {});
      } catch (err) {
        console.error('Users fetch error', err);
      }
    }

    function renderUsersTable(users, pagination) {
      const tbody = document.getElementById('usersTableBody');
      document.getElementById('usersTotalCount').textContent = \`Jami: \${pagination.total || 0} ta foydalanuvchi\`;

      if (!users || users.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center py-8 text-slate-500">Foydalanuvchi topilmadi</td></tr>';
        document.getElementById('usersPaginationInfo').textContent = '0 / 0';
        document.getElementById('usersPaginationBtns').innerHTML = '';
        return;
      }

      listedUsers = users;
      tbody.innerHTML = users.map((u, index) => {
        const createdAt = u.createdAt ? new Date(u.createdAt).toLocaleDateString('uz-UZ') : '-';
        const lastActive = u.lastActiveAt ? new Date(u.lastActiveAt).toLocaleString('uz-UZ', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-';

        return \`
          <tr class="hover:bg-dark-850/50 transition">
            <td class="py-3 px-4 font-mono font-medium text-brand-400">\${u.telegramId}<button onclick="showRecipient(\${index})" class="block text-xs text-sky-400">Materiallari</button><button onclick="openRequests(\${index})" class="block text-xs text-sky-400">So‘rovlar</button></td>
            <td class="py-3 px-4">
              <div class="font-medium text-white">\${escapeHtml(u.firstName || 'Ismsiz')} \${escapeHtml(u.lastName || '')}</div>
              <div class="text-[11px] text-slate-400">\${u.username ? '@' + escapeHtml(u.username) : '-'}</div>
            </td>
            <td class="py-3 px-4 font-mono font-semibold text-slate-300">\${u.messageCount || 0}</td>
            <td class="py-3 px-4 text-slate-400 text-[11px]">\${createdAt}</td>
            <td class="py-3 px-4 text-slate-400 text-[11px]">\${lastActive}</td>
          </tr>
        \`;
      }).join('');

      const { page, total, pages } = pagination;
      document.getElementById('usersPaginationInfo').textContent = \`Ko'rsatilmoqda: \${(page - 1) * usersLimit + 1} - \${Math.min(page * usersLimit, total)} / Jami \${total}\`;

      let btns = '';
      if (page > 1) {
        btns += \`<button onclick="fetchUsers(\${page - 1})" class="px-3 py-1 bg-dark-850 hover:bg-slate-800 rounded-lg text-slate-300">Oldingi</button>\`;
      }
      if (page < pages) {
        btns += \`<button onclick="fetchUsers(\${page + 1})" class="px-3 py-1 bg-dark-850 hover:bg-slate-800 rounded-lg text-slate-300">Keyingi</button>\`;
      }
      document.getElementById('usersPaginationBtns').innerHTML = btns;
    }

    // Helper: Toast notifications
    function showToast(msg, type = 'info') {
      const el = document.createElement('div');
      el.className = \`fixed bottom-5 right-5 z-50 px-4 py-2.5 rounded-xl text-xs font-medium shadow-2xl transition-all flex items-center gap-2 border \${
        type === 'success' ? 'bg-emerald-950 border-emerald-500/40 text-emerald-300' :
        type === 'error' ? 'bg-rose-950 border-rose-500/40 text-rose-300' :
        'bg-dark-900 border-slate-700 text-slate-200'
      }\`;
      el.innerHTML = \`<i class="fa-solid \${type === 'success' ? 'fa-circle-check' : 'fa-circle-exclamation'}"></i> \${escapeHtml(msg)}\`;
      document.body.appendChild(el);
      setTimeout(() => {
        el.style.opacity = '0';
        setTimeout(() => el.remove(), 300);
      }, 3000);
    }

    function escapeHtml(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }
  </script>
</body>
</html>`;
};
