import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import fs from 'fs';
import path from 'path';

export default async function handler(req, res) {
  try {
    // Try to read base URL from ../src/baseurl.txt, otherwise default
    let baseURL;
    try {
      const basePath = path.join(process.cwd(), 'src', 'baseurl.txt');
      baseURL = fs.readFileSync(basePath, 'utf8').trim();
    } catch {
      baseURL = 'https://multimovies.coupons/';
    }
    baseURL = baseURL.replace(/\/$/, ''); // remove trailing slash

    // Get cookies (optional for Cloudflare)
    let cookieHeaders = '';
    const homeResp = await fetch(baseURL, {
      headers: { "User-Agent": "Mozilla/5.0", "Accept": "text/html" }
    });
    const setCookies = homeResp.headers.get('set-cookie');
    if (setCookies) cookieHeaders = setCookies.split(',').map(c => c.split(';')[0]).join('; ');

    // Fetch homepage HTML with cookies
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

    // Scrape Featured Titles
    const featured = [];
    $('#featured-titles .owl-item article').each((_, el) => {
      const title = $(el).find('h3 a').text().trim();
      const year = $(el).find('.data.dfeatur span').text().trim();
      const rating = $(el).find('.rating').text().trim();
      const img = fixImage($(el).find('.poster img').attr('src'));
      const link = cleanLink($(el).find('.poster a').attr('href'));

      if (title) {
        featured.push({ title, year, rating, img, link });
      }
    });

    res.status(200).json({
      status: 'ok',
      base: baseURL,
      totalFeatured: featured.length,
      featured
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
