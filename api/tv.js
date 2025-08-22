const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs').promises;
const path = require('path');

// Retry logic for HTTP requests
async function fetchWithRetry(url, maxRetries = 3, delay = 1000) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        },
        timeout: 10000 // 10-second timeout
      });

      // Check for Cloudflare protection (e.g., 403 or specific content)
      if (response.status === 403 || response.data.includes('cf-browser-verification')) {
        throw new Error('Cloudflare protection detected');
      }

      return response;
    } catch (error) {
      if (attempt === maxRetries) {
        throw error;
      }
      console.warn(`Attempt ${attempt} failed for ${url}: ${error.message}. Retrying...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

async function readBaseUrl() {
  try {
    const baseUrlPath = path.join(__dirname, '..', 'src', 'baseurl.txt');
    const baseUrl = await fs.readFile(baseUrlPath, 'utf8');
    return baseUrl.trim();
  } catch (error) {
    console.error('Error reading baseurl.txt:', error.message);
    return 'https://multimovies.pro/'; // Fallback URL
  }
}

async function scrapeWebsite(url) {
  try {
    // Fetch the HTML content with retry
    const response = await fetchWithRetry(url);
    const html = response.data;

    // Load HTML into cheerio
    const $ = cheerio.load(html);

    // Extract title with fallback
    const title = $('h1').first().text().trim() || 'Unknown Title';

    // Extract poster with fallback
    const poster = $('.poster img').attr('src') || $('.poster img').attr('data-src') || '';

    // Extract genres with fallback
    const genres = $('.sgeneros a').length
      ? $('.sgeneros a').map((i, el) => $(el).text().trim()).get()
      : [];

    // Extract networks with fallback
    const networks = $('.extra span a').length
      ? $('.extra span a').map((i, el) => $(el).text().trim()).get()
      : [];

    // Extract rating with fallback
    const rating = $('.dt_rating_vgs').text().trim() || 'N/A';
    const ratingCount = $('.rating-count').text().trim() || '0';

    // Extract synopsis with fallback
    const synopsis = $('#info .wp-content p').text().trim() || 'No synopsis available';

    // Extract seasons and episodes with fallback
    const seasons = [];
    $('#seasons .se-c').each((i, seasonEl) => {
      const seasonNumber = $(seasonEl).find('.se-t').text().trim() || 'Unknown';
      const seasonTitle = $(seasonEl).find('.title').text().trim() || `Season ${seasonNumber}`;
      const episodes = [];

      $(seasonEl).find('.episodios li').each((j, episodeEl) => {
        const episodeNumber = $(episodeEl).find('.numerando').text().trim() || 'N/A';
        const episodeTitle = $(episodeEl).find('.episodiotitle a').text().trim() || 'Untitled Episode';
        const episodeUrl = $(episodeEl).find('.episodiotitle a').attr('href') || '';
        const episodeDate = $(episodeEl).find('.episodiotitle .date').text().trim() || 'Unknown Date';
        const episodeImage = $(episodeEl).find('.imagen img').attr('data-src') || 
                            $(episodeEl).find('.imagen img').attr('src') || '';

        episodes.push({
          episodeNumber,
          title: episodeTitle,
          url: episodeUrl,
          date: episodeDate,
          image: episodeImage
        });
      });

      seasons.push({
        seasonNumber,
        title: seasonTitle,
        episodes
      });
    });

    // Extract cast with fallback
    const cast = [];
    $('#cast .person').each((i, personEl) => {
      const name = $(personEl).find('.data .name a').text().trim() || 'Unknown Actor';
      const character = $(personEl).find('.data .caracter').text().trim() || 'Unknown Character';
      const image = $(personEl).find('.img img').attr('data-src') || 
                    $(personEl).find('.img img').attr('src') || '';

      cast.push({
        name,
        character,
        image
      });
    });

    // Extract metadata with fallback
    const metadata = {};
    $('.custom_fields').each((i, el) => {
      const key = $(el).find('.variante').text().trim().replace(/\s+/g, '_').toLowerCase() || `field_${i}`;
      const value = $(el).find('.valor').text().trim() || 'N/A';
      metadata[key] = value;
    });

    // Construct the response object
    return {
      status: 'ok',
      slug: $('meta[id="dooplay-ajax-counter"]').attr('data-postid') || 'N/A',
      title,
      poster,
      genres,
      networks,
      rating,
      ratingCount,
      synopsis,
      seasons,
      cast,
      metadata
    };
  } catch (error) {
    console.error('Scraping error:', error.message);
    return {
      status: 'error',
      message: error.message
    };
  }
}

// Vercel serverless function handler
module.exports = async (req, res) => {
  // Handle CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // Read base URL from file
    const baseUrl = await readBaseUrl();
    
    // Get URL from query parameter or construct default
    const slug = req.query.slug || 'a-couple-of-cuckoos';
    const url = req.query.url || `${baseUrl}tvshows/${slug}/`;

    const data = await scrapeWebsite(url);
    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
};
