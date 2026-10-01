import { fetchFoliageReport } from "../lib/foliage.mjs";

export default async function handler(_req, res) {
  try {
    const report = await fetchFoliageReport();
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.setHeader("cache-control", "public, max-age=300");
    res.status(200).json(report);
  } catch {
    res.status(502).json({ error: "Feed unavailable" });
  }
}
