import fs from "fs";
import path from "path";
import * as cheerio from "cheerio";
import chromium from "@sparticuz/chromium";
import playwright from "playwright-core";

export default async function handler(req, res) {
  let browser;
  try {
    const baseUrlPath = path.join(process.cwd(), "src", "baseurl.txt");
    const baseUrl = fs.readFileSync(baseUrlPath, "utf8").trim();

    browser = await playwright.chromium.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true
    });

    const page = await browser.newPage();
    await page.goto(baseUrl, { waitUntil: "networkidle" });

    // Get rendered HTML
    const html = await page.content();
    const $ = cheerio.load(html);

    const featured = [];
    $("#featured-titles .owl-item article").each((_, el) => {
      featured.push({
        title: $(el).find("h3 a").text().trim(),
        year: $(el).find(".data.dfeatur span").text().trim(),
        rating: $(el).find(".rating").text().trim(),
        img: $(el).find(".poster img").attr("src"),
        link: $(el).find(".poster a").attr("href")
      });
    });

    res.status(200).json({
      baseUrl,
      totalFeatured: featured.length,
      featured
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    if (browser) await browser.close();
  }
}
