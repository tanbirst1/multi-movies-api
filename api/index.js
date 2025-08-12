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

    // Step 1: Fetch raw HTML
    const rawRes = await fetch(baseUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0"
      }
    });
    if (!rawRes.ok) {
      return res.status(500).json({ error: `Failed to fetch ${baseUrl}` });
    }
    const rawHtml = await rawRes.text();

    // Step 2: Send HTML to formatter API to make it clean
    const formatRes = await fetch("https://api.codetabs.com/v1/proxy/?quest=https://tools.w3clubs.com/html-beautify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ content: rawHtml })
    });
    const formattedHtml = await formatRes.text();

    // Step 3: Parse formatted HTML
    const $ = cheerio.load(formattedHtml);

    const featured = [];
    $("#featured-titles .owl-item article").each((_, el) => {
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
