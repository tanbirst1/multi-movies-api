import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import fs from 'fs';
import path from 'path';

export default async function handler(req, res) {
  try {
    // Read base URL from src/base_url.txt
    const basePath = path.join(process.cwd(), 'src', 'base_url.txt');
    const baseURL = fs.readFileSync(basePath, 'utf8').trim();

    // Optional: Grab initial cookies to bypass Cloudflare
    let cookieHeaders = '';
    const homeResp = await fetch(baseURL, {
      headers: { "User-Agent": "Mozilla/5.0", "Accept": "text/html" }
    });
    const setCookies = homeResp.headers.get('set-cookie');
    if (setCookies) cookieHeaders = setCookies.split(',').map(c => c.split(';')[0]).join('; ');

    // Fetch homepage HTML
    const response = await fetch(baseURL + '/', {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept": "text/html",
        "Cookie": cookieHeaders
      }
    });
    if (!response.ok) {
      return res.status(500).json({ error: `Fetch failed: ${response.status}` });
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // Helper functions
    function cleanLink(link) {
      if (!link) return '';
      if (link.startsWith(baseURL)) return link.replace(baseURL, '');
      return link;
    }
    function fixImage(src) {
      if (!src) return '';
      if (src.startsWith('//')) return 'https:' + src;
      return src;
    }

    // Scrape Featured section
    function scrapeFeatured() {
      let data = [];
      $('#featured-titles .owl-item').each((i, el) => {
        const article = $(el).find('article');
        const title = article.find('.data.dfeatur h3 a').text().trim();
        let link = article.find('.data.dfeatur h3 a').attr('href');
        let image = article.find('.poster img').attr('src');
        const rating = article.find('.poster .rating').text().trim();
        const year = article.find('.data.dfeatur span').text().trim();
        link = cleanLink(link);
        image = fixImage(image);
        if (title) {
          data.push({ title, link, image, rating, year });
        }
      });
      return data;
    }

    const featured = scrapeFeatured();
    const totalFeatured = featured.length;

    // You can still scrape other sections like in your example
    // const newestDrops = scrapeSwiperSection("Newest Drops"); ...

    res.status(200).json({
      status: "ok",
      base: baseURL,
      totalFeatured,
      featured
      // newestDrops, ...
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
