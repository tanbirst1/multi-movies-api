const axios = require('axios');
const cheerio = require('cheerio');

async function scrapeWebsite(https://multimovies.pro) {
  try {
    // Fetch the HTML content
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    const html = response.data;

    // Load HTML into cheerio
    const $ = cheerio.load(html);

    // Extract title
    const title = $('h1').first().text().trim();

    // Extract poster
    const poster = $('.poster img').attr('src') || $('.poster img').attr('data-src');

    // Extract genres
    const genres = $('.sgeneros a').map((i, el) => $(el).text().trim()).get();

    // Extract networks
    const networks = $('.extra span a').map((i, el) => $(el).text().trim()).get();

    // Extract rating
    const rating = $('.dt_rating_vgs').text().trim();
    const ratingCount = $('.rating-count').text().trim();

    // Extract synopsis
    const synopsis = $('#info .wp-content p').text().trim();

    // Extract seasons and episodes
    const seasons = [];
    $('#seasons .se-c').each((i, seasonEl) => {
      const seasonNumber = $(seasonEl).find('.se-t').text().trim();
      const seasonTitle = $(seasonEl).find('.title').text().trim();
      const episodes = [];

      $(seasonEl).find('.episodios li').each((j, episodeEl) => {
        const episodeNumber = $(episodeEl).find('.numerando').text().trim();
        const episodeTitle = $(episodeEl).find('.episodiotitle a').text().trim();
        const episodeUrl = $(episodeEl).find('.episodiotitle a').attr('href');
        const episodeDate = $(episodeEl).find('.episodiotitle .date').text().trim();
        const episodeImage = $(episodeEl).find('.imagen img').attr('data-src') || $(episodeEl).find('.imagen img').attr('src');

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

    // Extract cast
    const cast = [];
    $('#cast .person').each((i, personEl) => {
      const name = $(personEl).find('.data .name a').text().trim();
      const character = $(personEl).find('.data .caracter').text().trim();
      const image = $(personEl).find('.img img').attr('data-src') || $(personEl).find('.img img').attr('src');

      cast.push({
        name,
        character,
        image
      });
    });

    // Extract additional metadata
    const metadata = {};
    $('.custom_fields').each((i, el) => {
      const key = $(el).find('.variante').text().trim().replace(/\s+/g, '_').toLowerCase();
      const value = $(el).find('.valor').text().trim();
      metadata[key] = value;
    });

    // Construct the response object
    return {
      status: 'ok',
      slug: $('meta[id="dooplay-ajax-counter"]').attr('data-postid'),
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

  // Get URL from query parameter or use default
  const url = req.query.url || 'https://multimovies.pro/tvshows/a-couple-of-cuckoos/';

  try {
    const data = await scrapeWebsite(url);
    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
};
