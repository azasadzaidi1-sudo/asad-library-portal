"""Second pass: for books whose first match was wrong or missing, collect
several candidate covers (from editions in the right language) and draw
them on contact sheets so the right one can be picked by eye."""
import io
import json
import time
from pathlib import Path

import requests
from PIL import Image, ImageDraw, ImageFont

HEADERS = {"User-Agent": "AsadLibraryPortal/0.1 (https://github.com/azasadzaidi1-sudo/asad-library-portal)"}
OUT = Path("scripts/out2")
OUT.mkdir(parents=True, exist_ok=True)
targets = json.loads(Path("scripts/cover_targets.json").read_text(encoding="utf-8"))


def get(url, params=None):
    for attempt in range(3):
        try:
            r = requests.get(url, params=params, headers=HEADERS, timeout=30)
            r.raise_for_status()
            time.sleep(1)
            return r.json()
        except Exception as e:  # noqa: BLE001
            print("  retry", attempt, url, e)
            time.sleep(5)
    return {}


results = []
for t in targets:
    params = {"q": t["q"], "fields": "key,title,author_name,cover_i", "limit": 4}
    docs = get("https://openlibrary.org/search.json", params).get("docs", [])
    candidates = []
    for d in docs[:3]:
        if t.get("author") and not any(t["author"].lower() in a.lower() for a in d.get("author_name", [])):
            continue
        if d.get("cover_i"):
            candidates.append({"cover_id": d["cover_i"], "note": f"work {d['title'][:18]}"})
        eds = get(f"https://openlibrary.org{d['key']}/editions.json", {"limit": 100}).get("entries", [])
        for e in eds:
            langs = [l["key"].split("/")[-1] for l in e.get("languages", [])]
            if t["lang"] in langs or not langs:
                for c in e.get("covers", [])[:1]:
                    if c and c > 0:
                        candidates.append({"cover_id": c, "note": (e.get("publishers") or ["?"])[0][:18]})
    seen, unique = set(), []
    for c in candidates:
        if c["cover_id"] not in seen:
            seen.add(c["cover_id"])
            unique.append(c)
    results.append({"id": t["id"], "title": t["title"], "candidates": unique[:9]})
    print(t["id"], t["title"], len(unique))

(OUT / "candidates.json").write_text(json.dumps(results, ensure_ascii=False, indent=1), encoding="utf-8")

font = ImageFont.load_default(size=13)
W, H, LABEL, HEAD = 110, 160, 30, 22
for page in range(0, len(results), 6):
    chunk = results[page:page + 6]
    sheet = Image.new("RGB", (9 * W, len(chunk) * (H + LABEL + HEAD)), "white")
    draw = ImageDraw.Draw(sheet)
    for r_i, row in enumerate(chunk):
        y0 = r_i * (H + LABEL + HEAD)
        draw.text((4, y0 + 4), f"{row['id']} {row['title']}", fill="black", font=font)
        for c_i, cand in enumerate(row["candidates"]):
            x, y = c_i * W, y0 + HEAD
            try:
                img = requests.get(f"https://covers.openlibrary.org/b/id/{cand['cover_id']}-M.jpg",
                                   headers=HEADERS, timeout=30).content
                im = Image.open(io.BytesIO(img)).convert("RGB")
                im.thumbnail((W - 8, H - 4))
                sheet.paste(im, (x + 4, y + 2))
            except Exception:  # noqa: BLE001
                draw.text((x + 8, y + 60), "error", fill="red", font=font)
            draw.text((x + 4, y + H), f"{c_i}: {cand['note']}"[:16], fill="gray", font=font)
        if not row["candidates"]:
            draw.text((10, y0 + HEAD + 60), "no candidates", fill="red", font=font)
    sheet.save(OUT / f"pick-{page // 6 + 1}.jpg", quality=80)
print("done")
