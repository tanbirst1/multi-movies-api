// /api/index.js
import fs from 'fs';
import path from 'path';
import cheerio from 'cheerio';
import fetch from 'node-fetch';

export default async function handler(req, res) {
  try {
    // 1. Read base URL from ../src/baseurl.txt
    const basePath = path.join(process.cwd(), 'src', 'baseurl.txt');
    const baseUrl = fs.readFileSync(basePath, 'utf8').trim();

    // 2. Fetch fully rendered HTML using an HTML formatter API (jina.ai proxy)
    const formattedUrl = `https://r.jina.ai/http://${baseUrl.replace(/^https?:\/\//, '')}`;
    const htmlResponse = await fetch(formattedUrl);
    const html = await htmlResponse.text();

    // 3. Parse HTML with cheerio
    const $ = cheerio.load(html);
    let featured = [];

    $('#featured-titles article').each((i, el) => {
      const img = $(el).find('.poster img').attr('src');
      const title = $(el).find('h3 a').text().trim();
      const link = $(el).find('h3 a').attr('href');
      const rating = $(el).find('.rating').text().trim();
      const year = $(el).find('.data span').text().trim();

      featured.push({
        title,
        link,
        img,
        rating,
        year
      });
    });

    // 4. Send response
    res.status(200).json({
      status: "ok",
      base: baseUrl,
      totalFeatured: featured.length,
      featured
    });

  } catch (err) {
    res.status(500).json({
      status: "error",
      message: err.message
    });
  }
}
