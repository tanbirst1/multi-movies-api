import fs from "fs";
import path from "path";
import * as cheerio from "cheerio";

export default async function handler(req, res) {
  try {
    // Read base URL from ../src/baseurl.txt
    const baseUrlPath = path.join(process.cwd(), "src", "baseurl.txt");
    const baseUrl = fs.readFileSync(baseUrlPath, "utf8").trim().replace(/\/$/, "");

    if (!baseUrl) {
      return res.status(500).json({ error: "Base URL not found in baseurl.txt" });
    }

    // This URL directly returns the HTML for the featured carousel
    const ajaxUrl = `${baseUrl}/wp-admin/admin-ajax.php?action=featured_titles`;

    const response = await fetch(ajaxUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Referer": baseUrl
      }
    });

    if (!response.ok) {
      return res.status(500).json({ error: `Failed to fetch ${ajaxUrl}` });
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    const featured = [];
    $(".owl-item article").each((_, el) => {
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
