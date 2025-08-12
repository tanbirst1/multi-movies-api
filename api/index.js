import requests
from bs4 import BeautifulSoup
import re
import json

BASE_URL = "https://multimovies.coupons"

def clean_img_url(url):
    # Remove size suffix like -90x135 or -185x278 before .jpg/.png/.webp
    return re.sub(r"-\d+x\d+(?=\.(jpg|png|webp)$)", "", url)

def to_relative(url):
    if url.startswith(BASE_URL):
        return url.replace(BASE_URL, "")
    return url

def scrape_sections():
    r = requests.get(BASE_URL)
    soup = BeautifulSoup(r.text, "html.parser")

    data = {
        "status": "ok",
        "featured": [],
        "top_movies": [],
        "top_tvshows": []
    }

    # Featured section (detect dynamically by h2 title)
    featured_section = soup.find("h2", string=re.compile("Featured", re.I))
    if featured_section:
        featured_container = featured_section.find_next("div", class_="nav_items_module")
        if featured_container:
            for item in featured_container.find_all("a", href=True):
                img_tag = item.find("img")
                if img_tag:
                    img_url = clean_img_url(img_tag["src"])
                    data["featured"].append({
                        "title": img_tag.get("alt", "").strip(),
                        "url": to_relative(item["href"]),
                        "img": img_url
                    })

    # Top Movies
    top_movies_h3 = soup.find("h3", string=re.compile("TOP Movies", re.I))
    if top_movies_h3:
        for item in top_movies_h3.find_all_next("div", class_="top-imdb-item", limit=20):
            title_tag = item.find("div", class_="title").find("a", href=True)
            img_tag = item.find("img")
            rank_tag = item.find("div", class_="puesto")
            rating_tag = item.find("div", class_="rating")

            data["top_movies"].append({
                "rank": int(rank_tag.text.strip()) if rank_tag else None,
                "title": title_tag.text.strip() if title_tag else "",
                "url": to_relative(title_tag["href"]) if title_tag else "",
                "img": clean_img_url(img_tag["src"]) if img_tag else "",
                "rating": float(rating_tag.text.strip()) if rating_tag else None
            })

    # Top TV Shows
    top_tv_h3 = soup.find("h3", string=re.compile("TOP TVShows", re.I))
    if top_tv_h3:
        for item in top_tv_h3.find_all_next("div", class_="top-imdb-item", limit=20):
            title_tag = item.find("div", class_="title").find("a", href=True)
            img_tag = item.find("img")
            rank_tag = item.find("div", class_="puesto")
            rating_tag = item.find("div", class_="rating")

            data["top_tvshows"].append({
                "rank": int(rank_tag.text.strip()) if rank_tag else None,
                "title": title_tag.text.strip() if title_tag else "",
                "url": to_relative(title_tag["href"]) if title_tag else "",
                "img": clean_img_url(img_tag["src"]) if img_tag else "",
                "rating": float(rating_tag.text.strip()) if rating_tag else None
            })

    return data

if __name__ == "__main__":
    scraped_data = scrape_sections()
    print(json.dumps(scraped_data, indent=2, ensure_ascii=False))
