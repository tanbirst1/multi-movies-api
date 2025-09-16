// No external dependencies version (pure regex & DOM parsing)
const fs = require("fs");
const path = require("path");

// ------- In-memory Cache -------
const cacheStore = new Map(); // key: target URL, value: { data, expiry }

// ------- Helpers -------
function readBaseURL() {
  const envBase = (process.env.BASE_URL || "").trim();
  if (/^https?:\/\//i.test(envBase)) return envBase.replace(/\/+$/, "");

  try {
    const filePath = path.resolve(process.cwd(), "src", "baseurl.txt");
    if (fs.existsSync(filePath)) {
      const txt = fs.readFileSync(filePath, "utf8").trim();
      if (/^https?:\/\//i.test(txt)) return txt.replace(/\/+$/, "");
    }
  } catch (_) {}
  return "https://multimovies.lol/"; // fallback default
}

function toAbs(base, href) {
  if (!href) return "";
  try {
    return new URL(href, base).toString();
  } catch {
    return href;
  }
}

function normalizeImageURL(u) {
  if (!u || u.startsWith("data:")) return "";
  let out = u.replace(/(\.[a-z0-9]{2,6})(\?.*)$/i, "$1");
  try {
    const urlObj = new URL(out);
    if (urlObj.hostname.includes("image.tmdb.org")) return urlObj.toString();
  } catch {}
  return out.replace(/-\d+x\d+(?=(?:\.[a-z0-9]+){1,2}$)/i, "");
}

function slugifyTitle(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

async function fetchHTML(target, timeoutMs = 20000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const resp = await fetch(target, {
      method: "GET",
      headers: {
        "user-agent": "Mozilla/5.0 (Scraper/3.0; +https://vercel.com/)",
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: ac.signal,
    });
    if (!resp.ok) {
      throw new Error(`Fetch failed ${resp.status} ${resp.statusText} for ${target}`);
    }
    return await resp.text();
  } finally {
    clearTimeout(t);
  }
}

// ---- Extract Show Page (regex scraping) ----
function parsePage(html, pageUrl, siteRoot) {
  const getText = (re) => {
    const m = html.match(re);
    return m ? m[1].trim() : "";
  };

  const title =
    getText(/<h1[^>]*>(.*?)<\/h1>/i) ||
    getText(/<meta[^>]+itemprop=["']name["'][^>]+content=["']([^"']+)["']/i);

  let poster = getText(/<div class="poster">\s*<img[^>]+src=["']([^"']+)["']/i);
  if (!poster) {
    const m = html.match(/<img[^>]+class=["'][^"']*poster[^"']*["'][^>]+src=["']([^"']+)["']/i);
    poster = m ? m[1] : "";
  }
  poster = normalizeImageURL(toAbs(siteRoot, poster));

  const synopsis = getText(/<div id="info"[^>]*>\s*<div class="wp-content">(.*?)<\/div>/is);

  const seasons = [];
  const seasonBlocks = html.split('<div class="se-c"');
  seasonBlocks.shift(); // remove preamble

  for (const block of seasonBlocks) {
    const seasonNumberText = (block.match(/<span class="se-t">\s*(\d+)/i) || [])[1] || "";
    const seasonNumber = seasonNumberText ? parseInt(seasonNumberText, 10) : null;
    const seasonTitle = (block.match(/<span class="title">\s*([^<]+)/i) || [])[1] || "";

    const episodes = [];
    const epMatches = block.split("<li");
    epMatches.shift();

    for (const li of epMatches) {
      const numerando = (li.match(/<span class="numerando">\s*([^<]+)/i) || [])[1] || "";
      const eMatch = numerando.match(/(\d+)\s*-\s*(\d+)/);
      const seasonNo = eMatch ? parseInt(eMatch[1], 10) : null;
      const episodeNo = eMatch ? parseInt(eMatch[2], 10) : null;

      const epTitle = (li.match(/<div class="episodiotitle">\s*<a[^>]*>([^<]+)/i) || [])[1] || "";
      const epUrl = toAbs(siteRoot, (li.match(/<a[^>]+href=["']([^"']+)["']/i) || [])[1] || "");
      const airDate = (li.match(/<span class="date">\s*([^<]+)/i) || [])[1] || "";

      let thumb = (li.match(/<img[^>]+src=["']([^"']+)["']/i) || [])[1] || "";
      thumb = normalizeImageURL(toAbs(siteRoot, thumb));

      episodes.push({
        seasonNo,
        episodeNo,
        title: epTitle,
        url: epUrl,
        airDate,
        thumbnail: thumb,
        sources: [], // preload step will fill this
      });
    }

    if (seasonNumber !== null || episodes.length) {
      seasons.push({ seasonNumber, seasonTitle, episodes });
    }
  }

  return {
    ok: true,
    scrapedFrom: pageUrl,
    meta: { title, poster, synopsis },
    seasons,
  };
}

// ---- Preload video sources (calls ./video.js) ----
async function preloadEpisodeSources(seasons, delay = 1000) {
  for (const season of seasons) {
    for (const ep of season.episodes) {
      try {
        const apiUrl = `https://${process.env.VERCEL_URL || "localhost:3000"}/api/video?url=${encodeURIComponent(ep.url)}`;
        const resp = await fetch(apiUrl);
        if (resp.ok) {
          const json = await resp.json();
          ep.sources = json.sources || [];
        }
      } catch (_) {}
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  return seasons;
}

// ------- Handler -------
module.exports = async function handler(req, res) {
  try {
    const q = req.query || {};
    const base = (q.base && String(q.base)) || readBaseURL();

    let target = (q.url && String(q.url).trim()) || "";

    if (!target && q.slug) {
      const slug = slugifyTitle(String(q.slug));
      const section = (q.section && String(q.section)) || "tvshows";
      target = `${base.replace(/\/+$/, "")}/${section}/${slug}/`;
    }

    if (!target) {
      res.status(400).json({ ok: false, error: "Missing ?url= or ?slug=" });
      return;
    }

    const siteRoot = (() => {
      try {
        return new URL(base || target).origin;
      } catch {
        return base || target;
      }
    })();

    // --- Cache ---
    const now = Date.now();
    const cached = cacheStore.get(target);
    if (cached && cached.expiry > now) {
      res.setHeader("cache-control", "s-maxage=500, stale-while-revalidate=600");
      res.status(200).json({ ...cached.data, cache: true });
      return;
    }

    // --- Fetch + Parse ---
    const html = await fetchHTML(target);
    let data = parsePage(html, target, siteRoot);

    // Preload video sources
    data.seasons = await preloadEpisodeSources(data.seasons);

    cacheStore.set(target, { data, expiry: now + 500 * 1000 });

    res.setHeader("cache-control", "s-maxage=500, stale-while-revalidate=600");
    res.status(200).json({ ...data, cache: false });
  } catch (err) {
    const dev = process.env.NODE_ENV !== "production";
    res.status(500).json({
      ok: false,
      error: err.message || String(err),
      stack: dev ? err.stack : undefined,
    });
  }
};
