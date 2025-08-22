import fs from 'fs';
import path from 'path';
import axios from 'axios';
import cheerio from 'cheerio';

export default async function handler(req, res) {
  const { name } = req.query;
  if (!name) {
    return res.status(400).json({ error: "Please provide ?name={show-name}" });
  }

  try {
    // Read base URL
    const basePath = path.join(process.cwd(), 'src', 'baseurl.txt');
    const baseUrl = fs.readFileSync(basePath, 'utf-8').trim();

    const showUrl = `${baseUrl}/tvshows/${name}`;
    const { data } = await axios.get(showUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      }
    });

    const $ = cheerio.load(data);

    // Title
    const title = $('h1[itemprop="name"]').text().trim();

    // Description
    const description = $('div.description').text().trim() || $('div[itemprop="description"]').text().trim();

    // Cover Image
    const coverImage = $('div.thumb img').attr('src') || $('img[itemprop="image"]').attr('src');

    // Episodes list
    const episodes = [];
    $('ul.episodes li a').each((i, el) => {
      const epTitle = $(el).text().trim();
      const epUrl = $(el).attr('href');
      episodes.push({
        episode: epTitle,
        url: epUrl.startsWith('http') ? epUrl : `${baseUrl}${epUrl}`
      });
    });

    res.json({
      baseUrl,
      showUrl,
      title,
      description,
      coverImage,
      totalEpisodes: episodes.length,
      episodes
    });

  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: "Failed to fetch show details" });
  }
}
