const express = require('express');
const { connect } = require("puppeteer-real-browser");
const fs = require('fs');
const path = require('path');

const app = express();
const port = process.env.PORT || 7860;
const authToken = process.env.authToken || null;
const domain = process.env.DOMAIN || `https://forgets-Me12.hf.space`;

global.browserLimit = Number(process.env.browserLimit) || 100;
global.timeOut = Number(process.env.timeOut) || 60000;

const CACHE_DIR = path.join(__dirname, "cache");
const CACHE_FILE = path.join(CACHE_DIR, "cache.json");
const CACHE_TTL = 5 * 60 * 1000;

function loadCache() {
  if (!fs.existsSync(CACHE_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
  } catch {
    return {};
  }
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

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

app.get("/", (req, res) => {
  res.json({
    message: "Server is running!",
    domain: domain,
    endpoints: {
      cloudflare: `${domain}/cloudflare`,
      antibot: `${domain}/antibot`
    },
    status: {
      browserLimit: global.browserLimit,
      timeOut: global.timeOut,
      authRequired: authToken !== null
    }
  });
});

if (process.env.NODE_ENV !== 'development') {
  let server = app.listen(port, () => {
    console.log(`Server running on port ${port}`);
    console.log(`Domain: ${domain}`);
    console.log(`Auth required: ${authToken !== null}`);
  });
  try {
    server.timeout = global.timeOut;
  } catch {}
}

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
    const type = req.resourceType();
    if (["image", "stylesheet", "font", "media"].includes(type)) req.abort();
    else req.continue();
  });

  return { browser, page };
}

const turnstile = require('./endpoints/turnstile');
const cloudflare = require('./endpoints/cloudflare');
const antibot = require('./endpoints/antibot');

app.post('/cloudflare', async (req, res) => {
  const data = req.body;
  if (!data || typeof data.mode !== 'string')
    return res.status(400).json({ message: 'Bad Request: missing or invalid mode' });

  if (global.browserLimit <= 0)
    return res.status(429).json({ message: 'Too Many Requests' });

  let cacheKey, cached;
  if (data.mode === "iuam") {
    cacheKey = JSON.stringify(data);
    cached = readCache(cacheKey);
    if (cached) return res.status(200).json({ ...cached, cached: true });
  }

  global.browserLimit--;
  let result, browser;

  try {
    const proxyServer = data.proxy ? `${data.proxy.hostname}:${data.proxy.port}` : null;
    const ctx = await createBrowser(proxyServer);
    browser = ctx.browser;
    const page = ctx.page;

    await page.goto('about:blank');

    switch (data.mode) {
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
  } catch (err) {
    result = { code: 500, message: err.message };
  } finally {
    if (browser) try { await browser.close(); } catch {}
    global.browserLimit++;
  }

  res.status(result.code ?? 200).json(result);
});

app.post("/antibot", async (req, res) => {
  const data = req.body;

  if (!data || !data.main || !Array.isArray(data.bots))
    return res.status(400).json({ message: "Invalid body" });

  try {
    const result = await antibot(data);
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.use((req, res) => {
  res.status(404).json({ message: 'Not Found' });
});

if (process.env.NODE_ENV === 'development') {
  module.exports = app;
}
