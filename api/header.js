// api/header.js
export const config = { runtime: "edge" };

export default async function handler(req) {
  try {
    const res = await fetch("https://multimovies.pro");
    const html = await res.text();

    // Extract the main <header id="header" class="main"> ... </header>
    const headerMatch = html.match(
      /<header id=["']header["'][^>]*class=["']main["'][\s\S]*?<\/header>/i
    );
    if (!headerMatch) {
      return new Response(JSON.stringify({ error: "Header not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }
    const headerHTML = headerMatch[0];

    // Extract logo
    const logoMatch = headerHTML.match(
      /<div class=["']logo["'][^>]*>[\s\S]*?<img[^>]*data-src=['"]([^'"]+)['"]/i
    );
    const logoURL = logoMatch ? logoMatch[1] : null;

    // Extract search form action
    const searchMatch = headerHTML.match(
      /<form[^>]*id=["']searchform["'][^>]*action=['"]([^'"]+)['"]/i
    );
    const searchAction = searchMatch ? searchMatch[1] : null;

    // Recursive function to parse <ul> menu into JSON
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

        // Make relative paths for multimovies.pro URLs
        if (href.includes("multimovies.pro")) href = new URL(href).pathname;

        const item = { title, url: href };

        // Nested sub-menu
        const subMenuMatch = liContent.match(/<ul[^>]*class=["']sub-menu["'][^>]*>([\s\S]*?)<\/ul>/i);
        if (subMenuMatch) {
          item.children = parseMenu(subMenuMatch[1]);
        }

        items.push(item);
      }
      return items;
    }

    // Extract main navigation menu <ul id="main_header" ...>
    const menuMatch = headerHTML.match(/<ul[^>]*id=["']main_header["'][^>]*>([\s\S]*?)<\/ul>/i);
    const menuHTML = menuMatch ? menuMatch[1] : "";
    const menu = parseMenu(menuHTML);

    return new Response(JSON.stringify({ logo: logoURL, searchAction, menu }, null, 2), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
