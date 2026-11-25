/**
 * Tailwind is compiled ahead of time, not loaded from the CDN.
 *
 * Rebuild after touching any markup:
 *   npx --yes tailwindcss@3.4.17 -i tw-in.css -o static/tailwind.css --minify
 *
 * landing_pages.py is scanned too because it generates the intent landing
 * pages from string templates — those class names exist nowhere in the HTML
 * source at build time.
 */
module.exports = {
  content: ["./static/index.html", "./landing_pages.py"],
  theme: { extend: {} },
  plugins: [],
};
