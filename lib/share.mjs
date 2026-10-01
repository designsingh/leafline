import { TORONTO, bestPark, shareSentence } from "../public/trip.mjs";

function escapeAttr(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

export function pickPark(feed, parkId) {
  const parks = Array.isArray(feed?.parks) ? feed.parks : [];
  if (parkId) {
    const chosen = parks.find((park) => park.id === parkId);
    if (chosen) return chosen;
  }
  return bestPark(parks, { origin: TORONTO, maxMinutes: 240 });
}

export function injectShareMeta(html, feed, pageOrigin, parkId) {
  const park = pickPark(feed, parkId);
  if (!park) return html;
  const title = `${park.name} is at ${park.colour}% — Leafline`;
  const description = shareSentence(park);
  const image = `${pageOrigin}/photos/hero.webp`;
  const pageUrl = parkId ? `${pageOrigin}/?park=${encodeURIComponent(park.id)}` : `${pageOrigin}/`;
  const block = `<!-- share -->
<title>${escapeAttr(title)}</title>
<meta name="description" content="${escapeAttr(description)}">
<meta property="og:title" content="${escapeAttr(title)}">
<meta property="og:description" content="${escapeAttr(description)}">
<meta property="og:type" content="website">
<meta property="og:url" content="${escapeAttr(pageUrl)}">
<meta property="og:image" content="${escapeAttr(image)}">
<meta name="twitter:card" content="summary_large_image">
<!-- /share -->`;
  if (html.includes("<!-- share -->")) {
    return html.replace(/<!-- share -->[\s\S]*?<!-- \/share -->/, block);
  }
  return html.replace(/<title>[^<]*<\/title>/, block);
}
