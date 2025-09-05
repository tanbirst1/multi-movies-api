// api/header.js (Edge Function compatible, no DOMParser)
export const config = { runtime: "edge" };

export default async function handler(req) {
  try {
    const res = await fetch("https://multimovies.pro");
    const html = await res.text();

    // Extract main header UL
    const headerMatch = html.match(/<ul id=["']main_header["'][^>]*>([\s\S]*?)<\/ul>/i);
    if (!headerMatch) {
      return new Response(JSON.stringify({ error: "Header not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const headerHTML = headerMatch[1];

    // Function to parse <li> recursively
    function parseMenu(html) {
      const items = [];
      const liRegex = /<li[^>]*>([\s\S]*?)<\/li>/gi;
      let liMatch;
      while ((liMatch = liRegex.exec(html))) {
        const liContent = liMatch[1];

        // Extract <a> tag
        const aMatch = liContent.match(/<a[^>]*href=["']([^"']*)["'][^>]*>(.*?)<\/a>/i);
        if (!aMatch) continue;
        let href = aMatch[1];
        const title = aMatch[2].replace(/<[^>]+>/g, "").trim();

        // Convert multimovies.pro URLs to relative paths
        if (href.includes("multimovies.pro")) {
          href = new URL(href).pathname;
        }

        const item = { title, url: href };

        // Check for nested <ul class="sub-menu">
        const subMenuMatch = liContent.match(/<ul[^>]*class=["']sub-menu["'][^>]*>([\s\S]*?)<\/ul>/i);
        if (subMenuMatch) {
          item.children = parseMenu(subMenuMatch[1]);
        }

        items.push(item);
      }
      return items;
    }

    const menu = parseMenu(headerHTML);

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
