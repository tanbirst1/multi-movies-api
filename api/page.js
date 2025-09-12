// In-memory cache for 500 errors with size limit
const errorCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const MAX_CACHE_SIZE = 100; // Limit cache entries

// Global limits to avoid ReferenceError in fallbacks/loops
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
export default async function handler(req, res) {
  try {
    const { path, url, page } = req.query;

    // -------- Get source url --------
    let sourceUrl = url;
    if (!sourceUrl && path) {
      const raw = await fetch(
        "https://raw.githubusercontent.com/tanbirst1/multi-movies-api/refs/heads/main/src/baseurl.txt"
      ).then(r => r.text());
      const base = raw.split("\n").find(line => line.trim() && !line.startsWith("#"));
      sourceUrl = base.replace(/\/$/, "") + (path.startsWith("/") ? path : "/" + path);
    }
    if (!sourceUrl) {
      res.status(400).json({ error: "Please provide ?path= or ?url=" });
      return;
    }

    // -------- Helpers --------
    function cleanImage(url) {
      if (!url) return null;
      let u = url.replace(/-\d+x\d+(?=\.(jpg|jpeg|png|webp))/i, "");
      u = u.replace(/(\.(jpg|jpeg|png))\.webp$/i, "$1");
      return u;
    }
    function tmdbFromImage(url) {
      if (!url) return null;
      const match = /\/([A-Za-z0-9]{10,})\.(jpg|jpeg|png)$/i.exec(url);
      return match ? match[1] : null;
    }
    function extractAll(regex, str) {
      let m, out = [];
      while ((m = regex.exec(str)) !== null) out.push(m);
      return out;
    }

    // -------- Parse a single page --------
    async function parsePage(pageUrl, current) {
      const html = await fetch(pageUrl, {
        headers: { "user-agent": "VercelScraper/2.0" }
      }).then(r => r.text());

      let totalPages = 1;
      const p = /Page\s+\d+\s+of\s+(\d+)/i.exec(html);
      if (p) totalPages = parseInt(p[1]);

      const sectionRegex = /<h2[^>]*>(.*?)<\/h2>/gi;
      const sections = {};
      let secMatch;
      const titles = [];

      while ((secMatch = sectionRegex.exec(html)) !== null) {
        titles.push({ title: secMatch[1].trim(), index: secMatch.index });
      }

      for (let i = 0; i < titles.length; i++) {
        const currentSec = titles[i];
        const nextIndex = titles[i + 1] ? titles[i + 1].index : html.length;
        const block = html.slice(currentSec.index, nextIndex);

        const articles = extractAll(/<article\b[^>]*>([\s\S]*?)<\/article>/gi, block);

        const items = articles.map(m => {
          const art = m[1];

          let title = null, link = null;
          const t = /<h3[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/.exec(art)
                || /<a[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/.exec(art);
          if (t) {
            link = t[1];
            title = t[2].replace(/<[^>]+>/g, "").trim();
          }

          let date_or_year = null;
          const d = /<span[^>]*>(.*?)<\/span>/.exec(art);
          if (d) date_or_year = d[1].trim();

          let rating = null;
          const r = /<div[^>]*class="[^"]*rating[^"]*"[^>]*>(.*?)<\/div>/.exec(art);
          if (r) rating = r[1].trim();

          let original_image = null;
          const imgMatch = /<img[^>]+(?:data-src|src)="([^"]+)"/.exec(art);
          if (imgMatch) original_image = cleanImage(imgMatch[1]);

          let tmdb_image = null;
          const tid = tmdbFromImage(original_image);
          if (tid) tmdb_image = `https://image.tmdb.org/t/p/500w/${tid}.jpg`;

          return {
            title,
            link,
            date_or_year,
            rating,
            original_image,
            tmdb_image
          };
        });

        if (!sections[currentSec.title]) sections[currentSec.title] = [];
        sections[currentSec.title].push(...items);
      }

      return { sections, totalPages, currentPage: current };
    }

    // -------- Handle ?page logic --------
    const firstParsed = await parsePage(sourceUrl, 1);
    const totalPages = firstParsed.totalPages;

    let finalSections = JSON.parse(JSON.stringify(firstParsed.sections));
    let currentPage = 1;

    if (page) {
      if (page === "all") {
        for (let p = 2; p <= totalPages; p++) {
          const pageUrl = sourceUrl.replace(/\/page\/\d+\/?$/, "").replace(/\/$/, "") + `/page/${p}/`;
          const parsed = await parsePage(pageUrl, p);
          for (const [sec, items] of Object.entries(parsed.sections)) {
            if (!finalSections[sec]) finalSections[sec] = [];
            finalSections[sec].push(...items);
          }
        }
        currentPage = "all";
      } else if (/^\d+$/.test(page)) {
        const pNum = parseInt(page);
        if (pNum > 1) {
          const pageUrl = sourceUrl.replace(/\/page\/\d+\/?$/, "").replace(/\/$/, "") + `/page/${pNum}/`;
          const parsed = await parsePage(pageUrl, pNum);
          finalSections = parsed.sections;
          currentPage = pNum;
        }
      } else if (/^\d+-$/i.test(page)) {
        const start = parseInt(page);
        for (let p = start; p <= totalPages; p++) {
          const pageUrl = sourceUrl.replace(/\/page\/\d+\/?$/, "").replace(/\/$/, "") + `/page/${p}/`;
          const parsed = await parsePage(pageUrl, p);
          for (const [sec, items] of Object.entries(parsed.sections)) {
            if (!finalSections[sec]) finalSections[sec] = [];
            finalSections[sec].push(...items);
          }
        }
        currentPage = `${start}-end`;
      }
    }

    // -------- Response --------
    res.setHeader("Content-Type", "application/json");
    res.status(200).json({
      source: sourceUrl,
      total_pages: totalPages,
      current_page: currentPage,
      sections: finalSections
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
