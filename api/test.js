import cloudscraper from 'cloudscraper';
import cheerio from 'cheerio';

export default async function handler(req, res) {
  try {
    // Fetch page HTML bypassing Cloudflare's JS challenge
    const html = await cloudscraper.get('https://multimovies.coupons/');
    
    // Load HTML into cheerio
    const $ = cheerio.load(html);
    const links = [];

    // Extract only href attributes from <a> tags
    $('a').each((_, el) => {
      const href = $(el).attr('href');
      if (href && !href.startsWith('#')) {
        links.push(href);
      }
    });

    res.status(200).json({
      status: 'ok',
      total: links.length,
      links
    });
  } catch (err) {
    res.status(500).json({
      status: 'error',
      message: err.message
    });
  }
}
