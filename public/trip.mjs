export const TORONTO = { name: "Toronto", lat: 43.6532, lng: -79.3832 };

export const DRIVE_WINDOWS = [
  { id: "90", label: "After work", title: "After work", minutes: 90 },
  { id: "180", label: "Day trip", title: "A day trip", minutes: 180 },
  { id: "240", label: "Weekend", title: "The weekend list", minutes: 240 },
  { id: "all", label: "All Ontario", title: "All of Ontario", minutes: Infinity },
];

const ROAD_FACTOR = 1.35;
const ROAD_KMH = 80;

export function torontoToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function ageDays(reportDate, now = new Date()) {
  const today = torontoToday(now);
  return Math.max(0, Math.floor((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${reportDate}T12:00:00Z`)) / 86400000));
}

export function driveMinutes(park, origin = TORONTO) {
  const toRad = (degrees) => (degrees * Math.PI) / 180;
  const dLat = toRad(park.lat - origin.lat);
  const dLng = toRad(park.lng - origin.lng);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(origin.lat)) * Math.cos(toRad(park.lat)) * Math.sin(dLng / 2) ** 2;
  const straightKm = 2 * 6371 * Math.asin(Math.sqrt(a));
  return Math.max(1, Math.round((straightKm * ROAD_FACTOR) / ROAD_KMH * 60));
}

export function formatDrive(minutes) {
  const rounded = Math.max(1, Math.round(minutes));
  if (rounded < 60) return `${rounded} min`;
  const hours = Math.floor(rounded / 60);
  const remainder = rounded % 60;
  if (remainder < 8) return `${hours} hr`;
  if (remainder > 52) return `${hours + 1} hr`;
  return `${hours} hr ${remainder} min`;
}

export function tripScore(park, origin = TORONTO, now = new Date()) {
  const hours = driveMinutes(park, origin) / 60;
  return park.colour * 1.15 - hours * 16 - Math.max(0, ageDays(park.reportDate, now) - 5) * 4;
}

export function bestPark(parks, { origin = TORONTO, maxMinutes = 240, now = new Date() } = {}) {
  if (!parks.length) return null;
  const within = parks.filter((park) => driveMinutes(park, origin) <= maxMinutes);
  const pool = within.length ? within : parks;
  return pool.reduce((best, park) => (
    tripScore(park, origin, now) > tripScore(best, origin, now) ? park : best
  ));
}

export function formatReportDate(reportDate) {
  return new Intl.DateTimeFormat("en-CA", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${reportDate}T12:00:00Z`));
}

export function shareSentence(park, origin = TORONTO) {
  const place = origin.name === "you" ? "Toronto" : origin.name;
  const from = origin.name === "you" ? TORONTO : origin;
  return `${park.name} is at ${park.colour}% colour — about ${formatDrive(driveMinutes(park, from))} from ${place}. Reported ${formatReportDate(park.reportDate)} by Ontario Parks.`;
}
