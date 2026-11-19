"""Find an Open Library cover for each book.

Reads scripts/books_for_covers.json, asks Open Library's search API for each
title, and writes scripts/out/covers.json plus contact sheets (thumbnails with
titles) so the matches can be checked by eye. Runs on GitHub Actions.
"""
import io
import json
import re
import time
from pathlib import Path

import requests
from PIL import Image, ImageDraw, ImageFont

HEADERS = {"User-Agent": "AsadLibraryPortal/0.1 (https://github.com/azasadzaidi1-sudo/asad-library-portal)"}
PUBLISHER_AUTHORS = {"Langenscheidt", "Hueber", "Klett", "Brigitte", "Entrepreneur Press",
                     "History for Peace (Seagull Foundation for the Arts)"}
OUT = Path("scripts/out")
OUT.mkdir(parents=True, exist_ok=True)


def clean_author(author):
    if author in PUBLISHER_AUTHORS:
        return ""
    first = re.split(r",| & ", author)[0]
    return re.sub(r"\s*\(.*?\)", "", first).strip()


def clean_title(title):
    title = re.sub(r"\s*\(.*?\)", "", title)       # drop "(دستک نہ دو)", "(for Brilka)"
    return title.strip().strip("'")


def search(params):
    params = {**params, "fields": "key,title,author_name,cover_i,first_publish_year,edition_count", "limit": 10}
    for attempt in range(3):
        try:
            r = requests.get("https://openlibrary.org/search.json", params=params, headers=HEADERS, timeout=30)
            r.raise_for_status()
            return [d for d in r.json().get("docs", []) if d.get("cover_i")]
        except Exception as e:  # noqa: BLE001
            print("  retry", attempt, e)
            time.sleep(5)
    return []


def best(docs, author):
    if not docs:
        return None
    if author:
        surname = author.split()[-1].lower()
        for d in docs:
            if any(surname in a.lower() for a in d.get("author_name", [])):
                return d
        return None
    # No author to check: prefer the edition-richest match.
    return max(docs, key=lambda d: d.get("edition_count", 0))


books = json.loads(Path("scripts/books_for_covers.json").read_text(encoding="utf-8"))
results = []
for b in books:
    author = clean_author(b["author"])
    title = clean_title(b["title"])
    short = title.split(":")[0].strip()
    tries = [{"title": title, "author": author} if author else {"title": title}]
    if short != title:
        tries.append({"title": short, "author": author} if author else {"title": short})
    if author:
        tries.append({"q": f"{short} {author}"})
    match, how = None, None
    for params in tries:
        docs = search(params)
        time.sleep(1)  # be polite: about one request a second
        match = best(docs, author)
        if match:
            how = params
            break
    row = {"id": b["id"], "title": b["title"], "author": b["author"]}
    if match:
        row.update(cover_id=match["cover_i"], ol_key=match["key"], ol_title=match["title"],
                   ol_author=", ".join(match.get("author_name", [])[:2]), how=how)
    print(b["id"], b["title"], "->", row.get("ol_title"), row.get("cover_id"))
    results.append(row)

(OUT / "covers.json").write_text(json.dumps(results, ensure_ascii=False, indent=1), encoding="utf-8")

# Contact sheets: 8 columns x 6 rows per sheet.
font = ImageFont.load_default(size=13)
W, H, LABEL = 130, 190, 46
for page in range(0, len(results), 48):
    chunk = results[page:page + 48]
    sheet = Image.new("RGB", (8 * W, 6 * (H + LABEL)), "white")
    draw = ImageDraw.Draw(sheet)
    for i, row in enumerate(chunk):
        x, y = (i % 8) * W, (i // 8) * (H + LABEL)
        if row.get("cover_id"):
            try:
                img = requests.get(f"https://covers.openlibrary.org/b/id/{row['cover_id']}-M.jpg",
                                   headers=HEADERS, timeout=30).content
                im = Image.open(io.BytesIO(img)).convert("RGB")
                im.thumbnail((W - 10, H - 6))
                sheet.paste(im, (x + 5, y + 3))
            except Exception as e:  # noqa: BLE001
                draw.text((x + 5, y + 80), f"error {e}"[:20], fill="red", font=font)
        else:
            draw.rectangle([x + 5, y + 3, x + W - 5, y + H - 3], outline="red")
            draw.text((x + 15, y + 80), "no cover", fill="red", font=font)
        label = f"{row['id']} {row['title']}"
        draw.text((x + 4, y + H), label[:19], fill="black", font=font)
        draw.text((x + 4, y + H + 15), label[19:38], fill="black", font=font)
        draw.text((x + 4, y + H + 30), (row.get("ol_title") or "")[:19], fill="gray", font=font)
    sheet.save(OUT / f"sheet-{page // 48 + 1}.jpg", quality=80)
print("found", sum(1 for r in results if r.get("cover_id")), "of", len(results))
