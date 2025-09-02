// In-memory cache
let CACHE = { ts: 0, data: null };
const CACHE_TTL = 500 * 1000; // 500 seconds

export default async function handler(req, res) {
  // --- Return cached data if still valid ---
  const now = Date.now();
  if (CACHE.data && now - CACHE.ts < CACHE_TTL) {
    return res.status(200).json(CACHE.data);
  }

  // Default target
  let TARGET = "https://multimovies.pro";

  // Optional: load custom target from ../src/baseurl.txt if exists
  try {
    const fs = await import("fs/promises");
    const path = await import("path");
    const filePath = path.resolve(process.cwd(), "src/baseurl.txt");
    const text = (await fs.readFile(filePath, "utf8")).trim();
    if (text) TARGET = text;
  } catch (e) {
    // ignore if file missing
  }

  try {
    const r = await fetch(TARGET, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Connection": "keep-alive",
      },
    });

    if (!r.ok) {
      return res.status(502).json({ error: "fetch_failed", status: r.status });
    }

    const html = await r.text();

    // === Existing parsing logic (sections) ===
    const headerRegex = /<header[^>]*>[\s\S]*?<h2[^>]*>([^<]+)<\/h2>[\s\S]*?<\/header>/gi;
    const headers = [];
    let hMatch;
    while ((hMatch = headerRegex.exec(html)) !== null) {
      const name = hMatch[1].trim();
      const headerEnd = hMatch.index + hMatch[0].length;
      headers.push({ name, headerEnd });
    }

    function findItemsDivStart(fromPos) {
      const sub = html.slice(fromPos);
      const itemsDivRegex = /<div\b[^>]*\bclass=(?:"|')[^"']*?\bitems\b[^"']*(?:"|')[^>]*>/i;
      const m = itemsDivRegex.exec(sub);
      if (!m) return -1;
      return fromPos + m.index;
    }

    function extractArticlesBetween(startPos, endPos) {
      const scope = html.slice(startPos, endPos === -1 ? undefined : endPos);
      const articleRegex = /<article\b[\s\S]*?<\/article>/gi;
// In-memory cache let CACHE = { ts: 0, data: null }; const CACHE_TTL = 500 * 1000; // 500 seconds

export default async function handler(req, res) { const now = Date.now(); if (CACHE.data && now - CACHE.ts < CACHE_TTL) { return res.status(200).json(CACHE.data); }

let TARGET = "https://multimovies.pro"; try { const fs = await import("fs/promises"); const path = await import("path"); const filePath = path.resolve(process.cwd(), "src/baseurl.txt"); const text = (await fs.readFile(filePath, "utf8")).trim(); if (text) TARGET = text; } catch (e) { // ignore missing file }

try { const r = await fetch(TARGET, { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0 Safari/537.36", }, }); if (!r.ok) { return res.status(502).json({ error: "fetch_failed", status: r.status }); }

const html = await r.text();

// --- helpers ---
function parseArticleBlock(blockHtml) {
  const idMatch = /post(?:-featured)?-(\d+)/i.exec(blockHtml);
  const id = idMatch ? idMatch[1] : null;

  const imgMatch =
    /<img[^>]*data-src=(?:"|')([^"']+)(?:"|')/i.exec(blockHtml) ||
    /<img[^>]*src=(?:"|')([^"']+)(?:"|')/i.exec(blockHtml);
  let img = imgMatch ? imgMatch[1] : null;
  if (img) img = img.replace(/-\d+x\d+(\.\w{2,6})$/i, "$1");

  const ratingMatch = /<b>(\d+\.\d+)<\/b>/i.exec(blockHtml);
  const rating = ratingMatch ? ratingMatch[1] : null;

  const yearMatch = /<span[^>]*class=(?:"|')year(?:"|')[^>]*>(\d{4})<\/span>/i.exec(blockHtml);
  const year = yearMatch ? yearMatch[1] : null;

  const urlMatch = /<a[^>]*href=(?:"|')([^"']+)(?:"|')/i.exec(blockHtml);
  let url = urlMatch ? urlMatch[1] : null;
  if (url) url = url.replace(/^https?:\/\/[^/]+/i, "");

  const titleMatch = /<h3[^>]*>([^<]+)<\/h3>/i.exec(blockHtml);
  const title = titleMatch ? titleMatch[1].trim() : null;

  return { id, img, rating, year, url, title };
}

// --- Parse sections (Featured/Movies) ---
const headerRegex = /<header[^>]*>[\s\S]*?<h2[^>]*>([^<]+)<\/h2>[\s\S]*?<\/header>/gi;
const sections = {};
let hMatch;
while ((hMatch = headerRegex.exec(html)) !== null) {
  const name = hMatch[1].trim();
  const from = hMatch.index + hMatch[0].length;
  const sub = html.slice(from);
  const itemsDivRegex = /<div[^>]*class=(?:"|')[^"']*\bitems\b[^"']*(?:"|')[^>]*>[\s\S]*?<\/div>/i;
  const m = itemsDivRegex.exec(sub);
  if (!m) continue;
  const block = m[0];
  const articleRegex = /<article[\s\S]*?<\/article>/gi;
  const arr = [];
  let a;
  while ((a = articleRegex.exec(block)) !== null) {
    const item = parseArticleBlock(a[0]);
    if (item.title) arr.push(item);
  }
  if (arr.length) sections[name] = arr;
}

// --- Parse Most Popular ---
const asideRegex = /<aside[^>]*class="widget doothemes_widget"[^>]*>[\s\S]*?<\/aside>/i;
const asideMatch = asideRegex.exec(html);
if (asideMatch) {
  const asideHtml = asideMatch[0];
  const articleRegex = /<article[\s\S]*?<\/article>/gi;
  const arr = [];
  let a;
  while ((a = articleRegex.exec(asideHtml)) !== null) {
    const item = parseArticleBlock(a[0]);
    if (item.title) arr.push(item);
  }
  if (arr.length) sections["Most Popular"] = arr;
}

// --- Parse Top Movies ---
const topRegex = /<div[^>]*class=(?:'|")top-imdb-list[^>]*>[\s\S]*?<\/div>/i;
const topMatch = topRegex.exec(html);
if (topMatch) {
  const topHtml = topMatch[0];
  const itemRegex = /<div[^>]*class=(?:'|")top-imdb-item[^>]*>[\s\S]*?<\/div>/gi;
  const arr = [];
  let m;
  while ((m = itemRegex.exec(topHtml)) !== null) {
    const block = m[0];
    const idMatch = /id='top-(\d+)'/i.exec(block);
    const id = idMatch ? idMatch[1] : null;

    const urlMatch = /<a href='([^']+)'/i.exec(block);
    let url = urlMatch ? urlMatch[1] : null;
    if (url) url = url.replace(/^https?:\/\/[^/]+/i, "");

    const titleMatch = /<div class='title'><a [^>]*>([^<]+)<\/a><\/div>/i.exec(block);
    const title = titleMatch ? titleMatch[1].trim() : null;

    const imgMatch = /data-src='([^']+)'/i.exec(block);
    let img = imgMatch ? imgMatch[1] : null;
    if (img) img = img.replace(/-\d+x\d+(\.\w{2,6})$/i, "$1");

    const ratingMatch = /<div class='rating'>([^<]+)<\/div>/i.exec(block);
    const rating = ratingMatch ? ratingMatch[1].trim() : null;

    const rankMatch = /<div class='puesto'>(\d+)<\/div>/i.exec(block);
    const rank = rankMatch ? rankMatch[1] : null;

    arr.push({ id, title, url, img, rating, rank });
  }
  if (arr.length) sections["Top Movies"] = arr;
}

const payload = { status: "ok", sections };
CACHE = { ts: now, data: payload };

return res.status(200).json(payload);

} catch (err) { return res.status(500).json({ error: err.message || String(err) }); } }

