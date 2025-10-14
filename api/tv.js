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
  return "https://multimovies.sale/";
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
  out = out.replace(/-\d+x\d+(?=(?:\.[a-z0-9]+){1,2}$)/i, "");
  return out;
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
          "Mozilla/5.0 (compatible; VercelScraper/1.2; +https://vercel.com/)",
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: ac.signal,
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new Error(
        `Fetch failed ${resp.status} ${resp.statusText} for ${target} :: ${text.slice(
          0,
          200
        )}`
      );
    }
    return await resp.text();
  } finally {
    clearTimeout(t);
  }
}

// Fetch video sources from multi-movies API
async function fetchMovieSources(target) {
  try {
    const apiUrl = `https://multi-movies-api.vercel.app/api/video.js?url=${encodeURIComponent(
      target
    )}`;
    const resp = await fetch(apiUrl, {
      headers: { "user-agent": "Mozilla/5.0 (MovieFetcher/1.0)" },
    });
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  }
}

function parsePage(html, pageUrl, siteRoot) {
  const $ = cheerio.load(html);

  const title =
    $("#single .sheader .data h1").first().text().trim() ||
    $('meta[itemprop="name"]').attr("content") ||
    "";

  let poster = getImgSrc($("#single .sheader .poster img").first());
  poster = normalizeImageURL(toAbs(siteRoot, poster));

  const networks = [];
  $("#single .sheader .data .extra span a[rel='tag']").each((_, a) => {
    const name = $(a).text().trim();
    const href = toAbs(siteRoot, $(a).attr("href"));
    if (name) networks.push({ name, url: href });
  });

  const firstAirDate =
    $("#single .sheader .data .extra .date").first().text().trim() ||
    $('#info .custom_fields:contains("First air date") .valor')
      .first()
      .text()
      .trim() ||
    "";

  const ratingValue =
    $(".starstruck-rating .dt_rating_vgs").first().text().trim() ||
    $("#info .custom_fields:contains('TMDb Rating') .valor strong")
      .first()
      .text()
      .trim() ||
    "";
  const ratingCount =
    $(".starstruck-rating .rating-count").first().text().trim() || "";

  const genres = [];
  $("#single .sheader .data .sgeneros a[rel='tag']").each((_, a) => {
    const name = $(a).text().trim();
    const href = toAbs(siteRoot, $(a).attr("href"));
    if (name) genres.push({ name, url: href });
  });

  const synopsis = $("#info .wp-content").text().replace(/\s+\n/g, "\n").trim();

  const gallery = [];
  $("#info #dt_galery img, #info .galeria img").each((_, img) => {
    const raw = getImgSrc($(img));
    const abs = toAbs(siteRoot, raw);
    const clean = normalizeImageURL(abs);
    if (clean) gallery.push(clean);
  });

  const seasons = [];
  $("#seasons .se-c").each((_, se) => {
    const $se = $(se);
    const seasonNumberText =
      $se.find(".se-q .se-t").first().text().trim() ||
      $se.find(".se-q .se-t.se-o").first().text().trim() ||
      "";
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
      });
    });

    if (seasonNumber !== null || episodes.length) {
      seasons.push({
        seasonNumber,
        seasonTitle,
        episodeCount: episodes.length,
        episodes,
      });
    }
  });

  const cast = [];
  $("#cast .persons .person").each((_, person) => {
    const $p = $(person);
    const name =
      $p.find(".data .name a").first().text().trim() ||
      $p.find('meta[itemprop="name"]').attr("content") ||
      "";
    const role = $p.find(".data .caracter").first().text().trim();
    const href = toAbs(siteRoot, $p.find(".data .name a").attr("href"));
    const imgRaw = getImgSrc($p.find(".img img").first());
    const img = normalizeImageURL(toAbs(siteRoot, imgRaw));
    if (name) cast.push({ name, role, url: href || "", image: img || "" });
  });

  const similar = [];
  const seen = new Set();
  $("#single_relacionados .owl-item article a").each((_, a) => {
    const href = toAbs(siteRoot, $(a).attr("href"));
    if (!href || seen.has(href)) return;
    const $img = $(a).find("img").first();
    const thumbRaw = getImgSrc($img);
    const thumb = normalizeImageURL(toAbs(siteRoot, thumbRaw));
    let alt = ($img.attr("alt") || "").trim();
    if (!alt && href) {
      try {
        const u = new URL(href);
        const seg = u.pathname.split("/").filter(Boolean).pop() || "";
        alt = seg.replace(/-/g, " ").replace(/\s+/g, " ").trim();
      } catch {}
    }
    seen.add(href);
    if (href) similar.push({ title: alt || "", url: href, thumbnail: thumb || "" });
  });

  const infoFields = {};
  $("#info .custom_fields").each((_, cf) => {
    const key = $(cf).find(".variante").first().text().trim();
    const val = $(cf).find(".valor").first().text().trim();
    if (key) infoFields[key] = val;
  });

  return {
    ok: true,
    scrapedFrom: pageUrl,
    meta: {
      title,
      poster,
      networks,
      genres,
      firstAirDate,
      ratingValue,
      ratingCount,
      synopsis,
      infoFields,
    },
    seasons,
    cast,
    gallery,
    similar,
  };
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
        res.status(400).json({
          ok: false,
          cache: false,
          error:
            "Base URL missing. Provide BASE_URL env, src/baseurl.txt, or ?base= param.",
        });
        return;
      }
      const origin = base.replace(/\/+$/, "");
      if (slugParam) {
        const slug = slugifyTitle(slugParam);
        const section = (q.section && String(q.section)) || "tvshows";
        target = `${origin}/${section.replace(/^\/|\/$/g, "")}/${slug}/`;
      } else {
        target = `${origin}/tvshows/a-couple-of-cuckoos/`;
      }
    }

    let siteRoot = "";
    try {
      siteRoot = new URL(base || target).origin;
    } catch {}

    const now = Date.now();
    const cached = cacheStore.get(target);
    if (cached && cached.expiry > now) {
      res.setHeader(
        "cache-control",
        "s-maxage=500, stale-while-revalidate=600"
      );
      res.status(200).json({ ...cached.data, cache: true });
      return;
    }

    const html = await fetchHTML(target);
    const data = parsePage(html, target, siteRoot || target);

    // --- Fetch video sources for each episode ---
    for (const season of data.seasons) {
      for (const ep of season.episodes) {
        if (ep.url) {
          const videoExtra = await fetchMovieSources(ep.url);
          if (videoExtra) {
            ep.video = {
              views: videoExtra.views || null,
              sources: videoExtra.sources || [],
              options: videoExtra.options || [],
            };
          }
        }
      }
    }

    // --- Fetch movie sources if it's a standalone movie ---
    if (/\/movies\//i.test(target)) {
      const movieExtra = await fetchMovieSources(target);
      if (movieExtra) {
        data.views = movieExtra.views || null;
        data.sources = movieExtra.sources || [];
        data.options = movieExtra.options || [];
      }
    }

    cacheStore.set(target, { data, expiry: now + 500 * 1000 });
    res.setHeader("cache-control", "s-maxage=500, stale-while-revalidate=600");
    res.status(200).json({ ...data, cache: false });
  } catch (err) {
    const dev = process.env.NODE_ENV !== "production";
    res.status(500).json({
      ok: false,
      cache: false,
      error: err && err.message ? err.message : String(err),
      stack: dev ? err.stack : undefined,
    });
  }
};
