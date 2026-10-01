import { injectShareMeta } from "./lib/share.mjs";

export const config = { matcher: "/" };

export default async function middleware(request) {
  const url = new URL(request.url);
  const [page, feedResponse] = await Promise.all([
    fetch(new URL("/index.html", url)),
    fetch(new URL("/api/foliage", url)),
  ]);
  let html = await page.text();
  if (feedResponse.ok) {
    html = injectShareMeta(html, await feedResponse.json(), url.origin, url.searchParams.get("park"));
  }
  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=300",
    },
  });
}
