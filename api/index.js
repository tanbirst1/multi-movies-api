import requests
from bs4 import BeautifulSoup
import json

BASE_URL = "https://multimovies.coupons"

def scrape_multimovies():
    result = {
        "status": "ok",
        "base": BASE_URL,
        "totalFeatured": 0,
        "featured": [],
        "top_movies": [],
        "top_tvshows": []
    }
    
    try:
        r = requests.get(BASE_URL, timeout=10)
        r.raise_for_status()
        soup = BeautifulSoup(r.text, "html.parser")

        # --- Featured Titles (Dynamic) ---
        featured_section = soup.find("header", string=lambda s: s and "Featured titles" in s)
        if not featured_section:
            featured_container = soup.find("h2", string=lambda s: s and "Featured titles" in s)
        else:
            featured_container = featured_section

        if featured_container:
            featured_items = featured_container.find_parent().find_all("article", class_="post")
            for item in featured_items:
                title_el = item.find("h3")
                link_el = item.find("a", href=True)
                img_el = item.find("img", src=True)
                if title_el and link_el:
                    result["featured"].append({
                        "title": title_el.get_text(strip=True),
                        "link": link_el["href"],
                        "image": img_el["src"] if img_el else None
                    })
            result["totalFeatured"] = len(result["featured"])

        # --- TOP MOVIES (Fixed Section) ---
        top_movies_header = soup.find("h3", string=lambda s: s and "TOP Movies" in s)
        if top_movies_header:
            for item in top_movies_header.find_all_next("div", class_="top-imdb-item", limit=10):
                title_el = item.find("div", class_="title").find("a")
                img_el = item.find("img", src=True)
                rating_el = item.find("div", class_="rating")
                if title_el:
                    result["top_movies"].append({
                        "title": title_el.get_text(strip=True),
                        "link": title_el["href"],
                        "image": img_el["src"] if img_el else None,
                        "rating": rating_el.get_text(strip=True) if rating_el else None
                    })

        # --- TOP TV SHOWS (Fixed Section) ---
        top_tv_header = soup.find("h3", string=lambda s: s and "TOP TVShows" in s)
        if top_tv_header:
            for item in top_tv_header.find_all_next("div", class_="top-imdb-item", limit=10):
                title_el = item.find("div", class_="title").find("a")
                img_el = item.find("img", src=True)
                rating_el = item.find("div", class_="rating")
                if title_el:
                    result["top_tvshows"].append({
                        "title": title_el.get_text(strip=True),
                        "link": title_el["href"],
                        "image": img_el["src"] if img_el else None,
                        "rating": rating_el.get_text(strip=True) if rating_el else None
                    })

    except Exception as e:
        return {"status": "error", "message": str(e)}

    return result


if __name__ == "__main__":
    data = scrape_multimovies()
    print(json.dumps(data, indent=2))
