export default async function handler(req, res) {
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
    // ignore if file missing, fallback to default
  }

  try {
    const r = await fetch(TARGET, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0 Safari/537.36",
        "Accept":
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Connection": "keep-alive",
        "Referer": "https://multimovies.coupons/",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "same-origin",
        "Sec-Fetch-User": "?1",
        "Upgrade-Insecure-Requests": "1"
      },
    });

    if (!r.ok) {
      return res.status(502).json({ error: "fetch_failed", status: r.status });
    }

    const html = await r.text();

    // === Parsing logic stays the same ===
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

    // fallback parsing
    if (Object.keys(sections).length === 0) {
      const fallback = { featured: [], movies: [] };
      const featuredRegex =
        /<article[^>]*?post-featured-(\d+)[\s\S]*?<img[^>]*src=(?:"|')([^"']+)(?:"|')[\s\S]*?<div[^>]*class=(?:"|')rating(?:"|')[^>]*>([^<]+)<\/div>[\s\S]*?<a[^>]*href=(?:"|')([^"']+)(?:"|')[\s\S]*?<h3[^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>[\s\S]*?<\/h3>[\s\S]*?<span[^>]*>([^<]+)<\/span>/gi;
      let fm;
      while ((fm = featuredRegex.exec(html)) !== null) {
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
      }

      const moviesRegex =
        /<article[^>]*?id="post-(\d+)"[\s\S]*?<img[^>]*src=(?:"|')([^"']+)(?:"|')[\s\S]*?<div[^>]*class=(?:"|')rating(?:"|')[^>]*>([^<]+)<\/div>[\s\S]*?<a[^>]*href=(?:"|')([^"']+)(?:"|')[\s\S]*?<h3[^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>[\s\S]*?<\/h3>[\s\S]*?<span[^>]*>([^<]+)<\/span>/gi;
      while ((fm = moviesRegex.exec(html)) !== null) {
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
      }

      if (fallback.featured.length) sections["Featured titles"] = fallback.featured;
      if (fallback.movies.length) sections["Movies"] = fallback.movies;
    }

    const summary = {};
    for (const k of Object.keys(sections)) summary[k] = sections[k].length;

    return res.status(200).json({ status: "ok", counts: summary, sections });
  } catch (err) {
    return res.status(500).json({ error: err.message || String(err) });
  }
}
