const fs = require("fs");
const path = require("path");
const fetch = require("node-fetch");

const API_KEY = process.env.API_KEY || fs.readFileSync(path.join(__dirname, "key.txt"), "utf-8").trim();
const API_BASE = "https://api.streamup.cc/v1";

module.exports = async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const action = url.searchParams.get("action") || "";

  res.setHeader("Content-Type", "text/html");

  if (action === "upload") {
    // Upload a Google Drive video link
    const videoUrl = url.searchParams.get("url");
    if (!videoUrl) {
      return res.end("<h3>❌ Missing ?url= parameter</h3>");
    }

    const apiUrl = `${API_BASE}/remote?api_key=${API_KEY}&url=${encodeURIComponent(videoUrl)}&action=add_remote_url`;

    try {
      const r = await fetch(apiUrl);
      const data = await r.json();

      if (data.success) {
        return res.end(`
          <h2>✅ Upload Success!</h2>
          <p><b>Streaming URL:</b> <a href="https://strmup.to/${data.filecode}" target="_blank">https://strmup.to/${data.filecode}</a></p>
          <a href="/">⬅ Back</a>
        `);
      } else {
        return res.end(`<h3>❌ Upload failed: ${data.message}</h3><a href="/">⬅ Back</a>`);
      }
    } catch (err) {
      return res.end(`<h3>❌ Error: ${err.message}</h3><a href="/">⬅ Back</a>`);
    }
  }

  if (action === "list") {
    // Fetch uploaded videos
    const apiUrl = `${API_BASE}/data?api_key=${API_KEY}&page=1`;

    try {
      const r = await fetch(apiUrl);
      const data = await r.json();

      if (data.videos) {
        const items = data.videos.map(v => `
          <div style="margin:10px;padding:10px;border:1px solid #444;border-radius:8px;">
            <img src="${v.thumbnail}" width="160" /><br>
            <b>${v.title}</b><br>
            Status: ${v.status}<br>
            Last Updated: ${v.last_updated}<br>
            <a href="https://strmup.to/${v.Filecode}" target="_blank">▶ Watch</a>
          </div>
        `).join("");

        return res.end(`
          <h2>📂 Your Uploaded Videos</h2>
          <div style="display:flex;flex-wrap:wrap;">${items}</div>
          <a href="/">⬅ Back</a>
        `);
      } else {
        return res.end(`<h3>❌ Failed: ${JSON.stringify(data)}</h3><a href="/">⬅ Back</a>`);
      }
    } catch (err) {
      return res.end(`<h3>❌ Error: ${err.message}</h3><a href="/">⬅ Back</a>`);
    }
  }

  // Default homepage
  res.end(`
    <h1>🎬 StreamUP GDrive Uploader</h1>
    <form action="/" method="GET">
      <input type="hidden" name="action" value="upload"/>
      <input type="text" name="url" placeholder="Paste Google Drive video link" size="50" required/>
      <button type="submit">Upload</button>
    </form>
    <hr>
    <a href="/?action=list">📂 View Uploaded Videos</a>
  `);
};
