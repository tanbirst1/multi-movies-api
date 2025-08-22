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
      const seABlocks = html.match(/<div\s+class="se-a"[\s\S]*?<\/div>\s*<\/div>/gi) || [];
      const episodes = [];

      for (const se of seABlocks) {
        const liMatches = se.match(/<li\s+class="mark-[^"]+">[\s\S]*?<\/li>/gi) || [];

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
      const ulMatches = html.match(/<ul\s+class="episodios">([\s\S]*?)<\/ul>/gi) || [];
      const episodes = [];

      for (const ul of ulMatches) {
        const liMatches = ul.match(/<li\s+class="mark-[^"]+">([\s\S]*?)<\/li>/gi) || [];
        for (const li of liMatches) {
          // Poster
          const imgTag = first(/<div\s+class="imagen">([\s\S]*?<img[^>]+>)/i, li);
          const epPoster = preferDataSrc(imgTag);

          // Episode number
          const numRaw = first(/<div\s+class="numerando">([\s\S]*?)<\/div>/i, li);
          let number = numRaw ? numRaw.replace(/\s+/g, "") : null;
          if (number && number.includes("-")) {
            const [s, e] = number.split("-").map((x) => x.trim());
            if (s && e) number = `${s}x${e.padStart(2, "0")}`;
          }

          // Title & URL
          const epTitle = first(
            /<div\s+class="episodiotitle">[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i,
            li
          );
          const epUrl = first(
            /<div\s+class="episodiotitle">[\s\S]*?<a[^>]+href="([^"]+)"/i,
            li
          );

          // Date
          const epDate = first(/<span\s+class="date">([\s\S]*?)<\/span>/i, li);

          episodes.push({
            number,
            title: epTitle,
            url: epUrl,
            date: epDate,
            poster: epPoster,
          });
        }
      }

      const res = {
        status: "ok",
        slug: name,
        title,
        poster,
        episodes,
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
