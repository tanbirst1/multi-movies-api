// api/index.js
export default {
  async fetch(request) {
    try {
      const reqUrl = new URL(request.url);
      const name = reqUrl.searchParams.get("name");
      const wantPretty = reqUrl.searchParams.get("pretty") === "1";

      if (!name) {
        return new Response(JSON.stringify({ error: "Missing ?name={slug}" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      // Base URL
      const BASEURL = "https://multimovies.pro";
      const targetURL = `${BASEURL.replace(/\/+$/, "")}/tvshows/${name}`;

      // Fetch HTML
      const r = await fetch(targetURL, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0 Safari/537.36",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          Connection: "keep-alive",
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

      // --- HTML formatter ---
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
        str
          ?.replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .trim() ?? null;

      const first = (re, i = 1) => {
        const m = re.exec(html);
        return m ? decode(m[i]) : null;
      };

      const cleanImg = (url) => (url ? url.replace(/\[\-?\d+x\d+\]/, "") : null);

      // --- Title & Poster ---
      const title = first(/<div class="data">\s*<h1[^>]*>([^<]+)<\/h1>/i) || decode(name.replace(/-/g, " "));
      let poster = first(/<div class="poster">[\s\S]*?<img[^>]+(?:src|data-src)="([^">]+)"/i);
      poster = cleanImg(poster);

      // --- Seasons & Episodes ---
      const seasons = [];
      const seasonsBlock = first(/<div id="seasons">([\s\S]*?)<\/div>/i);
      if (seasonsBlock) {
        const seCards = seasonsBlock.match(/<div class="se-c">[\s\S]*?<\/div>\s*<\/div>?/gi) || [];
        let seasonCounter = 1;
        for (const card of seCards) {
          const seasonNumber = seasonCounter++;
          const epListBlock = /<ul class="episodios">([\s\S]*?)<\/ul>/i.exec(card)?.[1];
          const episodes = [];
          if (epListBlock) {
            const epItems = epListBlock.match(/<li\b[^>]*>[\s\S]*?<\/li>/gi) || [];
            for (const li of epItems) {
              const epNum = /<div class="numerando">([^<]+)<\/div>/i.exec(li)?.[1]?.trim();
              const epTitle = /<div class="episodiotitle"><a[^>]*>([^<]+)<\/a>/i.exec(li)?.[1];
              const epUrl = /<div class="episodiotitle"><a[^>]+href="([^"]+)"/i.exec(li)?.[1];
              const epDate = /<div class="episodiotitle">[\s\S]*?<span class="date">([^<]+)<\/span>/i.exec(li)?.[1];
              let epImg =
                /<div class="imagen">[\s\S]*?<img[^>]+(?:data-src|src)="([^">]+)"/i.exec(li)?.[1];
              epImg = cleanImg(epImg);

              episodes.push({
                number: epNum ? `${seasonNumber}x${epNum.split("-").pop().trim()}` : null,
                title: decode(epTitle),
                url: epUrl || null,
                date: decode(epDate),
                poster: epImg,
              });
            }
          }
          seasons.push({ season: seasonNumber, episodes });
        }
      }

      const res = { status: "ok", slug: name, title, poster, seasons };
      if (wantPretty) res.formatted_html = html;

      return new Response(JSON.stringify(res, null, 2), { status: 200, headers: { "Content-Type": "application/json" } });
    } catch (err) {
      return new Response(JSON.stringify({ error: err?.message || String(err) }), { status: 500, headers: { "Content-Type": "application/json" } });
    }
  },
};
