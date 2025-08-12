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

    // Fetch the HTML
    const response = await fetch(baseUrl);
    if (!response.ok) {
      return res.status(500).json({ error: `Failed to fetch ${baseUrl}` });
    }

    const html = await response.text();

    // Load HTML into cheerio
    const $ = cheerio.load(html);

    // Example: scrape all links with text
    const links = [];
    $("a").each((_, el) => {
      links.push({
        text: $(el).text().trim(),
        href: $(el).attr("href"),
      });
    });

    res.status(200).json({
      baseUrl,
      totalLinks: links.length,
      links,
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
