import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../dist/', import.meta.url));
const port = Number(process.env.PORT || process.env.AWS_LWA_PORT || 8080);
const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
};

function sendFile(requestPath, response) {
  const normalizedPath = normalize(requestPath).replace(/^(\.\.(\/|\\|$))+/, '');
  const candidate = join(root, normalizedPath);
  const filePath = existsSync(candidate) && statSync(candidate).isFile()
    ? candidate
    : join(root, 'index.html');
  const extension = extname(filePath);

  response.statusCode = 200;
  response.setHeader('Content-Type', mimeTypes[extension] || 'application/octet-stream');
  response.setHeader(
    'Cache-Control',
    filePath.endsWith('index.html') ? 'no-cache, no-store, must-revalidate' : 'public, max-age=31536000, immutable',
  );
  createReadStream(filePath).pipe(response);
}

createServer((request, response) => {
  const url = new URL(request.url || '/', 'http://localhost');
  if (url.pathname === '/runtime-config.json') {
    response.statusCode = 200;
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    response.end(process.env.RUNTIME_CONFIG_JSON || '{}');
    return;
  }
  if (url.pathname === '/health') {
    response.statusCode = 200;
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.end('{"status":"ok"}');
    return;
  }
  sendFile(url.pathname === '/' ? '/index.html' : url.pathname, response);
}).listen(port, '0.0.0.0', () => {
  console.log(`Web server listening on http://0.0.0.0:${port}`);
});
