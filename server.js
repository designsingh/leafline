import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fetchFoliageReport } from "./lib/foliage.mjs";
import { injectShareMeta } from "./lib/share.mjs";

const port = Number(process.env.PORT) || 4173;
const publicDir = path.resolve("public");

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

function fileFor(pathname) {
  const decoded = decodeURIComponent(pathname);
  const full = path.resolve(publicDir, `.${decoded}`);
  if (full !== publicDir && !full.startsWith(`${publicDir}${path.sep}`)) return null;
  return full;
}

async function sendFile(res, filePath) {
  const body = await readFile(filePath);
  const type = types[path.extname(filePath)] || "application/octet-stream";
  const cache = type.startsWith("image/") ? "public, max-age=86400" : "no-cache";
  res.writeHead(200, { "content-type": type, "cache-control": cache });
  res.end(body);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

  if (url.pathname === "/api/foliage") {
    try {
      const report = await fetchFoliageReport();
      res.writeHead(200, {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "public, max-age=300",
      });
      res.end(JSON.stringify(report));
    } catch {
      res.writeHead(502, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: "Feed unavailable" }));
    }
    return;
  }

  if (url.pathname === "/" || url.pathname === "/index.html") {
    try {
      let html = await readFile(path.join(publicDir, "index.html"), "utf8");
      try {
        const report = await fetchFoliageReport();
        html = injectShareMeta(html, report, url.origin, url.searchParams.get("park"));
      } catch { /* keep the baked share tags */ }
      res.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "public, max-age=300",
      });
      res.end(html);
    } catch {
      res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
      res.end("Page unavailable");
    }
    return;
  }

  const filePath = fileFor(url.pathname);
  if (!filePath) {
    res.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
    res.end("Bad path");
    return;
  }
  try {
    const info = await stat(filePath);
    if (!info.isFile()) throw new Error("missing");
    await sendFile(res, filePath);
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
});

server.listen(port, () => {
  console.log(`Leafline listening on http://localhost:${port}`);
});
