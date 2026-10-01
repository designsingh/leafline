import {
  DRIVE_WINDOWS,
  TORONTO,
  ageDays,
  driveMinutes,
  formatDrive,
  formatReportDate,
  shareSentence,
  tripScore,
} from "./trip.mjs";

const $ = (id) => document.getElementById(id);
const photos = window.PARK_PHOTOS || {};
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
}[char]));

let feed = { source: "https://www.ontarioparks.ca/fallcolour", fetchedAt: new Date().toISOString(), parks: [] };
let view = "explore";
let saved = new Set();
let selectedPark = "";
let origin = { ...TORONTO };
let driveId = "240";
let pinId = new URLSearchParams(location.search).get("park");
let pinActive = Boolean(pinId);
let pinReady = false;
let map;
let markerLayer;
let originMarker;
let fitKey = "";
let pendingFocus = pinId;
let expanded = false;
let previousBodyOverflow = "";
let toastTimer;
let openReportId = "";
let arrivalOpened = false;

try { saved = new Set(JSON.parse(localStorage.getItem("leafline-real-saved") || "[]")); } catch { saved = new Set(); }

const LEAFPATH = "M 0,-18 L 4,-10 L 9,-14 L 8,-6 L 17,-8 L 13,0 L 18,3 L 7,8 L 9,12 L 1,11 L 1,20 L -1,20 L -1,11 L -9,12 L -7,8 L -18,3 L -13,0 L -17,-8 L -8,-6 L -9,-14 L -4,-10 Z";

function regionOf(park) {
  return park.region === "Northeast" ? "Northeastern" : park.region === "Northwest" ? "Northwestern" : park.region;
}

function driveWindow() {
  return DRIVE_WINDOWS.find((item) => item.id === driveId) || DRIVE_WINDOWS[2];
}

function placeName() {
  return origin.name === "you" ? "you" : "Toronto";
}

function ageLabel(reportDate) {
  const days = ageDays(reportDate);
  return `${days} ${days === 1 ? "day" : "days"} old`;
}

function status(text, kind = "ok") {
  const el = $("feed-status");
  el.textContent = text;
  el.classList.toggle("is-error", kind === "error");
}

function toast(text) {
  const el = $("toast");
  el.hidden = false;
  el.textContent = text;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 3400);
}

function photosFor(park) {
  return photos[park.id] || [];
}

function leafColour(park) {
  if (park.dominant === "Green") return "#b7992f";
  if (park.dominant === "Yellow") return "#dfba36";
  if (park.dominant === "Orange") return "#e58538";
  if (park.dominant === "Yellow/Orange") return "#d89e36";
  return "#bc5736";
}

function leaves(park) {
  let out = "";
  const filled = Math.round(park.colour / 10);
  for (let i = 0; i < 10; i += 1) {
    out += `<path d="${LEAFPATH}" transform="translate(${22 + i * 42},25) scale(.9)" fill="${i < filled ? leafColour(park) : "#5a7945"}" stroke="#ffffff90" stroke-width="1"/>`;
  }
  return `<svg class="visual-leaves" viewBox="0 0 425 50" role="img" aria-label="${park.colour}% reported colour change, visualized as ten leaves">${out}</svg>`;
}

function markerColour(park) {
  if (park.colour < 30) return "#507a43";
  if (park.colour < 60) return "#cda323";
  if (park.colour < 80) return "#e97c30";
  return "#b84232";
}

function retention(park) {
  const remain = 100 - park.fall;
  return `<div class="retention-visual"><svg viewBox="0 0 80 80" role="img" aria-label="${remain}% of leaves remaining"><circle cx="40" cy="40" r="29" fill="none" stroke="#dedfcf" stroke-width="9"/><circle cx="40" cy="40" r="29" fill="none" stroke="#54764a" stroke-width="9" stroke-dasharray="${remain / 100 * 182.21} 182.21" transform="rotate(-90 40 40)"/><text x="40" y="45" text-anchor="middle" fill="#244c3a" font-size="16" font-family="system-ui">${remain}%</text></svg><p><strong>${park.fall}% leaf fall</strong><br>Ring shows ${remain}% still on the trees<br><span style="font-size:11px">Calculated as 100 − reported leaf fall</span></p></div>`;
}

function cardPhoto(park) {
  const shot = photosFor(park)[0];
  if (!shot) return "";
  return `<button class="park-photo" data-detail="${park.id}" type="button" aria-label="See ${esc(park.name)} photos and report"><img src="${esc(shot.src)}" alt="${esc(shot.alt)}" loading="lazy" width="1200" height="900"><span class="photo-tag">${esc(park.name)} · scenic photo</span><span class="photo-count">▧ ${photosFor(park).length} photos</span></button><div class="photo-credit">Ontario Parks · Not today’s conditions</div>`;
}

function photoGallery(park) {
  const items = photosFor(park);
  if (!items.length) return "";
  return `<div class="gallery-heading"><b>Scenic photos</b><span>Not today’s conditions</span></div><div class="report-gallery">${items.map((shot) => `<figure><img src="${esc(shot.src)}" alt="${esc(shot.alt)}" loading="lazy"><figcaption><a href="${esc(shot.source)}" target="_blank" rel="noopener">Ontario Parks ↗</a></figcaption></figure>`).join("")}</div>`;
}

function mapPhoto(park) {
  const shot = photosFor(park)[0];
  if (!shot) return "";
  return `<button type="button" style="padding:0;border:0;background:transparent;width:100%" data-detail="${park.id}" aria-label="Open ${esc(park.name)} report"><img class="map-photo" src="${esc(shot.src)}" alt="${esc(shot.alt)}" loading="lazy"></button><p class="map-photo-note">Scenic photo · Ontario Parks · Not current conditions</p>`;
}

function directionsUrl(park) {
  const from = origin.name === "you" ? `${origin.lat},${origin.lng}` : "Toronto, Ontario";
  return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(from)}&destination=${park.lat},${park.lng}&travelmode=driving`;
}

function headline(colour) {
  if (colour >= 70) return "The colour<br><em>is on.</em>";
  if (colour >= 40) return "It’s<br><em>turning.</em>";
  return "Still mostly<br><em>green.</em>";
}

function leadIn() {
  if (pinActive) return "Sent to you";
  if (driveId === "90") return "After work";
  if (driveId === "180") return "Make a day of it";
  if (driveId === "all") return "Right now";
  return "This weekend";
}

function visibleParks() {
  const query = $("search").value.trim().toLowerCase();
  const region = $("region").value;
  const maxMinutes = driveWindow().minutes;
  return feed.parks.filter((park) => {
    if (query && !park.name.toLowerCase().includes(query)) return false;
    if (region !== "all" && regionOf(park) !== region) return false;
    if (view === "saved") return saved.has(park.id);
    return driveMinutes(park, origin) <= maxMinutes;
  });
}

function sortParks(parks) {
  const mode = $("sort").value;
  return parks.slice().sort((a, b) => {
    if (mode === "fresh") return b.reportDate.localeCompare(a.reportDate) || b.colour - a.colour;
    if (mode === "leaves") return a.fall - b.fall || b.colour - a.colour;
    if (mode === "near") return driveMinutes(a, origin) - driveMinutes(b, origin) || b.colour - a.colour;
    if (mode === "colour") return b.colour - a.colour || a.fall - b.fall;
    return tripScore(b, origin) - tripScore(a, origin) || b.colour - a.colour;
  });
}

function featuredPark(rows) {
  if (pinActive && pinId) {
    const pinned = feed.parks.find((park) => park.id === pinId);
    if (pinned) return pinned;
  }
  return rows[0] || null;
}

function syncUrl() {
  if (!openReportId) return;
  const url = new URL(location.href);
  if (url.searchParams.get("park") === openReportId && history.state?.report === openReportId) return;
  url.searchParams.set("park", openReportId);
  url.hash = "";
  const state = history.state?.report === openReportId ? history.state : { report: openReportId, pushed: false };
  history.replaceState(state, "", url);
}

function ensureMap() {
  if (map || !window.L) return;
  map = L.map("foliage-map", {
    zoomControl: false,
    minZoom: 5,
    maxZoom: 15,
    maxBounds: [[41.2, -96], [57.2, -73.5]],
    maxBoundsViscosity: 0.7,
  });
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 18,
  }).addTo(map);
  markerLayer = L.layerGroup().addTo(map);
  map.setView([44.5, -79.2], 6);
  $("foliage-map").addEventListener("keydown", (event) => {
    if (event.key === "Home") {
      event.preventDefault();
      fitKey = "";
      render();
    }
  });
  if (typeof ResizeObserver !== "undefined") {
    new ResizeObserver(() => map.invalidateSize()).observe($("foliage-map"));
  }
}

function renderMap(rows) {
  ensureMap();
  if (!map) return;
  markerLayer.clearLayers();
  rows.forEach((park, index) => {
    const icon = L.divIcon({
      className: `ll-marker${park.id === selectedPark ? " is-selected" : ""}`,
      html: `<span style="background:${markerColour(park)}">${index + 1}</span>`,
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    });
    const marker = L.marker([park.lat, park.lng], {
      icon,
      keyboard: true,
      alt: `${park.name}, ${park.colour} percent colour change`,
      riseOnHover: true,
    });
    marker.on("click", () => selectPark(park.id));
    marker.addTo(markerLayer);
    marker.getElement()?.setAttribute("aria-label", `${park.name}, ${park.colour}% colour change`);
  });
  if (originMarker) originMarker.remove();
  originMarker = L.circleMarker([origin.lat, origin.lng], {
    radius: 6,
    color: "#fff",
    weight: 2,
    fillColor: "#263c32",
    fillOpacity: 1,
  }).addTo(map);
  originMarker.bindTooltip(origin.name === "you" ? "You" : "Toronto", {
    permanent: true,
    direction: "right",
    className: "origin-tip",
  });

  const key = `${rows.map((park) => park.id).join(",")}|${origin.lat.toFixed(3)},${origin.lng.toFixed(3)}`;
  const focus = pendingFocus;
  pendingFocus = null;
  if (!rows.length) {
    map.setView([origin.lat, origin.lng], 8);
    fitKey = key;
    return;
  }
  if (key !== fitKey) {
    const bounds = L.latLngBounds(rows.map((park) => [park.lat, park.lng]));
    bounds.extend([origin.lat, origin.lng]);
    map.fitBounds(bounds, { padding: [36, 36], maxZoom: 9 });
    fitKey = key;
  } else if (focus) {
    const park = rows.find((item) => item.id === focus) || feed.parks.find((item) => item.id === focus);
    if (park) map.panTo([park.lat, park.lng]);
  }
  const limits = map.getZoom();
  $("zoom-in").disabled = limits >= map.getMaxZoom();
  $("zoom-out").disabled = limits <= map.getMinZoom();
}

function renderSelection(rows) {
  const park = rows.find((item) => item.id === selectedPark) || rows[0];
  $("map-jump").innerHTML = rows.map((item) => `<option value="${item.id}">${esc(item.name)} · ${item.colour}%</option>`).join("");
  $("map-jump").disabled = !rows.length;
  if (!park) {
    $("map-selection").innerHTML = "<p>No parks match. Try a longer drive or another search.</p>";
    return;
  }
  selectedPark = park.id;
  $("map-jump").value = park.id;
  const mins = driveMinutes(park, origin);
  const rank = rows.findIndex((item) => item.id === park.id) + 1;
  $("map-selection").innerHTML = `<span class="marker-badge">${rank ? `No. ${rank} · ` : ""}${esc(regionOf(park))}</span><h2>${esc(park.name)}</h2>${mapPhoto(park)}${leaves(park)}<p><strong>${park.colour}% colour change</strong> · ${esc(park.dominant)}<br>About ${formatDrive(mins)} from ${placeName()}.</p>${retention(park)}<p>Observed ${formatReportDate(park.reportDate)} · ${ageLabel(park.reportDate)}</p><div class="actions"><button class="primary" type="button" data-detail="${park.id}">Report & directions</button><button class="secondary" type="button" data-share="${park.id}">Share</button></div>`;
}

function renderHero(park, rows) {
  const fromYou = origin.name === "you" ? " from you" : "";
  $("picks-title").textContent = `${driveWindow().title}${fromYou}`;
  $("hero-kicker").textContent = pinActive ? "Sent to you" : origin.name === "you" ? "From where you are" : "From Toronto";
  if (!park) {
    $("hero-title").innerHTML = "Reports<br><em>are out.</em>";
    $("hero-sub").textContent = "Ontario Parks didn’t return a list. Try refresh, or open the official report.";
    $("hero-number").textContent = "";
    $("hero-name").textContent = "";
    $("hero-date").textContent = "";
    $("hero-drive").textContent = "";
    $("hero-leaves").innerHTML = "";
    $("picks").innerHTML = "";
    return;
  }
  const mins = driveMinutes(park, origin);
  $("hero-title").innerHTML = headline(park.colour);
  $("hero-sub").innerHTML = `${leadIn()}. <strong>${esc(park.name)}</strong> is at ${park.colour}% colour, about ${formatDrive(mins)} from ${placeName()}. Reported ${formatReportDate(park.reportDate)} by Ontario Parks.`;
  $("hero-eyebrow").textContent = pinActive ? "Shared plan" : "Worth the drive";
  $("hero-number").textContent = `${park.colour}%`;
  $("hero-name").textContent = park.name;
  $("hero-date").textContent = `Reported ${formatReportDate(park.reportDate)}`;
  $("hero-drive").textContent = `About ${formatDrive(mins)} from ${placeName()}`;
  $("hero-leaves").innerHTML = leaves(park);
  $("share").dataset.share = park.id;
  document.title = `${park.name} is at ${park.colour}% — Leafline`;
  const shown = rows.slice(0, 3);
  const pickRows = shown.some((item) => item.id === park.id) ? shown : [park, ...shown.slice(0, 2)];
  $("drive-note").textContent = origin.name === "you"
    ? "Drive times are a rough estimate from your location to the park pin, not live traffic. A shared link still describes the drive from Toronto."
    : "Drive times are a rough estimate from Toronto to the park pin, not live traffic. Directions open in Google Maps.";
  $("picks").innerHTML = pickRows.map((item, index) => `<button class="pick${item.id === park.id ? " is-on" : ""}" type="button" data-detail="${item.id}"><span class="pick-rank">${index + 1}</span><span><b>${esc(item.name)}</b><small>${item.colour}% · ${esc(item.dominant)} · about ${formatDrive(driveMinutes(item, origin))}</small></span></button>`).join("");
  syncUrl();
}

function render() {
  ensurePinnedVisible();
  const regions = [...new Set(feed.parks.map(regionOf))].sort();
  const selectedRegion = $("region").value;
  $("region").innerHTML = `<option value="all">All regions</option>${regions.map((region) => `<option>${esc(region)}</option>`).join("")}`;
  $("region").value = regions.includes(selectedRegion) ? selectedRegion : "all";
  for (const button of document.querySelectorAll("[data-drive]")) {
    button.setAttribute("aria-pressed", String(button.dataset.drive === driveId));
  }
  const rows = sortParks(visibleParks());
  const hero = featuredPark(rows);
  if (hero && !rows.some((park) => park.id === selectedPark)) selectedPark = hero.id;
  $("saved-count").textContent = saved.size;
  $("explore").setAttribute("aria-pressed", String(view === "explore"));
  $("saved").setAttribute("aria-pressed", String(view === "saved"));
  $("results-title").textContent = `${view === "saved" ? "Saved" : "Parks"} · ${rows.length}`;
  $("routes").innerHTML = rows.length ? rows.map((park) => {
    const days = ageDays(park.reportDate);
    return `<article class="route">${cardPhoto(park)}<div class="content"><div class="card-accent" style="background:${leafColour(park)}"></div><div class="eyebrow">${esc(regionOf(park))}</div><h3>${esc(park.name)}</h3><div class="card-score"><b>${park.colour}%</b><span>${esc(park.dominant)}</span></div>${leaves(park)}<div class="metrics"><span>about ${formatDrive(driveMinutes(park, origin))}</span><span>${park.fall}% leaf fall</span></div><div class="freshness ${days > 5 ? "old" : ""}">${formatReportDate(park.reportDate)} · ${ageLabel(park.reportDate)}${days > 5 ? " · Older report" : ""}</div><div class="actions"><button class="primary" type="button" data-detail="${park.id}">View report</button><button class="save" type="button" data-save="${park.id}" aria-label="${saved.has(park.id) ? "Unsave" : "Save"} ${esc(park.name)}" aria-pressed="${saved.has(park.id)}">${saved.has(park.id) ? "♥" : "♡"}</button></div></div></article>`;
  }).join("") : `<div class="empty">${view === "saved" ? "No saved parks yet. Tap the heart on a report." : "Nothing in this drive matches. Try Weekend, or All Ontario."}</div>`;
  renderHero(hero, rows);
  renderMap(rows);
  renderSelection(rows);
  if (openReportId) fillReport(openReportId);
}

function ensurePinnedVisible() {
  if (pinReady || !pinId) return;
  const park = feed.parks.find((item) => item.id === pinId);
  if (!park) return;
  pinReady = true;
  pinActive = true;
  selectedPark = pinId;
  if (driveMinutes(park, origin) > driveWindow().minutes) driveId = "all";
}

function selectPark(id) {
  selectedPark = id;
  pendingFocus = id;
  render();
}

function fillReport(id) {
  const park = feed.parks.find((item) => item.id === id);
  const panel = $("report");
  if (!park) {
    hideReport();
    return;
  }
  const viewing = park.viewing ? `<div class="viewing"><b>Where to look</b><p>${esc(park.viewing)}</p></div>` : "";
  $("detail-body").innerHTML = `<div class="modal-head"><div><div class="eyebrow">Official park observation</div><h2 id="drawer-title">${esc(park.name)}</h2><p class="meta">Report dated ${formatReportDate(park.reportDate)} · about ${formatDrive(driveMinutes(park, origin))} from ${placeName()}</p></div></div><div class="modal-content"><div class="detail-stats"><div class="stat"><b>${park.colour}%</b><span>Reported colour change</span></div><div class="stat"><b>${park.fall}%</b><span>Reported leaf fall</span></div></div>${leaves(park)}<p>Dominant colour: <strong>${esc(park.dominant)}</strong>.</p>${retention(park)}${viewing}${photoGallery(park)}<p class="meta">This is the park’s report for that date. The drive time is an estimate, not live traffic. No peak date is predicted. Scenic photos are not current conditions.</p><div class="source-row"><b>Where this comes from</b>Ontario Parks Fall Colour Report · ${ageLabel(park.reportDate)}.<br>Retrieved ${esc(new Date(feed.fetchedAt).toLocaleString("en-CA", { timeZone: "America/Toronto" }))} Toronto time.</div><div class="modal-actions"><button class="primary" type="button" data-share="${park.id}">Share this park</button><a class="secondary" href="${directionsUrl(park)}" target="_blank" rel="noopener">Directions ↗</a><a class="secondary" href="${esc(feed.source)}" target="_blank" rel="noopener">Official foliage report ↗</a><a class="secondary" href="${esc(park.parkUrl)}" target="_blank" rel="noopener">Park access & permits ↗</a></div></div>`;
  panel.hidden = false;
  panel.setAttribute("aria-labelledby", "drawer-title");
  document.body.classList.add("report-open");
}

function hideReport() {
  openReportId = "";
  const panel = $("report");
  if (panel) panel.hidden = true;
  document.body.classList.remove("report-open");
}

function closeReport() {
  if (!openReportId) return;
  const closingId = openReportId;
  const pushed = Boolean(history.state?.pushed && history.state?.report === closingId);
  hideReport();
  if (pushed) {
    const before = location.href;
    history.back();
    setTimeout(() => {
      if (location.href !== before || openReportId) return;
      const url = new URL(location.href);
      url.searchParams.delete("park");
      history.replaceState(null, "", url);
    }, 0);
    return;
  }
  const url = new URL(location.href);
  if (url.searchParams.has("park")) {
    url.searchParams.delete("park");
    history.replaceState(null, "", url);
  }
}

function maybeOpenArrival() {
  if (arrivalOpened || !pinId || !feed.parks.some((park) => park.id === pinId)) return;
  arrivalOpened = true;
  openReport(pinId, "replace");
}

function openReport(id, mode = "push") {
  const park = feed.parks.find((item) => item.id === id);
  if (!park) return;
  const already = openReportId === id && !$("report").hidden;
  openReportId = id;
  selectedPark = id;
  pendingFocus = id;
  const url = new URL(location.href);
  url.searchParams.set("park", id);
  url.hash = "";
  if (mode === "push" && !already) {
    history.pushState({ report: id, pushed: true }, "", url);
  } else if (mode !== "show") {
    history.replaceState({ report: id, pushed: Boolean(history.state?.pushed) }, "", url);
  }
  render();
  if (mode !== "show") $("close-report")?.focus();
}

function validate(report) {
  if (report.source !== "https://www.ontarioparks.ca/fallcolour" || !Array.isArray(report.parks) || report.parks.length < 10 || !Number.isFinite(Date.parse(report.fetchedAt))) {
    throw new Error("Invalid feed");
  }
  for (const park of report.parks) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(park.reportDate) || !Number.isInteger(park.colour) || !Number.isInteger(park.fall) || park.colour < 0 || park.colour > 100 || park.fall < 0 || park.fall > 100 || !Number.isFinite(park.lat) || !Number.isFinite(park.lng) || typeof park.name !== "string") {
      throw new Error("Invalid report");
    }
    if (park.viewing != null && typeof park.viewing !== "string") throw new Error("Invalid report");
    park.name = park.name.trim();
    park.dominant = String(park.dominant).trim();
    if (typeof park.viewing === "string") park.viewing = park.viewing.trim();
  }
  return report;
}

async function refresh() {
  if (!/^https?:$/.test(location.protocol)) {
    status("Showing the saved Ontario Parks snapshot. Open the site on the web for a live refresh.", "error");
    return;
  }
  $("refresh").disabled = true;
  try {
    const response = await fetch("/api/foliage", { cache: "no-store", signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error("Feed unavailable");
    feed = validate(await response.json());
    render();
    maybeOpenArrival();
    status(`Live Ontario Parks reports · ${new Date(feed.fetchedAt).toLocaleString("en-CA", { timeZone: "America/Toronto" })} Toronto time.`);
  } catch {
    status("Couldn’t refresh Ontario Parks. These are the last saved reports — check the official page before you drive.", "error");
  } finally {
    $("refresh").disabled = false;
  }
}

async function sharePark(id) {
  const park = feed.parks.find((item) => item.id === id);
  if (!park) return;
  const url = new URL(location.href);
  url.searchParams.set("park", park.id);
  url.hash = "";
  const text = shareSentence(park, TORONTO);
  const title = `${park.name} is at ${park.colour}% — Leafline`;
  let delivered = false;
  if (navigator.share) {
    try {
      await navigator.share({ title, text, url: url.toString() });
      delivered = true;
    } catch (error) {
      if (error?.name === "AbortError") return;
    }
  }
  if (!delivered) {
    try {
      await navigator.clipboard.writeText(`${text}\n${url}`);
      toast("Copied. Paste it in the group chat.");
      delivered = true;
    } catch {
      toast(text);
    }
  }
  if (!delivered) return;
  pinId = id;
  pinActive = true;
  pinReady = true;
  openReport(id, "replace");
}

function toggleMapExpanded(force) {
  expanded = force ?? !expanded;
  const panel = $("foliage-map").closest(".map-section");
  panel.classList.toggle("is-expanded", expanded);
  $("map-expand").setAttribute("aria-pressed", String(expanded));
  $("map-expand").setAttribute("aria-label", expanded ? "Exit expanded map" : "Expand map");
  $("map-expand").textContent = expanded ? "×" : "⛶";
  if (expanded) {
    previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  } else {
    document.body.style.overflow = previousBodyOverflow;
  }
  setTimeout(() => {
    if (!map) return;
    map.invalidateSize();
    fitKey = "";
    render();
  }, 60);
}

function clearPin() {
  pinActive = false;
}

document.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (button?.dataset.share) {
    sharePark(button.dataset.share);
    return;
  }
  if (button?.dataset.detail) {
    openReport(button.dataset.detail);
    return;
  }
  if (button?.dataset.save) {
    if (saved.has(button.dataset.save)) saved.delete(button.dataset.save);
    else saved.add(button.dataset.save);
    try { localStorage.setItem("leafline-real-saved", JSON.stringify([...saved])); } catch { /* ignore quota */ }
    render();
    return;
  }
  if (openReportId && !$("report").contains(event.target)) closeReport();
}, true);

for (const button of document.querySelectorAll("[data-drive]")) {
  button.addEventListener("click", () => {
    driveId = button.dataset.drive;
    clearPin();
    selectedPark = "";
    fitKey = "";
    render();
  });
}

["search", "sort", "region"].forEach((id) => {
  $(id).addEventListener("input", () => {
    clearPin();
    render();
  });
  $(id).addEventListener("change", () => {
    clearPin();
    fitKey = "";
    render();
  });
});

$("explore").onclick = () => { view = "explore"; render(); };
$("saved").onclick = () => { view = "saved"; render(); };
$("refresh").onclick = refresh;
$("export").onclick = () => {
  const url = URL.createObjectURL(new Blob([JSON.stringify(feed, null, 2)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "leafline-official-reports.json";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
$("zoom-in").onclick = () => map && map.zoomIn();
$("zoom-out").onclick = () => map && map.zoomOut();
$("zoom-reset").onclick = () => { fitKey = ""; render(); };
$("map-jump").onchange = () => selectPark($("map-jump").value);
$("map-expand").onclick = () => toggleMapExpanded();
$("locate").onclick = () => {
  if (origin.name === "you") {
    origin = { ...TORONTO };
    $("locate").textContent = "Use my location";
    clearPin();
    fitKey = "";
    render();
    return;
  }
  if (!navigator.geolocation) {
    toast("This browser can’t share a location. Staying with Toronto.");
    return;
  }
  navigator.geolocation.getCurrentPosition((position) => {
    origin = { name: "you", lat: position.coords.latitude, lng: position.coords.longitude };
    $("locate").textContent = "Back to Toronto";
    clearPin();
    fitKey = "";
    render();
  }, () => toast("Couldn’t use your location. Staying with Toronto."));
};

$("close-report").onclick = () => closeReport();

window.addEventListener("popstate", () => {
  const id = history.state?.report;
  if (id && feed.parks.some((park) => park.id === id)) {
    openReportId = id;
    selectedPark = id;
    render();
    return;
  }
  hideReport();
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (openReportId) {
    event.preventDefault();
    closeReport();
    return;
  }
  if (expanded) {
    event.preventDefault();
    toggleMapExpanded(false);
  }
});

async function boot() {
  try {
    const response = await fetch("/fallback.json");
    if (response.ok) feed = validate(await response.json());
  } catch { /* live refresh will replace this */ }
  render();
  maybeOpenArrival();
  refresh();
  if (/^https?:$/.test(location.protocol)) setInterval(refresh, 15 * 60 * 1000);
}

boot();
