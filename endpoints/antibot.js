const fs = require('fs');
const path = require('path');
// Pastikeun file imageProcessor.js aya dina folder anu sarua
const { extractTextFromImage } = require('./imageProcessor');

// --- KONFIGURASI & MAPPING ---
const NUMBER_WORDS = {
  'nol': '0', 'satu': '1', 'dua': '2', 'tiga': '3', 'empat': '4', 'lima': '5',
  'enam': '6', 'tujuh': '7', 'delapan': '8', 'sembilan': '9', 'sepuluh': '10',
  'sebelas': '11', 'one': '1', 'two': '2', 'three': '3', 'four': '4', 'five': '5',
  'six': '6', 'seven': '7', 'eight': '8', 'nine': '9', 'ten': '10',
  'zero': '0', 'eleven': '11', 'twelve': '12'
};

const LEET_MAP = {
  '4': 'a', '@': 'a', '8': 'b', '3': 'e', '6': 'g', '1': 'i', '!': 'i', '0': 'o',
  '5': 's', '$': 's', '7': 't', '+': 't', '2': 'z'
};

// --- FUNGSI HELPER ---
function safeString(s) { return (s || '').toString(); }

function normalizeText(text) {
  let normalized = safeString(text).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  normalized = normalized.toLowerCase();
  
  // Apply Leet Map (anti-deteksi karakter anéh)
  let leetOut = '';
  for (const ch of normalized) { leetOut += (LEET_MAP[ch] !== undefined) ? LEET_MAP[ch] : ch; }
  normalized = leetOut;
  
  // Beberesih karakter non-alfanumerik
  normalized = normalized.replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  
  // Mapping kecap angka jadi digit
  const tokens = normalized.split(/\s+/);
  return tokens.map(t => NUMBER_WORDS[t] !== undefined ? NUMBER_WORDS[t] : t).join(' ');
}

function levenshtein(a = '', b = '') {
  const alen = a.length, blen = b.length;
  if (alen === 0) return blen;
  if (blen === 0) return alen;
  const matrix = Array.from({ length: alen + 1 }, () => new Array(blen + 1));
  for (let i = 0; i <= alen; i++) matrix[i][0] = i;
  for (let j = 0; j <= blen; j++) matrix[0][j] = j;
  for (let i = 1; i <= alen; i++) {
    for (let j = 1; j <= blen; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(matrix[i - 1][j] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j - 1] + cost);
    }
  }
  return matrix[alen][blen];
}

function similarity(a, b) {
  a = normalizeText(a); b = normalizeText(b);
  if (a === b || a.includes(b) || b.includes(a)) return 1;
  const dist = levenshtein(a, b);
  const maxLen = Math.max(a.length, b.length);
  return maxLen === 0 ? 1 : 1 - (dist / maxLen);
}

// --- LOGIKA UTAMA SOLVER ---
async function solve(data) {
  try {
    console.log("🛠️  Processing Antibot Challenge...");
    
    const mainBuffer = Buffer.from(data.main, 'base64');
    const botsBuffers = data.bots.map(b => Buffer.from(b, 'base64'));

    // OCR Gambar Instruksi Utama
    const mainOCR = await extractTextFromImage(mainBuffer);
    let rawMain = (mainOCR.response || "").toLowerCase();
    console.log("🎯 Raw Instruction:", rawMain);

    // --- BAGIAN TARGET NU DIUBAH (LEMBUT TAPI TEGAS) ---
    const targets = rawMain
      .replace(/please\s*click\s*on\s*the\s*anti-bot\s*links\s*in\s*the\s*following\s*order/gi, '')
      .replace(/[:.,|+&-]/g, ' ') // Ganti karakter separator ku spasi
      .split(/\s+/) 
      .filter(t => t.length > 0 && t !== 'and');

    console.log("🔍 Cleaned Targets:", targets);

    // OCR Kabéh Gambar Pilihan (Bots)
    const botResults = [];
    for (let i = 0; i < botsBuffers.length; i++) {
      const res = await extractTextFromImage(botsBuffers[i]);
      botResults.push({
        index: (i + 1).toString(), 
        text: normalizeText(res.response || "")
      });
      console.log(`🖼️  Bot ${i+1} OCR: "${res.response}"`);
    }

    // Matching Strategy
    let finalOrder = [];
    let usedIndices = new Set();

    for (const target of targets) {
      let bestMatch = { index: null, score: -1 };
      
      for (const bot of botResults) {
        if (usedIndices.has(bot.index)) continue;
        
        const score = similarity(bot.text, target);
        if (score > bestMatch.score) {
          bestMatch = { index: bot.index, score: score };
        }
      }

      // Skor minimal 0.3 (30%) bisi OCR-na rada burem
      if (bestMatch.index && bestMatch.score > 0.3) {
        finalOrder.push(bestMatch.index);
        usedIndices.add(bestMatch.index);
      }
    }

    // Fallback: Mun aya bot nu can kapaéh, asupkeun dumasar urutan
    if (finalOrder.length < botsBuffers.length) {
       botResults.forEach(b => {
         if(!usedIndices.has(b.index)) finalOrder.push(b.index);
       });
    }

    // Pastikeun ngan ngirim jumlah nu sarua jeung bot nu aya
    finalOrder = finalOrder.slice(0, botsBuffers.length);

    console.log("✅ Final Solution:", finalOrder.join(", "));
    return { status: "Success", result: finalOrder };

  } catch (error) {
    console.error("❌ Solver Error:", error.message);
    return { status: "Error", message: error.message, result: ["1", "2", "3"] };
  }
}

module.exports = solve;
