const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8080;

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
  // Parse URL and sanitize path to prevent traversal
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  
  // Handle API Database Requests
  if (parsedUrl.pathname === '/api/logs') {
    const userId = parsedUrl.searchParams.get('userId') || 'guest';
    const dbPath = path.join(__dirname, 'data', 'database.json');
    
    if (req.method === 'GET') {
      fs.readFile(dbPath, 'utf8', (err, data) => {
        let db = {};
        if (!err && data) {
          try { db = JSON.parse(data); } catch(e) {}
        }
        const userLogs = db[userId] || [];
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify(userLogs));
      });
      return;
    }
    
    if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const newLog = JSON.parse(body);
          const dirPath = path.join(__dirname, 'data');
          if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
          }
          
          fs.readFile(dbPath, 'utf8', (err, data) => {
            let db = {};
            if (!err && data) {
              try { db = JSON.parse(data); } catch(e) {}
            }
            if (!db[userId]) db[userId] = [];
            db[userId].push(newLog);
            
            fs.writeFile(dbPath, JSON.stringify(db, null, 2), 'utf8', (err) => {
              if (err) {
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end('Server Error writing to database');
              } else {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ status: 'success', log: newLog }));
              }
            });
          });
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'text/plain' });
          res.end('Invalid JSON body');
        }
      });
      return;
    }
  }

  if (parsedUrl.pathname === '/api/reset' && req.method === 'POST') {
    const userId = parsedUrl.searchParams.get('userId') || 'guest';
    const dbPath = path.join(__dirname, 'data', 'database.json');
    
    fs.readFile(dbPath, 'utf8', (err, data) => {
      let db = {};
      if (!err && data) {
        try { db = JSON.parse(data); } catch(e) {}
      }
      db[userId] = [];
      fs.writeFile(dbPath, JSON.stringify(db, null, 2), 'utf8', () => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'success' }));
      });
    });
    return;
  }

  let safePath = parsedUrl.pathname === '/' ? 'index.html' : parsedUrl.pathname;
  
  // Resolve absolute path
  let filePath = path.join(__dirname, safePath);
  
  if (!filePath.startsWith(__dirname)) {
    res.statusCode = 403;
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Access Denied');
    return;
  }

  const ext = path.extname(filePath);
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.statusCode = 404;
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('File Not Found');
      } else {
        res.statusCode = 500;
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end(`Server Error: ${err.code}`);
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
  console.log(`Server running on port ${PORT}`);
});
