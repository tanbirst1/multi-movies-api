const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs').promises;
const path = require('path');

// Retry logic for HTTP requests with exponential backoff
async function fetchWithRetry(url, maxRetries = 3, baseDelay = 1000) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
        },
        timeout: 8000, // Reduced timeout to 8 seconds to prevent hanging
        maxContentLength: 5 * 1024 * 1024 // Limit response size to 5MB to prevent memory issues
      });

      // Check for Cloudflare protection or invalid response
      if (response.status >= 400 || response.data.includes('cf-browser-verification')) {
        throw new Error(`Request failed with status ${response.status} or Cloudflare protection detected`);
      }

      return response;
    } catch (error) {
      if (attempt === maxRetries) {
        console.error(`Final attempt failed for ${url}: ${error.message}`);
        throw new Error(`Failed to fetch ${url}: ${error.message}`);
      }
      const delay = baseDelay * Math.pow(2, attempt - 1); // Exponential backoff
      console.warn(`Attempt ${attempt} failed for ${url}: ${error.message}. Retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

// Safely read base URL from file
async function readBaseUrl() {
  try {
    const baseUrlPath = path.join(__dirname, '..', 'src', 'baseurl.txt');
    const baseUrl = await fs.readFile(baseUrlPath, 'utf8');
    const trimmedUrl = baseUrl.trim();
    // Validate URL
    if (!trimmedUrl.startsWith('http')) {
      throw new Error('Invalid URL in baseurl.txt');
    }
    return trimmedUrl;
  } catch (error) {
    console.error('Error reading baseurl.txt:', error.message);
    return 'https://multimovies.pro/'; // Fallback URL
  }
}

// Main scraping function with enhanced error handling
async function scrapeWebsite(url) {
  try {
    // Fetch HTML with retry
    const response = await fetchWithRetry(url);
    if (!response || !response.data) {
      throw new Error('No response data received');
    }

    // Load HTML into cheerio with error handling
    let $;
    try {
      $ = cheerio.load(response.data, { xmlMode: false, decodeEntities: true });
    } catch (error) {
      throw new Error(`Failed to parse HTML: ${error.message}`);
    }

    // Helper function to safely extract text
    const safeText = (selector, defaultValue = 'N/A') => {
      try {
        return $(selector).text().trim() || defaultValue;
      } catch {
        return defaultValue;
      }
    };

    // Helper function to safely extract attribute
    const safeAttr = (selector, attr, defaultValue = '') => {
      try {
        return $(selector).attr(attr) || defaultValue;
      } catch {
        return defaultValue;
      }
    };

    // Helper function to safely map elements
    const safeMap = (selector, callback, defaultValue = []) => {
      try {
        return $(selector).length ? $(selector).map((i, el) => callback($(el))).get() : defaultValue;
      } catch {
        return defaultValue;
      }
    };

    // Extract title
    const title = safeText('h1:first-child', 'Unknown Title');

    // Extract poster
    const poster = safeAttr('.poster img', 'src') || safeAttr('.poster img', 'data-src', '');

    // Extract genres
    const genres = safeMap('.sgeneros a', el => el.text().trim(), []);

    // Extract networks
    const networks = safeMap('.extra span a', el => el.text().trim(), []);

    // Extract rating
    const rating = safeText('.dt_rating_vgs', 'N/A');
    const ratingCount = safeText('.rating-count', '0');

    // Extract synopsis
    const synopsis = safeText('#info .wp-content p', 'No synopsis available');

    // Extract seasons and episodes
    const seasons = [];
    try {
      $('#seasons .se-c').each((i, seasonEl) => {
        const seasonNumber = safeText($(seasonEl).find('.se-t'), 'Unknown');
        const seasonTitle = safeText($(seasonEl).find('.title'), `Season ${seasonNumber}`);
        const episodes = [];

        $(seasonEl).find('.episodios li').each((j, episodeEl) => {
          const episodeNumber = safeText($(episodeEl).find('.numerando'), 'N/A');
          const episodeTitle = safeText($(episodeEl).find('.episodiotitle a'), 'Untitled Episode');
          const episodeUrl = safeAttr($(episodeEl).find('.episodiotitle a'), 'href', '');
          const episodeDate = safeText($(episodeEl).find('.episodiotitle .date'), 'Unknown Date');
          const episodeImage = safeAttr($(episodeEl).find('.imagen img'), 'data-src') || 
                              safeAttr($(episodeEl).find('.imagen img'), 'src', '');

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
    } catch (error) {
      console.error('Error parsing seasons:', error.message);
      seasons.push({ seasonNumber: 'N/A', title: 'No Seasons', episodes: [] });
    }

    // Extract cast
    const cast = safeMap('#cast .person', personEl => ({
      name: safeText(personEl.find('.data .name a'), 'Unknown Actor'),
      character: safeText(personEl.find('.data .caracter'), 'Unknown Character'),
      image: safeAttr(personEl.find('.img img'), 'data-src') || safeAttr(personEl.find('.img img'), 'src', '')
    }), []);

    // Extract metadata
    const metadata = {};
    try {
      $('.custom_fields').each((i, el) => {
        const key = safeText($(el).find('.variante'), `field_${i}`).replace(/\s+/g, '_').toLowerCase();
        const value = safeText($(el).find('.valor'), 'N/A');
        metadata[key] = value;
      });
    } catch (error) {
      console.error('Error parsing metadata:', error.message);
    }

    return {
      status: 'ok',
      slug: safeAttr('meta[id="dooplay-ajax-counter"]', 'data-postid', 'N/A'),
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
      message: `Scraping failed: ${error.message}`
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
    // Read base URL
    const baseUrl = await readBaseUrl();
    
    // Construct URL
    const slug = req.query.slug || 'a-couple-of-cuckoos';
    const url = req.query.url || `${baseUrl}tvshows/${slug}/`;

    // Validate URL
    if (!url.match(/^https?:\/\/[^\s/$.?#].[^\s]*$/)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid URL provided'
      });
    }

    const data = await scrapeWebsite(url);
    res.status(200).json(data);
  } catch (error) {
    console.error('Handler error:', error.message);
    res.status(500).json({
      status: 'error',
      message: `Server error: ${error.message}`
    });
  }
};
