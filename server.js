const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8080;

// ─── Security Constants ────────────────────────────────────────────────────
const MAX_BODY_BYTES = 65_536; // 64 KB — prevent DoS via large payloads
const MAX_USERID_LENGTH = 100;
const USERID_ALLOWLIST = /^[a-zA-Z0-9_\-\.@]+$/; // safe chars only

/**
 * Sanitize a userId from query string to prevent prototype-pollution
 * and path-injection attacks.
 * @param {string} raw
 * @returns {string} safe userId or 'guest' if invalid
 */
function sanitizeUserId(raw) {
  if (typeof raw !== 'string') return 'guest';
  const trimmed = raw.trim().slice(0, MAX_USERID_LENGTH);
  // Reject prototype-pollution keys and non-allowlisted characters
  if (
    trimmed === '__proto__' ||
    trimmed === 'constructor' ||
    trimmed === 'prototype' ||
    !USERID_ALLOWLIST.test(trimmed)
  ) {
    return 'guest';
  }
  return trimmed || 'guest';
}

/**
 * Validate a log object shape before persisting it.
 * @param {*} obj
 * @returns {boolean}
 */
function validateLog(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
  if (typeof obj.id !== 'string' || obj.id.length > 64) return false;
  if (typeof obj.category !== 'string') return false;
  if (typeof obj.co2 !== 'number' || !isFinite(obj.co2)) return false;
  if (typeof obj.description !== 'string' || obj.description.length > 300) return false;
  if (typeof obj.timestamp !== 'string') return false;
  // Guard against XSS via stored JSON
  const validCategories = ['Transport', 'Energy', 'Food', 'Consumption', 'Travel', 'Waste'];
  if (!validCategories.includes(obj.category)) return false;
  return true;
}

// ─── Security Headers ──────────────────────────────────────────────────────
const SECURITY_HEADERS = {
  'Content-Security-Policy':
    "default-src 'self'; " +
    "script-src 'self' https://accounts.google.com https://www.gstatic.com https://translate.google.com https://cdnjs.cloudflare.com https://cdn.jsdelivr.net 'unsafe-inline'; " +
    "style-src 'self' https://fonts.googleapis.com 'unsafe-inline'; " +
    "font-src 'self' https://fonts.gstatic.com; " +
    "img-src 'self' data: https:; " +
    "connect-src 'self' https://api.open-meteo.com https://maps.google.com; " +
    "frame-src https://maps.google.com;",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'geolocation=(self), camera=(), microphone=()',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains'
};

function addSecurityHeaders(res) {
  Object.entries(SECURITY_HEADERS).forEach(([key, value]) => {
    res.setHeader(key, value);
  });
}

// ─── MIME Types ───────────────────────────────────────────────────────────
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.webp': 'image/webp',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon'
};

// ─── HTTP Server ──────────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  // Apply security headers to every response
  addSecurityHeaders(res);

  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  // ── API: /api/logs ────────────────────────────────────────────────────
  if (parsedUrl.pathname === '/api/logs') {
    const userId = sanitizeUserId(parsedUrl.searchParams.get('userId'));
    const dbPath = path.join(__dirname, 'data', 'database.json');

    if (req.method === 'GET') {
      fs.readFile(dbPath, 'utf8', (err, data) => {
        let db = {};
        if (!err && data) {
          try { db = JSON.parse(data); } catch (_) { /* ignore corrupt data */ }
        }
        const userLogs = Array.isArray(db[userId]) ? db[userId] : [];
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(userLogs));
      });
      return;
    }

    if (req.method === 'POST') {
      // Enforce body size limit
      let body = '';
      let byteCount = 0;
      let aborted = false;

      req.on('data', chunk => {
        byteCount += chunk.length;
        if (byteCount > MAX_BODY_BYTES) {
          aborted = true;
          res.writeHead(413, { 'Content-Type': 'text/plain' });
          res.end('Payload Too Large');
          req.destroy();
          return;
        }
        body += chunk;
      });

      req.on('end', () => {
        if (aborted) return;
        try {
          const newLog = JSON.parse(body);

          // Validate log shape before persisting
          if (!validateLog(newLog)) {
            res.writeHead(400, { 'Content-Type': 'text/plain' });
            res.end('Invalid log structure');
            return;
          }

          const dirPath = path.join(__dirname, 'data');
          if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
          }

          fs.readFile(dbPath, 'utf8', (err, data) => {
            let db = {};
            if (!err && data) {
              try { db = JSON.parse(data); } catch (_) { /* ignore */ }
            }
            if (!Array.isArray(db[userId])) db[userId] = [];
            // Prevent duplicates by id
            const exists = db[userId].some(l => l.id === newLog.id);
            if (!exists) {
              db[userId].push(newLog);
            }

            fs.writeFile(dbPath, JSON.stringify(db, null, 2), 'utf8', writeErr => {
              if (writeErr) {
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end('Server Error writing to database');
              } else {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ status: 'success', log: newLog }));
              }
            });
          });
        } catch (_) {
          res.writeHead(400, { 'Content-Type': 'text/plain' });
          res.end('Invalid JSON body');
        }
      });
      return;
    }

    // Method not allowed for /api/logs
    res.writeHead(405, { 'Content-Type': 'text/plain', Allow: 'GET, POST' });
    res.end('Method Not Allowed');
    return;
  }

  // ── API: /api/reset ───────────────────────────────────────────────────
  if (parsedUrl.pathname === '/api/reset' && req.method === 'POST') {
    const userId = sanitizeUserId(parsedUrl.searchParams.get('userId'));
    const dbPath = path.join(__dirname, 'data', 'database.json');

    fs.readFile(dbPath, 'utf8', (err, data) => {
      let db = {};
      if (!err && data) {
        try { db = JSON.parse(data); } catch (_) { /* ignore */ }
      }
      db[userId] = [];
      fs.writeFile(dbPath, JSON.stringify(db, null, 2), 'utf8', () => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'success' }));
      });
    });
    return;
  }

  // ── Static File Serving ───────────────────────────────────────────────
  let safePath = parsedUrl.pathname === '/' ? 'index.html' : parsedUrl.pathname;

  // Resolve and normalise to prevent path traversal
  const filePath = path.normalize(path.join(__dirname, safePath));

  if (!filePath.startsWith(path.normalize(__dirname) + path.sep) &&
      filePath !== path.normalize(path.join(__dirname, 'index.html'))) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Access Denied');
    return;
  }

  const ext = path.extname(filePath);
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  // Only serve known text/web assets; block access to data/ and .json files
  if (!MIME_TYPES[ext]) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Access Denied');
    return;
  }

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('File Not Found');
      } else {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Server Error');
      }
    } else {
      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600'
      });
      res.end(content, 'utf-8');
    }
  });
});

server.listen(PORT, () => {
  console.log(`DeCarbonizer server running on port ${PORT}`);
});

// Export helpers for unit testing
module.exports = { sanitizeUserId, validateLog };
