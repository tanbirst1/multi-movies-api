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

      const BASEURL = "https://multimovies.pro";
      const targetURL = `${BASEURL.replace(/\/+$/, "")}/tvshows/${name}`;

      const r = await fetch(targetURL, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
      });

      if (!r.ok) {
        return new Response(
          JSON.stringify({ error: "fetch_failed", status: r.status, target: targetURL }),
          { status: 502, headers: { "Content-Type": "application/json" } }
        );
      }

      const html = await r.text();

      // --- helpers ---
      const decode = (str) =>
        str == null
          ? null
          : str
              .replace(/&amp;/g, "&")
              .replace(/&lt;/g, "<")
              .replace(/&gt;/g, ">")
              .replace(/&quot;/g, '"')
              .replace(/&#39;/g, "'")
              .trim();

      const first = (re, src = html, i = 1) => {
        const m = re.exec(src);
        return m ? decode(m[i]) : null;
      };

      const preferDataSrc = (imgHtml) => {
        if (!imgHtml) return null;
        const ds = /data-src="([^"]+)"/i.exec(imgHtml)?.[1];
        const s = /src="([^"]+)"/i.exec(imgHtml)?.[1];
        return ds || (s && !/^data:image\//i.test(s) ? s : s) || null;
      };

      // --- title & poster ---
      const title =
        first(/<div class="data">[\s\S]*?<h1[^>]*>([^<]+)<\/h1>/i) ||
        decode(name.replace(/-/g, " "));

      let posterTag = first(/<div class="poster">[\s\S]*?(<img[^>]+>)/i, html, 1);
      let poster =
        posterTag ? preferDataSrc(posterTag) : first(/<meta property="og:image" content="([^"]+)"/i);

      // --- extract all seasons ---
      const seasons = [];

      // find each season block
      const seasonBlocks = html.match(/<div class="se-c">[\s\S]*?<ul class="episodios">[\s\S]*?<\/ul>[\s\S]*?<\/div>/gi) || [];
      for (const block of seasonBlocks) {
        const seasonNumber =
          /<span class="se-t[^"]*">(\d+)<\/span>/i.exec(block)?.[1] ||
          /Season\s+(\d+)/i.exec(block)?.[1] ||
          null;

        // episodes
        const epListBlock = /<ul class="episodios">([\s\S]*?)<\/ul>/i.exec(block)?.[1] || "";
        const liMatches = epListBlock.match(/<li[^>]*>[\s\S]*?<\/li>/gi) || [];
        const episodes = [];

        for (const li of liMatches) {
          const numRaw = /<div class="numerando">([^<]+)<\/div>/i.exec(li)?.[1]?.trim();
          let number = null;
          if (numRaw) {
            const m = numRaw.match(/(\d+)\s*-\s*(\d+)/);
            if (m) {
              number = `${m[1]}x${m[2].padStart(2, "0")}`;
            }
          }

          const epTitle = /<div class="episodiotitle"><a[^>]*>([^<]+)<\/a>/i.exec(li)?.[1];
          const epUrl = /<div class="episodiotitle"><a[^>]+href="([^"]+)"/i.exec(li)?.[1];
          const epDate = /<span class="date">([^<]+)<\/span>/i.exec(li)?.[1];
          const imgTag = /<div class="imagen">[\s\S]*?(<img[^>]+>)/i.exec(li)?.[1];
          const epPoster = preferDataSrc(imgTag);

          if (epTitle || epUrl) {
            episodes.push({
              number,
              title: decode(epTitle),
              url: epUrl || null,
              date: decode(epDate),
              poster: epPoster,
            });
          }
        }

        if (episodes.length) {
          seasons.push({ season: seasonNumber ? parseInt(seasonNumber, 10) : seasons.length + 1, episodes });
        }
      }

      const res = {
        status: "ok",
        slug: name,
        title,
        poster,
        seasons,
      };

      if (wantPretty) res.html_debug = html;

      return new Response(JSON.stringify(res, null, 2), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: err?.message || String(err) }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  },
};
