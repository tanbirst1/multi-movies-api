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
        return s
          .replace(/>(\s*)</g, ">\n<")
          .replace(/<\/(div|li|article|section|span|h\d|p)>/g, "</$1>\n")
          .replace(/(<li\b)/g, "\n$1")
          .replace(/(\s){2,}/g, " ")
          .trim();
      }

      const formatted = formatHTML(html);
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

      // Modified abs function to return relative URLs
      const abs = (u, keepAbsolute = false) => {
        if (!u) return null;
        if (keepAbsolute && /^https?:\/\//i.test(u)) return u;
        const relative = u.replace(new RegExp(`^${BASEURL.replace(/\/+$/, "")}/?`), "/");
        return relative.replace(/^\/+/, "/");
      };

      // Function to clean image URLs (remove size suffix like [-200x300].jpg.webp)
      const cleanImageUrl = (url) => {
        if (!url) return null;
        return url.replace(/\[-?\d+x?\d*\]\.(jpg|webp|png)$/i, "");
      };

      // --- SHEADER data ---
      const title =
        first(/<div class="data">\s*<h1[^>]*>([^<]+)<\/h1>/i) ||
        first(/<h1[^>]*>([^<]+)<\/h1>/i) ||
        decode(name.replace(/-/g, " "));

      // Poster (prefer poster block; fallback to any main image in poster or gallery)
      let poster =
        first(/<div class="poster">[\s\S]*?<img[^>]+(?:src|data-src)="([^">]+)"/i) ||
        first(/id="dt_galery"[\s\S]*?<img[^>]+(?:src|data-src)="([^">]+)"/i) ||
        null;
      poster = cleanImageUrl(abs(poster, true));

      // Top-left aired date & networks (from .extra)
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

      // Site star rating & votes
      const siteRating = first(/<div class="dt_rating_data">[\s\S]*?class="dt_rating_vgs"[^>]*>([\d.]+)<\/span>/i);
      const siteVotes = (() => {
        const m = /<div class="dt_rating_data">[\s\S]*?class="rating-count"[^>]*>(\d+)<\/span>/i.exec(html);
        return m ? parseInt(m[1], 10) : null;
      })();

      // Genres
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

      // Trailer
      const trailer = first(/<div id="trailer"[\s\S]*?<iframe[^>]+src="([^"]+)"/i);

      // --- Custom fields ---
      const customField = (label) => {
        const re = new RegExp(
          `<div class="custom_fields">\\s*<b class="variante">\\s*${label}\\s*<\\/b>\\s*<span class="valor">([\\s\\S]*?)<\\/span>\\s*<\\/div>`,
          "i"
        );
        return first(re);
      };

      const original_title = customField("Original title");

      // TMDb rating
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

      // Gallery images
      const gallery_images = allMatches(
        /id="dt_galery"[\s\S]*?<img[^>]+(?:data-src|src)="([^">]+)"/gi
      ).map((url) => cleanImageUrl(abs(url, true)));

      // --- Seasons & Episodes ---
      const seasons = [];
      {
        const seasonsBlock =
          first(/<div id="seasons">([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>\s*<\/div>/i) ||
          first(/<div id="seasons">([\s\S]*?)<\/div>/i);

        if (seasonsBlock) {
          const seCards = seasonsBlock.match(/<div class="se-c">[\s\S]*?(?:<\/div>\s*<\/div>|<\/div>)/gi) || [];
          for (const card of seCards) {
            const seasonNumStr = (() => {
              const m =
                /<span class="se-t(?:\s+[^"]*)?">(\d+)<\/span>/i.exec(card) ||
                /<span class="se-t(?:\s+[^"]*)?">([^<]+)<\/span>/i.exec(card);
              return m ? m[1].trim() : null;
            })();
            const seasonNumber = seasonNumStr ? parseInt(seasonNumStr.replace(/\D+/g, ""), 10) : null;

            const seasonTitleLine =
              first(/<span class="title">([\s\S]*?)<\/span>/i) ||
              (() => {
                const m = /<span class="title">([\s\S]*?)<\/span>/i.exec(card);
                return m ? decode(m[1]) : null;
              })();

            const seasonAirDate = (() => {
              const m = /<span class="title">[\s\S]*?<i>([^<]+)<\/i>/i.exec(card);
              return m ? decode(m[1]) : null;
            })();

            // Episodes
            const episodes = [];
            const epListBlock = (() => {
              const m = /<ul class="episodios">([\s\S]*?)<\/ul>/i.exec(card);
              return m ? m[1] : null;
            })();

            if (epListBlock) {
              const epItems = epListBlock.match(/<li\b[^>]*>[\s\S]*?(?:<\/li>)/gi) || [];
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
                  (/<div class="imagen">[\s\S]*?<img[^>]+data-src="([^">]+)"/i.exec(li) ||
                  /<div class="imagen">[\s\S]*?<img[^>]+src="([^">]+)"/i.exec(li))?.[1] ||
                  null;

                // Extract season and episode numbers
                let seasonNum = seasonNumber;
                let episodeNum = null;
                let episodeFormat = null;
                if (numerando) {
                  const parts = numerando.split("-").map((s) => s.trim());
                  if (parts.length === 2) {
                    seasonNum = parseInt(parts[0], 10);
                    episodeNum = parseInt(parts[1], 10);
                    episodeFormat = `${seasonNum}x${episodeNum}`;
                  }
                }

                episodes.push({
                  episode_format: episodeFormat,
                  number_display: numerando,
                  season: seasonNum,
                  episode: episodeNum,
                  name: epTitle,
                  url: epUrl,
                  date: epDate,
                  poster: cleanImageUrl(abs(epImg, true)),
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

      // Computed total episodes
      const episodes_total =
        seasons.reduce((acc, s) => acc + (Array.isArray(s.episodes) ? s.episodes.length : 0), 0) ||
        (episodes_count || 0);

      // --- Cast & Creators ---
      const creators = [];
      const cast = [];
      {
        const castBlock =
          first(/<div id="cast"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/i) ||
          first(/<div id="cast"[^>]*>([\s\S]*?)<\/div>/i);
        if (castBlock) {
          const creatorsBlock = (() => {
            const m = /<h2>\s*Creator\s*<\/h2>\s*<div class="persons">([\s\S]*?)<\/div>/i.exec(castBlock);
            return m ? m[1] : null;
          })();
          if (creatorsBlock) {
            const items = creatorsBlock.match(/<div class="person"[\s\S]*?(?:<\/div>\s*<\/div>|<\/div>)/gi) || [];
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
                  image: cleanImageUrl(abs(img, true)),
                  url: abs(url),
                });
              }
            }
          }

          const castPeopleBlock = (() => {
            const m = /<h2>\s*Cast\s*<\/h2>\s*<div class="persons">([\s\S]*?)<\/div>/i.exec(castBlock);
            return m ? m[1] : null;
          })();

          if (castPeopleBlock) {
            const items = castPeopleBlock.match(/<div class="person"[\s\S]*?(?:<\/div>\s*<\/div>|<\/div>)/gi) || [];
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
                  image: cleanImageUrl(abs(img, true)),
                  url: abs(url),
                });
              }
            }
          }
        }
      }

      // --- Synopsis ---
      const synopsis = (() => {
        const m = /<div id="info"[^>]*>[\s\S]*?<div class="wp-content">\s*<p>([\s\S]*?)<\/p>/i.exec(html);
        return m ? decode(m[1].replace(/<[^>]+>/g, "").trim()) : null;
      })();

      // --- Similar titles ---
      const similar = [];
      {
        const simBlock =
          first(/<div class="sbox srelacionados">([\s\S]*?)<\/div>\s*<\/div>/i) ||
          first(/<div class="sbox srelacionados">([\s\S]*?)<\/div>/i);
        if (simBlock) {
          const cards = simBlock.match(/<article>[\s\S]*?(?:<\/article>)/gi) || [];
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
        date_created: dateCreated,
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
