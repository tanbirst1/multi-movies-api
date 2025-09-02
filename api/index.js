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
      const out = [];
      let a;
      while ((a = articleRegex.exec(scope)) !== null) {
        out.push(a[0]);
      }
      return out;
    }

    function parseArticleBlock(blockHtml) {
      const idMatch = /post(?:-featured)?-(\d+)/i.exec(blockHtml);
      const id = idMatch ? idMatch[1] : null;

      const imgMatch = /<img[^>]*\bdata-src=(?:"|')([^"']+)(?:"|')/i.exec(blockHtml) 
                    || /<img[^>]*\bsrc=(?:"|')([^"']+)(?:"|')/i.exec(blockHtml);
      let img = imgMatch ? imgMatch[1] : null;
      if (img) img = img.replace(/-\d+x\d+(\.\w{2,6})$/i, "$1");

      const ratingMatch = /<b>(\d+\.\d+)<\/b>/i.exec(blockHtml);
      const rating = ratingMatch ? ratingMatch[1] : null;

      const yearMatch = /<span[^>]*class=(?:"|')year(?:"|')[^>]*>(\d{4})<\/span>/i.exec(blockHtml);
      const year = yearMatch ? yearMatch[1] : null;

      const urlMatch = /<a[^>]*\bhref=(?:"|')([^"']+)(?:"|')/i.exec(blockHtml);
      let url = urlMatch ? urlMatch[1] : null;
      if (url) url = url.replace(/^https?:\/\/[^/]+/i, "");

      const titleMatch = /<h3[^>]*>([^<]+)<\/h3>/i.exec(blockHtml);
      const title = titleMatch ? titleMatch[1].trim() : null;

      return { id, img, rating, year, url, title };
    }

    const sections = {};
    for (let i = 0; i < headers.length; i++) {
      const sec = headers[i];
      const nextHeader = headers[i + 1];
      const divStart = findItemsDivStart(sec.headerEnd);
      if (divStart === -1) continue;
      const scanEnd = nextHeader ? nextHeader.headerEnd : -1;
      const articlesHtml = extractArticlesBetween(divStart, scanEnd);
      const items = [];
      for (const artHtml of articlesHtml) {
        const item = parseArticleBlock(artHtml);
        if (item.title && item.url) items.push(item);
      }
      sections[sec.name] = items;
    }

    // === New: Parse "Most Popular" aside ===
    const asideRegex = /<aside[^>]*class="widget doothemes_widget"[^>]*>[\s\S]*?<\/aside>/i;
    const asideMatch = asideRegex.exec(html);
    if (asideMatch) {
      const asideHtml = asideMatch[0];
      const articleRegex = /<article\b[\s\S]*?<\/article>/gi;
      const items = [];
      let m;
      while ((m = articleRegex.exec(asideHtml)) !== null) {
        const item = parseArticleBlock(m[0]);
        if (item.title && item.url) items.push(item);
      }
      if (items.length) sections["Most Popular"] = items;
    }

    const summary = {};
    for (const k of Object.keys(sections)) summary[k] = sections[k].length;

    const payload = { status: "ok", counts: summary, sections };

    // Save to cache
    CACHE = { ts: now, data: payload };

    return res.status(200).json(payload);
  } catch (err) {
    return res.status(500).json({ error: err.message || String(err) });
  }
}
