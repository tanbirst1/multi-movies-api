// api/video.js
import fetch from "node-fetch";
import * as cheerio from "cheerio";

export default async function handler(req, res) {
  try {
    const { slug } = req.query;
    if (!slug) {
      return res.status(400).json({ error: "Missing slug parameter" });
    }

    // Build target URL
    const targetUrl = `https://multimovies.pro/${slug}`;

    // Fetch HTML
    const response = await fetch(targetUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
      },
    });

    const html = await response.text();
    const $ = cheerio.load(html);

    // Function to safely get iframe src
    const getIframeSrc = () =>
      $("#source-player-1 iframe").attr("src") || "";

    // First attempt
    let iframeSrc = getIframeSrc();

    // If blank, retry a few times with delays (simulate waiting for AJAX)
    let attempts = 0;
    while (
      (!iframeSrc || iframeSrc.startsWith("about:blank")) &&
      attempts < 5
    ) {
      await new Promise((r) => setTimeout(r, 1500)); // wait 1.5s
      iframeSrc = getIframeSrc();
      attempts++;
    }

    if (!iframeSrc || iframeSrc.startsWith("about:blank")) {
      return res
        .status(404)
        .json({ error: "Could not resolve video iframe src" });
    }

    res.status(200).json({
      slug,
      iframe: iframeSrc,
    });
  } catch (err) {
    console.error("Scraper error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
}
