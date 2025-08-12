import fs from "fs";
import path from "path";
import * as cheerio from "cheerio";

export default async function handler(req, res) {
  try {
    // Read base URL
    const baseUrlPath = path.join(process.cwd(), "src", "baseurl.txt");
    const baseUrl = fs.readFileSync(baseUrlPath, "utf8").trim().replace(/\/$/, "");

    if (!baseUrl) {
      return res.status(500).json({ error: "Base URL not found" });
    }

    // The site loads featured titles from a module endpoint
    const featuredUrl = `${baseUrl}/wp-admin/admin-ajax.php?action=load_home_featured`;

    const response = await fetch(featuredUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept": "text/html"
      }
    });

    if (!response.ok) {
      return res.status(500).json({ error: `Failed to fetch featured titles` });
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    const featured = [];
    $("article.item.movies").each((_, el) => {
      const title = $(el).find("h3 a").text().trim();
      const year = $(el).find(".data.dfeatur span").text().trim();
      const rating = $(el).find(".rating").text().trim();
      const img = $(el).find(".poster img").attr("src");
      const link = $(el).find(".poster a").attr("href");

      if (title) {
        featured.push({ title, year, rating, img, link });
      }
    });

    res.status(200).json({
      baseUrl,
      totalFeatured: featured.length,
      featured
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
