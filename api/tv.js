import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { request } from "undici";
import cheerio from "cheerio";

/**
 * Helper: read base URL from ../src/baseurl.txt (one line, trimmed).
 */
function readBaseURL() {
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const p = path.resolve(__dirname, "../src/baseurl.txt");
    if (fs.existsSync(p)) {
      const txt = fs.readFileSync(p, "utf8").trim();
      if (/^https?:\/\//i.test(txt)) return txt.replace(/\/+$/, "");
    }
  } catch {}
  return "";
}

/**
 * Helper: prefer data-src over src for lazy images.
 */
function getImgSrc($el) {
  const dataSrc = $el.attr("data-src") || $el.attr("data-lazy-src") || "";
  const src = $el.attr("src") || "";
  return (dataSrc || src || "").trim();
}

/**
 * Helper: absolute URL join
 */
function toAbs(base, href) {
  if (!href) return "";
  try {
    return new URL(href, base).toString();
  } catch {
    return href;
  }
}

/**
 * Fetch HTML via undici
 */
async function fetchHTML(url) {
  const { body, statusCode } = await request(url, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (compatible; VercelScraper/1.0; +https://vercel.com/)",
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
    }
  });
  if (statusCode >= 400) {
    throw new Error(`Fetch failed ${statusCode} for ${url}`);
  }
  const text = await body.text();
  return text;
}

/**
 * Main parser — built for the structure you pasted
 */
function parsePage(html, pageUrl, siteRoot) {
  const $ = cheerio.load(html);

  // Title
  const title =
    $("#single .sheader .data h1").first().text().trim() ||
    $('meta[itemprop="name"]').attr("content") ||
    "";

  // Poster
  const poster = getImgSrc($("#single .sheader .poster img").first());

  // Networks (the <span> with <a rel="tag"> under .extra)
  const networks = [];
  $("#single .sheader .data .extra span a[rel='tag']").each((_, a) => {
    const name = $(a).text().trim();
    const href = toAbs(siteRoot, $(a).attr("href"));
    if (name) networks.push({ name, url: href });
  });

  // Dates & ratings
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

  // Genres
  const genres = [];
  $("#single .sheader .data .sgeneros a[rel='tag']").each((_, a) => {
    const name = $(a).text().trim();
    const href = toAbs(siteRoot, $(a).attr("href"));
    if (name) genres.push({ name, url: href });
  });

  // Synopsis
  const synopsis = $("#info .wp-content").text().replace(/\s+\n/g, "\n").trim();

  // Gallery images
  const gallery = [];
  $("#info #dt_galery img, #info .galeria img").each((_, img) => {
    const src = getImgSrc($(img));
    if (src) gallery.push(toAbs(siteRoot, src));
  });

  // Seasons & episodes
  const seasons = [];
  $("#seasons .se-c").each((_, se) => {
    const $se = $(se);
    const seasonNumber =
      $se.find(".se-q .se-t").first().text().trim() ||
      $se.find(".se-q .se-t.se-o").first().text().trim() ||
      "";

    const seasonTitle = $se.find(".se-q .title").first().text().trim();

    const episodes = [];
    $se.find(".se-a ul.episodios > li").each((__, li) => {
      const $li = $(li);
      const numerando = $li.find(".numerando").text().trim(); // e.g., "1 - 2"
      const eMatch = numerando.match(/(\d+)\s*-\s*(\d+)/);
      const seasonNo = eMatch ? parseInt(eMatch[1], 10) : null;
      const episodeNo = eMatch ? parseInt(eMatch[2], 10) : null;

      const $a = $li.find(".episodiotitle a").first();
      const epTitle = $a.text().trim();
      const epUrl = toAbs(siteRoot, $a.attr("href"));
      const airDate = $li.find(".episodiotitle .date").first().text().trim();
      const thumb = getImgSrc($li.find(".imagen img").first());

      episodes.push({
        seasonNo,
        episodeNo,
        title: epTitle,
        url: epUrl,
        airDate,
        thumbnail: thumb ? toAbs(siteRoot, thumb) : ""
      });
    });

    if (seasonNumber || episodes.length) {
      seasons.push({
        seasonNumber: seasonNumber ? parseInt(seasonNumber, 10) : null,
        seasonTitle,
        episodeCount: episodes.length,
        episodes
      });
    }
  });

  // Cast
  const cast = [];
  $("#cast .persons .person").each((_, person) => {
    const $p = $(person);
    const name =
      $p.find(".data .name a").first().text().trim() ||
      $p.find('meta[itemprop="name"]').attr("content") ||
      "";
    const role = $p.find(".data .caracter").first().text().trim();
    const href = toAbs(siteRoot, $p.find(".data .name a").attr("href"));
    const img = getImgSrc($p.find(".img img").first());
    if (name) {
      cast.push({
        name,
        role,
        url: href || "",
        image: img ? toAbs(siteRoot, img) : ""
      });
    }
  });

  // Similar titles
  const similar = [];
  $("#single_relacionados .owl-item article a").each((_, a) => {
    const href = $(a).attr("href");
    const img = $(a).find("img").first();
    const thumb = getImgSrc(img);
    const alt = (img.attr("alt") || "").trim();
    similar.push({
      title: alt,
      url: toAbs(siteRoot, href),
      thumbnail: thumb ? toAbs(siteRoot, thumb) : ""
    });
  });

  // Additional custom fields
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
      poster: poster ? toAbs(siteRoot, poster) : "",
      networks,
      genres,
      firstAirDate,
      ratingValue,
      ratingCount,
      synopsis,
      infoFields
    },
    seasons,
    cast,
    gallery,
    similar
  };
}

/**
 * API handler
 * Query options:
 *   - url: full URL to a TV page
 *   - slug: path after baseurl (e.g. tvshows/a-couple-of-cuckoos/)
 * If neither is provided, we use an example.
 *
 * Example:
 *   /api/scrape?slug=tvshows/a-couple-of-cuckoos/
 *   /api/scrape?url=https://multimovies.pro/tvshows/a-couple-of-cuckoos/
 */
export default async function handler(req, res) {
  try {
    const base = readBaseURL();
    const { url, slug } = req.query || {};

    let target = url && typeof url === "string" ? url.trim() : "";
    if (!target) {
      if (!base) {
        return res
          .status(400)
          .json({ ok: false, error: "Base URL missing. Put it in src/baseurl.txt" });
      }
      const cleanSlug =
        typeof slug === "string" && slug.trim()
          ? slug.replace(/^\/+/, "")
          : "tvshows/a-couple-of-cuckoos/"; // example requested
      target = `${base}/${cleanSlug}`;
    }

    const siteRoot = (base && /^https?:\/\//i.test(base)) ? base : (() => {
      try { return new URL(target).origin; } catch { return ""; }
    })();

    const html = await fetchHTML(target);
    const data = parsePage(html, target, siteRoot || target);

    res.setHeader("cache-control", "s-maxage=300, stale-while-revalidate=600");
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || String(err) });
  }
}
