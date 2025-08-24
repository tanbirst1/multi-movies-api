const fs = require("fs");
const path = require("path");
const cheerio = require("cheerio");

// --------- Helpers ---------
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
  return "https://multimovies.pro";
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
        "user-agent": "Mozilla/5.0 (compatible; VercelScraper/1.3; +https://vercel.com/)",
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
      },
      signal: ac.signal
    });
    if (!resp.ok) throw new Error(`Fetch failed ${resp.status} ${resp.statusText}`);
    return await resp.text();
  } finally { clearTimeout(t); }
}

async function fetchAjaxEmbed(root, { post, nume, type }) {
  const url = `${root}/wp-admin/admin-ajax.php`;
  const body = new URLSearchParams({
    action: "doo_player_ajax",
    post,
    nume,
    type
  });
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
      "user-agent": "Mozilla/5.0 (compatible; VercelScraper/1.3; +https://vercel.com/)"
    },
    body
  });
  const text = await resp.text();
  // the response is usually an iframe HTML string
  const $ = cheerio.load(text);
  const src = $("iframe").attr("src") || "";
  return src;
}

async function parseEpisodePage(html, pageUrl, siteRoot) {
  const $ = cheerio.load(html);

  // Views
  const viewsText = $("#playernotice").data("text") || "";
  const views = parseInt(String(viewsText).replace(/\D/g, ""), 10) || 0;

  // Player options
  const options = [];
  $("#playeroptionsul li").each((_, li) => {
    const $li = $(li);
    const type = $li.data("type") || "";
    const post = $li.data("post") || "";
    const nume = $li.data("nume") || "";
    const title = $li.find(".title").text().trim() || "";
    options.push({ type, post, nume, title });
  });

  // Try iframe directly
  const sources = [];
  $("div[id^='source-player-']").each((_, div) => {
    const $div = $(div);
    const $iframe = $div.find("iframe").first();
    if ($iframe.length) {
      let src = $iframe.attr("src") || "";
      if (src && src !== "about:blank") {
        if (!/^https?:\/\//i.test(src)) src = toAbs(siteRoot, src);
        sources.push(src);
      }
    }
  });

  // If no valid iframe (or only about:blank), resolve via Ajax
  if (sources.length === 0 || sources.includes("about:blank")) {
    for (const opt of options) {
      try {
        const resolved = await fetchAjaxEmbed(siteRoot, opt);
        if (resolved) {
          sources.push(resolved);
        }
      } catch (e) {
        // ignore failed option
      }
    }
  }

  return { ok: true, scrapedFrom: pageUrl, views, sources, options };
}

// --------- Handler ---------
module.exports = async function handler(req, res) {
  try {
    const q = req.query || {};
    const base = (q.base && String(q.base)) || readBaseURL();

    let target = (q.url && String(q.url).trim()) || "";

    // support ?slug=episodes/naruto-shippuden-1x1/
    if (!target && q.slug) {
      const slug = String(q.slug).replace(/^\/+/, "").replace(/\/+$/, "");
      target = `${base.replace(/\/+$/, "")}/${slug}`;
    }

    if (!target) {
      res.status(400).json({ ok: false, error: "Missing target URL. Provide ?url= or ?slug=" });
      return;
    }

    const siteRoot = (() => { try { return new URL(base || target).origin; } catch { return base || target; } })();

    // fetch and parse
    const html = await fetchHTML(target);
    const data = await parseEpisodePage(html, target, siteRoot);

    res.setHeader("cache-control", "s-maxage=300, stale-while-revalidate=600");
    res.status(200).json(data);
  } catch (err) {
    const dev = process.env.NODE_ENV !== "production";
    res.status(500).json({
      ok: false,
      error: err && err.message ? err.message : String(err),
      stack: dev ? (err && err.stack) : undefined
    });
  }
};
