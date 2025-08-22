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

    // --- Load base URL from ../src/baseurl.txt (fallback to default) ---
    let BASEURL = "https://multimovies.pro";
    try {
      const urlResponse = await fetch(new URL("../src/baseurl.txt", import.meta.url));
      if (urlResponse.ok) {
        const text = (await urlResponse.text()).trim();
        if (text) BASEURL = text;
      }
    } catch (_) {
      // ignore; fallback to default
    }

    const targetURL = `${BASEURL.replace(/\/+$/, "")}/tvshows/${name}`;

    try {
      const r = await fetch(targetURL, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0 Safari/537.36",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          Connection: "keep-alive",
          Referer: BASEURL,
          "Upgrade-Insecure-Requests": "1",
        },
      });

      if (!r.ok) {
        return new Response(
          JSON.stringify({ error: "fetch_failed", status: r.status, target: targetURL }),
          { status: 502, headers: { "Content-Type": "application/json" } }
        );
      }

      let html = await r.text();

      // --- HTML "formatter" to make minified HTML easier to regex over ---
      function formatHTML(s) {
        // Put newlines between tags & at common split points
        return s
          .replace(/>(\s*)</g, ">\n<")
          .replace(/<\/(div|li|article|section|span|h\d|p)>/g, "</$1>\n")
          .replace(/(<li\b)/g, "\n$1")
          .replace(/(\s){2,}/g, " ")
          .trim();
      }

      const formatted = formatHTML(html);
      // For parsing, use formatted to make regex more resilient
      html = formatted;

      // --- Small helpers ---
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

      // --- SHEADER data ---
      const title =
        first(/<div class="data">\s*<h1[^>]*>([^<]+)<\/h1>/i) ||
        first(/<h1[^>]*>([^<]+)<\/h1>/i) ||
        decode(name.replace(/-/g, " "));

      // poster (prefer poster block; fallback to any main image in poster or gallery)
      let poster =
        first(/<div class="poster">[\s\S]*?<img[^>]+(?:src|data-src)="([^">]+)"/i) ||
        first(/id="dt_galery"[\s\S]*?<img[^>]+(?:src|data-src)="([^">]+)"/i) ||
        null;
      poster = abs(poster);

      // top-left aired date & networks (from .extra)
      const dateCreated = first(/<span class="date"[^>]*>([^<]+)<\/span>/i);
      const networks = [];
      {
        const netBlock = first(
          /<div class="extra">\s*<span class="date"[^>]*>[^<]+<\/span>\s*<span>([\s\S]*?)<\/span>/i
        );
        if (netBlock) {
          const re = /<a[^>]+href="([^"]+)"[^>]*>([^<]+)<\/a>/gi;
          let m;
          while ((m = re.exec(netBlock)) !== null) {
            networks.push({ name: decode(m[2]), url: abs(m[1]) });
          }
        }
      }

      // site star rating & votes (big 9.4 + 58)
      const siteRating = first(/<div class="dt_rating_data">[\s\S]*?class="dt_rating_vgs"[^>]*>([\d.]+)<\/span>/i);
      const siteVotes = (() => {
        const m = /<div class="dt_rating_data">[\s\S]*?class="rating-count"[^>]*>(\d+)<\/span>/i.exec(html);
        return m ? parseInt(m[1], 10) : null;
      })();

      // Genres (from .sgeneros block)
      const genres = (() => {
        const gblock = first(/<div class="sgeneros">([\s\S]*?)<\/div>/i);
        const out = [];
        if (gblock) {
          const re = /<a[^>]+href="[^"]+\/genre\/[^"]+"[^>]*>([^<]+)<\/a>/gi;
          let m;
          while ((m = re.exec(gblock)) !== null) out.push(decode(m[1]));
        }
        return out;
      })();

      // Trailer (iframe in #trailer)
      const trailer = first(/<div id="trailer"[\s\S]*?<iframe[^>]+src="([^"]+)"/i);

      // --- Custom fields (right panel "info") ---
      const customField = (label) => {
        const re = new RegExp(
          `<div class="custom_fields">\\s*<b class="variante">\\s*${label}\\s*<\\/b>\\s*<span class="valor">([\\s\\S]*?)<\\/span>\\s*<\\/div>`,
          "i"
        );
        return first(re);
      };

      const original_title = customField("Original title");

      // TMDb field structure: <span class="valor"><b id="repimdb"><strong>7</strong> 58 votes</b></span>
      let tmdb_rating = null;
      let tmdb_votes = null;
      {
        const tmdbBlock = customField("TMDb Rating");
        if (tmdbBlock) {
          const rm = /<strong>([\d.]+)<\/strong>\s*(\d+)\s*votes/i.exec(tmdbBlock);
          if (rm) {
            tmdb_rating = rm[1];
            tmdb_votes = parseInt(rm[2], 10);
          }
        }
      }

      const first_air_date = customField("First air date");
      const last_air_date = customField("Last air date");

      const seasons_count = (() => {
        const v = customField("Seasons");
        return v ? parseInt(v.replace(/\D+/g, ""), 10) || 0 : 0;
      })();

      const episodes_count = (() => {
        const v = customField("Episodes");
        return v ? parseInt(v.replace(/\D+/g, ""), 10) || 0 : 0;
      })();

      const average_duration = customField("Average Duration");

      // --- Gallery images (array) ---
      const gallery_images = allMatches(
        /id="dt_galery"[\s\S]*?<img[^>]+(?:data-src|src)="([^">]+)"/gi
      ).map(abs);

      // --- Seasons & Episodes (robust, per season block) ---
      const seasons = [];
      {
        // Grab the whole seasons container
        const seasonsBlock = first(/<div id="seasons">([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>\s*<\/div>/i) ||
          first(/<div id="seasons">([\s\S]*?)<\/div>/i);

        if (seasonsBlock) {
          // Split into each season card "se-c"
          const seCards = seasonsBlock.match(/<div class="se-c">[\s\S]*?<\/div>\s*<\/div>?/gi) || [];
          for (const card of seCards) {
            const seasonNumStr = (() => {
              const m =
                /<span class="se-t(?:\s+[^"]*)?">(\d+)<\/span>/i.exec(card) ||
                /<span class="se-t(?:\s+[^"]*)?">([^<]+)<\/span>/i.exec(card);
              return m ? m[1].trim() : null;
            })();
            const seasonNumber = seasonNumStr ? parseInt(seasonNumStr.replace(/\D+/g, ""), 10) : null;

            const seasonTitleLine = first(/<span class="title">([\s\S]*?)<\/span>/i) ||
              (() => {
                const m = /<span class="title">([\s\S]*?)<\/span>/i.exec(card);
                return m ? decode(m[1]) : null;
              })();

            const seasonAirDate = (() => {
              const m = /<span class="title">[\s\S]*?<i>([^<]+)<\/i>/i.exec(card);
              return m ? decode(m[1]) : null;
            })();

            // Episodes inside this season
            const episodes = [];
            const epListBlock = (() => {
              const m = /<ul class="episodios">([\s\S]*?)<\/ul>/i.exec(card);
              return m ? m[1] : null;
            })();

            if (epListBlock) {
              const epItems = epListBlock.match(/<li\b[^>]*>[\s\S]*?<\/li>/gi) || [];
              for (const li of epItems) {
                const numerando = (() => {
                  const m = /<div class="numerando">([^<]+)<\/div>/i.exec(li);
                  return m ? decode(m[1]) : null;
                })();

                const epTitle = (() => {
                  const m = /<div class="episodiotitle"><a[^>]*>([^<]+)<\/a>/i.exec(li);
                  return m ? decode(m[1]) : null;
                })();

                const epUrl = (() => {
                  const m = /<div class="episodiotitle"><a[^>]+href="([^"]+)"/i.exec(li);
                  return m ? abs(m[1]) : null;
                })();

                const epDate = (() => {
                  const m = /<div class="episodiotitle">[\s\S]*?<span class="date">([^<]+)<\/span>/i.exec(li);
                  return m ? decode(m[1]) : null;
                })();

                const epImg =
                  (/<div class="imagen">[\s\S]*?<img[^>]+data-src="([^">]+)"/i.exec(li) || /<div class="imagen">[\s\S]*?<img[^>]+src="([^">]+)"/i.exec(li))?.[1] ||
                  null;

                episodes.push({
                  number_display: numerando, // e.g. "2 - 3"
                  season: seasonNumber ?? (numerando ? parseInt(numerando.split("-")[0], 10) : null),
                  episode: numerando ? parseInt(numerando.split("-").pop().trim(), 10) : null,
                  title: epTitle,
                  url: epUrl,
                  date: epDate,
                  image: abs(epImg),
                });
              }
            }

            seasons.push({
              season: seasonNumber,
              title: seasonTitleLine ? seasonTitleLine.replace(/<i>.*?<\/i>/i, "").trim() : null,
              air_date: seasonAirDate,
              episodes,
            });
          }
        }
      }

      // computed total episodes if page field missing
      const episodes_total =
        seasons.reduce((acc, s) => acc + (Array.isArray(s.episodes) ? s.episodes.length : 0), 0) ||
        (episodes_count || 0);

      // --- Cast & Creators (from #cast section) ---
      const creators = [];
      const cast = [];
      {
        const castBlock = first(/<div id="cast"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/i) || first(/<div id="cast"[^>]*>([\s\S]*?)<\/div>/i);
        if (castBlock) {
          // Creators section after <h2>Creator</h2>
          const creatorsBlock = (() => {
            const m = /<h2>\s*Creator\s*<\/h2>\s*<div class="persons">([\s\S]*?)<\/div>/i.exec(castBlock);
            return m ? m[1] : null;
          })();
          if (creatorsBlock) {
            const items = creatorsBlock.match(/<div class="person"[\s\S]*?<\/div>\s*<\/div>/gi) || [];
            for (const it of items) {
              const name = (/<div class="name"><a[^>]*>([^<]+)<\/a>/.exec(it) || [null, null])[1];
              const role = (/<div class="caracter">([^<]+)<\/div>/.exec(it) || [null, null])[1];
              const img =
                (/\bdata-src="([^">]+)"/i.exec(it) || /\bsrc="([^">]+)"/i.exec(it))?.[1] || null;
              const url = (/<div class="name"><a[^>]+href="([^"]+)"/i.exec(it) || [null, null])[1];
              if (name) {
                creators.push({
                  name: decode(name),
                  role: decode(role) || "Creator",
                  image: abs(img),
                  url: abs(url),
                });
              }
            }
          }

          // Cast section after <h2>Cast</h2>
          const castPeopleBlock = (() => {
            const m = /<h2>\s*Cast\s*<\/h2>\s*<div class="persons">([\s\S]*?)<\/div>/i.exec(castBlock);
            return m ? m[1] : null;
          })();

          if (castPeopleBlock) {
            const items = castPeopleBlock.match(/<div class="person"[\s\S]*?<\/div>\s*<\/div>/gi) || [];
            for (const it of items) {
              const name = (/<div class="name"><a[^>]*>([^<]+)<\/a>/.exec(it) || [null, null])[1];
              const role = (/<div class="caracter">([^<]+)<\/div>/.exec(it) || [null, null])[1];
              const img =
                (/\bdata-src="([^">]+)"/i.exec(it) || /\bsrc="([^">]+)"/i.exec(it))?.[1] || null;
              const url = (/<div class="name"><a[^>]+href="([^"]+)"/i.exec(it) || [null, null])[1];
              if (name) {
                cast.push({
                  name: decode(name),
                  role: decode(role),
                  image: abs(img),
                  url: abs(url),
                });
              }
            }
          }
        }
      }

      // --- Synopsis (inside #info -> .wp-content > p) ---
      const synopsis = (() => {
        const m = /<div id="info"[^>]*>[\s\S]*?<div class="wp-content">\s*<p>([\s\S]*?)<\/p>/i.exec(html);
        return m ? decode(m[1].replace(/<[^>]+>/g, "").trim()) : null;
      })();

      // --- Similar titles (from .srelacionados) ---
      const similar = [];
      {
        const simBlock = first(/<div class="sbox srelacionados">([\s\S]*?)<\/div>\s*<\/div>/i) || first(/<div class="sbox srelacionados">([\s\S]*?)<\/div>/i);
        if (simBlock) {
          const cards = simBlock.match(/<article>[\s\S]*?<\/article>/gi) || [];
          for (const card of cards) {
            const href = (/<a href="([^"]+)"/i.exec(card) || [null, null])[1];
            const alt = (/\balt="([^"]+)"/i.exec(card) || [null, null])[1];
            if (href) {
              similar.push({
                title: decode(alt) || null,
                url: abs(href),
              });
            }
          }
        }
      }

      // Build response
      const res = {
        status: "ok",
        slug: name,
        url: targetURL,
        title,
        original_title,
        poster,
        date_created: dateCreated, // top-left date in header
        networks,
        site_rating: siteRating ? parseFloat(siteRating) : null,
        site_votes: siteVotes,
        tmdb_rating: tmdb_rating ? parseFloat(tmdb_rating) : null,
        tmdb_votes,
        first_air_date,
        last_air_date,
        seasons_count,
        episodes_count,
        episodes_total,
        average_duration,
        genres,
        trailer,
        synopsis,
        gallery_images,
        seasons,
        creators,
        cast,
        similar,
      };

      if (wantPretty) {
        // include formatted HTML to help debugging (careful: large!)
        res.formatted_html = formatted;
      }

      return new Response(JSON.stringify(res, null, 2), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (err) {
      return new Response(
        JSON.stringify({ error: err?.message || String(err) }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
  },
};
