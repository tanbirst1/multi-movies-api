const fs = require("fs");
const path = require("path");
const cheerio = require("cheerio");

// ------- Simple In-memory Cache -------
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
  return "https://multimovies.lol/"; // sane default
}

function getImgSrc($el) {
  return (
    $el.attr("data-src") ||
    $el.attr("data-lazy-src") ||
    $el.attr("data-lazyloaded-src") ||
    $el.attr("src") ||
    ""
  ).trim();
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
    if (!resp.ok) return null;
    const json = await resp.json();
    if (!json || !Array.isArray(json.sources)) return null;

    return json.sources.map((s) => ({
      server: s.server || "Unknown",
      url: s.file || s.url || "",
    }));
  } catch {
    return null;
  }
}

// ---- Parse Show Page ----
function parsePage(html, pageUrl, siteRoot) {
  const $ = cheerio.load(html);

  const title =
    $("#single .sheader .data h1").first().text().trim() ||
    $('meta[itemprop="name"]').attr("content") ||
    "";

  let poster = getImgSrc($("#single .sheader .poster img").first());
  poster = normalizeImageURL(toAbs(siteRoot, poster));

  const synopsis = $("#info .wp-content").text().replace(/\s+\n/g, "\n").trim();

  const seasons = [];
  $("#seasons .se-c").each((_, se) => {
    const $se = $(se);
    const seasonNumberText = $se.find(".se-q .se-t").first().text().trim();
    const seasonNumber = seasonNumberText ? parseInt(seasonNumberText, 10) : null;
    const seasonTitle = $se.find(".se-q .title").first().text().trim();

    const episodes = [];
    $se.find(".se-a ul.episodios > li").each((__, li) => {
      const $li = $(li);
      const numerando = $li.find(".numerando").text().trim();
      const eMatch = numerando.match(/(\d+)\s*-\s*(\d+)/);
      const seasonNo = eMatch ? parseInt(eMatch[1], 10) : null;
      const episodeNo = eMatch ? parseInt(eMatch[2], 10) : null;

      const $a = $li.find(".episodiotitle a").first();
      const epTitle = $a.text().trim();
      const epUrl = toAbs(siteRoot, $a.attr("href"));
      const airDate = $li.find(".episodiotitle .date").first().text().trim();
      const thumbRaw = getImgSrc($li.find(".imagen img").first());
      const thumb = normalizeImageURL(toAbs(siteRoot, thumbRaw));

      episodes.push({
        seasonNo,
        episodeNo,
        title: epTitle,
        url: epUrl,
        airDate,
        thumbnail: thumb,
        sources: [], // preload step will fill this
      });
    });

    if (seasonNumber !== null || episodes.length) {
      seasons.push({ seasonNumber, seasonTitle, episodes });
    }
  });

  return {
    ok: true,
    scrapedFrom: pageUrl,
    meta: { title, poster, synopsis },
    seasons,
  };
}

// ---- Preloader: fetch episode sources one by one ----
async function preloadEpisodeSources(seasons, delay = 1000) {
  for (const season of seasons) {
    for (const ep of season.episodes) {
      const srcs = await fetchSourcesFromVideo(ep.url);
      ep.sources = srcs || [];
      await new Promise((r) => setTimeout(r, delay)); // prevent crash
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

    if (!target) {
      const slugParam = q.slug ? String(q.slug) : "";
      if (!base) {
        res.status(400).json({ ok: false, error: "Missing base or url" });
        return;
      }
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
    let data = parsePage(html, target, siteRoot || target);

    // Preload sources with delay to avoid crash
    data.seasons = await preloadEpisodeSources(data.seasons, 1200);

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
};
