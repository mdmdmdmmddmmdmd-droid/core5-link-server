'use strict';

// Core5 Custom Link System
// Запуск: node server.js
// ENV: PORT=3000 BASE_URL=https://your-domain.ru GAME_URL=https://official-game-url

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

const PORT = Number(process.env.PORT || 3000);
const BASE_URL = String(process.env.BASE_URL || `http://localhost:${PORT}`).replace(/\/+$/, '');
const GAME_URL = String(process.env.GAME_URL || '').trim();
const DATA_DIR = path.join(__dirname, 'data');
const LINKS_FILE = path.join(DATA_DIR, 'links.json');
const CLICKS_FILE = path.join(DATA_DIR, 'clicks.json');

function ensureFiles() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(LINKS_FILE)) fs.writeFileSync(LINKS_FILE, '[]');
  if (!fs.existsSync(CLICKS_FILE)) fs.writeFileSync(CLICKS_FILE, '[]');
}

function readJson(file, fallback) {
  ensureFiles();
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return Array.isArray(parsed) || typeof parsed === 'object' ? parsed : fallback;
  } catch (e) {
    return fallback;
  }
}

function writeJson(file, data) {
  ensureFiles();
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function safeText(value, max = 120) {
  return String(value || '')
    .replace(/[<>]/g, '')
    .replace(/[\r\n\t]/g, ' ')
    .trim()
    .slice(0, max);
}

function safeId(value) {
  return String(value || '')
    .replace(/^#/, '')
    .replace(/[^A-Za-z0-9_-]/g, '')
    .slice(0, 64) || 'player';
}

function randomSlug() {
  return crypto.randomBytes(5).toString('base64url').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 8);
}

function hashIp(ip) {
  return crypto.createHash('sha256').update(String(ip || '') + 'core5-link-salt').digest('hex').slice(0, 16);
}

function send(res, status, body, type = 'text/html; charset=utf-8') {
  res.writeHead(status, {
    'Content-Type': type,
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(body);
}

function sendJson(res, status, data) {
  send(res, status, JSON.stringify(data, null, 2), 'application/json; charset=utf-8');
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1024 * 64) req.destroy();
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try { resolve(JSON.parse(body)); }
      catch (e) { reject(new Error('Bad JSON')); }
    });
    req.on('error', reject);
  });
}

function escapeHtml(text) {
  return String(text || '').replace(/[&<>'"]/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[ch]));
}

function page(title, body) {
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  :root{color-scheme:dark;--bg:#0b1020;--card:#111827;--line:#26324a;--text:#e5e7eb;--muted:#9ca3af;--blue:#0ea5e9;--green:#10b981;--orange:#f59e0b}
  *{box-sizing:border-box} body{margin:0;min-height:100vh;background:radial-gradient(circle at top,#1e3a8a 0,#111827 42%,#070b14 100%);font-family:Arial,Helvetica,sans-serif;color:var(--text);display:flex;align-items:center;justify-content:center;padding:24px}
  .card{width:min(720px,100%);background:rgba(17,24,39,.94);border:1px solid rgba(255,255,255,.12);border-radius:22px;box-shadow:0 20px 70px rgba(0,0,0,.45);padding:22px}
  h1{margin:0 0 10px;font-size:26px} p{color:var(--muted);line-height:1.45} .row{display:flex;gap:10px;flex-wrap:wrap;margin-top:14px}.btn{border:0;border-radius:14px;padding:12px 16px;font-weight:900;color:white;background:linear-gradient(135deg,#2563eb,#7c3aed);text-decoration:none;cursor:pointer;display:inline-block}.btn.green{background:linear-gradient(135deg,#10b981,#047857)}.btn.gray{background:linear-gradient(135deg,#374151,#111827)}
  .box{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);border-radius:16px;padding:14px;margin-top:14px}.big{font-size:38px;font-weight:900;color:#fff}.muted{color:var(--muted);font-size:13px}.warn{background:rgba(245,158,11,.13);border-color:rgba(245,158,11,.3)} input{width:100%;background:#0b1020;color:#fff;border:1px solid var(--line);border-radius:12px;padding:12px;font-size:14px} code{background:#0b1020;border:1px solid #273449;border-radius:6px;padding:2px 6px}
</style>
</head>
<body><main class="card">${body}</main></body>
</html>`;
}

function landingFor(link, slug, req) {
  const ownerId = safeId(link.ownerId);
  const label = safeText(link.label || 'Пузыри', 80);
  const linkUrl = `${BASE_URL}/l/${encodeURIComponent(slug)}`;
  const target = GAME_URL ? `${GAME_URL}${GAME_URL.includes('#') ? '&' : '#'}core5_ref=${encodeURIComponent(ownerId)}&core5_link=${encodeURIComponent(slug)}` : '';
  const gameButton = target
    ? `<a class="btn green" href="${escapeHtml(target)}">Открыть игру</a>`
    : `<button class="btn gray" onclick="copyText('ID аккаунта/шара: #${escapeHtml(ownerId)}')">Скопировать ID</button>`;
  return page('Core5 Link', `
    <h1>🫧 Core5 личная ссылка</h1>
    <p>Это твоя собственная страница ссылки. Она не использует VK/OK и не передаёт чужую сессию. Игрок открывает эту страницу, а дальше заходит в игру своим обычным способом.</p>
    <div class="box">
      <div class="muted">Метка</div>
      <div style="font-size:20px;font-weight:900">${escapeHtml(label)}</div>
      <div class="muted" style="margin-top:10px">ID аккаунта/шара</div>
      <div class="big">#${escapeHtml(ownerId)}</div>
      <div class="muted">Переходов по этой ссылке: ${Number(link.clicks || 0)}</div>
    </div>
    <div class="box warn">
      <b>Важно:</b> ссылка не может войти в чужой аккаунт. Если сервер игры требует авторизацию, игрок должен войти сам. Эта система нужна для красивых ссылок, ID, учёта переходов и перехода на указанную тобой страницу игры.
    </div>
    <div class="row">
      ${gameButton}
      <button class="btn" onclick="copyText('${escapeHtml(linkUrl)}')">Скопировать ссылку</button>
      <button class="btn gray" onclick="copyText('#${escapeHtml(ownerId)}')">Скопировать ID</button>
    </div>
    <p class="muted">Ссылка: <code>${escapeHtml(linkUrl)}</code></p>
    <script>
      function copyText(t){navigator.clipboard&&navigator.clipboard.writeText?navigator.clipboard.writeText(t).then(()=>alert('Скопировано')):prompt('Скопируй:',t)}
      try{localStorage.setItem('__CORE5_INCOMING_REF__','${escapeHtml(ownerId)}');localStorage.setItem('__CORE5_INCOMING_LINK__','${escapeHtml(slug)}')}catch(e){}
    </script>
  `);
}

function recordClick(slug, link, req) {
  const clicks = readJson(CLICKS_FILE, []);
  const item = {
    slug,
    ownerId: safeId(link.ownerId),
    time: new Date().toISOString(),
    ipHash: hashIp(req.headers['x-forwarded-for'] || req.socket.remoteAddress || ''),
    userAgent: safeText(req.headers['user-agent'] || '', 180),
    referer: safeText(req.headers.referer || '', 200)
  };
  clicks.unshift(item);
  if (clicks.length > 5000) clicks.length = 5000;
  writeJson(CLICKS_FILE, clicks);
}

async function handle(req, res) {
  if (req.method === 'OPTIONS') return send(res, 204, '');
  const url = new URL(req.url, BASE_URL);
  const pathname = decodeURIComponent(url.pathname);

  if (pathname === '/health') return sendJson(res, 200, { ok: true, baseUrl: BASE_URL, gameUrlConfigured: !!GAME_URL });

  if (pathname === '/') {
    return send(res, 200, page('Core5 Link System', `
      <h1>🫧 Core5 Custom Link System</h1>
      <p>Сервер работает. Укажи этот адрес в меню мода как <b>Сервер ссылок</b>:</p>
      <div class="box"><input readonly value="${escapeHtml(BASE_URL)}" onclick="this.select()"></div>
      <p>API: <code>POST /api/links</code>, открытие ссылки: <code>/l/код</code>, статистика: <code>/api/links/код/stats</code></p>
      <div class="box warn"><b>Не вход в чужой аккаунт:</b> система создаёт личные ссылки и считает переходы, но не обходит авторизацию игры.</div>
    `));
  }

  if (pathname === '/api/links' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const ownerId = safeId(body.ownerId);
      const label = safeText(body.label || 'Core5 link', 80);
      const links = readJson(LINKS_FILE, []);
      let slug;
      do { slug = randomSlug(); } while (links.some(x => x.slug === slug));
      const link = { slug, ownerId, label, clicks: 0, createdAt: new Date().toISOString(), lastClickAt: null };
      links.unshift(link);
      writeJson(LINKS_FILE, links);
      return sendJson(res, 200, { ok: true, slug, ownerId, label, url: `${BASE_URL}/l/${slug}`, statsUrl: `${BASE_URL}/api/links/${slug}/stats` });
    } catch (e) {
      return sendJson(res, 400, { ok: false, error: e.message || 'Bad request' });
    }
  }

  if (pathname === '/api/links' && req.method === 'GET') {
    const ownerId = safeId(url.searchParams.get('ownerId') || '');
    const links = readJson(LINKS_FILE, []);
    return sendJson(res, 200, { ok: true, links: ownerId && ownerId !== 'player' ? links.filter(x => x.ownerId === ownerId) : links.slice(0, 100) });
  }

  const statMatch = pathname.match(/^\/api\/links\/([A-Za-z0-9_-]+)\/stats$/);
  if (statMatch && req.method === 'GET') {
    const slug = statMatch[1];
    const links = readJson(LINKS_FILE, []);
    const link = links.find(x => x.slug === slug);
    if (!link) return sendJson(res, 404, { ok: false, error: 'Link not found' });
    const clicks = readJson(CLICKS_FILE, []).filter(x => x.slug === slug).slice(0, 50);
    return sendJson(res, 200, { ok: true, link, clicks });
  }

  const linkMatch = pathname.match(/^\/l\/([A-Za-z0-9_-]+)$/);
  if (linkMatch && req.method === 'GET') {
    const slug = linkMatch[1];
    const links = readJson(LINKS_FILE, []);
    const link = links.find(x => x.slug === slug);
    if (!link) return send(res, 404, page('Не найдено', '<h1>Ссылка не найдена</h1><p>Проверь код ссылки.</p>'));
    link.clicks = Number(link.clicks || 0) + 1;
    link.lastClickAt = new Date().toISOString();
    writeJson(LINKS_FILE, links);
    recordClick(slug, link, req);
    return send(res, 200, landingFor(link, slug, req));
  }

  const directMatch = pathname.match(/^\/p\/([A-Za-z0-9_-]+)$/);
  if (directMatch && req.method === 'GET') {
    const ownerId = safeId(directMatch[1]);
    const temp = { ownerId, label: 'Прямая ссылка ID', clicks: 0 };
    return send(res, 200, landingFor(temp, `direct-${ownerId}`, req));
  }

  return send(res, 404, page('404', '<h1>404</h1><p>Такой страницы нет.</p>'));
}

ensureFiles();
http.createServer((req, res) => {
  handle(req, res).catch(err => sendJson(res, 500, { ok: false, error: err.message || 'Server error' }));
}).listen(PORT, () => {
  console.log(`[Core5 Link System] running on ${BASE_URL}`);
  console.log(`[Core5 Link System] GAME_URL: ${GAME_URL || 'not configured'}`);
});
