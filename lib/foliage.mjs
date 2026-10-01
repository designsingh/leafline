const SOURCE = "https://www.ontarioparks.ca/fallcolour";
const CACHE_MS = 10 * 60 * 1000;

const REGIONS = {
  Northeast: "Northeastern",
  Northwest: "Northwestern",
  Northeastern: "Northeastern",
  Northwestern: "Northwestern",
  Southeastern: "Southeastern",
  Southwestern: "Southwestern",
  Algonquin: "Algonquin",
};

export function normalizeRegion(region) {
  if (typeof region !== "string" || !region.trim()) return "Ontario";
  return REGIONS[region] || region.trim();
}

export function plainText(value) {
  return String(value ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

let cache = null;

function reportDate(unixSeconds) {
  const ms = Number(unixSeconds) * 1000;
  if (!Number.isFinite(ms)) return null;
  const formatted = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(ms));
  return /^\d{4}-\d{2}-\d{2}$/.test(formatted) ? formatted : null;
}

function integerPercent(value) {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value !== "string" || !/^\d{1,3}$/.test(value)) return null;
  const n = Number(value);
  return n >= 0 && n <= 100 ? n : null;
}

export function parseFallColourHtml(html, fetchedAt = new Date().toISOString()) {
  const marker = "var data = ";
  const start = html.indexOf(marker);
  if (start < 0 || html[start + marker.length] !== "[") {
    throw new Error("Fall colour data not found");
  }

  const jsonStart = start + marker.length;
  let depth = 0;
  let inString = false;
  let escape = false;
  let end = -1;

  for (let i = jsonStart; i < html.length; i++) {
    const char = html[i];
    if (inString) {
      if (escape) escape = false;
      else if (char === "\\") escape = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === "[") depth++;
    else if (char === "]") {
      depth--;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }

  if (end < 0) throw new Error("Fall colour data not found");

  const rows = JSON.parse(html.slice(jsonStart, end));
  if (!Array.isArray(rows)) throw new Error("Fall colour data not found");

  const parks = [];
  for (const row of rows) {
    if (!row || row.reporting !== "yes" || typeof row.park_name !== "string") continue;
    const colour = integerPercent(row.colour_change);
    const fall = integerPercent(row.leaf_fall);
    const lat = Number(row.lat);
    const lng = Number(row.lng);
    const date = reportDate(row.report_date);
    const shortname = typeof row.shortname === "string" ? row.shortname : "";
    if (
      colour === null ||
      fall === null ||
      !date ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      !/^[a-z0-9-]+$/i.test(shortname)
    ) {
      continue;
    }

    const viewing = plainText(row.viewing);
    const park = {
      id: String(row.id),
      name: row.park_name,
      region: normalizeRegion(row.region),
      dominant: typeof row.dominant_colour === "string" ? row.dominant_colour.trim() : "Green",
      colour,
      fall,
      reportDate: date,
      lat,
      lng,
      parkUrl: `https://www.ontarioparks.ca/park/${shortname}`,
    };
    if (viewing.length >= 12) park.viewing = viewing.slice(0, 600);
    parks.push(park);
  }

  parks.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));

  if (!Number.isFinite(Date.parse(fetchedAt)) || parks.length < 10) {
    throw new Error("Invalid feed");
  }

  return { source: SOURCE, fetchedAt, parks };
}

export async function fetchFoliageReport() {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.data;

  const response = await fetch(SOURCE, {
    headers: {
      accept: "text/html",
      "user-agent": "Mozilla/5.0 (compatible; Leafline/1.0)",
    },
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error("Ontario Parks unavailable");

  const data = parseFallColourHtml(await response.text());
  cache = { at: Date.now(), data };
  return data;
}
