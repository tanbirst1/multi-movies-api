import fs from "fs";
import path from "path";
import axios from "axios";
import beautify from "js-beautify";
import * as cheerio from "cheerio";

export default async function handler(req, res) {
  try {
    // 1. Read base URL from file
    const baseFile = path.join(process.cwd(), "src", "baseurl.txt");
    const baseUrl = fs.readFileSync(baseFile, "utf-8").trim();

    // 2. Fetch HTML as plain text (disable axios auto parsing)
    const { data: rawHtml } = await axios.get(baseUrl, {
      responseType: "text",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "text/html",
      },
    });

    // 3. Locally beautify HTML (no external API)
    const formattedHtml = beautify.html(rawHtml, {
      indent_size: 2,
      wrap_line_length: 0,
    });

    // 4. Load formatted HTML into cheerio
    const $ = cheerio.load(formattedHtml);

    // 5. Extract featured titles
    const featured = [];
    $("article").each((_, el) => {
      const title = $(el).find("h3 a").text().trim();
      const link = $(el).find("h3 a").attr("href");
      const img =
        $(el).find("img").attr("src") ||
        $(el).find("img").attr("data-src") ||
        "";
      if (title && link) {
        featured.push({ title, link, img });
      }
    });

    // 6. Send JSON response
    res.status(200).json({
      baseUrl,
      totalFeatured: featured.length,
      featured,
    });
  } catch (err) {
    res.status(500).json({
      error: err.message,
      stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
    });
  }
}
