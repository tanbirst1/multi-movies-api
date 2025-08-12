// /api/index.js
import fs from "fs";
import path from "path";
import cheerio from "cheerio";
import chromium from "@sparticuz/chromium-min";
import playwright from "playwright-core";

export default async function handler(req, res) {
  try {
    const baseFile = path.join(process.cwd(), "src", "baseurl.txt");
    const baseUrl = fs.readFileSync(baseFile, "utf-8").trim();

    // Launch lightweight Chromium in Vercel
    const browser = await playwright.chromium.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });

    const page = await browser.newPage();
    await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 30000 });

    // Wait for articles or main content
    await page.waitForSelector("article, .post, .movie", { timeout: 10000 }).catch(() => {});

    const html = await page.content();
    await browser.close();

    const $ = cheerio.load(html);
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

    res.status(200).json({
      baseUrl,
      totalFeatured: featured.length,
      featured,
    });
  } catch (err) {
    res.status(500).json({
      error: err.message,
    });
  }
}
