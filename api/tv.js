// api/index.js
export default {
  async fetch(request) {
    const reqUrl = new URL(request.url);
    const name = reqUrl.searchParams.get("name");
    const wantPretty = reqUrl.searchParams.get("pretty") === "1";

    if (!name) {
      return new Response(JSON.stringify({ error: "Missing ?name={slug}" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    let BASEURL = "https://multimovies.pro";
    try {
      const urlResponse = await fetch(new URL("../src/baseurl.txt", import.meta.url));
      if (urlResponse.ok) {
        const text = (await urlResponse.text()).trim();
        if (text) BASEURL = text;
      }
    } catch (_) {}

    const targetURL = `${BASEURL.replace(/\/+$/, "")}/tvshows/${name}`;

    try {
      const r = await fetch(targetURL, {
        headers: {
          "User-Agent": "Mozilla/5.0",
          Accept: "text/html",
          "Accept-Language": "en-US,en;q=0.9",
          Referer: BASEURL,
        },
      });
      if (!r.ok) {
        return new Response(
          JSON.stringify({ error: "fetch_failed", status: r.status, target: targetURL }),
          { status: 502, headers: { "Content-Type": "application/json" } }
        );
      }

      let html = await r.text();

      // --- HTML formatter for minified pages ---
      function formatHTML(s) {
        return s
          .replace(/>(\s*)</g, ">\n<")
          .replace(/<\/(div|li|article|section|span|h\d|p)>/g, "</$1>\n")
          .replace(/(<li\b)/g, "\n$1")
          .replace(/(\s){2,}/g, " ")
          .trim();
      }
      html = formatHTML(html);

      const decode = (str) =>
        str?.replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .trim() ?? null;

      const first = (re, i = 1) => {
        const m = re.exec(html);
        return m ? decode(m[i]) : null;
      };

      const allMatches = (re, group = 1) => {
        const out = [];
        let m;
        while ((m = re.exec(html)) !== null) out.push(decode(m[group]));
        return out;
      };

      const abs = (u) => {
        if (!u) return null;
        if (/^https?:\/\//i.test(u)) return u;
        return BASEURL.replace(/\/+$/, "") + "/" + u.replace(/^\/+/, "");
      };

      // --- Basic show info ---
      const title = first(/<h1[^>]*>([^<]+)<\/h1>/i) || decode(name.replace(/-/g, " "));
      let poster = first(/<div class="poster">[\s\S]*?<img[^>]+(?:src|data-src)="([^">]+)"/i);
      poster = poster ? poster.replace(/-\d+x\d+/, "") : null;
      poster = abs(poster);

      const original_title = first(/<div class="custom_fields">[\s\S]*?<b[^>]*>Original title<\/b>\s*<span[^>]*>([\s\S]*?)<\/span>/i);

      const tmdb_rating = first(/<div class="custom_fields">[\s\S]*?<b[^>]*>TMDb Rating<\/b>\s*<span[^>]*>([\d.]+)/i);
      const tmdb_votes = first(/<div class="custom_fields">[\s\S]*?<b[^>]*>TMDb Rating<\/b>\s*<span[^>]*>[\d.]+ (\d+) votes/i);

      const first_air_date = first(/<div class="custom_fields">[\s\S]*?<b[^>]*>First air date<\/b>\s*<span[^>]*>([^<]+)<\/span>/i);
      const last_air_date = first(/<div class="custom_fields">[\s\S]*?<b[^>]*>Last air date<\/b>\s*<span[^>]*>([^<]+)<\/span>/i);

      const seasons_count = parseInt(first(/<div class="custom_fields">[\s\S]*?<b[^>]*>Seasons<\/b>\s*<span[^>]*>(\d+)/i) || "0", 10);
      const episodes_count = parseInt(first(/<div class="custom_fields">[\s\S]*?<b[^>]*>Episodes<\/b>\s*<span[^>]*>(\d+)/i) || "0", 10);

      const average_duration = first(/<div class="custom_fields">[\s\S]*?<b[^>]*>Average Duration<\/b>\s*<span[^>]*>([^<]+)<\/span>/i);

      const trailer = first(/<div id="trailer"[\s\S]*?<iframe[^>]+src="([^"]+)"/i);

      const synopsis = first(/<div id="info"[^>]*>[\s\S]*?<div class="wp-content">\s*<p>([\s\S]*?)<\/p>/i)?.replace(/<[^>]+>/g, "");

      // --- Seasons and Episodes ---
      const seasons = [];
      const seasonsBlock = first(/<div id="seasons">([\s\S]*?)<\/div>/i);
      if (seasonsBlock) {
        const seasonMatches = seasonsBlock.match(/<div class="se-c">[\s\S]*?<\/ul>/gi) || [];
        for (const s of seasonMatches) {
          const seasonNumber = parseInt(/<span class="se-t[^>]*">(\d+)<\/span>/i.exec(s)?.[1] || "0", 10);
          const epBlock = /<ul class="episodios">([\s\S]*?)<\/ul>/i.exec(s)?.[1] || "";
          const epItems = epBlock.match(/<li\b[^>]*>[\s\S]*?<\/li>/gi) || [];
          const episodes = [];
          let epCount = 1;
          for (const li of epItems) {
            const epTitle = first(/<div class="episodiotitle"><a[^>]*>([^<]+)<\/a>/i, 1, li) || `Episode ${epCount}`;
            const epUrl = first(/<div class="episodiotitle"><a[^>]+href="([^"]+)"/i, 1, li);
            let epImg = /<div class="imagen">[\s\S]*?<img[^>]+(?:data-src|src)="([^">]+)"/i.exec(li)?.[1] || null;
            epImg = epImg ? epImg.replace(/-\d+x\d+/, "") : null;
            episodes.push({
              number: `${seasonNumber}x${epCount}`,
              title: epTitle,
              url: epUrl ? epUrl.replace(BASEURL, "") : null,
              date: first(/<span class="date">([^<]+)<\/span>/i, 1, li),
              poster: epImg ? abs(epImg) : null
            });
            epCount++;
          }
          seasons.push({ season: seasonNumber, episodes });
        }
      }

      const res = {
        status: "ok",
        slug: name,
        url: targetURL,
        title,
        original_title,
        poster,
        date_created: first_air_date,
        networks: [],
        site_rating: parseFloat(tmdb_rating) || null,
        site_votes: parseInt(tmdb_votes) || null,
        tmdb_rating: parseFloat(tmdb_rating) || null,
        tmdb_votes: parseInt(tmdb_votes) || null,
        first_air_date,
        last_air_date,
        seasons_count,
        episodes_count,
        episodes_total: episodes_count,
        average_duration,
        genres: [],
        trailer,
        synopsis,
        gallery_images: [],
        seasons,
        creators: [],
        cast: [],
        similar: []
      };

      if (wantPretty) {
        res.formatted_html = html;
      }

      return new Response(JSON.stringify(res, null, 2), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: err?.message || String(err) }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }
  },
};
