# NOMA TIMA website

Static site for NOMA TIMA, a global dessert bar, bistro and home bakery on Beacon Street, Aliganj, Lucknow.

The opening section is an interactive 3D crème brûlée (Three.js): drag across the custard to torch the sugar, then tap the golden crust to crack it. If WebGL isn't available, a photo shows instead.

- `index.html`: the page
- `styles.css`: styles
- `brulee.js`: the 3D brûlée scene (Three.js 0.160 from jsDelivr, no build step)
- `assets/`: photos (`assets/menu/` holds dish photos cropped from the printed menu PDF)

Hosted on Netlify: import the GitHub repo at app.netlify.com. `netlify.toml` at the repo root points Netlify at this folder, so no settings are needed, and every push to `master` redeploys.

Run locally with any static server, e.g. `python3 -m http.server` in this folder. ES modules don't load over `file://`.

The design follows the `frontend-design` skill from https://github.com/anthropics/skills.

## Before launch
- Confirm the phone/WhatsApp number (9811792837). It was read from a poster.
- Add opening hours once known.
- Menu prices were taken from the printed menu PDF (Google Drive), where the ₹ symbol was misread in places (e.g. "2839" → ₹839). Check them against the current Swiggy/Zomato listing.
- Crème brûlée is on Instagram but not in the PDF menu, so it's shown as a signature without a price.
