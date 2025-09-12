// pages/api/scrape.js
// Vercel serverless Node.js API, no dependencies

export default async function handler(req, res) {
  try {
    const { path, url } = req.query;

    // get base URL from github raw if path is used
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

    // fetch page HTML
    const html = await fetch(sourceUrl, {
      headers: { "user-agent": "VercelScraper/1.0" }
    }).then(r => r.text());

    // regex helpers
    function extractAll(regex, str) {
      let m, out = [];
      while ((m = regex.exec(str)) !== null) {
        out.push(m);
      }
      return out;
    }

    // extract articles
    const articleRegex = /<article\b[^>]*>([\s\S]*?)<\/article>/gi;
    const articles = extractAll(articleRegex, html);

    const items = articles.map(match => {
      const block = match[1];

      // title + link
      let title = null, link = null;
      const t = /<h3[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/.exec(block)
            || /<a[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/.exec(block);
      if (t) {
        link = t[1];
        title = t[2].replace(/<[^>]+>/g, "").trim();
      }

      // year/date
      let date_or_year = null;
      const d = /<span[^>]*>(.*?)<\/span>/.exec(block);
      if (d) date_or_year = d[1].trim();

      // rating
      let rating = null;
      const r = /<div[^>]*class="[^"]*rating[^"]*"[^>]*>(.*?)<\/div>/.exec(block);
      if (r) rating = r[1].trim();

      // original image
      let original_image = null;
      const imgMatch = /<img[^>]+(?:data-src|src)="([^"]+)"/.exec(block);
      if (imgMatch) original_image = imgMatch[1];

      // tmdb image id extraction
      let tmdb_image = null;
      if (original_image) {
        const idMatch = /\/([A-Za-z0-9]{10,})-/.exec(original_image);
        if (idMatch) {
          const tid = idMatch[1];
          tmdb_image = `https://image.tmdb.org/t/p/original/${tid}.jpg`;
        }
      }

      return {
        title,
        link,
        date_or_year,
        rating,
        original_image,
        tmdb_image
      };
    });

    res.setHeader("Content-Type", "application/json");
    res.status(200).json({
      source: sourceUrl,
      items
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
