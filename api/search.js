// api/search.js
import fetch from "node-fetch";
import cheerio from "cheerio";

// Base URL (no fs, just hardcode or env variable)
const BASE_URL = process.env.BASE_URL || "https://multimovies.pro";

async function scrapeSearch(searchTerm) {
  const url = `${BASE_URL}/?s=${encodeURIComponent(searchTerm)}`;

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
