import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseFallColourHtml } from "../lib/foliage.mjs";
import { injectShareMeta } from "../lib/share.mjs";
import { bestPark, driveMinutes, formatDrive, TORONTO } from "../public/trip.mjs";

const html = await readFile(new URL("../fixtures/fallcolour-sample.html", import.meta.url), "utf8");

test("parses the pinned Ontario Parks fixture", () => {
  const feed = parseFallColourHtml(html, "2026-10-01T00:00:00.000Z");
  assert.equal(feed.source, "https://www.ontarioparks.ca/fallcolour");
  assert.equal(feed.parks.length, 10);
  assert.equal(feed.parks.find((park) => park.name === "Sample Northeast").region, "Northeastern");
  assert.equal(feed.parks.find((park) => park.name === "Sample Northwest").region, "Northwestern");
  const northeast = feed.parks.find((park) => park.name === "Sample Northeast");
  assert.equal(northeast.viewing, "Walk the ridge for the best colour.");
  assert.equal(feed.parks.find((park) => park.name === "Algonquin").colour, 90);
  assert.equal(feed.parks.find((park) => park.name === "Sample Northwest").viewing, undefined);
});

test("rejects a page that no longer contains the report", () => {
  assert.throws(() => parseFallColourHtml("<html>no report</html>", "2026-10-01T00:00:00.000Z"));
});

test("weekend pick prefers high colour within four hours of Toronto", () => {
  const feed = parseFallColourHtml(html, "2026-10-01T00:00:00.000Z");
  const pick = bestPark(feed.parks, { origin: TORONTO, maxMinutes: 240, now: new Date("2026-09-30T16:00:00Z") });
  assert.equal(pick.name, "Algonquin");
  assert.ok(driveMinutes(pick, TORONTO) > 120);
  assert.match(formatDrive(driveMinutes(pick, TORONTO)), /hr/);
});

test("share tags describe the linked park", () => {
  const feed = parseFallColourHtml(html, "2026-10-01T00:00:00.000Z");
  const page = injectShareMeta("<html><head><title>Old</title></head><body></body></html>", feed, "https://leafline.test", "7");
  assert.match(page, /Petroglyphs is at 70%/);
  assert.match(page, /og:image" content="https:\/\/leafline\.test\/photos\/hero\.webp"/);
  assert.match(page, /og:url" content="https:\/\/leafline\.test\/\?park=7"/);
});
