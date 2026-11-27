// Lokaler Testserver: liefert den Ordner public/ aus (wie später GitHub Pages).
// Start: npm start  ->  http://localhost:3000

const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const ROOT = path.join(__dirname, "..", "public");
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

http
  .createServer((req, res) => {
    let rel;
    try {
      rel = decodeURIComponent(req.url.split("?")[0]);
    } catch {
      return res.writeHead(400).end();
    }
    const file = path.normalize(path.join(ROOT, rel.endsWith("/") ? rel + "index.html" : rel));
    if (!file.startsWith(ROOT)) return res.writeHead(403).end();
    fs.readFile(file, (err, content) => {
      if (err) return res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Nicht gefunden");
      res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" }).end(content);
    });
  })
  .listen(PORT, () => console.log(`Planner läuft auf http://localhost:${PORT}`));
