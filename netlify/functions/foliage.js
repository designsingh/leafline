import { fetchFoliageReport } from "../../lib/foliage.mjs";

export default async function handler() {
  try {
    const report = await fetchFoliageReport();
    return new Response(JSON.stringify(report), {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "public, max-age=300",
      },
    });
  } catch {
    return new Response(JSON.stringify({ error: "Feed unavailable" }), {
      status: 502,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }
}
