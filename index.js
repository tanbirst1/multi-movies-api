import express from 'express';
import { chromium } from 'playwright';

const app = express();

app.get('/scrape', async (req, res) => {
  const url = req.query.url;
  if (!url) return res.json({ status: false, error: "Missing URL" });

  try {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    await page.goto(url, { waitUntil: "networkidle" });

    // If page loads, status true
    const html = await page.content();
    await browser.close();

    res.json({ status: true, html });

  } catch (err) {
    res.json({ status: false, error: err.toString() });
  }
});

app.listen(3000, () => console.log("✅ Render scraper running on port 3000"));
