// api/header.js (Vercel Serverless Function)
import fetch from "node-fetch";
import { JSDOM } from "jsdom";

export const config = {
  runtime: "edge",
};

export default async function handler(req) {
  try {
    const response = await fetch("https://multimovies.pro");
    const html = await response.text();

    const dom = new JSDOM(html);
    const document = dom.window.document;

    const header = document.querySelector("#main_header");
    const items = [];

    function parseMenu(liElements) {
      const menuArray = [];
      liElements.forEach((li) => {
        const aTag = li.querySelector("a");
        if (!aTag) return;

        let href = aTag.getAttribute("href") || "#";
        // Convert to relative path if from multimovies.pro
        if (href.includes("multimovies.pro")) {
          href = new URL(href).pathname;
        }

        const menuItem = {
          title: aTag.textContent.trim(),
          url: href,
        };

        // Check if submenu exists
        const subMenu = li.querySelectorAll(":scope > ul.sub-menu > li");
        if (subMenu.length > 0) {
          menuItem.children = parseMenu(subMenu);
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
