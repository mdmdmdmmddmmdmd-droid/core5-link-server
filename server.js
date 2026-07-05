"use strict";

// Core5 Vercel Redirect Link System v19 PUZIRI ONLY
// Работает на Vercel без карты и без базы данных.
// Важно: ссылки живут всегда, потому что данные зашиты в slug.
// Статистика кликов хранится в памяти serverless-функции и может обнуляться после перезапуска Vercel.

const http = require("http");
const crypto = require("crypto");
const { URL } = require("url");

const PORT = Number(process.env.PORT || 3000);
const BASE_URL = String(process.env.BASE_URL || process.env.VERCEL_URL || `http://localhost:${PORT}`).replace(/^https?:\/\//, "");
const PUBLIC_BASE_URL = String(process.env.BASE_URL || (process.env.VERCEL_URL ? `https://${BASE_URL}` : `http://localhost:${PORT}`)).replace(/\/+$/, "");
const GAME_URL = "https://www.puziri.net/"; // v19: принудительно только Пузыри, не GitHub/не чужой сайт
const SHOW_LINK_PAGE_PARAM = "info";

const mem = global.__CORE5_LINK_MEM__ || (global.__CORE5_LINK_MEM__ = { links: {}, clicks: {} });

function safeText(value, max = 120) {
  return String(value || "")
    .replace(/[<>]/g, "")
    .replace(/[\r\n\t]/g, " ")
    .trim()
    .slice(0, max);
}

function safeId(value) {
  return String(value || "")
    .replace(/^#/, "")
    .replace(/[^A-Za-z0-9_-]/g, "")
    .slice(0, 64) || "player";
}

function b64urlEncode(text) {
  return Buffer.from(String(text), "utf8").toString("base64")
    .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function b64urlDecode(text) {
  let s = String(text || "").replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  return Buffer.from(s, "base64").toString("utf8");
}

function makeSlug(ownerId, label) {
  const payload = {
    v: 1,
    ownerId: safeId(ownerId),
    label: safeText(label || "Мой шар", 80),
    t: Date.now(),
    n: crypto.randomBytes(4).toString("hex")
  };
  return b64urlEncode(JSON.stringify(payload));
}

function decodeSlug(slug) {
  try {
    const data = JSON.parse(b64urlDecode(slug));
    return {
      ownerId: safeId(data.ownerId),
      label: safeText(data.label || "Мой шар", 80),
      createdAt: data.t ? new Date(Number(data.t)).toISOString() : null,
      slug
    };
  } catch (e) {
    return null;
  }
}

function hashIp(ip) {
  return crypto.createHash("sha256").update(String(ip || "") + "core5-lite-salt").digest("hex").slice(0, 16);
}

function escapeHtml(text) {
  return String(text || "").replace(/[&<>'"]/g, ch => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
  }[ch]));
}

function send(res, status, body, type = "text/html; charset=utf-8") {
  res.writeHead(status, {
    "Content-Type": type,
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  });
  res.end(body);
}

function sendJson(res, status, data) {
  send(res, status, JSON.stringify(data, null, 2), "application/json; charset=utf-8");
}

function getRequestBaseUrl(req) {
  const proto = (req.headers["x-forwarded-proto"] || "https").split(",")[0].trim() || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host || BASE_URL;
  return `${proto}://${String(host).replace(/\/+$/, "")}`;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (body.length > 1024 * 64) req.destroy();
    });
    req.on("end", () => {
      if (!body) return resolve({});
      try { resolve(JSON.parse(body)); }
      catch (e) { reject(new Error("Bad JSON")); }
    });
    req.on("error", reject);
  });
}

function page(title, body) {
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>
:root{color-scheme:dark;--bg:#0b1020;--card:#111827;--line:#26324a;--text:#e5e7eb;--muted:#9ca3af;--blue:#0ea5e9;--green:#10b981;--orange:#f59e0b}*{box-sizing:border-box}body{margin:0;min-height:100vh;background:radial-gradient(circle at top,#1e3a8a 0,#111827 42%,#070b14 100%);font-family:Arial,Helvetica,sans-serif;color:var(--text);display:flex;align-items:center;justify-content:center;padding:24px}.card{width:min(720px,100%);background:rgba(17,24,39,.94);border:1px solid rgba(255,255,255,.12);border-radius:22px;box-shadow:0 20px 70px rgba(0,0,0,.45);padding:22px}h1{margin:0 0 10px;font-size:26px}p{color:var(--muted);line-height:1.45}.row{display:flex;gap:10px;flex-wrap:wrap;margin-top:14px}.btn{border:0;border-radius:14px;padding:12px 16px;font-weight:900;color:white;background:linear-gradient(135deg,#2563eb,#7c3aed);text-decoration:none;cursor:pointer;display:inline-block}.btn.green{background:linear-gradient(135deg,#10b981,#047857)}.btn.gray{background:linear-gradient(135deg,#374151,#111827)}.box{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);border-radius:16px;padding:14px;margin-top:14px}.big{font-size:38px;font-weight:900;color:#fff}.muted{color:var(--muted);font-size:13px}.warn{background:rgba(245,158,11,.13);border-color:rgba(245,158,11,.3)}input{width:100%;background:#0b1020;color:#fff;border:1px solid var(--line);border-radius:12px;padding:12px;font-size:14px}code{background:#0b1020;border:1px solid #273449;border-radius:6px;padding:2px 6px;word-break:break-all}</style></head><body><main class="card">${body}</main></body></html>`;
}

function recordClick(slug, link, req) {
  const now = new Date().toISOString();
  if (!mem.links[slug]) mem.links[slug] = { slug, ownerId: link.ownerId, label: link.label, clicks: 0, createdAt: link.createdAt || now, lastClickAt: null };
  mem.links[slug].clicks++;
  mem.links[slug].lastClickAt = now;
  const arr = mem.clicks[slug] || (mem.clicks[slug] = []);
  arr.unshift({
    slug,
    ownerId: link.ownerId,
    time: now,
    ipHash: hashIp(req.headers["x-forwarded-for"] || req.socket.remoteAddress || ""),
    userAgent: safeText(req.headers["user-agent"] || "", 180),
    referer: safeText(req.headers.referer || "", 200)
  });
  if (arr.length > 50) arr.length = 50;
}


function buildGameTarget(link, slug) {
  const ownerId = safeId(link.ownerId);
  let base = String(GAME_URL || "https://www.puziri.net/").trim();
  if (!base) base = "https://www.puziri.net/";
  try {
    const u = new URL(base);
    // Не добавляем параметры в query, чтобы сервер игры не ругался на лишние права.
    const hash = u.hash && u.hash.length > 1 ? u.hash.slice(1) + "&" : "";
    u.hash = hash + "core5_ref=" + encodeURIComponent(ownerId) + "&core5_link=" + encodeURIComponent(slug) + "&core5_src=custom";
    return u.toString();
  } catch (e) {
    return "https://www.puziri.net/#core5_ref=" + encodeURIComponent(ownerId) + "&core5_link=" + encodeURIComponent(slug) + "&core5_src=custom";
  }
}

function redirectToGame(res, link, slug) {
  const target = buildGameTarget(link, slug);
  res.writeHead(302, {
    "Location": target,
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*"
  });
  res.end("Redirecting to " + target);
}

function landingFor(link, slug) {
  const ownerId = safeId(link.ownerId);
  const label = safeText(link.label || "Пузыри", 80);
  const linkUrl = `${PUBLIC_BASE_URL}/l/${encodeURIComponent(slug)}`;
  const stats = mem.links[slug] || { clicks: 0, lastClickAt: null };
  const target = buildGameTarget(link, slug);
  const gameButton = `<a class="btn green" href="${escapeHtml(target)}">Открыть игру</a>`;
  return page("Core5 Link", `<h1>🫧 Core5 личная ссылка</h1><p>Это твоя собственная страница ссылки. Она не использует VK/OK и не передаёт чужую сессию.</p><div class="box"><div class="muted">Метка</div><div style="font-size:20px;font-weight:900">${escapeHtml(label)}</div><div class="muted" style="margin-top:10px">ID аккаунта/шара</div><div class="big">#${escapeHtml(ownerId)}</div><div class="muted">Переходов в текущей сессии сервера: ${Number(stats.clicks || 0)}</div><div class="muted">Последний переход: ${escapeHtml(stats.lastClickAt || "пока нет")}</div></div><div class="box warn"><b>Важно:</b> на бесплатном Vercel без базы статистика может обнуляться после перезапуска. Сама ссылка продолжит работать, потому что ID зашит в код ссылки.</div><div class="row">${gameButton}<button class="btn" onclick="copyText('${escapeHtml(linkUrl)}')">Скопировать ссылку</button><button class="btn gray" onclick="copyText('#${escapeHtml(ownerId)}')">Скопировать ID</button></div><p class="muted">Ссылка: <code>${escapeHtml(linkUrl)}</code></p><script>function copyText(t){navigator.clipboard&&navigator.clipboard.writeText?navigator.clipboard.writeText(t).then(()=>alert('Скопировано')):prompt('Скопируй:',t)}try{localStorage.setItem('__CORE5_INCOMING_REF__','${escapeHtml(ownerId)}');localStorage.setItem('__CORE5_INCOMING_LINK__','${escapeHtml(slug)}')}catch(e){}</script>`);
}

async function handle(req, res) {
  if (req.method === "OPTIONS") return send(res, 204, "");
  const url = new URL(req.url, PUBLIC_BASE_URL);
  const pathname = decodeURIComponent(url.pathname);

  if (pathname === "/health") return sendJson(res, 200, { ok: true, vercelLite: true, baseUrl: PUBLIC_BASE_URL, gameUrl: GAME_URL, puziriOnly: true });

  if (pathname === "/") {
    return send(res, 200, page("Core5 Vercel Link System", `<h1>🫧 Core5 Vercel Link System</h1><p>Сервер работает. Укажи этот адрес в меню мода как <b>Сервер ссылок</b>:</p><div class="box"><input readonly value="${escapeHtml(getRequestBaseUrl(req))}" onclick="this.select()"></div><p>API: <code>POST /api/links</code>, открытие с редиректом в игру: <code>/l/код</code>, карточка ссылки: <code>/card/код</code>, статистика: <code>/api/links/код/stats</code></p><div class="box warn"><b>Безопасно:</b> это не вход в чужой аккаунт. Ссылка /l/код делает редирект в игру и считает переходы. Это не вход в чужой аккаунт.</div>`));
  }

  if (pathname === "/api/links" && req.method === "POST") {
    try {
      const body = await readBody(req);
      const ownerId = safeId(body.ownerId);
      const label = safeText(body.label || "Core5 link", 80);
      const slug = makeSlug(ownerId, label);
      const createdAt = new Date().toISOString();
      mem.links[slug] = { slug, ownerId, label, clicks: 0, createdAt, lastClickAt: null };
      return sendJson(res, 200, { ok: true, slug, ownerId, label, url: `${getRequestBaseUrl(req)}/l/${slug}`, cardUrl: `${getRequestBaseUrl(req)}/card/${slug}`, statsUrl: `${getRequestBaseUrl(req)}/api/links/${slug}/stats`, redirectMode: true, vercelLite: true });
    } catch (e) {
      return sendJson(res, 400, { ok: false, error: e.message || "Bad request" });
    }
  }

  const statMatch = pathname.match(/^\/api\/links\/([A-Za-z0-9_-]+)\/stats$/);
  if (statMatch && req.method === "GET") {
    const slug = statMatch[1];
    const decoded = decodeSlug(slug);
    if (!decoded) return sendJson(res, 404, { ok: false, error: "Link not found or bad slug" });
    const link = mem.links[slug] || { slug, ownerId: decoded.ownerId, label: decoded.label, clicks: 0, createdAt: decoded.createdAt, lastClickAt: null };
    return sendJson(res, 200, { ok: true, link, clicks: (mem.clicks[slug] || []).slice(0, 50), vercelLite: true, note: "На бесплатном Vercel без базы статистика может обнуляться после перезапуска." });
  }

  const linkMatch = pathname.match(/^\/l\/([A-Za-z0-9_-]+)$/);
  if (linkMatch && req.method === "GET") {
    const slug = linkMatch[1];
    const decoded = decodeSlug(slug);
    if (!decoded) return send(res, 404, page("Не найдено", "<h1>Ссылка не найдена</h1><p>Проверь код ссылки.</p>"));
    recordClick(slug, decoded, req);
    if (url.searchParams.get(SHOW_LINK_PAGE_PARAM) === "1") return send(res, 200, landingFor(decoded, slug));
    return redirectToGame(res, decoded, slug);
  }

  const cardMatch = pathname.match(/^\/card\/([A-Za-z0-9_-]+)$/);
  if (cardMatch && req.method === "GET") {
    const slug = cardMatch[1];
    const decoded = decodeSlug(slug);
    if (!decoded) return send(res, 404, page("Не найдено", "<h1>Ссылка не найдена</h1><p>Проверь код ссылки.</p>"));
    return send(res, 200, landingFor(decoded, slug));
  }

  const directMatch = pathname.match(/^\/p\/([A-Za-z0-9_-]+)$/);
  if (directMatch && req.method === "GET") {
    const ownerId = safeId(directMatch[1]);
    const slug = makeSlug(ownerId, "Прямая ссылка ID");
    const temp = { ownerId, label: "Прямая ссылка ID", createdAt: new Date().toISOString() };
    recordClick(slug, temp, req);
    return redirectToGame(res, temp, slug);
  }

  return send(res, 404, page("404", "<h1>404</h1><p>Такой страницы нет.</p>"));
}

function handler(req, res) {
  return handle(req, res).catch(err => sendJson(res, 500, { ok: false, error: err.message || "Server error" }));
}

module.exports = handler;

if (require.main === module) {
  http.createServer(handler).listen(PORT, () => {
    console.log(`[Core5 Vercel Redirect Link System v19 PUZIRI ONLY] running on ${PUBLIC_BASE_URL}`);
  });
}
