// ---------------------------------------------------------------------------
// server.mjs — zero-dependency static server for local preview.
//   node server.mjs [port]        (defaults to 3013 or $PORT)
// ---------------------------------------------------------------------------
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.argv[2] || process.env.PORT || 3013);
const HOST = process.env.HOST || '0.0.0.0';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.sql': 'text/plain; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8'
};

const server = http.createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  let filePath = path.join(ROOT, url === '/' ? 'index.html' : url);

  // prevent path traversal
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  fs.stat(filePath, (err, stat) => {
    if (!err && stat.isDirectory()) filePath = path.join(filePath, 'index.html');
    fs.readFile(filePath, (readErr, data) => {
      if (readErr) {
        // SPA fallback for extension-less routes
        if (!path.extname(filePath)) {
          fs.readFile(path.join(ROOT, 'index.html'), (e2, html) => {
            if (e2) { res.writeHead(404).end('Not found'); return; }
            res.writeHead(200, { 'content-type': MIME['.html'], 'cache-control': 'no-store' });
            res.end(html);
          });
          return;
        }
        res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found');
        return;
      }
      res.writeHead(200, {
        'content-type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
        'cache-control': 'no-store',
        'access-control-allow-origin': '*'
      });
      res.end(data);
    });
  });
});

server.listen(PORT, HOST, () => {
  console.log(`TRIAD running at http://${HOST}:${PORT}`);
});
