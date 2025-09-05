// api/search.js
import fs from "fs";
import path from "path";
import fetch from "node-fetch";
import cheerio from "cheerio";

// Helper to read base URL
function getBaseURL() {
  const filePath = path.resolve(process.cwd(), "src", "baseurl.txt");
  try {
    const baseURL = fs.readFileSync(filePath, "utf-8").trim();
    return baseURL.replace(/\/+$/, "");
  } catch (err) {
    console.error("Error reading baseurl.txt:", err);
    return "https://multimovies.pro"; // fallback
  }
}

// Scrape search results
async function scrapeSearch(searchTerm) {
  const baseURL = getBaseURL();
  const url = `${baseURL}/?s=${encodeURIComponent(searchTerm)}`;

  const res = await fetch(url, { timeout: 15000 });
  if (!res.ok) throw new Error("Failed to fetch search results");

  const html = await res.text();
  const $ = cheerio.load(html);

  const results = [];

  $(".result-item article").each((_, el) => {
    const $el = $(el);

    const link = $el.find(".thumbnail a").attr("href") || "";
    const img = $el.find(".thumbnail img").attr("src") || "";
    const type = $el.find(".thumbnail span").text() || "";
    const title = $el.find(".details .title a").text() || "";
    const year = $el.find(".details .meta .year").text() || "";
    const rating = $el.find(".details .meta .rating").text() || "";
    const description = $el.find(".details .contenido p").text() || "";

    results.push({
      title,
      link,
      img,
      type,
      year,
      rating,
      description,
    });
  });

  return results;
}

// Vercel handler
export default async function handler(req, res) {
  try {
    const searchTerm = req.query.s || "";
    if (!searchTerm) {
      return res.status(400).json({ error: "Missing search term (?s=...)" });
    }

    const results = await scrapeSearch(searchTerm);
    res.status(200).json({ status: "ok", query: searchTerm, results });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: "error", message: err.message });
  }
}
