// Tiny static server over the game folder (sol/), for headless capture.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const GAME = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".wav": "audio/wav", ".mp3": "audio/mpeg", ".otf": "font/otf", ".png": "image/png", ".jpg": "image/jpeg" };

export function serve() {
  const server = http.createServer((req, res) => {
    const file = path.join(GAME, decodeURIComponent(new URL(req.url, "http://x").pathname));
    if (!file.startsWith(GAME) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

