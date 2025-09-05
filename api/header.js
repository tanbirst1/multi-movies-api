// api/menu.js
import fetch from "node-fetch";
import cheerio from "cheerio";

export default async function handler(req, res) {
  try {
    const targetUrl = "https://multimovies.pro/";

    const response = await fetch(targetUrl, {
      headers: { "User-Agent": "Mozilla/5.0" }
    });
    const html = await response.text();

    const $ = cheerio.load(html);

    const menuContainer = $(".menu-menu1-container");
    if (!menuContainer.length) {
      return res.status(404).json({ error: "Menu container not found" });
    }

    // Recursive function to parse <li> items
    function parseLi(li) {
      const $li = $(li);
      const title = $li.children("a").first().text().trim();
      const url = $li.children("a").first().attr("href") || null;
      const idMatch = ($li.attr("class") || "").match(/menu-item-(\d+)/);
      const id = idMatch ? idMatch[1] : null;

      let submenu = [];
      $li.children("ul.sub-menu").children("li").each((_, subLi) => {
        submenu.push(parseLi(subLi));
      });

      const item = { id, title, url };
      if (submenu.length) item.submenu = submenu;
      return item;
    }

    const menuData = [];
    menuContainer.find("#main_header > li").each((_, li) => {
      menuData.push(parseLi(li));
    });

    res.status(200).json(menuData);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
