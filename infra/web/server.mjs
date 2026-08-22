import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { pipeline } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { createBrotliCompress, createGzip, constants as zlibConstants } from 'node:zlib';

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

// 応答をストリーミングで返す構成では Content-Length が付かず、CloudFrontは圧縮を諦める。
// その結果6MB超のJSが生のまま流れて初期表示が数秒かかった（2026-08-22に実測）。
// 配信側で圧縮して Content-Encoding を付ければ、CloudFrontはそのまま通してくれる。
const COMPRESSIBLE = new Set(['.css', '.html', '.js', '.json', '.svg']);

function pickEncoding(request) {
  const accepted = String(request.headers['accept-encoding'] || '');
  if (/\bbr\b/.test(accepted)) return 'br';
  if (/\bgzip\b/.test(accepted)) return 'gzip';
  return null;
}

function sendFile(requestPath, response, request) {
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
  const encoding = COMPRESSIBLE.has(extension) ? pickEncoding(request) : null;
  if (!encoding) {
    createReadStream(filePath).pipe(response);
    return;
  }

  response.setHeader('Content-Encoding', encoding);
  // 同じURLでも圧縮の有無で中身が変わる。中間のキャッシュが取り違えないようにする。
  response.setHeader('Vary', 'Accept-Encoding');
  // 既定の品質は6MB級のファイルだとCPU時間が伸びるだけで、削減量はほとんど変わらない。
  const compressor = encoding === 'br'
    ? createBrotliCompress({ params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 4 } })
    : createGzip({ level: 5 });
  pipeline(createReadStream(filePath), compressor, response, (error) => {
    if (error) console.error(`[ERROR] 圧縮して返せませんでした: ${error.message}`);
  });
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
  sendFile(url.pathname === '/' ? '/index.html' : url.pathname, response, request);
}).listen(port, '0.0.0.0', () => {
  console.log(`Web server listening on http://0.0.0.0:${port}`);
});
