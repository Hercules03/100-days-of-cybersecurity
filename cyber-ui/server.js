// cyber-ui/server.js — minimal local server for the 100-days-of-cybersecurity study UI.
// Zero dependencies: Node built-ins only.
//
//   cd cyber-ui && npm start   ->  http://localhost:8787

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..'); // repo root
const PUBLIC_DIR = path.join(__dirname, 'public');
const PROGRESS_FILE = path.join(ROOT, 'progress.json'); // repo root (survives restarts, can be committed)

const PORT = process.env.PORT || 8787;

// Only these file types are ever listed or served as text.
const TEXT_EXT = new Set([
  '.md', '.py', '.txt', '.json', '.js', '.css', '.sh',
  '.yml', '.yaml', '.html', '.jsx', '.ts', '.toml', '.ini',
]);

// Directories never listed or read.
const EXCLUDE_DIRS = new Set(['.git', '.claude', 'node_modules', 'cyber-ui']);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function send(res, code, body, headers = {}) {
  res.writeHead(code, headers);
  res.end(body);
}

function sendJson(res, code, obj) {
  send(res, code, JSON.stringify(obj), { 'Content-Type': 'application/json; charset=utf-8' });
}

// Resolve a repo-relative path and refuse anything that escapes the repo root.
function readTextFile(rel) {
  if (!rel || rel.includes('\0')) return null;
  const abs = path.resolve(ROOT, rel);
  const inside = path.relative(ROOT, abs);
  if (!inside || inside.startsWith('..') || path.isAbsolute(inside)) return null;
  if (!TEXT_EXT.has(path.extname(abs).toLowerCase())) return null;
  try {
    return fs.readFileSync(abs, 'utf8');
  } catch {
    return null;
  }
}

function buildTree(dirAbs, relDir = '') {
  let entries;
  try {
    entries = fs.readdirSync(dirAbs, { withFileTypes: true });
  } catch {
    return { name: path.basename(dirAbs), path: relDir, type: 'dir', children: [] };
  }
  const children = [];
  for (const e of entries) {
    if (EXCLUDE_DIRS.has(e.name) || e.name.startsWith('.')) continue;
    const rel = relDir ? `${relDir}/${e.name}` : e.name;
    const abs = path.join(dirAbs, e.name);
    if (e.isDirectory()) {
      const sub = buildTree(abs, rel);
      if (sub.children.length) children.push(sub);
    } else if (TEXT_EXT.has(path.extname(e.name).toLowerCase())) {
      children.push({ name: e.name, path: rel, type: 'file' });
    }
  }
  children.sort((a, b) =>
    a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1
  );
  return { name: path.basename(dirAbs), path: relDir, type: 'dir', children };
}

function loadProgress() {
  try {
    const data = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
    return data && typeof data === 'object' ? data : { days: {} };
  } catch {
    return { days: {} };
  }
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = decodeURIComponent(url.pathname);

  if (pathname === '/api/tree') {
    return sendJson(res, 200, buildTree(ROOT));
  }

  if (pathname === '/api/file') {
    const content = readTextFile(url.searchParams.get('path') || '');
    if (content === null) return sendJson(res, 404, { error: 'not readable' });
    return sendJson(res, 200, { path: url.searchParams.get('path'), content });
  }

  if (pathname === '/api/progress' && req.method === 'GET') {
    return sendJson(res, 200, loadProgress());
  }

  if (pathname === '/api/progress' && req.method === 'POST') {
    let body = '';
    req.on('data', (c) => {
      body += c;
      if (body.length > 1e6) req.destroy();
    });
    req.on('end', () => {
      try {
        const data = JSON.parse(body || '{"days":{}}');
        fs.writeFileSync(PROGRESS_FILE, JSON.stringify(data, null, 2));
        return sendJson(res, 200, { ok: true });
      } catch (e) {
        return sendJson(res, 400, { error: e.message });
      }
    });
    return;
  }

  // Static files from public/
  const rel = pathname === '/' ? '/index.html' : pathname;
  const abs = path.join(PUBLIC_DIR, path.normalize(rel));
  if (!abs.startsWith(PUBLIC_DIR)) return send(res, 403, 'forbidden');
  fs.readFile(abs, (err, data) => {
    if (err) return send(res, 404, 'not found');
    send(res, 200, data, { 'Content-Type': MIME[path.extname(abs).toLowerCase()] || 'application/octet-stream' });
  });
});

server.listen(PORT, () => {
  console.log(`cyber-ui running at http://localhost:${PORT}`);
});