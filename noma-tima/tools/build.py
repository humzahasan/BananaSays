#!/usr/bin/env python3
"""Rebuild the generated parts of index.html from data/*.json.

Edit data/menu.json (dishes, prices) or data/signatures.json, then run:
    python3 tools/build.py
Dish photos are looked up in assets/dishes/manifest.json by item name.
"""
import html
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
e = html.escape


def load(name, default):
    p = ROOT / name
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else default


menu = load("data/menu.json", {"categories": []})
sigs = load("data/signatures.json", [])
manifest = load("assets/dishes/manifest.json", {})
by_name = {v["name"].lower(): v for v in manifest.values() if not v.get("hero")}
hero_by_name = {v["name"].lower(): v for v in manifest.values() if v.get("hero")}
by_slug = manifest


def photo_for(name=None, slug=None, hero=False):
    item = by_slug.get(slug) if slug else by_name.get((name or "").lower())
    if not item:
        return None
    if hero and item and (item["name"].lower() in hero_by_name):
        return hero_by_name[item["name"].lower()]
    return item


def img_tag(item, alt, cls, sizes="", eager=False):
    w, h = item.get("w", 600), item.get("h", 450)
    loading = "eager" if eager else "lazy"
    return (f'<img class="{cls}" src="{e(item["file"])}" alt="{e(alt)}" width="{w}" height="{h}" '
            f'loading="{loading}" decoding="async" />')


def price(p):
    return f"₹{e(p)}" if p else ""


# ---------- Signatures strip ----------
sig_html = ['<ol class="sig-track" id="sig-track">']
for s in sigs:
    item = photo_for(slug=s.get("photo"), name=s["name"])
    if s.get("photo_file"):
        item = {"file": s["photo_file"], "w": s.get("w", 900), "h": s.get("h", 700)}
    pic = img_tag(item, s.get("alt", s["name"]), "sig-img") if item else '<span class="sig-img sig-img--empty"></span>'
    sig_html.append(
        f'<li class="sig"><figure class="plate">{pic}</figure>'
        f'<h3>{e(s.get("display", s["name"]))}</h3><p>{e(s["line"])}</p>'
        + (f'<span class="sig-price">{price(s["price"])}</span>' if s.get("price") else "")
        + "</li>"
    )
sig_html.append("</ol>")

# ---------- Menu tabs + panels ----------
cats = menu["categories"]
tabs = ['<div class="menu-tabs" role="tablist" aria-label="Menu categories">']
panels = []
for i, c in enumerate(cats):
    sel = "true" if i == 0 else "false"
    tabs.append(
        f'<button role="tab" id="tab-{c["key"]}" aria-controls="panel-{c["key"]}" aria-selected="{sel}" '
        f'tabindex="{0 if i == 0 else -1}">{e(c["title"])}</button>'
    )
    hidden = "" if i == 0 else " hidden"
    cards = []
    for it in c["items"]:
        item = photo_for(name=it["name"])
        pic = (img_tag(item, it["name"], "dish-img") if item
               else '<span class="dish-img dish-img--empty" aria-hidden="true"></span>')
        desc = f'<p class="dish-desc">{e(it["desc"])}</p>' if it.get("desc") else ""
        cards.append(
            f'<li class="dish-card{"" if item else " no-photo"}"><div class="dish-pic">{pic}</div>'
            f'<div class="dish-body"><h4>{e(it["name"])}</h4><span class="dish-price">{price(it["price"])}</span>{desc}</div></li>'
        )
    panels.append(
        f'<div class="menu-panel" role="tabpanel" id="panel-{c["key"]}" aria-labelledby="tab-{c["key"]}"{hidden}>'
        f'<ul class="dish-grid">{"".join(cards)}</ul></div>'
    )
tabs.append("</div>")


def inject(src, marker, block):
    pat = re.compile(rf"(<!-- {marker} -->).*?(<!-- /{marker} -->)", re.S)
    if not pat.search(src):
        raise SystemExit(f"marker {marker} not found in index.html")
    return pat.sub(lambda m: f"{m.group(1)}\n{block}\n{m.group(2)}", src)


index = ROOT / "index.html"
src = index.read_text(encoding="utf-8")
src = inject(src, "SIGNATURES", "\n".join(sig_html))
src = inject(src, "MENU", "\n".join(tabs) + "\n" + "\n".join(panels))
index.write_text(src, encoding="utf-8")

with_photo = sum(1 for c in cats for it in c["items"] if photo_for(name=it["name"]))
total = sum(len(c["items"]) for c in cats)
print(f"signatures: {len(sigs)}, menu items: {total}, with photos: {with_photo}")
