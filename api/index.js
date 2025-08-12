import fetch from "node-fetch";
import * as cheerio from "cheerio";
import fs from "fs";
import path from "path";

export default async function handler(req, res) {
  try {
    // Read base URL from src/baseurl.txt
    const basePath = path.join(process.cwd(), "src", "baseurl.txt");
    const baseURL = fs.readFileSync(basePath, "utf8").trim();

    // Step 1: Get Cloudflare cookies
    let cookieHeaders = "";
    const homeResp = await fetch(baseURL, {
      headers: { "User-Agent": "Mozilla/5.0", "Accept": "text/html" },
    });
    const setCookies = homeResp.headers.get("set-cookie");
    if (setCookies) {
      cookieHeaders = setCookies
        .split(",")
        .map((c) => c.split(";")[0])
        .join("; ");
    }

    // Step 2: Fetch homepage HTML with cookies
    const response = await fetch(baseURL + "/", {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept": "text/html",
        "Cookie": cookieHeaders,
      },
    });
    if (!response.ok)
      return res.status(500).json({ error: `Fetch failed: ${response.status}` });

    const html = await response.text();
    const $ = cheerio.load(html);

    // Helper: Clean link (make relative from baseURL)
    function cleanLink(link) {
      if (!link) return "";
      if (link.startsWith(baseURL)) return link.replace(baseURL, "");
      return link;
    }

    // Helper: Fix image URL (add https: if starts with //)
    function fixImage(src) {
      if (!src) return "";
      if (src.startsWith("//")) return "https:" + src;
      return src;
    }

    // Step 3: Scrape Featured Titles
    const featured = [];
    $("#featured-titles .owl-item article").each((i, el) => {
      const title = $(el).find("h3 a").text().trim();
      const year = $(el).find(".data.dfeatur span").text().trim();
      const rating = $(el).find(".rating").text().trim();
      let img = $(el).find(".poster img").attr("src") || $(el).find(".poster img").attr("data-src");
      let link = $(el).find(".poster a").attr("href");

      img = fixImage(img);
      link = cleanLink(link);

      if (title) {
        featured.push({ title, year, rating, img, link });
      }
    });

    // Step 4: Send JSON response
    res.status(200).json({
      status: "ok",
      base: baseURL,
      totalFeatured: featured.length,
      featured,
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
