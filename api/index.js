// In-memory cache for 500 errors with size limit
const errorCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const MAX_CACHE_SIZE = 100; // Limit cache entries

// Utility to clean cache
function cleanCache() {
  if (errorCache.size > MAX_CACHE_SIZE) {
    const oldestKey = errorCache.keys().next().value;
    errorCache.delete(oldestKey);
  }
}

export default async function handler(req, res) {
  // Default target
  let TARGET = "https://multimovies.pro";

  // Optional: load custom target from ../src/baseurl.txt if exists
  try {
    // Check if running in a serverless environment with file system access
    const { default: fs } = await import("fs/promises").catch(() => ({}));
    const { default: path } = await import("path").catch(() => ({}));
    if (fs && fs.readFile && path && path.resolve) {
      const filePath = path.resolve(process.cwd(), "src/baseurl.txt");
      const text = await fs.readFile(filePath, "utf8").catch(() => "");
      if (text) TARGET = text.trim();
    }
  } catch (e) {
    console.error("Failed to read baseurl.txt:", e.message);
    // Continue with default TARGET
  }

  // Check cache for previous 500 error
  const cacheKey = `error_${TARGET}`;
  const cachedError = errorCache.get(cacheKey);
  if (cachedError && Date.now() - cachedError.timestamp < CACHE_TTL) {
    return res.status(500).json({ error: cachedError.message, cached: true });
  }

  try {
    // Add timeout to fetch
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout
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

    // === Parsing logic ===
    const headerRegex = /<header[^>]*>[\s\S]*?<h2[^>]*>([^<]+)<\/h2>[\s\S]*?<\/header>/gi;
    const headers = [];
    let hMatch;
    let iterationCount = 0;
    const MAX_ITERATIONS = 1000; // Prevent infinite loops
    while ((hMatch = headerRegex.exec(html)) !== null && iterationCount < MAX_ITERATIONS) {
      const name = hMatch[1]?.trim();
      if (name) headers.push({ name, headerEnd: hMatch.index + hMatch[0].length });
      iterationCount++;
    }
    if (iterationCount >= MAX_ITERATIONS) {
      throw new Error("Maximum iterations reached in header parsing");
    }

    function findItemsDivStart(fromPos) {
      const sub = html.slice(fromPos);
      const itemsDivRegex = /<div\b[^>]*\bclass=(?:"|')[^"']*?\bitems\b[^"']*(?:"|')[^>]*>/i;
      const m = itemsDivRegex.exec(sub);
      return m ? fromPos + m.index : -1;
    }

    function extractArticlesBetween(startPos, endPos) {
      const scope = html.slice(startPos, endPos === -1 ? undefined : endPos);
      const articleRegex = /<article\b[\s\S]*?<\/article>/gi;
      const out = [];
      let a;
      let articleCount = 0;
      const MAX_ARTICLES = 500; // Prevent excessive memory usage
      while ((a = articleRegex.exec(scope)) !== null && articleCount < MAX_ARTICLES) {
        out.push(a[0]);
        articleCount++;
      }
      if (articleCount >= MAX_ARTICLES) {
        console.warn("Maximum article limit reached");
      }
      return out;
    }

    function parseArticleBlock(blockHtml) {
      try {
        const idMatch = /post(?:-featured)?-(\d+)/i.exec(blockHtml);
        const id = idMatch ? idMatch[1] : null;

        const imgMatch = /<img[^>]*\bsrc=(?:"|')([^"']+)(?:"|')[^>]*>/i.exec(blockHtml);
        let img = imgMatch ? imgMatch[1] : null;
        if (img) img = img.replace(/-\d+x\d+(\.\w{2,6})$/i, "$1");

        const ratingMatch = /<div[^>]*\bclass=(?:"|')[^"']*?\brating\b[^"']*(?:"|')[^>]*>([^<]+)<\/div>/i.exec(blockHtml);
        const rating = ratingMatch ? ratingMatch[1].trim() : null;

        const urlMatch =
          /<a[^>]*\bhref=(?:"|')([^"']+)(?:"|')[^>]*>[^<]*<div[^>]*class=(?:"|')[^"']*?\bsee\b[^"']*(?:"|')/i.exec(blockHtml) ||
          /<h3>[\s\S]*?<a[^>]*\bhref=(?:"|')([^"']+)(?:"|')[^>]*>/i.exec(blockHtml);
        let url = urlMatch ? urlMatch[1] : null;
        if (url) url = url.replace(/^https?:\/\/[^/]+/i, "");

        const titleMatch = /<h3[^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>[\s\S]*?<\/h3>/i.exec(blockHtml);
        const title = titleMatch ? titleMatch[1].trim() : null;

        const dateMatch = /<h3[\s\S]*?<\/h3>\s*<span[^>]*>([^<]+)<\/span>/i.exec(blockHtml);
        const date = dateMatch ? dateMatch[1].trim() : null;

        return { id, img, rating, url, title, date };
      } catch (e) {
        console.error("Error parsing article block:", e.message);
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
      const items = [];
      for (const artHtml of articlesHtml) {
        const item = parseArticleBlock(artHtml);
        if (item && item.title && item.url) items.push(item);
      }
      if (items.length) sections[sec.name] = items;
    }

    // Additional section: Latest Releases
    const latestReleasesRegex = /<section[^>]*class=(?:"|')[^"']*?\blatest-releases\b[^"']*(?:"|')[^>]*>[\s\S]*?<div[^>]*class=(?:"|')[^"']*?\bitems\b[^"']*(?:"|')[^>]*>([\s\S]*?)<\/div>/i;
    const latestMatch = latestReleasesRegex.exec(html);
    if (latestMatch) {
      const latestArticles = extractArticlesBetween(latestMatch.index, latestMatch.index + latestMatch[0].length);
      const latestItems = [];
      for (const artHtml of latestArticles) {
        const item = parseArticleBlock(artHtml);
        if (item && item.title && item.url) latestItems.push(item);
      }
      if (latestItems.length) sections["Latest Releases"] = latestItems;
    }

    // Fallback parsing
    if (Object.keys(sections).length === 0) {
      const fallback = { featured: [], movies: [] };
      const featuredRegex =
        /<article[^>]*?post-featured-(\d+)[\s\S]*?<img[^>]*src=(?:"|')([^"']+)(?:"|')[\s\S]*?<div[^>]*class=(?:"|')rating(?:"|')[^>]*>([^<]+)<\/div>[\s\S]*?<a[^>]*href=(?:"|')([^"']+)(?:"|')[\s\S]*?<h3[^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>[\s\S]*?<\/h3>[\s\S]*?<span[^>]*>([^<]+)<\/span>/gi;
      let fm;
      let featuredCount = 0;
      while ((fm = featuredRegex.exec(html)) !== null && featuredCount < MAX_ARTICLES) {
        let img = fm[2].replace(/-\d+x\d+(\.\w+)$/, "$1");
        let url = fm[4].replace(/^https?:\/\/[^/]+/, "");
        fallback.featured.push({
          id: fm[1],
          img,
          rating: fm[3].trim(),
          url,
          title: fm[5].trim(),
          date: fm[6].trim(),
        });
        featuredCount++;
      }

      const moviesRegex =
        /<article[^>]*?id="post-(\d+)"[\s\S]*?<img[^>]*src=(?:"|')([^"']+)(?:"|')[\s\S]*?<div[^>]*class=(?:"|')rating(?:"|')[^>]*>([^<]+)<\/div>[\s\S]*?<a[^>]*href=(?:"|')([^"']+)(?:"|')[\s\S]*?<h3[^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>[\s\S]*?<\/h3>[\s\S]*?<span[^>]*>([^<]+)<\/span>/gi;
      let movieCount = 0;
      while ((fm = moviesRegex.exec(html)) !== null && movieCount < MAX_ARTICLES) {
        let img = fm[2].replace(/-\d+x\d+(\.\w+)$/, "$1");
        let url = fm[4].replace(/^https?:\/\/[^/]+/, "");
        fallback.movies.push({
          id: fm[1],
          img,
          rating: fm[3].trim(),
          url,
          title: fm[5].trim(),
          date: fm[6].trim(),
        });
        movieCount++;
      }

      if (fallback.featured.length) sections["Featured titles"] = fallback.featured;
      if (fallback.movies.length) sections["Movies"] = fallback.movies;
    }

    const summary = {};
    for (const k of Object.keys(sections)) summary[k] = sections[k].length;

    return res.status(200).json({ status: "ok", counts: summary, sections });
  } catch (err) {
    console.error("Serverless function error:", err);
    const errorMessage = err.name === "AbortError" ? "Fetch timeout" : err.message || "Internal server error";
    errorCache.set(cacheKey, { message: errorMessage, timestamp: Date.now() });
    cleanCache();
    return res.status(500).json({ error: errorMessage });
  }
}
