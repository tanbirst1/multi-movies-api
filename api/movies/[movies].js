export default {
  async fetch(request, env, ctx) {
    try {
      const url = new URL(request.url);
      const pathParts = url.pathname.split('/').filter(Boolean); // e.g. ["api", "movies", "slug"]
      if (pathParts.length < 3) {
        return new Response('Missing movie slug', { status: 400 });
      }
      const slug = pathParts[2];
      const BASE = 'https://multimovies.coupons/movies';
      const targetUrl = `${BASE}/${slug}/`;

      // Fetch target movie page
      const resp = await fetch(targetUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0 Safari/537.36',
          'Accept': 'text/html',
        },
      });
      if (!resp.ok) {
        return new Response(`Failed to fetch movie page: ${resp.status}`, { status: resp.status });
      }
      const html = await resp.text();

      // Parse HTML via DOMParser or regex (Cloudflare Workers don't have DOMParser, so use regex + DOMParser polyfill or parse with regex carefully)

      // Minimal DOMParser polyfill in Cloudflare Workers:
      // We can use 'linkedom' (not available here), so let's do robust regex.

      // Extract Title
      const titleMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
      const title = titleMatch ? titleMatch[1].trim() : null;

      // Extract Poster Image - remove size suffix like "-200x300"
      let posterMatch = html.match(/<div class="poster">\s*<img[^>]+src="([^"]+)"[^>]*>/i);
      let poster = posterMatch ? posterMatch[1].trim() : null;
      if (poster) {
        poster = poster.replace(/-\d+x\d+(\.\w+)$/, '$1');
      }

      // Extract Synopsis (inside div with class "wp-content" inside #info)
      const synMatch = html.match(/<div id="info"[^>]*>[\s\S]*?<div itemprop="description" class="wp-content">\s*<p>([\s\S]*?)<\/p>/i);
      const synopsis = synMatch ? synMatch[1].trim() : null;

      // Extract Genres (inside div.sgeneros > multiple <a>)
      const genres = [];
      const genreRegex = /<div class="sgeneros">([\s\S]*?)<\/div>/i;
      const genreBlockMatch = html.match(genreRegex);
      if (genreBlockMatch) {
        const genreLinks = genreBlockMatch[1].match(/<a href="([^"]+)"[^>]*>([^<]+)<\/a>/g);
        if (genreLinks) {
          for (const g of genreLinks) {
            const hrefMatch = g.match(/href="([^"]+)"/);
            const nameMatch = g.match(/>([^<]+)<\/a>/);
            if (hrefMatch && nameMatch) {
              genres.push({ name: nameMatch[1], url: hrefMatch[1] });
            }
          }
        }
      }

      // Extract Release Date (in .date inside .extra)
      const dateMatch = html.match(/<span class="date"[^>]*>([^<]+)<\/span>/i);
      const releaseDate = dateMatch ? dateMatch[1].trim() : null;

      // Extract Views count (in #playernotice data-text attribute, like "175607 Views")
      let views = null;
      const viewsMatch = html.match(/<span id="playernotice"[^>]*data-text="([\d,]+) Views"/i);
      if (viewsMatch) {
        views = viewsMatch[1].replace(/,/g, '');
      }

      // Extract Ratings (9.5 etc. from .starstruck or custom place)
      const ratingMatch = html.match(/<div class="dt_rating_vgs"[^>]*>([\d.]+)<\/div>/i);
      const rating = ratingMatch ? parseFloat(ratingMatch[1]) : null;

      // Extract IMDb rating & votes (optional)
      const imdbMatch = html.match(/<b id="repimdb"><strong>([\d.]+)<\/strong>\s*([\d,]+) votes<\/b>/i);
      let imdbRating = null;
      let imdbVotes = null;
      if (imdbMatch) {
        imdbRating = parseFloat(imdbMatch[1]);
        imdbVotes = parseInt(imdbMatch[2].replace(/,/g, ''));
      }

      // Extract TMDb rating & votes (optional)
      const tmdbMatch = html.match(/<div class="custom_fields">[\s\S]*?TMDb Rating<\/b>\s*<span class="valor"><strong>([\d.]+)<\/strong>\s*(\d+) votes<\/span>/i);
      let tmdbRating = null;
      let tmdbVotes = null;
      if (tmdbMatch) {
        tmdbRating = parseFloat(tmdbMatch[1]);
        tmdbVotes = parseInt(tmdbMatch[2]);
      }

      // Extract Video sources iframe URLs (inside dooplay_player_content)
      const videoSources = [];
      const videoSectionMatch = html.match(/<div id="dooplay_player_content">([\s\S]*?)<\/div><\/div><\/div>/i);
      if (videoSectionMatch) {
        const iframes = [...videoSectionMatch[1].matchAll(/<iframe[^>]+src="([^"]+)"[^>]*><\/iframe>/gi)];
        for (const iframe of iframes) {
          videoSources.push(iframe[1]);
        }
      }

      // Extract Cast (inside #cast div.person)
      const cast = [];
      const castSectionMatch = html.match(/<div id="cast"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*$/i);
      if (castSectionMatch) {
        const castHtml = castSectionMatch[1];
        const personRegex = /<div class="person"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/g;
        let match;
        while ((match = personRegex.exec(castHtml)) !== null) {
          const personHtml = match[1];
          // Name
          const nameMatch = personHtml.match(/<meta itemprop="name" content="([^"]+)"/);
          const name = nameMatch ? nameMatch[1].trim() : null;
          // Role (caracter)
          const roleMatch = personHtml.match(/<div class="caracter">([^<]+)<\/div>/);
          const role = roleMatch ? roleMatch[1].trim() : null;
          // Image src
          const imgMatch = personHtml.match(/<img[^>]+src="([^"]+)"/);
          const image = imgMatch ? imgMatch[1].trim() : null;
          // Link
          const linkMatch = personHtml.match(/<a[^>]+href="([^"]+)"/);
          const link = linkMatch ? linkMatch[1].trim() : null;
          if (name) cast.push({ name, role, image, link });
        }
      }

      // Compose JSON response
      const data = {
        slug,
        title,
        poster,
        synopsis,
        genres,
        releaseDate,
        views: views ? parseInt(views) : null,
        rating,
        imdbRating,
        imdbVotes,
        tmdbRating,
        tmdbVotes,
        videoSources,
        cast,
      };

      return new Response(JSON.stringify(data, null, 2), {
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (e) {
      return new Response('Error: ' + e.message, { status: 500 });
    }
  },
};
