# Droplabs — developer handover

Read this before touching anything. The repo's `README.md` is older than the
product and still claims "1080p/1920p Full HD"; the app deliberately reports the
resolution Instagram actually serves. Trust this file over the README.

## What this is

**Droplabs** is a small network of free, ad-supported browser tools for creators.
Two things exist today:

1. **InstaFetch** — public Instagram downloader (Reels, Stories, Photos,
   Carousels). The revenue product.
2. **Image Compressor** — 100% in-browser image compression. Zero server cost.

Direction: keep adding free creator tools (compression, conversion, research,
analysis). Each new tool should be cheap to serve, fast, and monetised.

- **Live:** https://droplabs.site
- **Repo:** https://github.com/itsdecoding/ig-downloader (branch `main`)
- **Host:** Render, auto-deploys on push to `main`. Deploy takes ~90–105 s.
- **Domain/DNS:** Cloudflare.

## Stack

| Layer | What |
| --- | --- |
| Backend | FastAPI + uvicorn (Python 3.11), `app.py` |
| Extraction | `yt-dlp` (runs in a thread executor) |
| Media proxy | `httpx`, streaming, Range passthrough |
| Frontend | Hand-written HTML/CSS/JS, no framework, no bundler |
| Styling | Compiled Tailwind for the InstaFetch shell; hand-written `tool.css` for tool pages |
| Storage | **None.** No DB, no accounts, no cookies, no uploaded files |
| Tests | None in the repo (see "Verifying a change") |

Dependencies are in `requirements.txt` (7 packages). `Dockerfile` is the
production image: `python:3.11-slim`, ffmpeg installed, 2 uvicorn workers.

## Run locally

```bash
python -m uvicorn app:app --host 0.0.0.0 --port 8000 --reload
```

`run.bat` does the same on Windows. No build step is needed to *run* the site;
the build step is only for CSS changes (below).

## Two different page systems — do not mix them up

### 1. InstaFetch shell + landing pages (server-side substitution)

`static/index.html` (121 KB) is the **only** InstaFetch document. It contains the
app, the Ad Deck, the legal modals and the footer.

`landing_pages.py` holds the five search intents. At request time `app.py` takes
`index.html` and swaps title, meta, canonical, OG/Twitter tags, JSON-LD, `<h1>`,
badge, how-to block, body copy and FAQ — then strips the `<!--LANDING:NAME-->`
markers.

- The four landing URLs are the same downloader with different copy. Fixing the
  app once fixes all five pages.
- The markers in `index.html` are a contract. If an anchor is renamed,
  `landing_pages.render()` **raises** instead of silently serving homepage copy.
- Adding a landing page: add an entry to `PAGES`, append the slug to `ORDER`,
  add content. Nothing else.

### 2. Standalone tool pages

The compressor is its own document: `static/compress.html` + `static/tool.css` +
`static/compress.js`. No Tailwind, no three.js, no Ad Deck. It is served by a
dedicated route in `app.py` and listed in `landing_pages.TOOL_URLS` so the
sitemap includes it.

**Route order matters.** `/{slug}` is a catch-all registered last. Any new
top-level path must be declared *before* it or it will 404 through the catch-all.

## Build step (the #1 way to break the UI)

Tailwind is compiled ahead of time. There is no CDN runtime. After changing any
markup or any class name:

```bash
npx --yes tailwindcss@3.4.17 -i tw-in.css -o static/tailwind.css --minify
```

`tailwind.config.js` scans `static/index.html` **and `landing_pages.py`** —
landing-page class names only exist inside Python strings. Miss that and those
four pages lose their styling.

`tw-in.css` lives outside the repo (it was in a temp dir); recreate it with the
three `@tailwind` directives if it is missing.

## Ads — hard rules, non-negotiable

Adsterra is the only network. One unit key:
`18527c484b75598c40e3c7284aae8ee4`.

- Adsterra injects **four creatives into one container**. The **Ad Deck** in
  `index.html` pages them inside a fixed-height card: 4 s dwell, 0.32 s slide,
  paged by the creatives' real measured heights, with swipe support and a
  pause-aware timer. Do not "simplify" this into an iframe carousel.
- **All four creatives must stay monetised.** That is the revenue model.
- **Never modify the ad markup, never fake clicks, never add clickbait.**
- Ads must not degrade UX: the deck sits below the fold, collapses if there is
  no fill, and pauses when off-screen/hovered/backgrounded.
- **Dev shield:** on `localhost`, `127.0.0.1` and empty hostname the ad script
  is never loaded. This protects the Adsterra account. Keep it.
- Tool pages currently run a **single plain unit** (no deck), loaded lazily with
  the same localhost guard and a no-fill collapse.
- A **second unit needs a new key from Adsterra**. Do not invent one and do not
  reuse the existing key twice on one page.

## SEO / search setup

- Five indexable URLs: `/`, and the four `instagram-*-downloader` pages, plus
  `/image-compressor`.
- `/sitemap.xml` and `/robots.txt` are generated in `app.py`. `SITE_UPDATED` in
  `app.py` is the sitemap `lastmod` — bump it when page content changes.
- Every page has its own title, description, canonical, OG/Twitter tags and
  JSON-LD (`WebApplication` + `BreadcrumbList` + `FAQPage`).
- Search Console is verified by DNS TXT. Sitemap is submitted.
- **Favicons:** Google requires a source that is a multiple of 48 px. We serve a
  real 16/32/48/64 `favicon.ico`, plus 48 and 96 px PNGs, plus an SVG declared
  at 48 px. Do not replace `/favicon.ico` with a 32 px PNG again — that is
  exactly what kept the old icon in Google for weeks.

## Environment variables

Everything is optional; the app runs with none set.

| Var | Effect |
| --- | --- |
| `PORT`, `HOST` | Bind address (defaults 8000 / 0.0.0.0) |
| `PROXY_URL` | **Operationally important.** Instagram blocks datacenter IPs. If extraction fails on Render but works locally, this is almost certainly why. Residential/rotating proxy. |
| `GOOGLE_SITE_VERIFICATION` | Adds the Search Console meta tag |
| `CF_ANALYTICS_TOKEN` | Adds the Cloudflare Web Analytics beacon (~2 KB, cookieless) |
| `GROQ_API_KEY` | **Required for `/tools/video-to-text`.** Groq Whisper API key (`POST /api/transcribe`). |
| `GROQ_WHISPER_MODEL` | Optional Whisper model override (defaults to `whisper-large-v3-turbo`). |

`.env.example` documents all of them. **There is currently no analytics at all** —
the token was never supplied. The first thing to fix if you need data.

## API surface

- `POST /api/extract` — `{ "url": "..." }` → metadata + direct media URL.
  In-memory cache, 10 min TTL, 500 entries.
- `GET /api/download?url=&filename=` — streams with
  `Content-Disposition: attachment`. **Only `cdninstagram.com` / `fbcdn.net`
  hosts are allowed**, 300 MB ceiling, Range forwarded.
- `GET /api/health` — also answers HEAD.

No auth, no rate limiting, CORS is `*`. That is a deliberate MVP trade-off and
also the biggest abuse/cost risk on this deployment. If you add anything
expensive, put a limit in front of it first.

## Gotchas that will cost you an afternoon

- **Never open production in a real browser while testing.** Every page load
  fires ad impressions and pollutes revenue data. Verify with
  `curl` / `Invoke-WebRequest` only. Use a local server + Playwright for UI.
- **Windows PowerShell:** `git push` prints a red `NativeCommandError` and exits
  1 even when the push succeeds. Check the `old..new main -> main` line.
- **Python 3.11:** no backslashes inside f-string expressions, no same-quote
  nesting in f-strings.
- **`sw.js` intentionally caches nothing.** It exists only to make the site
  installable. Do not add a cache-first strategy; stale HTML was a real problem.
- **Landing pages are rendered from `index.html` at request time**, with an
  mtime-based cache. Editing `index.html` is enough; no restart needed.
- **Do not trust `README.md`.** It predates the quality-honesty pass.

## Product rules (these are design constraints, not preferences)

- **Be honest about quality.** Never label a file 1080p unless it is. The app
  reports the resolution Instagram actually served, and the landing copy says
  so explicitly. This was a deliberate fix; do not regress it.
- **Mobile first.** Most traffic is phones. Every page must be checked at 390 px
  before it ships.
- **Fast.** No CDN frameworks, no runtime Tailwind, no heavy libraries on the
  critical path. The compressor page is ~50 KB total for that reason.
- **No fake claims.** If a feature cannot work (private accounts, HEIC in
  Chrome), say so in the UI.

## Verifying a change

There is no test suite. The working pattern is a throwaway Playwright script:

1. Run the app locally on a spare port.
2. Drive the real page in Chromium (desktop 1280 and phone 390).
3. Assert on behaviour, capture console errors, check
   `scrollWidth - clientWidth === 0` for overflow.
4. Screenshot and look at it.
5. `Invoke-WebRequest` / `curl` against production after deploy — **never a
   browser**.

Also check: `/sitemap.xml` URL count, a 404 for an unknown slug, and that every
new page appears in the sitewide footer nav.

## Open work

1. **Second ad unit** — blocked on a new Adsterra key from the owner.
2. **PDF toolkit** (merge / split / compress) — next tool, same in-browser model.
3. **HEIC support** — Safari decodes it, Chrome/Firefox do not. Needs a WASM
   decoder (~200 KB); only worth it if bounce data justifies it.
4. **Analytics token** — currently zero measurement.
5. **Favicon in Google** — fixed at the source; waits on Googlebot recrawl.
   Search Console → URL Inspection → Request Indexing is the only lever.
6. **Legal links on tool pages** — the compressor has no Privacy/Terms/DMCA
   links; the modals live only in `index.html`. Needs a shared footer.
