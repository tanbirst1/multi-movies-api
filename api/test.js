const GITHUB_REPO = "tanbirst1/multi-movies-api";
const GITHUB_BRANCH = "main";
const DATA_DIR = "data/movies";

async function saveToGithub(path, content) {
  const url = `https://api.github.com/repos/${GITHUB_REPO}/contents/${path}`;
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      "Authorization": `Bearer ${process.env.GITHUB_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: `scraped: ${path}`,
      content: Buffer.from(JSON.stringify(content, null, 2)).toString("base64"),
      branch: GITHUB_BRANCH,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error("GitHub save failed: " + err);
  }
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { "user-agent": "ScraperBot/1.0" } });
  if (!res.ok) throw new Error(`${url} failed ${res.status}`);
  return res.json();
}

export default async function handler(req, res) {
  try {
    const { page = 6, total = 6 } = req.query;
    const reversePage = total - page + 1;

    // Step 1: Titles
    const listUrl = `https://multi-movies-api.vercel.app/api/page?path=/tvshows/&page=${page}`;
    const list = await fetchJson(listUrl);

    for (const [section, items] of Object.entries(list.sections)) {
      for (const item of items) {
        const slug = encodeURIComponent(item.title.toLowerCase().replace(/\s+/g, "-"));
        const safeName = slug.replace(/[^a-z0-9-_]/gi, "_");

        // Step 2: TV details
        const tvUrl = `https://multi-movies-api.vercel.app/api/tv?slug=${slug}&section=movies`;
        const tvData = await fetchJson(tvUrl);

        // Step 3: Add video sources
        for (const season of tvData.seasons || []) {
          for (const ep of season.episodes || []) {
            try {
              const videoUrl = `https://multi-movies-api.vercel.app/api/video?url=${encodeURIComponent(ep.url)}`;
              const videoData = await fetchJson(videoUrl);
              ep.sources = videoData.sources || [];
            } catch {
              ep.sources = [];
            }
          }
        }

        // Step 4: Save
        const savePath = `${DATA_DIR}/page${reversePage}/${safeName}.json`;
        await saveToGithub(savePath, {
          meta: tvData.meta,
          cast: tvData.cast,
          gallery: tvData.gallery,
          similar: tvData.similar,
          seasons: tvData.seasons,
        });
      }
    }

    // Auto refresh
    let next = parseInt(page) - 1;
    let done = next < 1;
    let html = done
      ? `<h2>✅ Done scraping all ${total} pages!</h2>`
      : `<meta http-equiv="refresh" content="9.5;url=/api/full-scraper?page=${next}&total=${total}">
         <h2>Scraped page ${page}/${total} → next in 9.5s...</h2>`;

    res.setHeader("Content-Type", "text/html");
    res.status(200).send(html);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
