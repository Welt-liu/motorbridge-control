import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.stl': 'application/octet-stream', '.urdf': 'application/xml', '.dae': 'application/xml', '.woff2': 'font/woff2' };
export function staticHandler(root, prefix = '') {
  return async (req, res) => {
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
    let relative;
    try { relative = decodeURIComponent(new URL(req.url, 'http://localhost').pathname.slice(prefix.length)); }
    catch { res.writeHead(400); res.end(); return; }
    const base = path.resolve(root);
    let file = path.resolve(base, relative.replace(/^\/+/, '') || 'index.html');
    if (!file.startsWith(base + path.sep)) { res.writeHead(403); res.end(); return; }
    try {
      const info = await stat(file).catch(() => null);
      if (info?.isDirectory()) file = path.join(file, 'index.html');
      else if (!info && !path.extname(file)) file = path.join(base, 'index.html');
      const data = await readFile(file);
      res.writeHead(200, { 'Content-Type': mime[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      res.end(req.method === 'HEAD' ? undefined : data);
    } catch { res.writeHead(404); res.end('Resource not found'); }
  };
}
