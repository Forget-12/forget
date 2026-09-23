#!/usr/bin/env bun
// === PATCH UNTUK BUN: hindari crash NAPI dari modul sleep ===
if (typeof Bun !== 'undefined') {
  global.sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  const Module = require('module');
  const originalResolve = Module._resolveFilename;
  Module._resolveFilename = function(request, parent, isMain, options) {
    if (request === 'sleep') {
      return require.resolve('./sleep-polyfill.js');
    }
    return originalResolve.call(this, request, parent, isMain, options);
  };
}
// ==============================================================

const express = require('express');
const { connect } = require("puppeteer-real-browser");
const fs = require('fs');
const path = require('path');
const os = require('os');

// ===== UTILITAS UI =====
const RESET = "\x1b[0m";
const RGB = (r, g, b) => `\x1b[38;2;${r};${g};${b}m`;

function lerp(a, b, t) { return Math.round(a + (b - a) * t); }

function gradientText(text, fromRgb, toRgb) {
  const chars = text.split('');
  const n = chars.length - 1;
  let out = '';
  for (let i = 0; i < chars.length; i++) {
    const t = n === 0 ? 0 : i / n;
    const r = lerp(fromRgb[0], toRgb[0], t);
    const g = lerp(fromRgb[1], toRgb[1], t);
    const b = lerp(fromRgb[2], toRgb[2], t);
    out += RGB(r, g, b) + chars[i];
  }
  out += RESET;
  return out;
}

function centerText(text, width) {
  const pad = Math.max(0, Math.floor((width - text.length) / 2));
  return ' '.repeat(pad) + text;
}

function separatorLine(width, fromRgb, toRgb) {
  const line = '='.repeat(width);
  return gradientText(line, fromRgb, toRgb);
}

function printBanner() {
  const width = process.stdout.columns || 80;
  const sepFrom = [18, 22, 26];
  const sepTo = [32, 40, 54];
  const bannerFrom = [48, 160, 140];
  const bannerTo = [140, 100, 200];

  const sep = separatorLine(width, sepFrom, sepTo);
  const bannerText = "FORGET SOLVER PROJECT | SASUKE EDITION";
  const tinyCaption = "ᶠᵒʳᵍᵉᵗ ᵐᵉ";

  console.log(sep);
  console.log(gradientText(centerText(bannerText, width), bannerFrom, bannerTo));
  console.log(`\x1b[38;2;120;130;140m${centerText(tinyCaption, width)}${RESET}`);
  console.log(sep);
}

function logMessage(typeChar, text) {
  const timeStr = `\x1b[38;2;120;130;140m[${new Date().toTimeString().split(' ')[0]}]\x1b[0m `;
  let prefix = '';
  if (typeChar === 'e') {
    prefix = RGB(220, 60, 60) + "● AMATERASU : " + RESET;
  } else if (typeChar === 's') {
    prefix = RGB(60, 220, 60) + "● SHARINGAN : " + RESET;
  } else {
    prefix = gradientText("● SUSANOO   : ", [90, 200, 180], [170, 120, 220]);
  }
  console.log(timeStr + prefix + text);
}

// ======================================================

const app = express();
const port = 8080;
const authToken = process.env.authToken || null;
const domain = process.env.DOMAIN || `https://forgets-Me12.hf.space`;

// === POOL CONFIG BARU: 1 browser, banyak tab ===
global.browserLimit = Number(process.env.browserLimit) || 1;
global.pagesPerBrowser = Number(process.env.pagesPerBrowser) || 2;
global.timeOut = Number(process.env.timeOut) || 180000;

const CACHE_DIR = path.join(__dirname, "cache");
const CACHE_FILE = path.join(CACHE_DIR, "cache.json");
const CACHE_TTL = 5 * 60 * 1000;

// === Disk cache Chromium persistent ===
const PERSISTENT_CACHE_DIR = path.join(os.tmpdir(), 'cf-chrome-cache');
try { fs.mkdirSync(PERSISTENT_CACHE_DIR, { recursive: true }); } catch {}

// === LV4 REAL: profile persistent TUNGGAL (slot-0 saja) ===
const PERSISTENT_PROFILE_ROOT = path.join(os.tmpdir(), 'cf-chrome-profiles');
try { fs.mkdirSync(PERSISTENT_PROFILE_ROOT, { recursive: true }); } catch {}
const SINGLE_PROFILE_DIR = path.join(PERSISTENT_PROFILE_ROOT, 'slot-0');
try { fs.mkdirSync(SINGLE_PROFILE_DIR, { recursive: true }); } catch {}
// ==================================

// ===== STATISTIK SOLVER =====
const solveStats = {
  turnstile: { success: 0, failed: 0 },
  iuam: { success: 0, failed: 0 },
  antibot: { success: 0, failed: 0 },
  total: { success: 0, failed: 0 }
};
const urlStats = {};
// ==================================

// ===== STATUS VERIFIKASI 2 MODUL AKTIF =====
const verifyStatus = {
  hematKuota: null,
  turnstileBoost: null
};

function fmtVerifyStatus(v) {
  if (v === true)  return '\x1b[92mAKTIF ✓\x1b[0m';
  if (v === false) return '\x1b[91mGAGAL ✗\x1b[0m';
  return '\x1b[90mmenunggu...\x1b[0m';
}
// ============================================

// ═══════════════════════════════════════════════════════════════════
// ═══ MODE SUPER HEMAT KUOTA ═══
// ═══════════════════════════════════════════════════════════════════
const HEMAT_KUOTA = process.env.HEMAT_KUOTA !== '0';
const BLOCKED_RESOURCE_TYPES = new Set(['image', 'media', 'font', 'manifest']);
const BLOCKED_HOST_SUBSTRINGS = [
  'google-analytics.com',
  'googletagmanager.com',
  'googlesyndication.com',
  'googleadservices.com',
  'doubleclick.net',
  'connect.facebook.net',
  'facebook.net',
  'hotjar.com',
  'mixpanel.com',
  'segment.io',
  'segment.com',
  'amplitude.com',
  'sentry.io',
  'newrelic.com',
  'fullstory.com',
  'mouseflow.com',
  'clarity.ms',
  'mc.yandex.ru',
  'yandex.ru/metrika',
  'statcounter.com',
  'quantserve.com',
  'scorecardresearch.com',
  'crazyegg.com',
  'optimizely.com',
];

function setupHematKuota(page) {
  if (!HEMAT_KUOTA) return;
  page.on('request', (req) => {
    try {
      const type = req.resourceType();
      if (BLOCKED_RESOURCE_TYPES.has(type)) return req.abort();

      const url = (req.url() || '').toLowerCase();
      if (url.startsWith('data:') || url.startsWith('blob:')) return req.continue();

      for (let i = 0; i < BLOCKED_HOST_SUBSTRINGS.length; i++) {
        if (url.includes(BLOCKED_HOST_SUBSTRINGS[i])) return req.abort();
      }
      return req.continue();
    } catch {
      try { req.continue(); } catch {}
    }
  });
}
// ═══════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════
// ═══ EXTREME TURNSTILE SPEED BOOST ═══
// ═══════════════════════════════════════════════════════════════════
const CF_CHALLENGE_ORIGIN = 'https://challenges.cloudflare.com';
const CF_WARM_URL = CF_CHALLENGE_ORIGIN + '/cdn-cgi/challenge-platform/h/b/orchestrate/chl_page/v1';

// === PAKSA TAB FOKUS (tidak ada yang jalan di background) ===
// Chromium hanya punya SATU tab foreground di level window manager.
// Tapi CDP bisa MEMAKSA setiap tab menganggap dirinya focused:
//   - Emulation.setFocusEmulationEnabled → document.hasFocus() = true
//   - Page.setWebLifecycleState('active') → document.visibilityState = 'visible'
//   - Emulation.setCPUThrottlingRate(1)   → pastikan CPU tidak di-throttle
// Dipasang di setiap tab, tidak saling ganggu (state per-target).
// ═══════════════════════════════════════════════════════════════════
async function ensureTabFullyActive(page) {
  if (!page) return false;
  try {
    const cdp = await page.target().createCDPSession();
    try { await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true }); } catch {}
    try { await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 }); } catch {}
    try { await cdp.send('Page.setWebLifecycleState', { state: 'active' }); } catch {}
    try { await cdp.detach(); } catch {}
    return true;
  } catch {
    return false;
  }
}

// Re-apply ke SEMUA tab di satu browser — dipakai setelah newPage()
// (Chromium otomatis meng-background tab lama saat tab baru dibuat).
async function refreshAllTabsInBrowser(browserRef) {
  if (!browserRef) return;
  const entries = browserPool.filter(e => e.browserRef === browserRef && e.alive && e.page);
  for (const e of entries) {
    try { await ensureTabFullyActive(e.page); } catch {}
  }
}

async function setupTurnstileSpeedBoost(page) {
  const result = { cdpOk: false, preconnect: 0, warmFetch: false };

  try {
    const cdp = await page.target().createCDPSession();
    try { await cdp.send('Network.enable'); } catch {}
    try { await cdp.send('Page.enable'); } catch {}
    try { await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 }); } catch {}
    try { await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true }); } catch {}
    try { await cdp.send('Page.setWebLifecycleState', { state: 'active' }); } catch {}
    try { await cdp.send('Page.setBypassCSP', { enabled: true }); } catch {}
    // NOTE: Page.bringToFront TIDAK dipakai — dia bikin tab lain jadi
    // background di window manager. Focus emulation di atas sudah cukup.
    result.cdpOk = true;
  } catch (e) {
    logMessage('e', `Turnstile speed boost CDP gagal: ${e.message}`);
  }

  try {
    const r = await page.evaluate(async (origin, warmUrl) => {
      const out = { preconnect: 0, warmFetch: false };
      try {
        const head = document.head || document.documentElement;
        if (head) {
          for (const rel of ['preconnect', 'dns-prefetch']) {
            const l = document.createElement('link');
            l.rel = rel;
            l.href = origin;
            if (rel === 'preconnect') l.crossOrigin = 'anonymous';
            head.appendChild(l);
          }
          out.preconnect = document.querySelectorAll(
            'link[rel="preconnect"], link[rel="dns-prefetch"]'
          ).length;
        }
      } catch {}
      try {
        await fetch(warmUrl, { mode: 'no-cors', cache: 'force-cache' });
        out.warmFetch = true;
      } catch {}
      return out;
    }, CF_CHALLENGE_ORIGIN, CF_WARM_URL);
    if (r && typeof r === 'object') {
      result.preconnect = Number(r.preconnect) || 0;
      result.warmFetch = !!r.warmFetch;
    }
  } catch (e) {}

  return result;
}
// ═══════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════
// ═══ VERIFIKASI AKTIF ═══
// ═══════════════════════════════════════════════════════════════════
async function verifyHematKuota(page) {
  try {
    const n = (typeof page.listenerCount === 'function')
      ? page.listenerCount('request')
      : (typeof page.listeners === 'function' ? page.listeners('request').length : 0);
    return n > 0;
  } catch { return false; }
}

async function verifyBrowserFlags(browser) {
  const requiredStartsWith = [
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
  ];
  const requiredContains = {
    'disable-features': 'TranslateUI',
    'blink-settings': 'imagesEnabled=false',
  };

  const found = {};
  for (const k of requiredStartsWith) found[k] = false;
  for (const k of Object.keys(requiredContains)) found[k] = false;

  let total = 0;
  let error = null;
  try {
    const cdp = await browser.target().createCDPSession();
    try {
      const r = await cdp.send('Browser.getBrowserCommandLine');
      const args = (r && r.arguments) || [];
      total = args.length;
      const joined = args.filter(a => typeof a === 'string').join(' ');
      for (const req of requiredStartsWith) {
        found[req] = args.some(a => typeof a === 'string' && a.startsWith(req));
      }
      for (const [key, sub] of Object.entries(requiredContains)) {
        found[key] = joined.includes(sub);
      }
    } catch (e) {
      error = e.message;
    }
    try { await cdp.detach(); } catch {}
  } catch (e) {
    error = e.message;
  }

  let ok;
  if (error) {
    ok = true;
  } else {
    ok = Object.values(found).every(v => v === true);
  }

  return { total, found, error, ok };
}

async function verifyTurnstileSpeedBoost(page, setupResult) {
  const report = {
    hasFocus: null,
    rafFps: null,
    visibilityState: null,
    focusEmulation: null,
    preconnect: setupResult ? setupResult.preconnect : 0,
    warmFetch: setupResult ? setupResult.warmFetch : false,
    cdpOk: setupResult ? setupResult.cdpOk : false,
  };

  try {
    const r = await page.evaluate(() => new Promise(res => {
      const focused = document.hasFocus();
      const visible = document.visibilityState;
      let n = 0;
      const t0 = performance.now();
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        res({ focused, visible, n, ms: performance.now() - t0 });
      };
      const tick = () => {
        n++;
        if (performance.now() - t0 < 400) requestAnimationFrame(tick);
        else finish();
      };
      requestAnimationFrame(tick);
      setTimeout(finish, 800);
    }));
    report.hasFocus = r.focused;
    report.visibilityState = r.visible;
    report.rafFps = r.ms > 0 ? Math.round(r.n / (r.ms / 1000)) : 0;
  } catch {}

  report.focusEmulation =
    (report.hasFocus === true && report.visibilityState === 'visible') ||
    (report.rafFps !== null && report.rafFps >= 20);

  if (!report.warmFetch) {
    try {
      const n = await page.evaluate(() =>
        document.querySelectorAll('link[rel="preconnect"], link[rel="dns-prefetch"]').length
      );
      if (n >= 2) {
        report.preconnect = n;
        report.warmFetch = true;
      }
    } catch {}
  }

  return report;
}
// ═══════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════
// ═══ LV4 REAL: 1 BROWSER × N TAB POOL ═══
// ═══════════════════════════════════════════════════════════════════
const browserRegistry = [];  // browser instances
const browserPool = [];      // tab (page) entries
const POOL_IDLE_MS = 60 * 60 * 1000;     // idle 1 jam → close
const POOL_MAX_WAIT_MS = 60 * 1000;      // max nunggu slot kosong

let pendingBrowserSpawns = 0;

function poolStats() {
  const browsersAlive = browserRegistry.filter(b => b.alive).length;
  const totalPages = browserPool.length;
  const busy = browserPool.filter(e => e.busy).length;
  const pending = pendingBrowserSpawns > 0 ? ` (+${pendingBrowserSpawns} spawning)` : '';
  return `${busy}/${totalPages} tab | ${browsersAlive}/${global.browserLimit} browser (×${global.pagesPerBrowser})${pending}`;
}

async function createBrowserInstance(proxyServer, mode) {
  const isTurnstile = mode === 'turnstile';

  // ═══════════════════════════════════════════════════════════════════
  // FIX: Flag yang MELUMPUHKAN Turnstile sudah dihapus:
  //   --disable-gpu, --disable-accelerated-2d-canvas,
  //   --disable-accelerated-jpeg-decoding, --disable-accelerated-mjpeg-decode,
  //   --disable-accelerated-video-decode, --disable-webgl, --disable-webrtc,
  //   --enable-low-end-device-mode, --disable-software-rasterizer,
  //   --disable-threaded-animation, --disable-threaded-scrolling,
  //   --disable-composited-antialiasing, --disable-checker-imaging,
  //   --blink-settings=imagesEnabled=false
  //   + 'BlinkGenPropertyTrees' di --disable-features
  // Turnstile butuh canvas 2D, WebGL, WebRTC, dan rendering pipeline yang
  // normal untuk fingerprint. Semua itu dihilangkan dari blacklist di atas.
  // ═══════════════════════════════════════════════════════════════════
  const defaultArgs = [

  ];

  let args = [...defaultArgs];
  if (isTurnstile) {
    args.push(`--disk-cache-dir=${PERSISTENT_CACHE_DIR}`);
    args.push(`--user-data-dir=${SINGLE_PROFILE_DIR}`);
  }
  if (proxyServer) {
    args.push(`--proxy-server=${proxyServer}`);
  }

  const connectOptions = {
    headless: false,
    turnstile: true,
    args,                                    // ✅ diteruskan ke launch
    connectOption: { defaultViewport: null },
    disableXvfb: false,
    executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome'
  };

  const { browser } = await connect(connectOptions);

  let initialPage = null;
  try {
    const pages = await browser.pages();
    if (pages && pages.length > 0) initialPage = pages[0];
  } catch {}

  let flagsOk = true;
  try {
    const flags = await verifyBrowserFlags(browser);
    flagsOk = !!flags.ok;
    if (flags.error) {
      logMessage('i',
        `[VERIFY] Chromium flags: tidak bisa diverifikasi via CDP ` +
        `(${flags.error}) → dianggap OK`);
    } else {
      const missing = [];
      let ok = 0, tot = 0;
      for (const [k, v] of Object.entries(flags.found)) {
        tot++;
        if (v) ok++; else missing.push(k);
      }
      logMessage(ok === tot ? 'i' : 'e',
        `[VERIFY] Chromium flags kritis: ${ok}/${tot}` +
        (missing.length ? ` | HILANG: ${missing.join(', ')}` : ' ✓') +
        ` (total ${flags.total} arg)`);
    }
  } catch (e) {
    logMessage('e', `[VERIFY] flags error: ${e.message}`);
  }

  const ref = {
    browser,
    mode,
    alive: true,
    pageCount: 0,
    initialPage,
    initialPageUsed: false,
    flagsOk
  };
  return ref;
}

async function createPageInBrowser(browserRef, proxyServer, mode, useInitialPage = false) {
  const isTurnstile = mode === 'turnstile';

  let page;
  if (useInitialPage && browserRef.initialPage) {
    page = browserRef.initialPage;
  } else {
    page = await browserRef.browser.newPage();
  }

  try { await page.setCacheEnabled(true); } catch {}

  try { await page.goto('about:blank'); } catch {}
  try { await page.setRequestInterception(true); } catch {}

  setupHematKuota(page);

  let tsOk = false;
  if (isTurnstile) {
    const setupResult = await setupTurnstileSpeedBoost(page);
    try {
      const [hkOk, ts] = await Promise.all([
        verifyHematKuota(page),
        verifyTurnstileSpeedBoost(page, setupResult)
      ]);

      if (HEMAT_KUOTA) {
        logMessage(hkOk ? 'i' : 'e',
          `[VERIFY] Mode hemat kuota (request handler): ${hkOk ? 'AKTIF ✓' : 'GAGAL ✗'}`);
      } else {
        logMessage('i', `[VERIFY] Mode hemat kuota: dimatikan via HEMAT_KUOTA=0`);
      }

      const focusStr = ts.hasFocus === null ? 'unknown' : (ts.hasFocus ? 'true' : 'false');
      const visStr = ts.visibilityState === null ? 'unknown' : ts.visibilityState;
      const rafStr = ts.rafFps === null ? 'n/a' : `~${ts.rafFps}fps`;
      tsOk = !!(ts.focusEmulation && browserRef.flagsOk);

      const reasons = [];
      if (!ts.focusEmulation) reasons.push(`focus/raf-off(focus=${focusStr},vis=${visStr},raf=${rafStr})`);
      if (!browserRef.flagsOk) reasons.push('flags-missing');
      const reasonStr = reasons.length ? ` | ALASAN: ${reasons.join(', ')}` : '';

      logMessage(tsOk ? 'i' : 'e',
        `[VERIFY] Turnstile speed boost: focus=${focusStr} vis=${visStr} rAF=${rafStr} ` +
        `cdp=${ts.cdpOk ? 'ok' : 'no'} preconnect=${ts.preconnect} ` +
        `warm-fetch=${ts.warmFetch ? 'ok' : 'no'} ${tsOk ? '✓' : '✗'}${reasonStr}`);

      verifyStatus.hematKuota = HEMAT_KUOTA ? hkOk : false;
      verifyStatus.turnstileBoost = tsOk;
      printStats(lastProgress);
    } catch (e) {
      logMessage('e', `[VERIFY] Error saat verifikasi: ${e.message}`);
    }
  } else {
    try {
      const hkOk = await verifyHematKuota(page);
      verifyStatus.hematKuota = HEMAT_KUOTA ? hkOk : false;
      printStats(lastProgress);
    } catch {}
  }

  const entry = {
    browserRef,
    browser: browserRef.browser,
    page,
    busy: true,
    lastUsed: Date.now(),
    mode,
    alive: true
  };

  // === ANTI-BACKGROUND: refresh SEMUA tab setelah tab baru dibuat ===
  // Chromium otomatis memindahkan foreground ke tab terbaru, jadi tab
  // lama perlu di-refresh lagi agar tidak di-throttle.
  browserPool.push(entry);
  if (isTurnstile) {
    try { await refreshAllTabsInBrowser(browserRef); } catch {}
  } else {
    browserPool.pop();
  }

  return entry;
}

// === RECOVER TAB IN-PLACE ===
async function recoverTabInPlace(poolEntry) {
  if (!poolEntry || !poolEntry.alive || !poolEntry.browser) return false;
  try {
    const newPage = await poolEntry.browser.newPage();

    try { await newPage.setCacheEnabled(true); } catch {}
    try { await newPage.goto('about:blank'); } catch {}
    try { await newPage.setRequestInterception(true); } catch {}

    setupHematKuota(newPage);

    if (poolEntry.mode === 'turnstile') {
      try { await setupTurnstileSpeedBoost(newPage); } catch {}
    }

    const oldPage = poolEntry.page;
    poolEntry.page = newPage;
    try { if (oldPage) await oldPage.close(); } catch {}

    // Refresh semua tab di browser yang sama setelah newPage()
    if (poolEntry.mode === 'turnstile') {
      try { await refreshAllTabsInBrowser(poolEntry.browserRef); } catch {}
    }

    logMessage('i', 'Pool: tab di-recover in-place (jumlah tab tetap)');
    return true;
  } catch (e) {
    logMessage('e', `Recover tab gagal: ${e.message}`);
    return false;
  }
}

async function acquireBrowser(proxyServer, mode) {
  // 1. Tab idle mode cocok
  let entry = browserPool.find(e => !e.busy && e.mode === mode && e.alive);
  if (entry) {
    entry.busy = true;
    entry.lastUsed = Date.now();
    // === RE-APPLY FOCUS: pastikan tab ini fokus sebelum solve ===
    if (mode === 'turnstile' && entry.page) {
      try { await ensureTabFullyActive(entry.page); } catch {}
    }
    return entry;
  }

  // 2. Ada browser dengan slot tab kosong? → reserve sinkron
  const refWithRoom = browserRegistry.find(b =>
    b.alive && b.mode === mode && b.pageCount < global.pagesPerBrowser
  );
  if (refWithRoom) {
    refWithRoom.pageCount++;

    let useInitialPage = false;
    if (refWithRoom.initialPage && !refWithRoom.initialPageUsed) {
      refWithRoom.initialPageUsed = true;
      useInitialPage = true;
    }

    try {
      const newEntry = await createPageInBrowser(refWithRoom, proxyServer, mode, useInitialPage);
      logMessage('i',
        `Pool: tab baru di browser yang ada (${refWithRoom.pageCount}/${global.pagesPerBrowser})`);
      return newEntry;
    } catch (e) {
      refWithRoom.pageCount = Math.max(0, refWithRoom.pageCount - 1);
      throw e;
    }
  }

  // 3. Belum sampai limit browser → spawn baru
  const browsersAlive = browserRegistry.filter(b => b.alive).length;
  if ((browsersAlive + pendingBrowserSpawns) < global.browserLimit) {
    pendingBrowserSpawns++;
    try {
      const browserRef = await createBrowserInstance(proxyServer, mode);
      browserRegistry.push(browserRef);

      browserRef.pageCount = 1;
      let useInitialPage = false;
      if (browserRef.initialPage && !browserRef.initialPageUsed) {
        browserRef.initialPageUsed = true;
        useInitialPage = true;
      }

      try {
        const newEntry = await createPageInBrowser(browserRef, proxyServer, mode, useInitialPage);
        logMessage('i',
          `Pool: browser baru dibuat (${browserRegistry.filter(b => b.alive).length}/${global.browserLimit})`);
        return newEntry;
      } catch (e) {
        browserRef.pageCount = 0;
        throw e;
      }
    } finally {
      pendingBrowserSpawns--;
    }
  }

  // 4. Penuh & semua busy → tunggu slot kosong
  const deadline = Date.now() + POOL_MAX_WAIT_MS;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 200));
    entry = browserPool.find(e => !e.busy && e.mode === mode && e.alive);
    if (entry) {
      entry.busy = true;
      entry.lastUsed = Date.now();
      if (mode === 'turnstile' && entry.page) {
        try { await ensureTabFullyActive(entry.page); } catch {}
      }
      return entry;
    }
  }
  return null;
}

function releaseBrowser(entry) {
  if (!entry) return;
  entry.busy = false;
  entry.lastUsed = Date.now();
}

async function closePoolEntry(entry) {
  if (!entry) return;
  entry.alive = false;
  try { if (entry.page) await entry.page.close(); } catch {}
  const i = browserPool.indexOf(entry);
  if (i >= 0) browserPool.splice(i, 1);

  const ref = entry.browserRef;
  if (ref) {
    ref.pageCount = Math.max(0, ref.pageCount - 1);
    if (ref.pageCount === 0 && ref.alive) {
      ref.alive = false;
      try { if (ref.browser) await ref.browser.close(); } catch {}
      const j = browserRegistry.indexOf(ref);
      if (j >= 0) browserRegistry.splice(j, 1);
    }
  }
}

async function closeBrowserInstance(ref) {
  if (!ref || !ref.alive) return;
  ref.alive = false;
  const entries = browserPool.filter(e => e.browserRef === ref);
  for (const e of entries) {
    e.alive = false;
    try { if (e.page) await e.page.close(); } catch {}
    const i = browserPool.indexOf(e);
    if (i >= 0) browserPool.splice(i, 1);
  }
  try { if (ref.browser) await ref.browser.close(); } catch {}
  const j = browserRegistry.indexOf(ref);
  if (j >= 0) browserRegistry.splice(j, 1);
}

// Cleanup: kalau semua tab suatu browser nganggur > POOL_IDLE_MS, tutup browser.
setInterval(() => {
  const now = Date.now();
  for (const ref of [...browserRegistry]) {
    if (!ref.alive) continue;
    const entries = browserPool.filter(e => e.browserRef === ref);
    if (entries.length === 0) continue;
    const allIdle = entries.every(e => !e.busy && e.alive);
    if (!allIdle) continue;
    const oldest = Math.min(...entries.map(e => e.lastUsed));
    if ((now - oldest) > POOL_IDLE_MS) {
      logMessage('i',
        `Pool: tutup browser idle (${Math.round((now - oldest) / 1000)}s, ${entries.length} tab)`);
      closeBrowserInstance(ref);
    }
  }
}, 30000);

// ═══════════════════════════════════════════════════════════════════
// ═══ KEEP-FOCUS LOOP: refresh fokus SEMUA tab setiap 8 detik ═══
// ═══════════════════════════════════════════════════════════════════
// Chromium kadang melepas focus-emulation/lifecycle setelah navigasi
// atau setelah tab baru dibuat. Loop ini memaksa SEMUA tab selalu
// dalam keadaan fokus & visible. Biaya: 3 CDP call per tab per 8s,
// sangat ringan. Hanya berlaku untuk mode turnstile.
// ═══════════════════════════════════════════════════════════════════
setInterval(() => {
  for (const entry of browserPool) {
    if (!entry.alive || !entry.page) continue;
    if (entry.mode !== 'turnstile') continue;
    ensureTabFullyActive(entry.page).catch(() => {});
  }
}, 8000);
// ═══════════════════════════════════════════════════════════════════

process.on('SIGINT', async () => {
  logMessage('i', 'Shutdown: menutup semua browser pool...');
  for (const ref of [...browserRegistry]) {
    await closeBrowserInstance(ref);
  }
  process.exit(0);
});
// ═══════════════════════════════════════════════════════════════════

function loadCache() {
  if (!fs.existsSync(CACHE_FILE)) return {};
  try { return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8')); }
  catch { return {}; }
}

function saveCache(cache) {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2), 'utf-8');
}

function readCache(key) {
  const cache = loadCache();
  const entry = cache[key];
  if (entry && Date.now() - entry.timestamp < CACHE_TTL) {
    return entry.value;
  }
  return null;
}

function writeCache(key, value) {
  const cache = loadCache();
  cache[key] = { timestamp: Date.now(), value };
  saveCache(cache);
}

function updateUrlStats(url, success) {
  if (!url) url = "unknown";
  if (!urlStats[url]) {
    urlStats[url] = { success: 0, failed: 0 };
  }
  if (success) urlStats[url].success++;
  else urlStats[url].failed++;
}

// =============================================

// ===== ANIMASI SPINNER + PROGRESS BAR =====
let spinnerTimer = null;
let progressTimer = null;
const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
let spinnerIndex = 0;
let progressPercent = 0;
let progressBarMessage = '';

function startSpinner(message) {
  if (spinnerTimer) clearInterval(spinnerTimer);
  if (progressTimer) clearInterval(progressTimer);
  spinnerIndex = 0;
  progressPercent = 0;
  progressBarMessage = message;

  lastProgress = 0;
  printStats(0);

  spinnerTimer = setInterval(() => {
    const totalReq = solveStats.total.success + solveStats.total.failed;
    const spinner = SPINNER_FRAMES[spinnerIndex];
    spinnerIndex = (spinnerIndex + 1) % SPINNER_FRAMES.length;
  }, 100);

  progressTimer = setInterval(() => {
    if (progressPercent < 95) {
      progressPercent += Math.random() * 5 + 1;
      if (progressPercent > 95) progressPercent = 95;
      lastProgress = progressPercent;
      printStats(progressPercent);
    }
  }, 300);
}

function stopSpinner(successMessage, finalPercent = 100) {
  if (spinnerTimer) { clearInterval(spinnerTimer); spinnerTimer = null; }
  if (progressTimer) { clearInterval(progressTimer); progressTimer = null; }
  progressPercent = finalPercent;
  lastProgress = finalPercent;
  printStats(finalPercent);
  if (successMessage) logMessage('s', successMessage);
}
// =============================================

// ===== ANIMASI BERKEDIP UPTIME =====
let uptimeBlink = 0;
let lastProgress = 100;

function startUptimeBlink() {
  setInterval(() => {
    uptimeBlink = (uptimeBlink + 1) % 2;
    printStats(lastProgress);
  }, 500);
}
// =============================================

// ===== CETAK STATISTIK =====
let statsLineCount = 0;

function printStats(progress = null) {
  const width = process.stdout.columns || 80;
  const sep = separatorLine(width, [18, 22, 26], [32, 40, 54]);

  const uptimeSec = process.uptime();
  const days = Math.floor(uptimeSec / 86400);
  const hours = Math.floor((uptimeSec % 86400) / 3600);
  const minutes = Math.floor((uptimeSec % 3600) / 60);
  const seconds = Math.floor(uptimeSec % 60);
  const uptimeStr = `${days}d ${hours}h ${minutes}m ${seconds}s`;

  const uptimeColor = uptimeBlink === 0 ? '\x1b[96m' : '\x1b[95m';

  let urlStr = '';
  const entries = Object.entries(urlStats);
  if (entries.length === 0) {
    urlStr = 'No requests yet';
  } else {
    urlStr = entries.map(([url, stat]) => {
      const shortUrl = url.length > 30 ? url.substring(0, 27) + '...' : url;
      return `${shortUrl} (${stat.success}/${stat.failed})`;
    }).join(', ');
  }

  const totalReq = solveStats.total.success + solveStats.total.failed;

  let progressLine = '';
  if (progress !== null && progress < 100) {
    const barLen = 20;
    const filled = Math.round(barLen * (progress / 100));
    const bar = '█'.repeat(filled) + '░'.repeat(barLen - filled);
    progressLine = `\x1b[96m▶ PROGRESS   : \x1b[93m[${bar}] \x1b[97m${Math.round(progress)}%`;
  } else {
    progressLine = `\x1b[96m▶ PROGRESS   : \x1b[92mDONE`;
  }

  const lines = [
    `\x1b[96m▶ TARGET      : \x1b[97mSOLVER SERVER`,
    `\x1b[96m▶ HEMAT KUOTA : ${fmtVerifyStatus(verifyStatus.hematKuota)}`,
    `\x1b[96m▶ BOOST       : ${fmtVerifyStatus(verifyStatus.turnstileBoost)}`,
    `\x1b[96m▶ REQUESTS    : \x1b[97m${totalReq} | Success: \x1b[92m${solveStats.total.success}\x1b[97m, Failed: \x1b[91m${solveStats.total.failed}`,
    progressLine,
    `${uptimeColor}▶ UPTIME      : \x1b[97m${uptimeStr}${RESET}`,
    `\x1b[96m▶ TURNSTILE   : \x1b[97msuccess \x1b[92m${solveStats.turnstile.success}\x1b[97m | failed \x1b[91m${solveStats.turnstile.failed}`,
    `\x1b[96m▶ IUAM        : \x1b[97msuccess \x1b[92m${solveStats.iuam.success}\x1b[97m | failed \x1b[91m${solveStats.iuam.failed}`,
    `\x1b[96m▶ ANTIBOT     : \x1b[97msuccess \x1b[92m${solveStats.antibot.success}\x1b[97m | failed \x1b[91m${solveStats.antibot.failed}`,
    `\x1b[96m▶ URL STATS   : \x1b[97m${urlStr}`,
    `\x1b[96m▶ POOL        : \x1b[97m${poolStats()} \x1b[96m| cache hits \x1b[93m${Object.keys(loadCache()).length}`,
    `\x1b[96m▶ AUTH        : \x1b[97m${authToken ? 'Enabled' : 'Disabled'}`,
    sep
  ];

  if (statsLineCount === 0) statsLineCount = lines.length;

  const bannerLines = 6;
  process.stdout.write(`\x1b[${bannerLines + 1};1H`);
  process.stdout.write('\x1b[J');
  process.stdout.write(lines.join('\n') + '\n');
}
// =============================================

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

app.get("/", (req, res) => {
  res.json({
    message: "Server is running!",
    domain: domain,
    endpoints: {
      cloudflare: `${domain}/cloudflare`,
      antibot: `${domain}/antibot`,
      stats: `${domain}/stats`
    },
    status: {
      browserLimit: global.browserLimit,
      pagesPerBrowser: global.pagesPerBrowser,
      pool: poolStats(),
      timeOut: global.timeOut,
      authRequired: authToken !== null
    }
  });
});

app.get("/stats", (req, res) => {
  res.json({
    uptime: process.uptime(),
    pool: {
      browsers: browserRegistry.filter(b => b.alive).length,
      browsersMax: global.browserLimit,
      pendingSpawns: pendingBrowserSpawns,
      pagesPerBrowser: global.pagesPerBrowser,
      tabs: browserPool.length,
      busy: browserPool.filter(e => e.busy).length,
      entries: browserPool.map(e => ({
        busy: e.busy,
        mode: e.mode,
        idleSec: Math.round((Date.now() - e.lastUsed) / 1000),
        alive: e.alive
      })),
      browsers_detail: browserRegistry.map(b => ({
        alive: b.alive,
        mode: b.mode,
        pageCount: b.pageCount,
        flagsOk: b.flagsOk
      }))
    },
    solveStats: solveStats,
    urlStats: urlStats,
    verifyStatus: verifyStatus
  });
});

if (process.env.NODE_ENV !== 'development') {
  let server = app.listen(port, '0.0.0.0', () => {
    console.clear();
    printBanner();
    logMessage('s', `Server running on port ${port}`);
    logMessage('s', `Listening on all interfaces (0.0.0.0)`);
    logMessage('s', `Domain: ${domain}`);
    logMessage('s', `Auth required: ${authToken !== null}`);
    logMessage('s', `Pool mode: ${global.browserLimit} browser × ${global.pagesPerBrowser} tab = ${global.browserLimit * global.pagesPerBrowser} slot paralel`);
    logMessage('s', `Mode super hemat kuota: ${HEMAT_KUOTA ? 'AKTIF' : 'nonaktif'}`);
    lastProgress = 100;
    printStats(100);
    startUptimeBlink();
  });
  try { server.timeout = global.timeOut; } catch {}
}

const turnstile = require('./endpoints/turnstile');
const cloudflare = require('./endpoints/cloudflare');
const antibot = require('./endpoints/antibot');

try {
  logMessage('i',
    `[VERIFY] Modul endpoints: turnstile=${typeof turnstile === 'function' ? 'OK' : 'MISSING'}, ` +
    `cloudflare=${typeof cloudflare === 'function' ? 'OK' : 'MISSING'}, ` +
    `antibot=${typeof antibot === 'function' ? 'OK' : 'MISSING'}`);
  logMessage('i',
    `[VERIFY] Env: HEMAT_KUOTA=${HEMAT_KUOTA ? '1' : '0'}, ` +
    `browserLimit=${global.browserLimit}, pagesPerBrowser=${global.pagesPerBrowser}, ` +
    `timeOut=${global.timeOut}, cacheDir=${CACHE_DIR}`);
} catch (e) {
  logMessage('e', `[VERIFY] Startup check error: ${e.message}`);
}

if (typeof turnstile.warmupCFCache === 'function') {
  turnstile.warmupCFCache()
    .then(() => {
      const n = turnstile.CF_ASSET_CACHE ? turnstile.CF_ASSET_CACHE.size : 0;
      logMessage('s', `CF asset cache warmed: ${n} asset(s) in RAM`);
    })
    .catch(() => {});
}

app.post('/cloudflare', async (req, res) => {
  const data = req.body;
  if (!data || typeof data.mode !== 'string')
    return res.status(400).json({ message: 'Bad Request: missing or invalid mode' });

  let cacheKey, cached;
  if (data.mode === "iuam") {
    cacheKey = JSON.stringify(data);
    cached = readCache(cacheKey);
    if (cached) {
      logMessage('i', `IUAM Cache hit for ${cacheKey.substring(0, 30)}...`);
      return res.status(200).json({ ...cached, cached: true });
    }
  }

  let result;
  const currentMode = data.mode;
  const startTime = Date.now();
  const sourceUrl = req.headers.origin || req.headers.referer || data.url || 'unknown';

  startSpinner(`⚡ Solving ${currentMode.toUpperCase()} from ${sourceUrl}...`);

  let poolEntry = null;
  try {
    const proxyServer = data.proxy ? `${data.proxy.hostname}:${data.proxy.port}` : null;

    poolEntry = await acquireBrowser(proxyServer, currentMode);
    if (!poolEntry) {
      stopSpinner(`⏱️ Pool timeout untuk ${currentMode}`);
      return res.status(429).json({ message: 'Pool busy, coba lagi nanti' });
    }

    const page = poolEntry.page;

    switch (currentMode) {
      case "turnstile":
        result = await turnstile(data, page).then(t => ({ token: t }));
        break;

      case "iuam":
        result = await cloudflare(data, page).then(r => ({ ...r }));
        writeCache(cacheKey, result);
        break;

      case "antibot":
        result = await antibot(data);
        break;

      default:
        result = { code: 400, message: 'Invalid mode' };
    }

    const duration = Date.now() - startTime;

    if (result && (!result.code || result.code === 200)) {
      solveStats[currentMode].success++;
      solveStats.total.success++;
      updateUrlStats(sourceUrl, true);
      stopSpinner(`✅ ${currentMode.toUpperCase()} solved! (${duration}ms)`);
    } else {
      solveStats[currentMode].failed++;
      solveStats.total.failed++;
      updateUrlStats(sourceUrl, false);
      stopSpinner(`❌ ${currentMode.toUpperCase()} failed! (${duration}ms)`);
    }
  } catch (err) {
    const duration = Date.now() - startTime;
    result = { code: 500, message: err.message };
    solveStats[currentMode].failed++;
    solveStats.total.failed++;
    updateUrlStats(sourceUrl, false);
    stopSpinner(`❌ ${currentMode.toUpperCase()} error! (${duration}ms)`);
    logMessage('e', `Error: ${err.message}`);
  } finally {
    if (poolEntry) {
      let resetOk = false;
      try {
        if (poolEntry.alive && poolEntry.page) {
          await poolEntry.page.goto('about:blank', { timeout: 5000 });
          resetOk = true;
        }
      } catch (e) {
        logMessage('e', `Pool reset page gagal: ${e.message} → recover in-place`);
      }

      if (!resetOk && poolEntry.alive) {
        const recovered = await recoverTabInPlace(poolEntry);
        if (!recovered) {
          await closePoolEntry(poolEntry);
          poolEntry = null;
        }
      }

      if (poolEntry) releaseBrowser(poolEntry);
    }
    if (global.gc) { try { global.gc(); } catch {} }
  }

  res.status(result?.code ?? 200).json(result);
});

app.post("/antibot", async (req, res) => {
  const data = req.body;
  if (!data || !data.main || !Array.isArray(data.bots))
    return res.status(400).json({ message: "Invalid body" });

  const sourceUrl = req.headers.origin || req.headers.referer || data.url || 'unknown';
  startSpinner(`⚡ Solving ANTIBOT from ${sourceUrl}...`);

  try {
    const result = await antibot(data);
    solveStats.antibot.success++;
    solveStats.total.success++;
    updateUrlStats(sourceUrl, true);
    stopSpinner('✅ ANTIBOT solved!');
    res.json(result);
  } catch (err) {
    solveStats.antibot.failed++;
    solveStats.total.failed++;
    updateUrlStats(sourceUrl, false);
    stopSpinner('❌ ANTIBOT failed!');
    logMessage('e', `Error: ${err.message}`);
    res.status(500).json({ message: err.message });
  }
});

app.use((req, res) => {
  res.status(404).json({ message: 'Not Found' });
});

setInterval(() => {
  if (global.gc) { try { global.gc(); } catch {} }
}, 60000);

if (process.env.NODE_ENV === 'development') {
  module.exports = app;
}
