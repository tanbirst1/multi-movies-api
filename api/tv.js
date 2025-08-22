// api/index.js
import { format } from 'html-formatter'; // Use html-formatter for beautifying HTML

export default {
  async fetch(request) {
    // Default target
    let TARGET = "https://multimovies.pro";

    // Attempt to load custom target from ../src/baseurl.txt
    try {
      const urlResponse = await fetch(
        new URL("../src/baseurl.txt", import.meta.url)
      );
      if (urlResponse.ok) {
        const text = (await urlResponse.text()).trim();
        if (text) TARGET = text;
      }
    } catch (e) {
      // Ignore error, fallback to default
      console.warn('Failed to load baseurl.txt:', e.message);
    }

    try {
      const urlObj = new URL(request.url);
      const name = urlObj.searchParams.get('name');
      if (!name) {
        return new Response(
          JSON.stringify({ error: "name parameter is required" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }

      const targetUrl = `${TARGET}/tvshows/${name}/`;

      const r = await fetch(targetUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0 Safari/537.36",
          "Accept":
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          "Connection": "keep-alive",
          "Referer": "https://multimovies.coupons/",
          "Sec-Fetch-Dest": "document",
          "Sec-Fetch-Mode": "navigate",
          "Sec-Fetch-Site": "same-origin",
          "Sec-Fetch-User": "?1",
          "Upgrade-Insecure-Requests": "1",
        },
      });

      if (!r.ok) {
        return new Response(
          JSON.stringify({ error: "fetch_failed", status: r.status }),
          { status: 502, headers: { "Content-Type": "application/json" } }
        );
      }

      const html = await r.text();
      // Beautify the HTML to ensure consistent parsing
      const formattedHtml = format(html);

      const data = {};

      // Extract title
      const titleRegex = /<h1[^>]*>([^<]+)<\/h1>/i;
      data.title = titleRegex.exec(formattedHtml)?.[1]?.trim() || '';

      // Extract poster and posterAlt (try src first, then data-src for lazy-loaded)
      const posterRegex = /<div class="poster"[^>]*>\s*<img[^>]*(?:src|data-src)="([^"]+)"[^>]*alt="([^"]+)"[^>]*>/i;
      const posterMatch = posterRegex.exec(formattedHtml);
      data.poster = posterMatch ? posterMatch[1] : '';
      data.posterAlt = posterMatch ? posterMatch[2]?.trim() : '';

      // Extract date
      const dateRegex = /<span class="date"[^>]*>([^<]+)<\/span>/i;
      data.date = dateRegex.exec(formattedHtml)?.[1]?.trim() || '';

      // Extract networks
      data.networks = [];
      const networkRegex = /<a href="https:\/\/multimovies\.pro\/network\/[^"]+"[^>]*>([^<]+)<\/a>/gi;
      let match;
      while ((match = networkRegex.exec(formattedHtml)) !== null) {
        data.networks.push(match[1].trim());
      }

      // Extract genres
      data.genres = [];
      const genreRegex = /<a href="https:\/\/multimovies\.pro\/genre\/[^"]+"[^>]*>([^<]+)<\/a>/gi;
      while ((match = genreRegex.exec(formattedHtml)) !== null) {
        data.genres.push(match[1].trim());
      }

      // Extract rating
      const ratingValueRegex = /<span class="dt_rating_vgs"[^>]*>([^<]+)<\/span>/i;
      data.ratingValue = ratingValueRegex.exec(formattedHtml)?.[1]?.trim() || '';
      const ratingCountRegex = /<span class="rating-count"[^>]*>([^<]+)<\/span>/i;
      data.ratingCount = ratingCountRegex.exec(formattedHtml)?.[1]?.trim() || '';

      // Extract seasons and episodes
      data.seasons = [];
      const seasonRegex = /<div class="se-c"[^>]*>([\s\S]*?)<\/div>/gi;
      while ((match = seasonRegex.exec(formattedHtml)) !== null) {
        const seasonContent = match[1];
        const seasonNumRegex = /<span class="se-t(?:\s+se-o)?">(\d+)<\/span>/i;
        const seasonNum = seasonNumRegex.exec(seasonContent)?.[1]?.trim() || '';
        const seasonTitleRegex = /<span class="title">Season \d+\s*<i>([^<]+)<\/i><\/span>/i;
        const seasonDate = seasonTitleRegex.exec(seasonContent)?.[1]?.trim() || '';
        const episodes = [];
        const episodeRegex = /<li class="mark-\d+"[^>]*>([\s\S]*?)<\/li>/gi;
        let epMatch;
        while ((epMatch = episodeRegex.exec(seasonContent)) !== null) {
          const epContent = epMatch[1];
          const imgRegex = /<img[^>]*(?:src|data-src)="([^"]+)"[^>]*class="[^"]*lazy-loaded[^"]*"[^>]*>/i;
          const img = imgRegex.exec(epContent)?.[1]?.trim() || '';
          const numRegex = /<div class="numerando"[^>]*>([^<]+)<\/div>/i;
          const num = numRegex.exec(epContent)?.[1]?.trim() || '';
          const titleRegex = /<div class="episodiotitle"[^>]*><a href="([^"]+)"[^>]*>([^<]+)<\/a>\s*<span class="date"[^>]*>([^<]+)<\/span>/i;
          const titleMatch = titleRegex.exec(epContent);
          episodes.push({
            img: img || '',
            num: num || '',
            url: titleMatch ? titleMatch[1]?.trim() : '',
            title: titleMatch ? titleMatch[2]?.trim() : '',
            date: titleMatch ? titleMatch[3]?.trim() : '',
          });
        }
        if (episodes.length > 0) {
          data.seasons.push({
            season: seasonNum,
            date: seasonDate,
            episodes,
          });
        }
      }
      data.totalEpisodes = data.seasons.reduce((acc, season) => acc + season.episodes.length, 0);

      // Extract cast
      data.cast = [];
      const castRegex = /<div class="person"[^>]*itemtype="http:\/\/schema.org\/Person"[^>]*>([\s\S]*?)<\/div>/gi;
      while ((match = castRegex.exec(formattedHtml)) !== null) {
        const personContent = match[1];
        const nameMetaRegex = /<meta itemprop="name" content="([^"]+)"[^>]*>/i;
        const metaName = nameMetaRegex.exec(personContent)?.[1]?.trim() || '';
        const imgRegex = /<img[^>]*(?:src|data-src)="([^"]+)"[^>]*alt="([^"]*)"[^>]*>/i;
        const imgMatch = imgRegex.exec(personContent);
        const img = imgMatch ? imgMatch[1]?.trim() : '';
        const alt = imgMatch ? imgMatch[2]?.trim() : '';
        const linkRegex = /<div class="name"[^>]*><a[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/i;
        const linkMatch = linkRegex.exec(personContent);
        const url = linkMatch ? linkMatch[1]?.trim() : '';
        const name = linkMatch ? linkMatch[2]?.trim() : '';
        const charRegex = /<div class="caracter"[^>]*>([^<]+)<\/div>/i;
        const character = charRegex.exec(personContent)?.[1]?.trim() || '';
        if (metaName && name && character) { // Only include valid cast entries
          data.cast.push({
            metaName,
            img,
            alt,
            url,
            name,
            character,
          });
        }
      }

      // Extract trailer
      const trailerRegex = /<iframe class="rptss"[^>]*src="([^"]+)"[^>]*>/i;
      data.trailer = trailerRegex.exec(formattedHtml)?.[1]?.trim() || '';

      // Extract synopsis
      const synopsisRegex = /<h2>Synopsis<\/h2>\s*<div class="wp-content"[^>]*>\s*<p>([\s\S]*?)<\/p>/i;
      data.synopsis = synopsisRegex.exec(formattedHtml)?.[1]?.replace(/\s+/g, ' ').trim() || '';

      // Extract gallery
      data.gallery = [];
      const galleryRegex = /<a\s+href="([^"]+)"[^>]*>\s*<img[^>]*data-src="([^"]+)"[^>]*>/gi;
      while ((match = galleryRegex.exec(formattedHtml)) !== null) {
        data.gallery.push({
          full: match[1]?.trim(),
          thumb: match[2]?.trim(),
        });
      }

      // Extract custom fields
      data.fields = {};
      const fieldsRegex = /<div class="custom_fields"[^>]*><b class="variante"[^>]*>([^<]+)<\/b>\s*<span class="valor"[^>]*>([\s\S]*?)<\/span><\/div>/gi;
      while ((match = fieldsRegex.exec(formattedHtml)) !== null) {
        let key = match[1]?.trim();
        let value = match[2]?.trim();
        data.fields[key] = value;
      }
      // Special handling for TMDb Rating
      if (data.fields['TMDb Rating']) {
        const tmdbRegex = /<strong>(\d+)<\/strong>\s*(\d+\s*votes)/i;
        const tmdbMatch = tmdbRegex.exec(data.fields['TMDb Rating']);
        if (tmdbMatch) {
          data.fields['TMDb Rating'] = { rating: tmdbMatch[1], votes: tmdbMatch[2] };
        }
      }

      // Extract similar titles
      data.similar = [];
      const similarRegex = /<article[^>]*>\s*<a href="([^"]+)"[^>]*>\s*<img[^>]*data-src="([^"]+)"[^>]*alt="([^"]+)"[^>]*\/>\s*<\/a>\s*<\/article>/gi;
      while ((match = similarRegex.exec(formattedHtml)) !== null) {
        data.similar.push({
          url: match[1]?.trim(),
          img: match[2]?.trim(),
          title: match[3]?.trim(),
        });
      }

      // Debug logging for missing fields
      if (!data.poster || !data.seasons.length || !data.cast.length || !data.trailer) {
        console.warn('Some fields are empty:', {
          poster: !!data.poster,
          seasons: data.seasons.length,
          totalEpisodes: data.totalEpisodes,
          cast: data.cast.length,
          trailer: !!data.trailer,
        });
      }

      return new Response(
        JSON.stringify(data, null, 2),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    } catch (err) {
      return new Response(
        JSON.stringify({ error: err.message || String(err) }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
  },
};
