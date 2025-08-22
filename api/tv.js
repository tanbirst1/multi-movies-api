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

      const attr = (tagHtml, name) => {
        if (!tagHtml) return null;
        const m = new RegExp(`${name}\\s*=\\s*"([^"]+)"`, "i").exec(tagHtml);
        return m ? m[1] : null;
      };

      const preferDataSrc = (imgTagHtml) => {
        if (!imgTagHtml) return null;
        const ds = attr(imgTagHtml, "data-src");
        const s = attr(imgTagHtml, "src");
        // Some pages have base64 placeholders in src; prefer data-src if present
        return ds || (s && !/^data:image\//i.test(s) ? s : s) || null;
      };

      const formatHTML = (s) =>
        s
          .replace(/>(\s*)</g, ">\n<")
          .replace(/<\/(div|li|article|section|span|h\d|p)>/g, "</$1>\n")
          .replace(/(<li\b)/g, "\n$1")
          .replace(/[ \t]{2,}/g, " ")
          .trim();

      // --- title & poster ---
      const title =
        first(/<div class="data">[\s\S]*?<h1[^>]*>([^<]+)<\/h1>/i) ||
        decode(name.replace(/-/g, " "));

      let posterTag = first(/<div class="poster">[\s\S]*?(<img[^>]+>)/i, html, 1);
      let poster =
        posterTag ? preferDataSrc(posterTag) : first(/<meta property="og:image" content="([^"]+)"/i);
      // (We keep the exact URL; site often uses size-suffixed or .webp variants.)

      // --- slice out the seasons area safely ---
      // Find the start of #seasons; then cut before the next big section marker
      const seasonsStart = html.search(/<div\s+id="seasons"\b/i);
      let seasonsChunk = "";
      if (seasonsStart !== -1) {
        let tail = html.slice(seasonsStart);

        // possible boundaries after seasons block
        const boundaries = [
          '<div id="cast"',
          '<div id="trailer"',
          '<div id="info"',
          '<div id="comments"',
          '<div class="single_tabs"',
          '<footer',
        ];

        let cutAt = -1;
        for (const b of boundaries) {
          const idx = tail.indexOf(b);
          if (idx > 0 && (cutAt === -1 || idx < cutAt)) cutAt = idx;
        }
        seasonsChunk = cutAt > 0 ? tail.slice(0, cutAt) : tail;
      }

      // --- gather seasons (.se-c blocks) robustly ---
      const seasons = [];
      if (seasonsChunk) {
        // Split into cards without relying on perfectly matched </div>
        const splits = seasonsChunk.split(/<div\s+class="se-c"[^>]*>/i);
        // first split is preamble; ignore it
        for (let i = 1; i < splits.length; i++) {
          const cardInner = splits[i]; // content after opening se-c
          const cardHtml = `<div class="se-c">${cardInner}`;

          // season number
          const seasonNumber =
            first(/<span\s+class="se-t[^"]*">(\d+)<\/span>/i, cardHtml) ||
            first(/<span\s+class="title">[^<]*Season\s+(\d+)/i, cardHtml) ||
            null;

          // Episode list block
          const epListBlock = first(/<ul\s+class="episodios">([\s\S]*?)<\/ul>/i, cardHtml);
          const episodes = [];

          if (epListBlock) {
            // list items
            const epItems = epListBlock.match(/<li\b[^>]*>[\s\S]*?<\/li>/gi) || [];
            for (const li of epItems) {
              // number: may appear like "1 - 2"
              const epNumRaw = first(/<div\s+class="numerando">([\s\S]*?)<\/div>/i, li);
              let number = null;
              const numMatch = epNumRaw && epNumRaw.match(/(\d+)\s*-\s*(\d+)/);
              if (numMatch) {
                const sN = numMatch[1];
                const eN = numMatch[2];
                number = `${sN}x${eN.padStart(2, "0")}`;
              } else if (seasonNumber && epNumRaw) {
                const tailNum = epNumRaw.split("-").pop()?.trim();
                if (tailNum) number = `${seasonNumber}x${tailNum.padStart(2, "0")}`;
              }

              // title/url/date
              const titleA = first(/<div\s+class="episodiotitle">[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i, li);
              const url = first(/<div\s+class="episodiotitle">[\s\S]*?<a[^>]+href="([^"]+)"/i, li);
              const date = first(/<div\s+class="episodiotitle">[\s\S]*?<span\s+class="date">([\s\S]*?)<\/span>/i, li);

              // image (prefer data-src)
              const imgTag = first(/<div\s+class="imagen">[\s\S]*?(<img[^>]+>)/i, li, 1);
              const epPoster = imgTag ? preferDataSrc(imgTag) : null;

              const ep = {
                number: number,
                title: titleA,
                url: url || null,
                date: date,
                poster: epPoster,
              };

              // Filter out truly blank episodes (all fields null/empty)
              const hasAny =
                (ep.number && ep.number.trim()) ||
                (ep.title && ep.title.trim()) ||
                (ep.url && ep.url.trim());
              if (hasAny) episodes.push(ep);
            }
          }

          // push season only if it has any episodes
          if (episodes.length) {
            seasons.push({
              season: seasonNumber ? parseInt(seasonNumber, 10) : seasons.length + 1,
              episodes,
            });
          }
        }
      }

      // Sort seasons by season number (if present)
      seasons.sort((a, b) => (a.season ?? 0) - (b.season ?? 0));

      const res = {
        status: "ok",
        slug: name,
        title,
        poster,
        seasons,
      };

      if (wantPretty) res.formatted_html = formatHTML(html);

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
