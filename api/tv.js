// api/index.js
export default {
  async fetch(request) {
    try {
      const reqUrl = new URL(request.url);
      const name = reqUrl.searchParams.get("name");
      const pretty = reqUrl.searchParams.get("pretty") === "1";

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
          Accept: "text/html,application/xhtml+xml",
        },
      });

      if (!r.ok) {
        return new Response(
          JSON.stringify({ error: "fetch_failed", status: r.status }),
          { status: 502, headers: { "Content-Type": "application/json" } }
        );
      }

      const html = await r.text();

      // --- Helpers ---
      const decode = (s) =>
        s
          ? s
              .replace(/&amp;/g, "&")
              .replace(/&lt;/g, "<")
              .replace(/&gt;/g, ">")
              .replace(/&quot;/g, '"')
              .replace(/&#39;/g, "'")
              .trim()
          : null;

      const first = (re, src, i = 1) => {
        if (!src) return null;
        const m = re.exec(src);
        return m ? decode(m[i]) : null;
      };

      const preferDataSrc = (imgTag) => {
        if (!imgTag) return null;
        const ds = /data-src\s*=\s*"([^"]+)"/i.exec(imgTag)?.[1];
        const s = /src\s*=\s*"([^"]+)"/i.exec(imgTag)?.[1];
        return ds || (s && !/^data:image\//i.test(s) ? s : null);
      };

      // --- Title & Poster ---
      const title =
        first(/<div\s+class="data">[\s\S]*?<h1[^>]*>([^<]+)<\/h1>/i, html) ||
        decode(name.replace(/-/g, " "));

      const posterTag = first(/<div\s+class="poster">[\s\S]*?(<img[^>]+>)/i, html);
      const poster = preferDataSrc(posterTag);

      // --- Episodes ---
      const episodes = [];

      // Find all <ul class="episodios"> blocks
      const ulMatches = [...html.matchAll(/<ul\s+class="episodios">([\s\S]*?)<\/ul>/gi)];
// api/index.js
export default {
  async fetch(request) {
    try {
      const reqUrl = new URL(request.url);
      const name = reqUrl.searchParams.get("name");
      const pretty = reqUrl.searchParams.get("pretty") === "1";

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
          Accept: "text/html,application/xhtml+xml",
        },
      });

      if (!r.ok) {
        return new Response(
          JSON.stringify({ error: "fetch_failed", status: r.status }),
          { status: 502, headers: { "Content-Type": "application/json" } }
        );
      }

      const html = await r.text();

      // --- Helpers ---
      const decode = (s) =>
        s
          ? s
              .replace(/&amp;/g, "&")
              .replace(/&lt;/g, "<")
              .replace(/&gt;/g, ">")
              .replace(/&quot;/g, '"')
              .replace(/&#39;/g, "'")
              .trim()
          : null;

      const first = (re, src, i = 1) => {
        if (!src) return null;
        const m = re.exec(src);
        return m ? decode(m[i]) : null;
      };

      const preferDataSrc = (imgTag) => {
        if (!imgTag) return null;
        const ds = /data-src\s*=\s*"([^"]+)"/i.exec(imgTag)?.[1];
        const s = /src\s*=\s*"([^"]+)"/i.exec(imgTag)?.[1];
        return ds || (s && !/^data:image\//i.test(s) ? s : null);
      };

      // --- Title & Poster ---
      const title =
        first(/<div\s+class="data">[\s\S]*?<h1[^>]*>([^<]+)<\/h1>/i, html) ||
        decode(name.replace(/-/g, " "));

      const posterTag = first(/<div\s+class="poster">[\s\S]*?(<img[^>]+>)/i, html);
      const poster = preferDataSrc(posterTag);

      // --- Seasons & Episodes ---
      const seasons = [];

      // Find all season sections (usually <div class="se-c">)
      const seasonSections = [...html.matchAll(/<div\s+class="se-c">([\s\S]*?)<\/div>\s*<\/div>/gi)];

      let seasonCounter = 1; // fallback season number

      for (const sec of seasonSections) {
        const secHtml = sec[1];

        // Try to detect season number from <span class="se-t">, fallback to counter
        const seasonNum = first(/<span\s+class="se-t">(\d+)<\/span>/i, secHtml) || seasonCounter;

        // Find <ul class="episodios"> inside this season
        const ulMatches = [...secHtml.matchAll(/<ul\s+class="episodios">([\s\S]*?)<\/ul>/gi)];
        const seasonEpisodes = [];

        for (const ul of ulMatches) {
          const ulContent = ul[1];

          // Find <li class="mark-*">
          const liMatches = [...ulContent.matchAll(/<li\s+class="mark-[^"]+">([\s\S]*?)<\/li>/gi)];
          for (const liMatch of liMatches) {
            const liContent = liMatch[1];

            const imgTag = first(/<div\s+class="imagen">([\s\S]*?<img[^>]+>)/i, liContent);
            const epPoster = preferDataSrc(imgTag);

            let number = first(/<div\s+class="numerando">([\s\S]*?)<\/div>/i, liContent);
            number = number ? number.replace(/\s+/g, "") : null;
            if (number && number.includes("-")) {
              const [s, e] = number.split("-").map((x) => x.trim());
              if (s && e) number = `${s}x${e.padStart(2, "0")}`;
            }

            const epTitle = first(
              /<div\s+class="episodiotitle">[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i,
              liContent
            );
            const epUrl = first(
              /<div\s+class="episodiotitle">[\s\S]*?<a[^>]+href="([^"]+)"/i,
              liContent
            );
            const epDate = first(/<span\s+class="date">([\s\S]*?)<\/span>/i, liContent);

            seasonEpisodes.push({
              number: number || null,
              title: epTitle || null,
              url: epUrl || null,
              date: epDate || null,
              poster: epPoster || null,
            });
          }
        }

        seasons.push({
          season: parseInt(seasonNum, 10),
          episodes: seasonEpisodes,
        });

        seasonCounter++;
      }

      // Handle shows without season sections
      if (seasons.length === 0) {
        const ulMatches = [...html.matchAll(/<ul\s+class="episodios">([\s\S]*?)<\/ul>/gi)];
        const seasonEpisodes = [];
        for (const ul of ulMatches) {
          const ulContent = ul[1];
          const liMatches = [...ulContent.matchAll(/<li\s+class="mark-[^"]+">([\s\S]*?)<\/li>/gi)];
          for (const liMatch of liMatches) {
            const liContent = liMatch[1];
            const imgTag = first(/<div\s+class="imagen">([\s\S]*?<img[^>]+>)/i, liContent);
            const epPoster = preferDataSrc(imgTag);

            let number = first(/<div\s+class="numerando">([\s\S]*?)<\/div>/i, liContent);
            number = number ? number.replace(/\s+/g, "") : null;
            if (number && number.includes("-")) {
              const [s, e] = number.split("-").map((x) => x.trim());
              if (s && e) number = `${s}x${e.padStart(2, "0")}`;
            }

            const epTitle = first(
              /<div\s+class="episodiotitle">[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i,
              liContent
            );
            const epUrl = first(
              /<div\s+class="episodiotitle">[\s\S]*?<a[^>]+href="([^"]+)"/i,
              liContent
            );
            const epDate = first(/<span\s+class="date">([\s\S]*?)<\/span>/i, liContent);

            seasonEpisodes.push({
              number: number || null,
              title: epTitle || null,
              url: epUrl || null,
              date: epDate || null,
              poster: epPoster || null,
            });
          }
        }
        if (seasonEpisodes.length) {
          seasons.push({
            season: 1,
            episodes: seasonEpisodes,
          });
        }
      }

      const res = {
        status: "ok",
        slug: name,
        title,
        poster,
        seasons,
      };

      return new Response(JSON.stringify(res, null, pretty ? 2 : 0), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  },
};
