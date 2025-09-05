// api/header.js (Vercel Edge / Cloudflare Worker compatible)
export const config = {
  runtime: "edge",
};

export default async function handler(req) {
  try {
    // Fetch HTML from multimovies.pro
    const res = await fetch("https://multimovies.pro");
    const html = await res.text();

    // Parse HTML using DOMParser (Edge-friendly)
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");

    const header = doc.querySelector("#main_header");
    if (!header) {
      return new Response(JSON.stringify({ error: "Header not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    function parseMenu(liElements) {
      const menuArray = [];
      liElements.forEach((li) => {
        const aTag = li.querySelector("a");
        if (!aTag) return;

        let href = aTag.getAttribute("href") || "#";
        // Convert multimovies.pro URLs to relative paths
        if (href.includes("multimovies.pro")) {
          href = new URL(href).pathname;
        }

        const menuItem = {
          title: aTag.textContent.trim(),
          url: href,
        };

        const subMenuItems = li.querySelectorAll(":scope > ul.sub-menu > li");
        if (subMenuItems.length > 0) {
          menuItem.children = parseMenu(subMenuItems);
        }

        menuArray.push(menuItem);
      });
      return menuArray;
    }

    const topLevelItems = header.querySelectorAll(":scope > li");
    const menu = parseMenu(topLevelItems);

    return new Response(JSON.stringify(menu, null, 2), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
