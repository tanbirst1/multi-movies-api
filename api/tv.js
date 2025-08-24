const fs = require("fs");
const path = require("path");
const cheerio = require("cheerio");

// ------- Helpers -------
function readBaseURL() {
  // Prefer ENV, then file, then empty
  const envBase = (process.env.BASE_URL || "").trim();
  if (/^https?:\/\//i.test(envBase)) return envBase.replace(/\/+$/, "");

  try {
    // Resolve from project root no matter where the function runs
    const filePath = path.resolve(process.cwd(), "src", "baseurl.txt");
    if (fs.existsSync(filePath)) {
      const txt = fs.readFileSync(filePath, "utf8").trim();
      if (/^https?:\/\//i.test(txt)) return txt.replace(/\/+$/, "");
    }
  } catch (_) {}
  return "";
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
  try { return new URL(href, base).toString(); } catch { return href; }
}

async function fetchHTML(target, timeoutMs = 20000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const resp = await fetch(target, {
      method: "GET",
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; VercelScraper/1.1; +https://vercel.com/)",
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
      },
      signal: ac.signal
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new Error(`Fetch failed ${resp.status} ${resp.statusText} for ${target} :: ${text.slice(0,200)}`);
    }
    return await resp.text();
  } finally {
    clearTimeout(t);
  }
}

function parsePage(html, pageUrl, siteRoot) {
  const $ = cheerio.load(html);

  const title = $("#single .sheader .data h1").first().text().trim() ||
    $('meta[itemprop="name"]').attr("content") || "";

  const poster = getImgSrc($("#single .sheader .poster img").first());

  const networks = [];
  $("#single .sheader .data .extra span a[rel='tag']").each((_, a) => {
    const name = $(a).text().trim();
    const href = toAbs(siteRoot, $(a).attr("href"));
    if (name) networks.push({ name, url: href });
  });

  const firstAirDate = $("#single .sheader .data .extra .date").first().text().trim() ||
    $('#info .custom_fields:contains("First air date") .valor').first().text().trim() || "";

  const ratingValue = $(".starstruck-rating .dt_rating_vgs").first().text().trim() ||
    $("#info .custom_fields:contains('TMDb Rating') .valor strong").first().text().trim() || "";
  const ratingCount = $(".starstruck-rating .rating-count").first().text().trim() || "";

  const genres = [];
  $("#single .sheader .data .sgeneros a[rel='tag']").each((_, a) => {
    const name = $(a).text().trim();
    const href = toAbs(siteRoot, $(a).attr("href"));
    if (name) genres.push({ name, url: href });
  });

  const synopsis = $("#info .wp-content").text().replace(/\s+\n/g, "\n").trim();

  const gallery = [];
  $("#info #dt_galery img, #info .galeria img").each((_, img) => {
    const src = getImgSrc($(img));
    if (src) gallery.push(toAbs(siteRoot, src));
  });

  const seasons = [];
  $("#seasons .se-c").each((_, se) => {
    const $se = $(se);
    const seasonNumberText = $se.find(".se-q .se-t").first().text().trim() ||
      $se.find(".se-q .se-t.se-o").first().text().trim() || "";
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

    if (seasonNumber !== null || episodes.length) {
      seasons.push({
        seasonNumber,
        seasonTitle,
        episodeCount: episodes.length,
        episodes
      });
    }
  });

  const cast = [];
  $("#cast .persons .person").each((_, person) => {
    const $p = $(person);
    const name = $p.find(".data .name a").first().text().trim() ||
      $p.find('meta[itemprop="name"]').attr("content") || "";
    const role = $p.find(".data .caracter").first().text().trim();
    const href = toAbs(siteRoot, $p.find(".data .name a").attr("href"));
    const img = getImgSrc($p.find(".img img").first());
    if (name) cast.push({ name, role, url: href || "", image: img ? toAbs(siteRoot, img) : "" });
  });

  const similar = [];
  $("#single_relacionados .owl-item article a").each((_, a) => {
    const href = $(a).attr("href");
    const img = $(a).find("img").first();
    const thumb = getImgSrc(img);
    const alt = (img.attr("alt") || "").trim();
    if (href) similar.push({ title: alt, url: toAbs(siteRoot, href), thumbnail: thumb ? toAbs(siteRoot, thumb) : "" });
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

module.exports = async function handler(req, res) {
  try {
    const q = req.query || {};
    const baseFromFile = readBaseURL();
    const base = (q.base && String(q.base)) || baseFromFile;

    let target = (q.url && String(q.url).trim()) || "";
    if (!target) {
      if (!base) {
        res.status(400).json({ ok: false, error: "Base URL missing. Provide BASE_URL env, src/baseurl.txt, or ?base= param." });
        return;
      }
      const slug = (q.slug && String(q.slug)) || "tvshows/a-couple-of-cuckoos/"; // example
      target = `${base.replace(/\/+$/, "")}/${slug.replace(/^\/+/, "")}`;
    }

    let siteRoot = "";
    try { siteRoot = new URL(base || target).origin; } catch {}

    const html = await fetchHTML(target);
    const data = parsePage(html, target, siteRoot || target);

    res.setHeader("cache-control", "s-maxage=300, stale-while-revalidate=600");
    res.status(200).json(data);
  } catch (err) {
    // Never crash the function — always respond JSON
    const dev = process.env.NODE_ENV !== "production";
    res.status(500).json({ ok: false, error: err && err.message ? err.message : String(err), stack: dev ? (err && err.stack) : undefined });
  }
};
