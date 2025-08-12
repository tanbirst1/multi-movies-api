import fs from "fs";
import path from "path";
import fetch from "node-fetch";
import * as cheerio from "cheerio";

export default async function handler(req, res) {
  try {
    // Read base URL from ../src/baseurl.txt
    const baseUrlPath = path.join(process.cwd(), "src", "baseurl.txt");
    const baseUrl = fs.readFileSync(baseUrlPath, "utf8").trim();

    // Step 1: Get raw HTML from the target site
    const rawHtml = await fetch(baseUrl).then(r => r.text());

    // Step 2: Send HTML to a formatter API so we get consistent markup
    const formattedHtml = await fetch("https://www.prettifyhtmlapi.com/api/format", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ html: rawHtml })
    }).then(r => r.text());

    // Step 3: Load into Cheerio
    const $ = cheerio.load(formattedHtml);

    // Step 4: Scrape Featured Titles
    const featured = [];
    $("#featured-titles article").each((_, el) => {
      const poster = $(el).find(".poster img").attr("src") || "";
      const title = $(el).find("h3 a").text().trim();
      const year = $(el).find(".data span").text().trim();
      const rating = $(el).find(".rating").text().trim();
      const link = $(el).find(".poster a").attr("href") || "";

      if (title) {
        featured.push({ title, year, rating, poster, link });
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
