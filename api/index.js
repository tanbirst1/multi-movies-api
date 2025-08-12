import fs from "fs";
import path from "path";
import * as cheerio from "cheerio";

export default async function handler(req, res) {
  try {
    // Read base URL from ../src/baseurl.txt
    const baseUrlPath = path.join(process.cwd(), "src", "baseurl.txt");
    const baseUrl = fs.readFileSync(baseUrlPath, "utf8").trim();

    if (!baseUrl) {
      return res.status(500).json({ error: "Base URL not found in baseurl.txt" });
    }

    // Fetch HTML
    const response = await fetch(baseUrl);
    if (!response.ok) {
      return res.status(500).json({ error: `Failed to fetch ${baseUrl}` });
    }
    const html = await response.text();

    // Load HTML into cheerio
    const $ = cheerio.load(html);

    // Scrape "Featured titles" section
    const featured = [];
    $("#featured-titles .owl-item article").each((_, el) => {
      const $el = $(el);
      const title = $el.find("h3 a").text().trim();
      const year = $el.find(".data.dfeatur span").text().trim();
      const rating = $el.find(".rating").text().trim();
      const img = $el.find(".poster img").attr("src");
      const link = $el.find(".poster a").attr("href");

      featured.push({
        title,
        year,
        rating,
        img,
        link
      });
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
