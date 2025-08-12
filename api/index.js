import fs from "fs";
import path from "path";
import axios from "axios";
import * as cheerio from "cheerio";

export default async function handler(req, res) {
  try {
    // Read base URL from file
    const baseFile = path.join(process.cwd(), "src", "baseurl.txt");
    const baseUrl = fs.readFileSync(baseFile, "utf-8").trim();

    // Step 1: Fetch raw HTML
    const { data: rawHtml } = await axios.get(baseUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      },
    });

    // Step 2: Send HTML to formatting API
    const { data: formattedHtml } = await axios.post(
      "https://api.htmlcleaner.com/v1/beautify",
      { html: rawHtml },
      { headers: { "Content-Type": "application/json" } }
    );

    // Step 3: Load formatted HTML into cheerio
    const $ = cheerio.load(formattedHtml.html || formattedHtml);

    // Step 4: Extract featured titles
    const featured = [];
    $("#featured-titles article").each((_, el) => {
      const title = $(el).find("h3 a").text().trim();
      const link = $(el).find("h3 a").attr("href");
      const img = $(el).find(".poster img").attr("src");
      const rating = $(el).find(".rating").text().trim();
      featured.push({ title, link, img, rating });
    });

    res.status(200).json({
      status: "ok",
      base: baseUrl,
      totalFeatured: featured.length,
      featured,
    });
  } catch (err) {
    res.status(500).json({
      status: "error",
      message: err.message,
    });
  }
}
