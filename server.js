'use strict';
/**
 * DeCarbonizer — HTTP Server
 *
 * Serves the single-page application and exposes a minimal REST API for
 * persisting carbon emission logs per user to a local JSON database.
 *
 * Security posture:
 *  - All responses carry a full Content-Security-Policy + defence-in-depth headers.
 *  - Input validation on every API parameter (userId, logId, log body).
 *  - Body-size limit (64 KB) to prevent DoS.
 *  - Path-traversal prevention on static file serving.
 *  - Only allow-listed MIME types are served.
 */

const http = require('http');
const fs   = require('fs');
const path = require('path');

// ─── Configuration ────────────────────────────────────────────────────────────
/** TCP port the HTTP server listens on. Override via PORT env variable. */
const PORT = process.env.PORT || 8080;

// ─── Security Constants ───────────────────────────────────────────────────────
/** Maximum accepted request body size (bytes) — prevents DoS via large payloads. */
const MAX_BODY_BYTES = 65_536; // 64 KB
/** Maximum allowed length for a userId parameter. */
const MAX_USERID_LENGTH = 100;
/** Maximum allowed length for a log entry description field. */
const MAX_LOG_DESCRIPTION_LENGTH = 300;
/** Minimum plausible CO₂ value per log entry (large negative = tree-planting offset). */
const MIN_CO2_VALUE = -500;
/** Maximum plausible CO₂ value per log entry — prevents data corruption. */
const MAX_CO2_VALUE = 10_000;
/** Allowlist regex for log entry IDs — alphanumeric, underscores, hyphens only. */
const LOG_ID_PATTERN = /^[a-zA-Z0-9_\-]+$/;
/** Allowlist regex for user IDs — blocks path injection and special characters. */
const USERID_ALLOWLIST = /^[a-zA-Z0-9_\-\.@]+$/;

// ─── Valid Emission Categories ────────────────────────────────────────────────
/** Exhaustive list of categories accepted in a log entry. Mirrors VALID_CATEGORIES in app.js. */
const VALID_LOG_CATEGORIES = ['Transport', 'Energy', 'Food', 'Consumption', 'Travel', 'Waste'];

// ─── Input Sanitization ───────────────────────────────────────────────────────
/**
 * Sanitize a raw userId string from query params to prevent prototype-pollution
 * and path-injection attacks.
 * @param {string|null} raw - Raw userId value from `URLSearchParams`.
 * @returns {string} A safe userId, or `'guest'` if the input is invalid.
 */
function sanitizeUserId(raw) {
  if (typeof raw !== 'string') return 'guest';
  const trimmed = raw.trim().slice(0, MAX_USERID_LENGTH);
  if (
    trimmed === '__proto__'  ||
    trimmed === 'constructor' ||
    trimmed === 'prototype'  ||
    !USERID_ALLOWLIST.test(trimmed)
  ) {
    return 'guest';
  }
  return trimmed || 'guest';
}

/**
 * Validate a candidate log object before persisting it.
 * Checks shape, field types, value ranges, and category allow-list to guard
 * against XSS via stored JSON, prototype pollution, and data corruption.
 * @param {*} obj - Candidate log object parsed from the POST body.
 * @returns {boolean} `true` if the log is valid and safe to persist.
 */
function validateLog(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
  // id — non-empty, safe chars, max 64 chars
  if (typeof obj.id !== 'string' || obj.id.length === 0 || obj.id.length > 64) return false;
  if (!LOG_ID_PATTERN.test(obj.id)) return false;
  // category — must be one of the known VALID_LOG_CATEGORIES
  if (typeof obj.category !== 'string') return false;
  if (!VALID_LOG_CATEGORIES.includes(obj.category)) return false;
  // co2 — finite number within plausible physical range
  if (typeof obj.co2 !== 'number' || !isFinite(obj.co2)) return false;
  if (obj.co2 < MIN_CO2_VALUE || obj.co2 > MAX_CO2_VALUE) return false;
  // description — string, max length
  if (typeof obj.description !== 'string' || obj.description.length > MAX_LOG_DESCRIPTION_LENGTH) return false;
  // timestamp — must be a string (ISO 8601 expected)
  if (typeof obj.timestamp !== 'string') return false;
  return true;
}

// ─── Database Helpers ─────────────────────────────────────────────────────────
/** Absolute path to the JSON flat-file database. */
const DB_PATH = path.join(__dirname, 'data', 'database.json');

/**
 * Read the full database file, returning an empty object on any error.
 * @param {Function} callback - `(db: Object) => void` called with parsed DB contents.
 */
function readDb(callback) {
  fs.readFile(DB_PATH, 'utf8', (err, data) => {
    let db = {};
    if (!err && data) {
      try { db = JSON.parse(data); } catch (_) { /* silently ignore corrupt JSON */ }
    }
    callback(db);
  });
}

/**
 * Write the full database object back to disk.
 * Creates the `data/` directory if it does not exist.
 * @param {Object}   db       - The full database object to persist.
 * @param {Function} callback - `(err: Error|null) => void` called after write.
 */
function writeDb(db, callback) {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFile(DB_PATH, JSON.stringify(db, null, 2), 'utf8', callback);
}

// ─── Security Headers ─────────────────────────────────────────────────────────
/**
 * Map of HTTP response headers applied to every server response.
 * Implements defence-in-depth: CSP, HSTS, frame-denial, and permissions policy.
 */
const SECURITY_HEADERS = {
  'Content-Security-Policy':
    "default-src 'self'; " +
    "script-src 'self' https://accounts.google.com https://www.gstatic.com " +
      "https://translate.google.com https://cdnjs.cloudflare.com " +
      "https://cdn.jsdelivr.net 'unsafe-inline'; " +
    "style-src 'self' https://fonts.googleapis.com 'unsafe-inline'; " +
    "font-src 'self' https://fonts.gstatic.com; " +
    "img-src 'self' data: https:; " +
    "connect-src 'self' https://api.open-meteo.com https://maps.google.com; " +
    "frame-src https://maps.google.com;",
  'X-Content-Type-Options':   'nosniff',
  'X-Frame-Options':          'DENY',
  'X-XSS-Protection':         '1; mode=block',
  'Referrer-Policy':          'no-referrer',
  'Permissions-Policy':       'geolocation=(self), camera=(), microphone=()',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains'
};

/**
 * Apply all security headers to an outgoing HTTP response.
 * Must be called before `res.writeHead()` or `res.end()`.
 * @param {http.ServerResponse} res - The outgoing response object.
 */
function addSecurityHeaders(res) {
  Object.entries(SECURITY_HEADERS).forEach(([key, value]) => res.setHeader(key, value));
}

// ─── MIME Type Registry ───────────────────────────────────────────────────────
/**
 * Allowed file extensions and their corresponding Content-Type values.
 * Any extension absent from this map will be blocked by the static file handler.
 */
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

// ─── Response Helpers ─────────────────────────────────────────────────────────
/**
 * Send a plain-text error response.
 * @param {http.ServerResponse} res    - The response object.
 * @param {number}              status - HTTP status code.
 * @param {string}              msg    - Error message body.
 */
function sendError(res, status, msg) {
  res.writeHead(status, { 'Content-Type': 'text/plain' });
  res.end(msg);
}

/**
 * Send a JSON success response.
 * @param {http.ServerResponse} res  - The response object.
 * @param {*}                   data - Value to serialise as JSON.
 */
function sendJson(res, data) {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

// ─── HTTP Server ──────────────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  addSecurityHeaders(res);

  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const { pathname } = parsedUrl;

  // ── API: /api/logs (GET · POST · DELETE) ──────────────────────────────
  if (pathname === '/api/logs') {
    const userId = sanitizeUserId(parsedUrl.searchParams.get('userId'));

    // GET — retrieve all logs for a user
    if (req.method === 'GET') {
      readDb(db => {
        const userLogs = Array.isArray(db[userId]) ? db[userId] : [];
        sendJson(res, userLogs);
      });
      return;
    }

    // POST — append a new validated log entry
    if (req.method === 'POST') {
      let body      = '';
      let byteCount = 0;
      let aborted   = false;

      req.on('data', chunk => {
        byteCount += chunk.length;
        if (byteCount > MAX_BODY_BYTES) {
          aborted = true;
          sendError(res, 413, 'Payload Too Large');
          req.destroy();
        } else {
          body += chunk;
        }
      });

      req.on('end', () => {
        if (aborted) return;
        let newLog;
        try {
          newLog = JSON.parse(body);
        } catch (_) {
          return sendError(res, 400, 'Invalid JSON body');
        }

        if (!validateLog(newLog)) {
          return sendError(res, 400, 'Invalid log structure');
        }

        readDb(db => {
          if (!Array.isArray(db[userId])) db[userId] = [];
          // Prevent duplicate entries by id
          if (!db[userId].some(l => l.id === newLog.id)) {
            db[userId].push(newLog);
          }
          writeDb(db, err => {
            if (err) return sendError(res, 500, 'Server Error writing to database');
            sendJson(res, { status: 'success', log: newLog });
          });
        });
      });
      return;
    }

    // DELETE — remove a specific log entry by id
    if (req.method === 'DELETE') {
      const logId = parsedUrl.searchParams.get('logId');
      if (!logId || !LOG_ID_PATTERN.test(logId) || logId.length > 64) {
        return sendError(res, 400, 'Invalid log ID');
      }

      readDb(db => {
        if (Array.isArray(db[userId])) {
          db[userId] = db[userId].filter(l => l.id !== logId);
        }
        writeDb(db, err => {
          if (err) return sendError(res, 500, 'Server Error');
          sendJson(res, { status: 'success' });
        });
      });
      return;
    }

    // All other methods on /api/logs
    res.writeHead(405, { 'Content-Type': 'text/plain', Allow: 'GET, POST, DELETE' });
    res.end('Method Not Allowed');
    return;
  }

  // ── API: /api/reset (POST) ────────────────────────────────────────────
  if (pathname === '/api/reset' && req.method === 'POST') {
    const userId = sanitizeUserId(parsedUrl.searchParams.get('userId'));
    readDb(db => {
      db[userId] = [];
      writeDb(db, err => {
        if (err) return sendError(res, 500, 'Server Error');
        sendJson(res, { status: 'success' });
      });
    });
    return;
  }

  // ── Static File Serving ───────────────────────────────────────────────
  /**
   * Resolve the requested pathname to an absolute filesystem path.
   * Guards against path-traversal by ensuring the resolved path stays
   * within the project root directory.
   */
  const relativePath = pathname === '/' ? 'index.html' : pathname;
  const filePath     = path.normalize(path.join(__dirname, relativePath));
  const projectRoot  = path.normalize(__dirname) + path.sep;

  if (!filePath.startsWith(projectRoot) &&
      filePath !== path.normalize(path.join(__dirname, 'index.html'))) {
    return sendError(res, 403, 'Access Denied');
  }

  const ext         = path.extname(filePath);
  const contentType = MIME_TYPES[ext];

  // Block any extension not in the MIME allowlist (incl. .json, .sh, etc.)
  if (!contentType) {
    return sendError(res, 403, 'Access Denied');
  }

  fs.readFile(filePath, (err, content) => {
    if (err) {
      const status = err.code === 'ENOENT' ? 404 : 500;
      const msg    = err.code === 'ENOENT' ? 'File Not Found' : 'Server Error';
      return sendError(res, status, msg);
    }
    res.writeHead(200, {
      'Content-Type':  contentType,
      'Cache-Control': 'public, max-age=3600'
    });
    res.end(content);
  });
});

server.listen(PORT, () => {
  console.log(`DeCarbonizer server running on port ${PORT}`);
});

// Export helpers for unit testing
module.exports = { sanitizeUserId, validateLog, MIN_CO2_VALUE, MAX_CO2_VALUE };
