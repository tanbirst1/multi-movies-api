// api/header.js

// In-memory cache for 500 errors with size limit
const errorCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const MAX_CACHE_SIZE = 100; // Limit cache entries

// Global limits
const MAX_ITERATIONS = 1000;
const MAX_ARTICLES = 500;
const MAX_TOP_ITEMS = 100;

// Utility to clean cache
function cleanCache() {
  if (errorCache.size > MAX_CACHE_SIZE) {
    const oldestKey = errorCache.keys().next().value;
    errorCache.delete(oldestKey);
  }
}

// --- helpers ---
function stripDomain(url) {
  if (!url) return url;
  return url.replace(/^https?:\/\/[^/]+/i, "");
}

// Prefer data-src over src on lazy images
function extractImg(blockHtml) {
  const dataSrc = /<img[^>]*\bdata-src=(?:"|')([^"']+)(?:"|')[^>]*>/i.exec(blockHtml);
  const src = /<img[^>]*\bsrc=(?:"|')([^"']+)(?:"|')[^>]*>/i.exec(blockHtml);
  let img = (dataSrc ? dataSrc[1] : (src ? src[1] : null)) || null;
  if (img && img.startsWith("data:image/")) {
    const fallback = /data-src=(?:"|')([^"']+)(?:"|')/i.exec(blockHtml);
    img = fallback ? fallback[1] : img;
  }
  if (img) img = img.replace(/-\d+x\d+(\.\w{2,6})$/i, "$1");
  return img;
}

// Balanced <div> extractor
function extractBalancedDiv(html, openIndex) {
  const openTagEnd = html.indexOf(">", openIndex);
  if (openTagEnd === -1) return null;
  let depth = 1;
  const re = /<div\b|<\/div>/gi;
  re.lastIndex = openTagEnd + 1;
  let m;
  while ((m = re.exec(html)) !== null) {
    if (m[0].toLowerCase() === "<div") depth++;
    else depth--;
    if (depth === 0) {
      return { start: openIndex, end: re.lastIndex };
    }
  }
  return null;
}

export default async function handler(req, res) {
  const TARGET = "https://multimovies.lol/";

  // Check error cache
  const cacheKey = `error_${TARGET}`;
  const cachedError = errorCache.get(cacheKey);
  if (cachedError && Date.now() - cachedError.timestamp < CACHE_TTL) {
    return res.status(500).json({ error: cachedError.message, cached: true });
  }

  try {
    // Fetch with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    const r = await fetch(TARGET, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        Connection: "keep-alive",
        Referer: "https://multimovies.coupons/",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "same-origin",
        "Sec-Fetch-User": "?1",
        "Upgrade-Insecure-Requests": "1",
      },
    }).finally(() => clearTimeout(timeoutId));

    if (!r.ok) {
      const error = { error: "fetch_failed", status: r.status };
      errorCache.set(cacheKey, { message: JSON.stringify(error), timestamp: Date.now() });
      cleanCache();
      return res.status(502).json(error);
    }

    const html = await r.text();

    // --- Parsing Logic ---
    const headerRegex = /<header[^>]*>[\s\S]*?<h2[^>]*>([^<]+)<\/h2>[\s\S]*?<\/header>/gi;
    const headers = [];
    let hMatch, iterationCount = 0;
    while ((hMatch = headerRegex.exec(html)) !== null && iterationCount < MAX_ITERATIONS) {
      const name = hMatch[1]?.trim();
      if (name) headers.push({ name, headerEnd: hMatch.index + hMatch[0].length });
      iterationCount++;
    }
    if (iterationCount >= MAX_ITERATIONS) throw new Error("Max header iterations reached");

    function findItemsDivStart(fromPos) {
      const sub = html.slice(fromPos);
      const m = /<div\b[^>]*\bclass=(?:"|')[^"']*?\bitems\b[^"']*(?:"|')[^>]*>/i.exec(sub);
      return m ? fromPos + m.index : -1;
    }

    function extractArticlesBetween(startPos, endPos) {
      const scope = html.slice(startPos, endPos === -1 ? undefined : endPos);
      const articleRegex = /<article\b[\s\S]*?<\/article>/gi;
      const out = [];
      let a, count = 0;
      while ((a = articleRegex.exec(scope)) !== null && count < MAX_ARTICLES) {
        out.push(a[0]); count++;
      }
      return out;
    }

    function parseArticleBlock(blockHtml) {
      try {
        const idMatch = /id=(?:"|')(?:post(?:-featured)?-(\d+))(?:["'])/i.exec(blockHtml);
        const id = idMatch ? idMatch[1] : null;
        const img = extractImg(blockHtml);

        const ratingMatch = /<div[^>]*class=(?:"|')[^"']*?\brating\b[^"']*(?:"|')[^>]*>([^<]+)<\/div>/i.exec(blockHtml);
        const rating = ratingMatch ? ratingMatch[1].trim() : null;

        const urlMatch =
          /<a[^>]*\bhref=(?:"|')([^"']+)(?:"|')[^>]*>[^<]*<div[^>]*class=(?:"|')[^"']*?\bsee\b/i.exec(blockHtml) ||
          /<h3>[\s\S]*?<a[^>]*\bhref=(?:"|')([^"']+)(?:"|')[^>]*>/i.exec(blockHtml) ||
          /<a[^>]*\bhref=(?:"|')([^"']+)(?:"|')[^>]*>\s*<img/i.exec(blockHtml);
        let url = urlMatch ? urlMatch[1] : null;
        url = stripDomain(url);

        const titleMatch = /<h3[^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>/i.exec(blockHtml);
        const title = titleMatch ? titleMatch[1].trim() : null;

        return { id, img, rating, url, title };
      } catch {
        return null;
      }
    }

    const sections = {};
    for (let i = 0; i < headers.length; i++) {
      const sec = headers[i];
      const nextHeader = headers[i + 1];
      const divStart = findItemsDivStart(sec.headerEnd);
      if (divStart === -1) continue;
      const scanEnd = nextHeader ? nextHeader.headerEnd : -1;
      const articlesHtml = extractArticlesBetween(divStart, scanEnd);
      const items = articlesHtml.map(parseArticleBlock).filter(it => it && it.title && it.url);
      if (items.length) sections[sec.name] = items;
    }

    // === Extra: Slider Section ===
    (function parseSlider() {
      const openMatch = /<div[^>]*\bid=(?:"|')slider-movies-tvshows(?:"|')[^>]*>/i.exec(html);
      if (!openMatch) return;
      const balanced = extractBalancedDiv(html, openMatch.index);
      if (!balanced) return;
      const sliderScope = html.slice(balanced.start, balanced.end);
      const articleRegex = /<article\b[\s\S]*?<\/article>/gi;
      const out = [];
      let m, count = 0;
      while ((m = articleRegex.exec(sliderScope)) !== null && count < 200) {
        const item = parseArticleBlock(m[0]);
        if (item && item.title && item.url) out.push(item);
        count++;
      }
      if (out.length) sections["Slider Movies & TV Shows"] = out;
    })();

    // Fallback parsing if no sections
    if (Object.keys(sections).length === 0) {
      sections["Movies"] = [];
    }

    const summary = {};
    for (const k of Object.keys(sections)) summary[k] = sections[k].length;

    res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=86400");
    return res.status(200).json({ status: "ok", counts: summary, sections });
  } catch (err) {
    const errorMessage = err.name === "AbortError" ? "Fetch timeout" : err.message || "Internal error";
    errorCache.set(cacheKey, { message: errorMessage, timestamp: Date.now() });
    cleanCache();
    return res.status(500).json({ error: errorMessage });
  }
}
