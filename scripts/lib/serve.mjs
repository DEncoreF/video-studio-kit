// A static file server for headless captures (film-page.mjs, ae-export's preview check): one copy, so a missing asset is a 404 and
// not a crash. Read the file before writing headers — writing 200 first and then failing to read threw ERR_HTTP_HEADERS_SENT
// from the catch and killed the whole run (timeline-events b9f0522; ae-export, critic-loop, seek and camtrack had the same line).
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";

export const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".ttf": "font/ttf", ".otf": "font/otf", ".woff2": "font/woff2", ".woff": "font/woff", ".json": "application/json" };

/** Serve `base` on a free port; `server.address().port` is the port. */
export const serve = (base) => createServer(async (req, res) => { try { const p = join(base, decodeURIComponent(new URL(req.url, "http://x").pathname));
  const body = await readFile(p); res.writeHead(200, { "content-type": TYPES[extname(p).toLowerCase()] ?? "application/octet-stream" }); res.end(body); }
  catch { if (!res.headersSent) res.writeHead(404); res.end(); } }).listen(0);
