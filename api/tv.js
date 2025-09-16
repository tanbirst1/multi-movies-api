// api/show.js

// ---- Simple Cache ----
const cacheStore = new Map(); // key: target URL, value: { data, expiry }

// ---- Helpers ----
function readBaseURL() {
  const envBase = (process.env.BASE_URL || "").trim();
  if (/^https?:\/\//i.test(envBase)) return envBase.replace(/\/+$/, "");
  return "https://multimovies.lol/"; // fallback
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
        "user-agent":
          "Mozilla/5.0 (compatible; Scraper/2.0; +https://vercel.com/)",
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

async function fetchSourcesFromVideo(url) {
  try {
    const apiUrl = `https://multi-movies-api.vercel.app/api/video.js?url=${encodeURIComponent(url)}`;
    const resp = await fetch(apiUrl, {
      headers: { "user-agent": "Mozilla/5.0 (VideoFetcher/1.0)" },
    });
    if (!resp.ok) return [];
    const json = await resp.json();
    if (!json || !Array.isArray(json.sources)) return [];
    return json.sources.map((s) => ({
      server: s.server || "Unknown",
      url: s.file || s.url || "",
    }));
  } catch {
    return [];
  }
}

// ---- Lightweight Regex Parsing ----
function parsePage(html, pageUrl, siteRoot) {
  const titleMatch =
    html.match(/<h1[^>]*>(.*?)<\/h1>/) ||
    html.match(/<meta[^>]+itemprop="name"[^>]+content="([^"]+)"/i);
  const title = titleMatch ? titleMatch[1].trim() : "";

  const posterMatch = html.match(/<img[^>]+class="[^"]*poster[^"]*"[^>]+src="([^"]+)"/i);
  const poster = posterMatch ? normalizeImageURL(toAbs(siteRoot, posterMatch[1])) : "";

  const synopsisMatch = html.match(/<div[^>]+class="wp-content"[^>]*>([\s\S]*?)<\/div>/i);
  const synopsis = synopsisMatch
    ? synopsisMatch[1].replace(/<[^>]+>/g, "").replace(/\s+\n/g, "\n").trim()
    : "";

  const seasons = [];
  const seasonRegex = /<div class="se-c">([\s\S]*?)<\/div>\s*<\/div>/gi;
  let seasonBlock;
  while ((seasonBlock = seasonRegex.exec(html))) {
    const block = seasonBlock[1];
    const seasonNumberMatch = block.match(/<span class="se-t">(\d+)<\/span>/);
    const seasonNumber = seasonNumberMatch ? parseInt(seasonNumberMatch[1], 10) : null;
    const seasonTitleMatch = block.match(/<span class="title">(.*?)<\/span>/);
    const seasonTitle = seasonTitleMatch ? seasonTitleMatch[1].trim() : "";

    const episodes = [];
    const epRegex = /<li[^>]*>([\s\S]*?)<\/li>/gi;
    let epBlock;
    while ((epBlock = epRegex.exec(block))) {
      const li = epBlock[1];

      const numMatch = li.match(/(\d+)\s*-\s*(\d+)/);
      const seasonNo = numMatch ? parseInt(numMatch[1], 10) : null;
      const episodeNo = numMatch ? parseInt(numMatch[2], 10) : null;

      const urlMatch = li.match(/<a[^>]+href="([^"]+)"/i);
      const epUrl = urlMatch ? toAbs(siteRoot, urlMatch[1]) : "";

      const titleMatch = li.match(/<a[^>]*>(.*?)<\/a>/i);
      const epTitle = titleMatch ? epTitle[1].trim() : "";

      const dateMatch = li.match(/<span class="date">([^<]+)<\/span>/i);
      const airDate = dateMatch ? dateMatch[1].trim() : "";

      const thumbMatch = li.match(/<img[^>]+src="([^"]+)"/i);
      const thumb = thumbMatch ? normalizeImageURL(toAbs(siteRoot, thumbMatch[1])) : "";

      episodes.push({
        seasonNo,
        episodeNo,
        title: epTitle,
        url: epUrl,
        airDate,
        thumbnail: thumb,
        sources: [],
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

// ---- Preload Sources ----
async function preloadEpisodeSources(seasons, delay = 1000) {
  for (const season of seasons) {
    for (const ep of season.episodes) {
      ep.sources = await fetchSourcesFromVideo(ep.url);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  return seasons;
}

// ---- Handler ----
export default async function handler(req, res) {
  try {
    const q = req.query || {};
    const base = (q.base && String(q.base)) || readBaseURL();

    let target = (q.url && String(q.url).trim()) || "";
    if (!target) {
      const slugParam = q.slug ? String(q.slug) : "";
      const origin = base.replace(/\/+$/, "");
      if (slugParam) {
        const slug = slugifyTitle(slugParam);
        const section = (q.section && String(q.section)) || "tvshows";
        target = `${origin}/${section.replace(/^\/|\/$/g, "")}/${slug}/`;
      } else {
        target = `${origin}/tvshows/example-show/`;
      }
    }

    let siteRoot = "";
    try {
      siteRoot = new URL(base || target).origin;
    } catch {}

    // Cache
    const now = Date.now();
    const cached = cacheStore.get(target);
    if (cached && cached.expiry > now) {
      res.setHeader("cache-control", "s-maxage=500, stale-while-revalidate=600");
      res.status(200).json({ ...cached.data, cache: true });
      return;
    }

    // Fetch + Parse
    const html = await fetchHTML(target);
    let data = parsePage(html, target, siteRoot || target);

    // Preload sources
    data.seasons = await preloadEpisodeSources(data.seasons, 1000);

    cacheStore.set(target, { data, expiry: now + 500 * 1000 });

    res.setHeader("cache-control", "s-maxage=500, stale-while-revalidate=600");
    res.status(200).json({ ...data, cache: false });
  } catch (err) {
    const dev = process.env.NODE_ENV !== "production";
    res.status(500).json({
      ok: false,
      error: err && err.message ? err.message : String(err),
      stack: dev ? err.stack : undefined,
    });
  }
}
