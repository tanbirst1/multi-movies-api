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
      // ignore error, fallback to default
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
          // optionally add cookie if needed
          // "Cookie": "somecookie=value",
        },
      });

      if (!r.ok) {
        return new Response(
          JSON.stringify({ error: "fetch_failed", status: r.status }),
          { status: 502, headers: { "Content-Type": "application/json" } }
        );
      }

      const html = await r.text();

      const data = {};

      // Extract title
      const titleRegex = /<h1>([^<]+)<\/h1>/;
      data.title = titleRegex.exec(html)?.[1] || '';

      // Extract poster
      const posterRegex = /<div class="poster">\s*<img[^>]*data-src="([^"]+)"[^>]*alt="([^"]+)"[^>]*class="lazy-loaded"[^>]*>/;
      const posterMatch = posterRegex.exec(html);
      data.poster = posterMatch ? posterMatch[1] : '';
      data.posterAlt = posterMatch ? posterMatch[2] : '';

      // Extract date
      const dateRegex = /<span class="date" itemprop="dateCreated">([^<]+)<\/span>/;
      data.date = dateRegex.exec(html)?.[1] || '';

      // Extract networks
      data.networks = [];
      const networkRegex = /<a href="https:\/\/multimovies\.pro\/network\/[^"]+" rel="tag">([^<]+)<\/a>/g;
      let match;
      while ((match = networkRegex.exec(html)) !== null) {
        data.networks.push(match[1]);
      }

      // Extract genres
      data.genres = [];
      const genreRegex = /<a href="https:\/\/multimovies\.pro\/genre\/[^"]+" rel="tag">([^<]+)<\/a>/g;
      while ((match = genreRegex.exec(html)) !== null) {
        data.genres.push(match[1]);
      }

      // Extract rating
      const ratingValueRegex = /<span class="dt_rating_vgs" itemprop="ratingValue">([^<]+)<\/span>/;
      data.ratingValue = ratingValueRegex.exec(html)?.[1] || '';
      const ratingCountRegex = /<span class="rating-count" itemprop="ratingCount">([^<]+)<\/span>/;
      data.ratingCount = ratingCountRegex.exec(html)?.[1] || '';

      // Extract seasons and episodes
      data.seasons = [];
      const episodesDivRegex = /<div id="episodes" class="sbox fixidtab" style="display: block;">([\s\S]*?)<\/div>/;
      const episodesContent = episodesDivRegex.exec(html)?.[1] || '';
      if (episodesContent) {
        const seasonRegex = /<div class="se-c">([\s\S]*?)<\/div>/g;
        let seasonMatch;
        while ((seasonMatch = seasonRegex.exec(episodesContent)) !== null) {
          const seasonContent = seasonMatch[1];
          const seasonNumRegex = /<span class="se-t(?: se-o)?">(\d+)<\/span>/;
          const seasonNum = seasonNumRegex.exec(seasonContent)?.[1] || '';
          const seasonTitleRegex = /<span class="title">Season \d+ <i>([^<]+)<\/i><\/span>/;
          const seasonDate = seasonTitleRegex.exec(seasonContent)?.[1] || '';
          const episodes = [];
          const ulRegex = /<ul class="episodios">([\s\S]*?)<\/ul>/;
          const ulContent = ulRegex.exec(seasonContent)?.[1] || '';
          const epLiRegex = /<li class="mark-\d+">([\s\S]*?)<\/li>/g;
          let epMatch;
          while ((epMatch = epLiRegex.exec(ulContent)) !== null) {
            const epContent = epMatch[1];
            const imgRegex = /<img[^>]*data-src="([^"]+)"[^>]*>/;
            const img = imgRegex.exec(epContent)?.[1] || '';
            const numRegex = /<div class="numerando">([^<]+)<\/div>/;
            const num = numRegex.exec(epContent)?.[1] || '';
            const titleRegex = /<div class="episodiotitle"><a href="([^"]+)">([^<]+)<\/a> <span class="date">([^<]+)<\/span><\/div>/;
            const titleMatch = titleRegex.exec(epContent);
            const ep = {
              img,
              num,
              url: titleMatch ? titleMatch[1] : '',
              title: titleMatch ? titleMatch[2] : '',
              date: titleMatch ? titleMatch[3] : '',
            };
            episodes.push(ep);
          }
          data.seasons.push({
            season: seasonNum,
            date: seasonDate,
            episodes,
          });
        }
      }
      data.totalEpisodes = data.seasons.reduce((acc, s) => acc + s.episodes.length, 0);

      // Extract cast
      data.cast = [];
      const castDivRegex = /<div id="cast" class="sbox fixidtab" style="display: none;">([\s\S]*?)<\/div>/;
      const castContent = castDivRegex.exec(html)?.[1] || '';
      if (castContent) {
        const personRegex = /<div class="person" itemprop="actor" itemscope="" itemtype="http:\/\/schema.org\/Person">([\s\S]*?)<\/div>/g;
        let personMatch;
        while ((personMatch = personRegex.exec(castContent)) !== null) {
          const personContent = personMatch[1];
          const nameMetaRegex = /<meta itemprop="name" content="([^"]+)" \/>/;
          const metaName = nameMetaRegex.exec(personContent)?.[1] || '';
          const imgRegex = /<img[^>]*data-src="([^"]+)"[^>]*alt="([^"]+)"[^>]*>/;
          const imgMatch = imgRegex.exec(personContent);
          const img = imgMatch ? imgMatch[1] : '';
          const alt = imgMatch ? imgMatch[2] : '';
          const linkRegex = /<div class="name"><a itemprop="url" href="([^"]+)">([^<]+)<\/a><\/div>/;
          const linkMatch = linkRegex.exec(personContent);
          const url = linkMatch ? linkMatch[1] : '';
          const name = linkMatch ? linkMatch[2] : '';
          const charRegex = /<div class="caracter">([^<]+)<\/div>/;
          const character = charRegex.exec(personContent)?.[1] || '';
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
      const trailerRegex = /<iframe class="rptss" src="([^"]+)" frameborder="0" allow="autoplay; encrypted-media" allowfullscreen=""><\/iframe>/;
      data.trailer = trailerRegex.exec(html)?.[1] || '';

      // Extract synopsis
      const synopsisRegex = /<h2>Synopsis<\/h2>\s*<div class="wp-content">\s*<p>([\s\S]*?)<\/p>/;
      data.synopsis = synopsisRegex.exec(html)?.[1].replace(/\s+/g, ' ').trim() || '';

      // Extract gallery
      data.gallery = [];
      const galleryRegex = /<a\s+href="([^"]+)"[^>]*title="[^"]*">\s*<img[^>]*data-src="([^"]+)"[^>]*>/g;
      while ((match = galleryRegex.exec(html)) !== null) {
        data.gallery.push({
          full: match[1],
          thumb: match[2],
        });
      }

      // Extract custom fields
      data.fields = {};
      const fieldsRegex = /<div class="custom_fields"><b class="variante">([^<]+)<\/b> <span class="valor">([^<]+)<\/span><\/div>/g;
      while ((match = fieldsRegex.exec(html)) !== null) {
        let key = match[1].trim();
        let value = match[2].trim();
        data.fields[key] = value;
      }
      // Special handling for TMDb Rating if needed
      if (data.fields['TMDb Rating']) {
        const tmdbRegex = /<strong>(\d+)<\/strong> (\d+ votes)/;
        const tmdbMatch = tmdbRegex.exec(data.fields['TMDb Rating']);
        if (tmdbMatch) {
          data.fields['TMDb Rating'] = { rating: tmdbMatch[1], votes: tmdbMatch[2] };
        }
      }

      // Extract similar titles
      data.similar = [];
      const similarRegex = /<article>\s*<a href="([^"]+)">\s*<img[^>]*data-src="([^"]+)"[^>]*alt="([^"]+)"[^>]*\/>\s*<\/a>\s*<\/article>/g;
      while ((match = similarRegex.exec(html)) !== null) {
        data.similar.push({
          url: match[1],
          img: match[2],
          title: match[3],
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
