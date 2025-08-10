import express from 'express';
import chromium from 'chrome-aws-lambda';

const app = express();

app.get('/scrape', async (req, res) => {
  const url = req.query.url;
  if (!url) return res.json({ status: false, error: "Missing URL" });

  try {
    const browser = await chromium.puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath,
      headless: chromium.headless,
    });

    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "networkidle0" });

    const html = await page.content();
    await browser.close();

    res.json({ status: true, html });
  } catch (err) {
    res.json({ status: false, error: err.toString() });
  }
});

app.listen(3000, () => console.log("✅ Scraper running"));
