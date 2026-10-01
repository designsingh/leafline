import { injectShareMeta } from "../../lib/share.mjs";

export default async (request, context) => {
  const url = new URL(request.url);
  const response = await context.next();
  if (!response.ok) return response;
  let html = await response.text();
  try {
    const feedResponse = await fetch(new URL("/api/foliage", url));
    if (feedResponse.ok) {
      html = injectShareMeta(html, await feedResponse.json(), url.origin, url.searchParams.get("park"));
    }
  } catch { /* keep the page's baked share tags */ }
  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=300",
    },
  });
};
