// api/index.js
import fs from "fs";
import path from "path";

export default {
  async fetch(request) {
    try {
      const url = new URL(request.url);
      const name = url.searchParams.get("name");
      if (!name)
        return new Response(JSON.stringify({ error: "Missing name parameter" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });

      // Load base URL
      let BASEURL = "https://multimovies.pro";
      try {
        const baseurlPath = path.resolve("./src/baseurl.txt");
        if (fs.existsSync(baseurlPath)) {
          const txt = fs.readFileSync(baseurlPath, "utf-8").trim();
          if (txt) BASEURL = txt;
        }
      } catch (e) {}

      const targetURL = `${BASEURL}/tvshows/${name}`;
      const res = await fetch(targetURL, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0 Safari/537.36",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        },
      });

      if (!res.ok)
        return new Response(JSON.stringify({ error: "fetch_failed", status: res.status }), {
          status: 502,
          headers: { "Content-Type": "application/json" },
        });

      const html = await res.text();

      // --- Show info ---
      const title = (/<h1[^>]*>([^<]+)<\/h1>/i.exec(html) || [null, name])[1].trim();

      const original_title =
        (/<strong>\s*Original title\s*<\/strong>\s*([^<]+)/i.exec(html) || [null, null])[1]?.trim() ||
        null;

      const poster =
        (/<div class="galeria"[\s\S]*?<img[^>]*data-src="([^"]+)"/i.exec(html) || [null, null])[1] || null;

      const tmdbMatch = /TMDb Rating<\/strong>\s*([\d.]+).*?(\d+)\s*votes/i.exec(html);
      const tmdb_rating = tmdbMatch ? tmdbMatch[1] : null;
      const tmdb_votes = tmdbMatch ? parseInt(tmdbMatch[2]) : null;

      const first_air_date =
        (/<strong>\s*First air date\s*<\/strong>\s*([^<]+)/i.exec(html) || [null, null])[1]?.trim() || null;
      const last_air_date =
        (/<strong>\s*Last air date\s*<\/strong>\s*([^<]+)/i.exec(html) || [null, null])[1]?.trim() || null;

      const seasons_count = parseInt((/<strong>\s*Seasons\s*<\/strong>\s*(\d+)/i.exec(html) || [0, 0])[1]);
      const episodes_count = parseInt((/<strong>\s*Episodes\s*<\/strong>\s*(\d+)/i.exec(html) || [0, 0])[1]);
      const average_duration =
        (/<strong>\s*Average Duration\s*<\/strong>\s*([^<]+)/i.exec(html) || [null, null])[1]?.trim() || null;

      // --- Genres ---
      const genres = [];
      const genreRegex = /<a[^>]*\/genre\/[^"]+[^>]*>([^<]+)<\/a>/gi;
      let gm;
      while ((gm = genreRegex.exec(html)) !== null) genres.push(gm[1].trim());

      // --- Trailer ---
      const trailerMatch = /<iframe[^>]+src="([^"]+)"[^>]*><\/iframe>/i.exec(html);
      const trailer = trailerMatch ? trailerMatch[1] : null;

      // --- Seasons & episodes ---
      const seasons = [];
      const seasonRegex = /<span class="se-t">(\d+)<\/span>[\s\S]*?Season\s*\d+\s*<i>([^<]+)<\/i>/gi;
      let sm;
      while ((sm = seasonRegex.exec(html)) !== null) {
        const seasonNumber = parseInt(sm[1]);
        const seasonDate = sm[2].trim();
        seasons.push({ season: seasonNumber, date: seasonDate, episodes: [] });
      }

      const episodeRegex = /<li class="mark-[^"]*">[\s\S]*?<div class="numerando">([\d\s\-]+)<\/div>[\s\S]*?<div class="episodiotitle"><a href="([^"]+)">([^<]+)<\/a>\s*<span class="date">([^<]+)<\/span>/gi;
      let em;
      while ((em = episodeRegex.exec(html)) !== null) {
        const epNumber = em[1].trim();
        const epUrl = em[2];
        const epTitle = em[3].trim();
        const epDate = em[4].trim();
        const seasonIndex = parseInt(epNumber.split("-")[0]) - 1;
        if (seasons[seasonIndex]) {
          seasons[seasonIndex].episodes.push({ number: epNumber, title: epTitle, url: epUrl, date: epDate });
        }
      }

      // --- Cast & creators ---
      const cast = [];
      const castRegex = /<div class="person"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/gi;
      let cm;
      while ((cm = castRegex.exec(html)) !== null) {
        const block = cm[1];
        const nameMatch = /<div class="name"><a[^>]*>([^<]+)<\/a><\/div>/i.exec(block);
        const roleMatch = /<div class="caracter">([^<]+)<\/div>/i.exec(block);
        const imgMatch = /data-src="([^"]+)"/i.exec(block);
        const urlMatch = /<a[^>]*href="([^"]+)"/i.exec(block);
        if (nameMatch && roleMatch) {
          cast.push({
            name: nameMatch[1].trim(),
            role: roleMatch[1].trim(),
            image: imgMatch ? imgMatch[1] : null,
            url: urlMatch ? urlMatch[1] : null,
          });
        }
      }

      // --- Similar titles ---
      const similar = [];
      const simRegex = /<a href="([^"]+)"[^>]*>([^<]+)<\/a>/gi;
      let sim;
      while ((sim = simRegex.exec(html)) !== null) {
        if (sim[1].includes("/tvshows/")) similar.push({ url: sim[1], title: sim[2].trim() });
      }

      return new Response(
        JSON.stringify(
          {
            status: "ok",
            title,
            original_title,
            poster,
            tmdb_rating,
            tmdb_votes,
            first_air_date,
            last_air_date,
            seasons_count,
            episodes_count,
            average_duration,
            genres,
            trailer,
            seasons,
            cast,
            similar,
          },
          null,
          2
        ),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message || String(err) }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  },
};
