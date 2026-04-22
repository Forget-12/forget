const express = require('express');
const { connect } = require("puppeteer-real-browser");
const fs = require('fs');
const path = require('path');

const app = express();
const port = process.env.PORT || 7860;
const authToken = process.env.authToken || null;
const domain = process.env.DOMAIN || `https://forgets-Public.hf.space`;

// Konfigurasi Global
global.browserLimit = Number(process.env.browserLimit) || 30;
global.timeOut = Number(process.env.timeOut) || 120000;

// Cache System (Pikeun Cloudflare/Turnstile)
const CACHE_DIR = path.join(__dirname, "cache");
const CACHE_FILE = path.join(CACHE_DIR, "cache.json");
const CACHE_TTL = 5 * 60 * 1000;

function loadCache() {
  if (!fs.existsSync(CACHE_FILE)) return {};
  try { return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8')); } catch { return {}; }
}

function saveCache(cache) {
  if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2), 'utf-8');
}

// Middleware
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// --- IMPORT ENDPOINTS ---
// Ngaran variabel dijieun béda (solveAntibot) meh teu bentrok jeung route /antibot
const solveTurnstile = require('./endpoints/turnstile');
const solveCloudflare = require('./endpoints/cloudflare');
const solveAntibot = require('./endpoints/antibot');

// Dashboard Status
app.get("/", (req, res) => {
  res.json({
    message: "Server is running!",
    endpoints: {
      cloudflare: `${domain}/cloudflare`,
      antibot: `${domain}/antibot`
    },
    status: {
      browserLimit: global.browserLimit,
      authRequired: authToken !== null
    }
  });
});

// Browser Creator Utility
async function createBrowser(proxyServer = null) {
  const connectOptions = {
    headless: false,
    turnstile: true,
    connectOption: { defaultViewport: null },
    disableXvfb: false,
  };
  if (proxyServer) connectOptions.args = [`--proxy-server=${proxyServer}`];

  const { browser } = await connect(connectOptions);
  const [page] = await browser.pages();

  await page.goto('about:blank');
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    if (["image", "stylesheet", "font", "media"].includes(req.resourceType())) req.abort();
    else req.continue();
  });

  return { browser, page };
}

// --- ROUTE: ANTIBOT (KHUSUS PHP BOT) ---
app.post("/antibot", async (req, res) => {
  const data = req.body;

  // Validasi data ti PHP
  if (!data || !data.main || !Array.isArray(data.bots)) {
    return res.status(400).json({ message: "Body format salah (kudu aya main & bots array)" });
  }

  try {
    console.log("Menerima tantangan Antibot...");
    // Manggil fungsi solveAntibot tina folder endpoints/
    const result = await solveAntibot(data);
    
    // Kirim hasilna balik ka PHP
    res.json(result);
  } catch (err) {
    console.error("Error Antibot:", err.message);
    res.status(500).json({ message: err.message });
  }
});

// --- ROUTE: CLOUDFLARE/TURNSTILE ---
app.post('/cloudflare', async (req, res) => {
  const data = req.body;
  if (!data || !data.mode) return res.status(400).json({ message: 'Missing mode' });

  if (global.browserLimit <= 0) return res.status(429).json({ message: 'Server Busy' });

  global.browserLimit--;
  let result, browser;

  try {
    const proxyServer = data.proxy ? `${data.proxy.hostname}:${data.proxy.port}` : null;
    const ctx = await createBrowser(proxyServer);
    browser = ctx.browser;
    const page = ctx.page;

    switch (data.mode) {
      case "turnstile":
        const token = await solveTurnstile(data, page);
        result = { token };
        break;
      case "iuam":
        result = await solveCloudflare(data, page);
        break;
      default:
        result = { code: 400, message: 'Invalid mode' };
    }
  } catch (err) {
    result = { code: 500, message: err.message };
  } finally {
    if (browser) await browser.close();
    global.browserLimit++;
  }

  res.status(result.code ?? 200).json(result);
});

// Start Server
const server = app.listen(port, () => {
  console.log(`API Server jalan dina port ${port}`);
});
server.timeout = global.timeOut;
