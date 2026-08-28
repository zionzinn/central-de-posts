'use strict';
/*
 * Central de Posts - Grupo SB · v3.0 (neo brutal)
 * Servidor local (Node.js >= 18, sem dependências externas).
 * - data/data.json é o BANCO oficial (datas, posts, referências, fila de entregas)
 * - ClickUp: leitura ao vivo (status/artes/comentários) + escrita LIMITADA
 *   (entrega D-2 útil, descrição, comentários, aprovar->publicar / alterar->alterar)
 * - Sync em segundo plano: /api/state responde instantâneo
 * - Undo universal no servidor (Ctrl+Z no front)
 * - Backup diário automático em data/backups
 */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Readable } = require('node:stream');
const { parseTab, slotKey, taskIdFromUrl } = require('./lib/sheet-parser.js');

const VERSAO = '3.26'; // precisa bater com FRONT_VERSAO no public/index.html
const PORT = process.env.PORT || 3777;
const ROOT = __dirname;
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data'); // na nuvem: aponte pro disco persistente
const DATA_FILE = path.join(DATA_DIR, 'data.json');
const CONFIG_FILE = process.env.CONFIG_FILE || path.join(ROOT, 'config.json');
const PUBLIC_DIR = path.join(ROOT, 'public');
const CU_API = process.env.CU_API || 'https://api.clickup.com/api/v2';

// ---------------- storage ----------------
fs.mkdirSync(DATA_DIR, { recursive: true }); // garante a pasta de dados (útil na nuvem com disco novo)
if (!fs.existsSync(DATA_FILE)) {
  console.log('Primeira execução: gerando data.json a partir do retrato da planilha...');
  require('node:child_process').execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'seed.mjs')], { stdio: 'inherit' });
}
let db = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
// migrações leves (nunca destrutivas)
if (!Array.isArray(db.referencias)) db.referencias = [];
if (!db.dueSync || typeof db.dueSync !== 'object' || Array.isArray(db.dueSync)) db.dueSync = {};
let saveTimer = null;
function saveDb() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const tmp = DATA_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
    fs.renameSync(tmp, DATA_FILE);
  }, 150);
}

function loadConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); } catch { return {}; }
}
function saveConfig(cfg) { fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2)); }
let config = loadConfig();
// nuvem: variáveis de ambiente sobrepõem o config.json (token/senha/secret sem ficar em arquivo)
if (process.env.CU_TOKEN) config.token = String(process.env.CU_TOKEN).trim();
if (process.env.CU_SENHA) config.senha = String(process.env.CU_SENHA);
if (process.env.SB_SECRET) config.secret = String(process.env.SB_SECRET);
if (!config.secret) { config.secret = crypto.randomBytes(32).toString('hex'); saveConfig(config); }
// ---------------- login (senha de acesso; ativa só quando o Zion define uma senha) ----------------
function parseCookies(h) {
  const o = {};
  (h || '').split(';').forEach(c => { const i = c.indexOf('='); if (i > 0) o[c.slice(0, i).trim()] = decodeURIComponent(c.slice(i + 1).trim()); });
  return o;
}
function makeAuthToken() {
  const exp = Date.now() + 90 * 24 * 3600 * 1000; // 90 dias
  const sig = crypto.createHmac('sha256', config.secret).update('sb:' + exp).digest('hex');
  return exp + '.' + sig;
}
function validAuthToken(tok) {
  if (!tok || !config.secret) return false;
  const dot = String(tok).indexOf('.');
  if (dot < 1) return false;
  const exp = tok.slice(0, dot), sig = tok.slice(dot + 1);
  if (!/^\d+$/.test(exp) || Number(exp) < Date.now()) return false;
  const good = crypto.createHmac('sha256', config.secret).update('sb:' + exp).digest('hex');
  if (sig.length !== good.length) return false;
  try { return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good)); } catch { return false; }
}

// ---------------- ClickUp ----------------
const cuCache = new Map(); // key -> {t, data}
const CACHE_MS = 60_000;

async function cuFetch(pathname, { fresh = false } = {}) {
  if (!config.token) throw Object.assign(new Error('sem token'), { code: 'NO_TOKEN' });
  const hit = cuCache.get(pathname);
  if (!fresh && hit && Date.now() - hit.t < CACHE_MS) return hit.data;
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 12_000);
  try {
    const res = await fetch(CU_API + pathname, {
      headers: { Authorization: config.token, 'Content-Type': 'application/json' },
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw Object.assign(new Error(`ClickUp ${res.status}: ${body.slice(0, 200)}`), { code: 'CU_' + res.status });
    }
    const data = await res.json();
    cuCache.set(pathname, { t: Date.now(), data });
    return data;
  } finally { clearTimeout(to); }
}

/** Cache "instantâneo": devolve o que tiver (mesmo velho) e renova em segundo plano. */
async function cuFetchStale(pathname) {
  const hit = cuCache.get(pathname);
  if (hit) {
    if (Date.now() - hit.t > CACHE_MS) cuFetch(pathname, { fresh: true }).catch(() => {});
    return { data: hit.data, cachedAt: hit.t };
  }
  const data = await cuFetch(pathname);
  return { data, cachedAt: Date.now() };
}

/** Escrita no ClickUp (PUT/POST), sem cache. */
async function cuWrite(pathname, method, body) {
  if (!config.token) throw Object.assign(new Error('sem token'), { code: 'NO_TOKEN' });
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 15_000);
  try {
    const res = await fetch(CU_API + pathname, {
      method,
      headers: { Authorization: config.token, 'Content-Type': 'application/json' },
      body: body != null ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      throw Object.assign(new Error(`ClickUp ${res.status}: ${t.slice(0, 200)}`), { code: 'CU_' + res.status });
    }
    return await res.json().catch(() => ({}));
  } finally { clearTimeout(to); }
}

function normStatus(s) { return (s || '').trim().toLowerCase(); }
function statusColor(task) {
  const raw = task?.status?.color || '';
  if (raw && raw.startsWith('#')) return raw;
  const name = normStatus(task?.status?.status);
  return db.statusColors[name] || '#87909e';
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx]).catch(e => ({ __err: String(e && e.message || e) })); }
  });
  await Promise.all(workers);
  return out;
}

/** Atualiza cache de nome/status/responsável/entrega dos slots com taskId. */
async function enrichSlots(slotList, { fresh = false } = {}) {
  if (!config.token) return { ok: false, motivo: 'sem token' };
  const now = Date.now();
  const ids = [...new Set(slotList.filter(s => s.taskId).map(s => s.taskId))]
    .filter(id => fresh || !enrichAt.has(id) || now - enrichAt.get(id) > CACHE_MS);
  if (!ids.length) return { ok: true, atualizados: 0 };
  const results = await mapLimit(ids, 6, id => cuFetch(`/task/${id}`, { fresh }));
  let n = 0;
  results.forEach((task, i) => {
    const id = ids[i];
    if (!task || task.__err) return;
    enrichAt.set(id, Date.now());
    const st = { status: normStatus(task.status?.status), color: statusColor(task) };
    const assignee = (task.assignees || []).map(a => a.username).join(', ');
    const due = task.due_date ? Number(task.due_date) : null;
    for (const s of db.slots) {
      if (s.taskId === id) {
        s.tituloCache = task.name || s.tituloCache;
        s.statusCache = st;
        s.assigneeCache = assignee || s.assigneeCache;
        s.dueCache = due; // entrega REAL no ClickUp (detecta ajuste manual)
        s.atualizadoEm = new Date().toISOString();
        n++;
      }
    }
  });
  if (n) saveDb();
  return { ok: true, atualizados: n };
}
const enrichAt = new Map();

// ---------------- sync em segundo plano (ClickUp "instantâneo") ----------------
const SYNC_MS = 75_000;
let sync = { rodando: false, at: null, erro: null };

function mesesJanela() {
  const set = new Set();
  const d = new Date();
  for (let i = -1; i <= 2; i++) {
    const x = new Date(d.getFullYear(), d.getMonth() + i, 1);
    set.add(x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0'));
  }
  return set;
}
function slotsPraSync() {
  const janela = mesesJanela();
  return db.slots.filter(s => s.taskId && (!s.date || janela.has(s.date.slice(0, 7))));
}
async function backgroundSync() {
  if (sync.rodando || !config.token) return;
  sync.rodando = true;
  try {
    const r = await enrichSlots(slotsPraSync(), { fresh: true });
    sync.at = Date.now();
    sync.erro = r && r.ok === false ? (r.motivo || 'falha') : null;
  } catch (e) { sync.erro = String(e && e.message || e); }
  sync.rodando = false;
}
setInterval(backgroundSync, SYNC_MS);
setTimeout(backgroundSync, 400);

// pré-busca de comentários/artes em rodízio (modal abre na hora)
let prefetchIdx = 0;
setInterval(() => {
  if (!config.token) return;
  const ids = [...new Set(slotsPraSync().map(s => s.taskId))];
  if (!ids.length) return;
  const id = ids[prefetchIdx++ % ids.length];
  const key = `/task/${id}/comment`;
  const hit = cuCache.get(key);
  if (hit && Date.now() - hit.t < 5 * 60_000) return;
  cuFetch(key, { fresh: true }).catch(() => {});
}, 8_000);

// ---------------- desfazer (Ctrl+Z): pilha no servidor ----------------
const undoStack = [];
function pushUndo(entry) {
  undoStack.push(entry);
  if (undoStack.length > 50) undoStack.shift();
}
function copiaSlot(s) { return JSON.parse(JSON.stringify(s)); }
function undoSlots(desc, antes, criados) {
  pushUndo({ tipo: 'slots', desc, antes: (antes || []).map(copiaSlot), criados: criados || [] });
}
function addDiaISO(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n, 12)).toISOString().slice(0, 10);
}

// ---------------- entrega no ClickUp: 2 dias ÚTEIS antes do post ----------------
// Post na SEGUNDA -> pronto na QUINTA anterior (sáb/dom não contam).
function dueMsFor(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  let dt = new Date(Date.UTC(y, m - 1, d, 12));
  let faltam = 2;
  while (faltam > 0) {
    dt = new Date(dt.getTime() - 86_400_000);
    const dow = dt.getUTCDay();
    if (dow !== 0 && dow !== 6) faltam--;
  }
  return dt.getTime();
}
function dueStrFor(dateStr) { return new Date(dueMsFor(dateStr)).toISOString().slice(0, 10); }
/** Agenda atualização da entrega (fila com retry; a última data alterada vence). */
function queueDue(slot) {
  if (!slot.taskId || !slot.date) return null;
  db.dueSync[slot.taskId] = dueMsFor(slot.date);
  saveDb();
  return dueStrFor(slot.date);
}
let flushing = false;
async function flushDueQueue() {
  if (flushing || !config.token) return;
  flushing = true;
  try {
    for (const [taskId, ms] of Object.entries(db.dueSync)) {
      try {
        await cuWrite(`/task/${taskId}`, 'PUT', { due_date: ms, due_date_time: false });
        delete db.dueSync[taskId];
        for (const s of db.slots) if (s.taskId === taskId) s.dueCache = ms;
        saveDb();
        cuCache.delete(`/task/${taskId}`);
      } catch (e) {
        if (e.code === 'NO_TOKEN') break;
        // outros erros: fica na fila, tenta no próximo ciclo
      }
    }
  } finally { flushing = false; }
}

// ---------------- comentários / arquivos ----------------
function naturalCompare(a, b) {
  return String(a).localeCompare(String(b), 'pt-BR', { numeric: true, sensitivity: 'base' });
}
/** Nome-base pra agrupar versões: "arte 2 (1).png", "arte 2_v3.png", "ARTE 2.png" -> "arte 2" */
function fileBaseKey(name) {
  let s = String(name || '').toLowerCase().trim();
  s = s.replace(/\.[a-z0-9]{2,5}$/i, '');
  s = s.replace(/\s*[\(\[]\d+[\)\]]\s*$/, '');
  s = s.replace(/[\s_-]v\d+$/i, '');
  return s.replace(/\s+/g, ' ').trim();
}
function slideOrder(name) {
  const m = String(name || '').match(/(\d+)/);
  return m ? parseInt(m[1], 10) : 999;
}
function nameFromUrl(u) {
  try { return decodeURIComponent((new URL(u).pathname.split('/').pop() || '')); } catch { return ''; }
}
function attToFile(a) {
  const name = a.title || a.name || nameFromUrl(a.url_w_query || a.url || '') || 'arquivo';
  return {
    id: a.id || '',
    name,
    url: a.url_w_query || a.url || a.url_w_host || '',
    thumb: a.thumbnail_medium || a.thumbnail_small || a.thumbnail_large || '',
    ext: String(a.extension || name.split('.').pop() || '').toLowerCase(),
  };
}
/** Bloco de IMAGEM colada no comentário (formato real do ClickUp: piece.image). */
function imageBlockToFile(im) {
  const name = im.title || im.name || nameFromUrl(im.url) || 'imagem';
  return {
    id: im.id || ('img|' + im.url),
    name,
    url: im.url,
    thumb: im.thumbnail_url || im.thumbnail_medium || im.thumbnail_small || im.url,
    ext: String(name.split('.').pop() || 'png').toLowerCase(),
  };
}
/** Anexos pendurados direto na TASK (toda arte de comentário também aparece aqui). */
function taskFiles(task) {
  return ((task && task.attachments) || []).map(a => ({
    ...attToFile(a),
    date: Number(a.date) || 0,
    user: (a.user && a.user.username) || '',
  }));
}

function parseComments(raw, extras = []) {
  const comments = (raw.comments || []).map(c => {
    const atts = [];
    for (const piece of (Array.isArray(c.comment) ? c.comment : [])) {
      if (!piece) continue;
      if (piece.attachment) atts.push(attToFile(piece.attachment));
      if (piece.image && piece.image.url) atts.push(imageBlockToFile(piece.image));
    }
    atts.sort((x, y) => naturalCompare(x.name, y.name));
    return {
      id: c.id,
      user: c.user?.username || '?',
      initials: c.user?.initials || (c.user?.username || '?').slice(0, 2).toUpperCase(),
      userColor: c.user?.color || '#52514e',
      date: Number(c.date) || 0,
      text: c.comment_text || '',
      attachments: atts,
      resolved: !!c.resolved,
    };
  });
  comments.sort((a, b) => b.date - a.date);

  // candidatos: comentários + anexos da task; dedupe por id e por URL sem query
  const porId = new Map();
  for (const c of comments) {
    for (const a of c.attachments) {
      const k = a.id || (a.name.toLowerCase() + '|' + c.date);
      if (!porId.has(k)) porId.set(k, { ...a, date: c.date, user: c.user });
    }
  }
  for (const f of extras) {
    const k = f.id || (f.name.toLowerCase() + '|' + f.date);
    if (!porId.has(k)) porId.set(k, f);
  }
  const vistos = new Set();
  const unicos = [];
  for (const f of porId.values()) {
    const uk = (f.url || '').split('?')[0] || (f.name + '|' + f.date);
    if (vistos.has(uk)) continue;
    vistos.add(uk);
    unicos.push(f);
  }
  // agrupa por NOME-BASE: fica a versão mais recente, conta versões
  const byBase = new Map();
  for (const f of unicos) {
    const k = fileBaseKey(f.name) || f.name.toLowerCase();
    const prev = byBase.get(k);
    if (!prev || (f.date || 0) > (prev.date || 0)) byBase.set(k, { ...f, versions: (prev?.versions || 0) + 1 });
    else prev.versions++;
  }
  const arquivos = [...byBase.values()].sort((x, y) =>
    (slideOrder(fileBaseKey(x.name)) - slideOrder(fileBaseKey(y.name))) || naturalCompare(x.name, y.name));
  return { comments, arquivos };
}

// ---------------- planilha (APOSENTADA; código dormente de propósito) ----------------
async function importFromSheet() {
  const { id, tabs } = db.sheet;
  const added = [];
  let lidas = 0;
  const existing = new Set(db.slots.map(slotKey));
  for (const [tabName, ref] of Object.entries(tabs)) {
    const q = ref.gid != null ? `gid=${ref.gid}` : `sheet=${encodeURIComponent(ref.sheet)}`;
    const url = `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&${q}`;
    const res = await fetch(url, { redirect: 'follow' });
    if (!res.ok) throw new Error(`planilha ${tabName}: HTTP ${res.status}`);
    const csv = await res.text();
    const { slots, banco } = parseTab(tabName, csv);
    for (const s of [...slots, ...banco]) {
      lidas++;
      const k = slotKey(s);
      if (existing.has(k)) continue;
      existing.add(k);
      const novo = {
        id: 's' + crypto.randomBytes(4).toString('hex'),
        conta: s.conta, date: s.date || null, taskId: s.taskId || null, titulo: null,
        formato: s.formato || '', obs: s.obs || '', gm: s.gm || '', drive: s.drive || '',
        linkRef: s.linkRaw || '', aprovado: !!s.aprovado, postado: !!s.postado,
        responsavelManual: s.responsavel || '', origem: s.origem || 'planilha',
        tituloCache: null, statusCache: null, assigneeCache: null, atualizadoEm: null,
      };
      db.slots.push(novo);
      added.push(novo.id);
    }
  }
  if (added.length) saveDb();
  return { lidas, novos: added.length };
}

// ---------------- http ----------------
function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => { data += c; if (data.length > 2e6) reject(new Error('body grande demais')); });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
function serveStatic(res, file) {
  const full = path.join(PUBLIC_DIR, path.normalize(file).replace(/^([.][.][/\\])+/, ''));
  if (!full.startsWith(PUBLIC_DIR) || !fs.existsSync(full) || !fs.statSync(full).isFile()) {
    res.writeHead(404); res.end('não encontrado'); return;
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(full)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  fs.createReadStream(full).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://localhost:${PORT}`);
  const p = u.pathname;
  try {
    // ---------- login (só ativa quando há senha configurada) ----------
    if (p === '/api/login' && req.method === 'POST') {
      const b = await readBody(req);
      if (!config.senha) return json(res, 200, { ok: true, semSenha: true });
      if (String(b.senha || '') !== config.senha) return json(res, 401, { erro: 'senha incorreta' });
      res.setHeader('Set-Cookie', `sb_auth=${makeAuthToken()}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${90 * 24 * 3600}`);
      return json(res, 200, { ok: true });
    }
    if (p === '/api/logout' && req.method === 'POST') {
      res.setHeader('Set-Cookie', 'sb_auth=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
      return json(res, 200, { ok: true });
    }
    // PORTEIRO: com senha configurada, todo /api (menos login/logout) exige cookie válido.
    // Estáticos (a própria tela de login) passam sempre.
    if (config.senha && p.startsWith('/api/') && p !== '/api/login' && p !== '/api/logout') {
      if (!validAuthToken(parseCookies(req.headers.cookie).sb_auth)) return json(res, 401, { erro: 'login', precisaLogin: true });
    }

    // ---------- estado (INSTANTÂNEO: nunca espera o ClickUp) ----------
    if (p === '/api/state' && req.method === 'GET') {
      const month = u.searchParams.get('month'); // "2026-07"
      let slots = db.slots;
      if (month) {
        // além do mês pedido, inclui a janela de produção (hoje-7 a hoje+10)
        const isoDe = ms => { const d = new Date(ms); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
        const lo = isoDe(Date.now() - 7 * 86_400_000), hi = isoDe(Date.now() + 10 * 86_400_000);
        slots = slots.filter(s => !s.date || s.date.startsWith(month) || (s.date >= lo && s.date <= hi));
      }
      if (u.searchParams.get('fresh') === '1') backgroundSync();
      const enriquecimento = config.token
        ? { ok: !sync.erro, motivo: sync.erro || undefined, at: sync.at }
        : { ok: false, motivo: 'sem token' };
      return json(res, 200, {
        versao: VERSAO,
        contas: db.contas, abas: db.abas, statusColors: db.statusColors,
        slots, referencias: db.referencias,
        hasToken: !!config.token, user: config.user || null, enriquecimento,
        temSenha: !!config.senha,
        duePendentes: Object.keys(db.dueSync),
      });
    }

    if (p === '/api/sync' && req.method === 'POST') {
      await backgroundSync();
      return json(res, 200, { ok: !sync.erro, motivo: sync.erro || undefined, at: sync.at });
    }

    // ---------- criar post (calendário, banco ou criativo) ----------
    if (p === '/api/slots' && req.method === 'POST') {
      const b = await readBody(req);
      if (!b.conta || !db.contas[b.conta]) return json(res, 400, { erro: 'conta inválida' });
      const slot = {
        id: 's' + crypto.randomBytes(4).toString('hex'),
        conta: b.conta, date: b.date || null,
        taskId: b.taskUrl ? taskIdFromUrl(b.taskUrl) : (b.taskId || null),
        titulo: b.titulo || null, formato: b.formato || '', angulo: b.angulo || '', obs: b.obs || '',
        notas: typeof b.notas === 'string' ? b.notas : '', // caderno livre do post (só do painel, não vai pro ClickUp)
        gm: b.gm === 'sim' ? 'sim' : '',
        collab: Array.isArray(b.collab) ? b.collab.filter(c => db.contas[c] && c !== b.conta) : [],
        drive: b.drive || '', linkRef: b.linkRef || '', aprovado: false, postado: false, fixo: false,
        responsavelManual: '', origem: ['criativo', 'banco'].includes(b.origem) ? b.origem : 'painel',
        cat: typeof b.cat === 'string' ? b.cat : '', // categoria dentro do banco (ex.: conselho, corte-reels, outros)
        fonteId: typeof b.fonteId === 'string' ? b.fonteId : '', // id do item do banco que gerou este post
        tituloCache: null, statusCache: null, assigneeCache: null, dueCache: null, atualizadoEm: null,
      };
      // VAGA = "falta criar este post". Só faz sentido sem task: se já tem task, não falta criar.
      if (b.vaga && !slot.taskId) slot.vaga = true;
      undoSlots(slot.vaga ? 'sinalizar falta criar' : 'novo post', [], [slot.id]);
      db.slots.push(slot); saveDb();
      enrichSlots([slot]).catch(() => {});
      const entrega = queueDue(slot);
      return json(res, 200, { ok: true, slot, entrega });
    }

    // ---------- EMPURRAR / REAJUSTAR: este post + todos os seguintes da conta ----------
    // DELTA PURO: a base e todos os posts seguintes da MESMA conta (data >= base) andam
    // EXATAMENTE o mesmo tanto de dias. Fixos (pino) e postados não se movem. Sem desvio
    // esperto: mantém o espaçamento e é previsível (arrastou +1, todo mundo +1). NÃO grava
    // no ClickUp: a data de confecção só vai pro ClickUp no botão "Aplicar datas".
    const mEmp = p.match(/^\/api\/slots\/([a-z0-9]+)\/empurrar$/i);
    if (mEmp && req.method === 'POST') {
      const base = db.slots.find(s => s.id === mEmp[1]);
      if (!base || !base.date) return json(res, 400, { erro: 'post sem data' });
      if (base.fixo) return json(res, 400, { erro: 'este post está com data fixa (pino); solte o pino pra empurrar' });
      const b = await readBody(req);
      const dias = Math.max(1, Math.min(60, parseInt(b.dias) || 1));
      const mover = db.slots.filter(s => s.conta === base.conta && s.date && s.date >= base.date && !s.postado && !s.fixo);
      if (mover.length) {
        undoSlots('reajustar ' + mover.length + ' post' + (mover.length > 1 ? 's' : ''), mover);
        for (const s of mover) {
          s.date = addDiaISO(s.date, dias);
          if (s.taskId) db.dueSync[s.taskId] = dueMsFor(s.date); // registra a mudança (aplica depois)
        }
        saveDb();
      }
      return json(res, 200, { ok: true, movidos: mover.length });
    }

    // ---------- APLICAR DATAS NO CLICKUP (revisão: aplica SÓ os taskIds escolhidos) ----------
    // O Zion abre a revisão, marca os posts que quer, e só esses têm a data de confecção
    // (entrega = 2 dias úteis antes do post) gravada no ClickUp. Os não escolhidos ficam na fila.
    if (p === '/api/aplicar-datas' && req.method === 'POST') {
      if (!config.token) return json(res, 400, { erro: 'sem token do ClickUp configurado' });
      const b = await readBody(req);
      // lista escolhida no painel; sem lista = aplica tudo que está na fila (compat)
      const pedidos = Array.isArray(b.taskIds) ? b.taskIds : Object.keys(db.dueSync);
      const alvos = pedidos.filter(id => db.dueSync[id] != null).map(id => [id, db.dueSync[id]]);
      const resultados = await mapLimit(alvos, 6, async ([taskId, ms]) => {
        try {
          await cuWrite(`/task/${taskId}`, 'PUT', { due_date: ms, due_date_time: false });
          return { taskId, ms, ok: true };
        } catch (e) { return { taskId, ok: false }; }
      });
      let aplicadas = 0, erros = 0;
      for (const x of resultados) {
        if (x.ok) {
          delete db.dueSync[x.taskId];
          for (const s of db.slots) if (s.taskId === x.taskId) s.dueCache = x.ms;
          cuCache.delete(`/task/${x.taskId}`);
          aplicadas++;
        } else erros++; // erro: fica na fila pra tentar de novo
      }
      saveDb();
      return json(res, 200, { ok: true, aplicadas, erros });
    }

    // ---------- DESCARTAR da fila: tira a task do slider sem gravar no ClickUp ----------
    if (p === '/api/aplicar-datas/descartar' && req.method === 'POST') {
      const b = await readBody(req);
      const ids = Array.isArray(b.taskIds) ? b.taskIds : [];
      let descartadas = 0;
      for (const id of ids) { if (db.dueSync[id] != null) { delete db.dueSync[id]; descartadas++; } }
      if (descartadas) saveDb();
      return json(res, 200, { ok: true, descartadas });
    }

    // ---------- LOTE da seleção: mover N dias / banco / collab ----------
    if (p === '/api/slots/batch' && req.method === 'POST') {
      const b = await readBody(req);
      const ids = Array.isArray(b.ids) ? b.ids : [];
      const op = b.op === 'banco' ? 'banco' : (b.op === 'collab' ? 'collab' : 'mover');
      const dias = Math.max(-30, Math.min(30, parseInt(b.dias) || 1)) || 1;
      const alvos = db.slots.filter(s => ids.includes(s.id));
      if (!alvos.length) return json(res, 400, { erro: 'nenhum post selecionado' });

      if (op === 'collab') {
        const contas = [...new Set(alvos.map(s => s.conta))];
        if (alvos.length < 2 || contas.length < 2) {
          return json(res, 400, { erro: 'selecione pelo menos 2 posts de CONTAS diferentes (ex.: um da Educação e um do Club)' });
        }
        const desejado = conta => contas.filter(c => c !== conta).sort();
        const jaTem = alvos.every(s => ((s.collab || []).slice().sort().join(',')) === desejado(s.conta).join(','));
        undoSlots(jaTem ? 'desfazer collab' : 'marcar collab (' + contas.length + ' contas)', alvos);
        for (const s of alvos) s.collab = jaTem ? [] : desejado(s.conta);
        saveDb();
        return json(res, 200, { ok: true, modo: jaTem ? 'off' : 'on', afetados: alvos.length, contas });
      }

      const validos = alvos.filter(s => op === 'banco' ? !!s.date : (!!s.date && !s.fixo && !s.postado));
      const pulados = alvos.length - validos.length;
      if (validos.length) {
        undoSlots((op === 'banco' ? 'enviar ' : 'mover ') + validos.length + ' post' + (validos.length > 1 ? 's' : '') +
          (op === 'banco' ? ' pro banco' : (' (' + (dias > 0 ? '+' : '') + dias + ' dia' + (Math.abs(dias) > 1 ? 's' : '') + ')')), validos);
        for (const s of validos) {
          if (op === 'banco') s.date = null;
          else {
            s.date = addDiaISO(s.date, dias);
            if (s.taskId) db.dueSync[s.taskId] = dueMsFor(s.date);
          }
        }
        saveDb();
      }
      return json(res, 200, { ok: true, movidos: validos.length, pulados });
    }

    // ---------- DESFAZER (Ctrl+Z) ----------
    if (p === '/api/undo' && req.method === 'POST') {
      const e = undoStack.pop();
      if (!e) return json(res, 200, { ok: false, motivo: 'nada pra desfazer' });
      if (e.tipo === 'slots') {
        for (const id of e.criados || []) db.slots = db.slots.filter(s => s.id !== id);
        for (const cp of e.antes || []) {
          const i = db.slots.findIndex(s => s.id === cp.id);
          const atual = i >= 0 ? db.slots[i] : null;
          if (i >= 0) db.slots[i] = cp; else db.slots.push(cp);
          if (cp.taskId && cp.date && (!atual || atual.date !== cp.date)) db.dueSync[cp.taskId] = dueMsFor(cp.date);
        }
        saveDb();
        return json(res, 200, { ok: true, desfeito: e.desc });
      }
      if (e.tipo === 'referencias') {
        for (const id of e.criados || []) db.referencias = db.referencias.filter(r => r.id !== id);
        for (const cp of e.antes || []) {
          const i = db.referencias.findIndex(r => r.id === cp.id);
          if (i >= 0) db.referencias[i] = cp; else db.referencias.unshift(cp);
        }
        saveDb();
        return json(res, 200, { ok: true, desfeito: e.desc });
      }
      if (e.tipo === 'status') {
        if (e.statusAntes) {
          try { await cuWrite(`/task/${e.taskId}`, 'PUT', { status: e.statusAntes }); }
          catch (err) { undoStack.push(e); return json(res, 500, { erro: 'não consegui devolver o status no ClickUp: ' + (err.message || err) }); }
          cuCache.delete(`/task/${e.taskId}`);
        }
        for (const cp of e.slots || []) {
          const s = db.slots.find(x => x.id === cp.id);
          if (s) { s.aprovado = cp.aprovado; s.statusCache = cp.statusCache; }
        }
        saveDb();
        enrichSlots(db.slots.filter(s => s.taskId === e.taskId), { fresh: true }).catch(() => {});
        return json(res, 200, { ok: true, desfeito: e.desc });
      }
      if (e.tipo === 'descricao') {
        try {
          await cuWrite(`/task/${e.taskId}`, 'PUT', { markdown_description: e.textoAntes });
        } catch (err) {
          if (err.code === 'CU_400') {
            try { await cuWrite(`/task/${e.taskId}`, 'PUT', { description: e.textoAntes }); }
            catch (e2) { undoStack.push(e); return json(res, 500, { erro: 'não consegui devolver a descrição: ' + (e2.message || e2) }); }
          } else { undoStack.push(e); return json(res, 500, { erro: 'não consegui devolver a descrição: ' + (err.message || err) }); }
        }
        cuCache.delete(`/task/${e.taskId}`);
        return json(res, 200, { ok: true, desfeito: e.desc });
      }
      return json(res, 200, { ok: false, motivo: 'ação sem undo' });
    }

    // ---------- editar / excluir post ----------
    const mSlot = p.match(/^\/api\/slots\/([a-z0-9]+)$/i);
    if (mSlot && (req.method === 'PATCH' || req.method === 'DELETE')) {
      const slot = db.slots.find(s => s.id === mSlot[1]);
      if (!slot) return json(res, 404, { erro: 'slot não existe' });
      if (req.method === 'DELETE') {
        undoSlots('excluir post', [slot]);
        db.slots = db.slots.filter(s => s.id !== slot.id); saveDb();
        return json(res, 200, { ok: true });
      }
      const b = await readBody(req);
      // troca de conta: só aceita conta que existe. Conta inválida = erro claro, não silêncio.
      if ('conta' in b && b.conta !== slot.conta && !db.contas[b.conta]) {
        return json(res, 400, { erro: 'conta inválida: ' + b.conta });
      }
      const trocaConta = 'conta' in b && !!db.contas[b.conta] && b.conta !== slot.conta;
      const descUndo =
        trocaConta ? 'trocar pra ' + db.contas[b.conta].nome :
        'date' in b ? ((b.date || null) ? 'mover post pra ' + String(b.date).split('-').reverse().join('/') : 'mandar post pro banco') :
        'postado' in b ? (b.postado ? 'marcar postado' : 'desmarcar postado') :
        'gm' in b ? 'mudar GM' :
        'bp' in b ? 'mudar tag BP' :
        'vaga' in b ? (b.vaga ? 'sinalizar falta criar' : 'dar baixa na vaga') :
        'cat' in b ? 'mudar categoria no banco' :
        'notas' in b && Object.keys(b).length === 1 ? 'editar observação' :
        'aprovado' in b ? 'mudar aprovação da arte' :
        'fixo' in b ? 'mudar pino de data fixa' :
        'collab' in b ? (Array.isArray(b.collab) && b.collab.length ? 'marcar collab' : 'tirar collab') :
        'formato' in b && Object.keys(b).length === 1 ? 'mudar formato' : 'editar post';
      undoSlots(descUndo, [slot]);
      const dataMudou = 'date' in b && (b.date || null) !== slot.date;
      if (trocaConta) slot.conta = b.conta; // ANTES do collab: collab não pode conter a própria conta
      if ('date' in b) slot.date = b.date || null;
      for (const k of ['titulo', 'formato', 'obs', 'drive', 'linkRef', 'angulo', 'notas']) if (k in b) slot[k] = b[k] || '';
      if ('postado' in b) slot.postado = !!b.postado;
      if ('gm' in b) slot.gm = b.gm === 'sim' ? 'sim' : '';
      if ('bp' in b) slot.bp = !!b.bp; // tag BP (temporária, só SeuBoné)
      if ('vaga' in b) slot.vaga = !!b.vaga; // vaga = falta criar este post
      if ('cat' in b) slot.cat = typeof b.cat === 'string' ? b.cat : '';
      if ('aprovado' in b) slot.aprovado = !!b.aprovado;
      if ('fixo' in b) slot.fixo = !!b.fixo;
      if ('collab' in b) slot.collab = Array.isArray(b.collab) ? b.collab.filter(c => db.contas[c] && c !== slot.conta) : [];
      // trocou de conta sem mandar collab: tira a nova conta própria do collab (ninguém faz collab consigo)
      if (trocaConta) slot.collab = (slot.collab || []).filter(c => c !== slot.conta);
      let taskMudou = false;
      if ('taskUrl' in b) {
        const tid = taskIdFromUrl(b.taskUrl);
        taskMudou = tid !== slot.taskId;
        slot.taskId = tid; if (tid) { slot.statusCache = null; slot.tituloCache = null; enrichSlots([slot], { fresh: true }).catch(() => {}); }
        // colou a task: o post foi criado, então a vaga cai sozinha (Ctrl+Z devolve tudo junto)
        if (tid) slot.vaga = false;
      }
      saveDb();
      const entrega = (dataMudou || taskMudou) ? queueDue(slot) : null;
      return json(res, 200, { ok: true, slot, entrega });
    }

    // ---------- proxy de mídia do ClickUp (URLs de lá exigem o token) ----------
    if (p === '/api/img' && req.method === 'GET') {
      const raw = u.searchParams.get('u') || '';
      let dec; try { dec = decodeURIComponent(raw); } catch { dec = raw; }
      let host = ''; try { host = new URL(dec).hostname; } catch {}
      const okHost = host === 'clickup.com' || host.endsWith('.clickup.com') || host.endsWith('clickup-attachments.com');
      if (!okHost) return json(res, 403, { erro: 'domínio não permitido' });
      const range = req.headers.range;
      // Anexos do ClickUp hoje sao URLs ASSINADAS (S3): mandar o header Authorization QUEBRA elas (S3 recusa auth duplicada).
      // Ja a API (clickup.com) EXIGE o token. Entao: sem token pro host de anexo assinado, com token pra API; se falhar, tenta o modo oposto.
      const comToken = () => { const hh = {}; if (config.token) hh.Authorization = config.token; if (range) hh.Range = range; return hh; };
      const semToken = () => { const hh = {}; if (range) hh.Range = range; return hh; };
      const assinado = host.endsWith('clickup-attachments.com');
      const bom = r => r && (r.ok || r.status === 206) && r.body;
      let up = await fetch(dec, { headers: assinado ? semToken() : comToken(), redirect: 'follow' }).catch(() => null);
      if (!bom(up)) {
        const up2 = await fetch(dec, { headers: assinado ? comToken() : semToken(), redirect: 'follow' }).catch(() => null);
        if (bom(up2)) up = up2;
      }
      if (!bom(up)) { res.writeHead((up && up.status) || 502); return res.end(); }
      const h2 = {
        'Content-Type': up.headers.get('content-type') || 'application/octet-stream',
        'Cache-Control': 'public, max-age=3600',
        'Accept-Ranges': 'bytes',
      };
      for (const k of ['content-range', 'content-length']) { const v = up.headers.get(k); if (v) h2[k] = v; }
      res.writeHead(up.status === 206 ? 206 : 200, h2);
      Readable.fromWeb(up.body).pipe(res);
      return;
    }

    // ---------- banco de referências (geral, sem conta) ----------
    if (p === '/api/referencias' && req.method === 'POST') {
      const b = await readBody(req);
      const url2 = (b.url || '').trim();
      if (!/^https?:\/\//i.test(url2)) return json(res, 400, { erro: 'cole um link válido (http...)' });
      const ref = {
        id: 'r' + crypto.randomBytes(4).toString('hex'),
        url: url2,
        nota: (b.nota || '').trim(),
        criadoEm: new Date().toISOString(),
      };
      pushUndo({ tipo: 'referencias', desc: 'nova referência', antes: [], criados: [ref.id] });
      db.referencias.unshift(ref); saveDb();
      return json(res, 200, { ok: true, ref });
    }
    const mRef = p.match(/^\/api\/referencias\/([a-z0-9]+)$/i);
    if (mRef && (req.method === 'PATCH' || req.method === 'DELETE')) {
      const ref = db.referencias.find(r => r.id === mRef[1]);
      if (!ref) return json(res, 404, { erro: 'referência não existe' });
      if (req.method === 'DELETE') {
        pushUndo({ tipo: 'referencias', desc: 'excluir referência', antes: [{ ...ref }], criados: [] });
        db.referencias = db.referencias.filter(r => r.id !== ref.id); saveDb();
        return json(res, 200, { ok: true });
      }
      pushUndo({ tipo: 'referencias', desc: 'editar referência', antes: [{ ...ref }], criados: [] });
      const b = await readBody(req);
      if ('url' in b) {
        const u2 = (b.url || '').trim();
        if (!/^https?:\/\//i.test(u2)) return json(res, 400, { erro: 'link inválido' });
        ref.url = u2;
      }
      if ('nota' in b) ref.nota = (b.nota || '').trim();
      saveDb();
      return json(res, 200, { ok: true, ref });
    }

    // ---------- task: leitura instantânea ----------
    const mTask = p.match(/^\/api\/task\/([a-z0-9]+)$/i);
    if (mTask && req.method === 'GET') {
      const fresh = u.searchParams.get('fresh') === '1';
      const { data: task, cachedAt } = fresh
        ? { data: await cuFetch(`/task/${mTask[1]}`, { fresh: true }), cachedAt: Date.now() }
        : await cuFetchStale(`/task/${mTask[1]}`);
      return json(res, 200, {
        id: task.id, name: task.name,
        status: normStatus(task.status?.status), color: statusColor(task),
        assignees: (task.assignees || []).map(a => ({ nome: a.username, initials: (a.initials || a.username.slice(0, 2)).toUpperCase(), cor: a.color || '#52514e' })),
        descricao: task.markdown_description || task.text_content || '',
        url: task.url || `https://app.clickup.com/t/${task.id}`,
        due: task.due_date ? Number(task.due_date) : null,
        atualizado: task.date_updated ? Number(task.date_updated) : null,
        _cachedAt: cachedAt,
      });
    }

    // ---------- AÇÃO de aprovação: aprovar->publicar | alterar->comentário+alterar ----------
    const mAcao = p.match(/^\/api\/task\/([a-z0-9]+)\/acao$/i);
    if (mAcao && req.method === 'POST') {
      const b = await readBody(req);
      const acao = b.acao;
      if (acao !== 'aprovar' && acao !== 'alterar') return json(res, 400, { erro: 'ação inválida' });
      let statusAntes = '';
      try {
        const t0 = await cuFetch(`/task/${mAcao[1]}`, { fresh: true });
        statusAntes = (t0.status && t0.status.status) || '';
      } catch {}
      if (acao === 'aprovar' && normStatus(statusAntes) !== 'aprovar') {
        return json(res, 409, { erro: 'só dá pra aprovar task que está no status APROVAR (agora: "' + (normStatus(statusAntes) || 'desconhecido') + '")' });
      }
      pushUndo({
        tipo: 'status',
        desc: acao === 'aprovar' ? 'aprovação (status publicar)' : 'pedido de alteração (status alterar)',
        taskId: mAcao[1],
        statusAntes,
        slots: db.slots.filter(s => s.taskId === mAcao[1]).map(s => ({ id: s.id, aprovado: s.aprovado, statusCache: s.statusCache ? { ...s.statusCache } : null })),
      });
      if (acao === 'alterar') {
        const texto = String(b.comentario || '').trim();
        if (!texto) return json(res, 400, { erro: 'descreva a alteração' });
        await cuWrite(`/task/${mAcao[1]}/comment`, 'POST', { comment_text: 'ALTERAÇÃO SOLICITADA: ' + texto, notify_all: true });
        cuCache.delete(`/task/${mAcao[1]}/comment`);
      }
      const novoStatus = acao === 'aprovar' ? 'publicar' : 'alterar';
      await cuWrite(`/task/${mAcao[1]}`, 'PUT', { status: novoStatus });
      cuCache.delete(`/task/${mAcao[1]}`);
      let st = { status: novoStatus, color: db.statusColors[novoStatus] || '#87909e' };
      try {
        const task = await cuFetch(`/task/${mAcao[1]}`, { fresh: true });
        st = { status: normStatus(task.status?.status), color: statusColor(task) };
      } catch {}
      for (const s of db.slots) {
        if (s.taskId === mAcao[1]) {
          s.statusCache = st;
          if (acao === 'aprovar') s.aprovado = true;
          if (acao === 'alterar') s.aprovado = false;
          s.atualizadoEm = new Date().toISOString();
        }
      }
      saveDb();
      return json(res, 200, { ok: true, status: st, aprovado: acao === 'aprovar' });
    }

    // ---------- descrição (grava no ClickUp) ----------
    const mDesc = p.match(/^\/api\/task\/([a-z0-9]+)\/descricao$/i);
    if (mDesc && req.method === 'PATCH') {
      const b = await readBody(req);
      const texto = String(b.texto ?? '');
      try {
        const { data: t0 } = await cuFetchStale(`/task/${mDesc[1]}`);
        pushUndo({ tipo: 'descricao', desc: 'editar descrição da task', taskId: mDesc[1], textoAntes: (t0 && (t0.markdown_description || t0.text_content)) || '' });
      } catch {}
      try {
        await cuWrite(`/task/${mDesc[1]}`, 'PUT', { markdown_description: texto });
      } catch (e) {
        if (e.code === 'CU_400') await cuWrite(`/task/${mDesc[1]}`, 'PUT', { description: texto });
        else throw e;
      }
      cuCache.delete(`/task/${mDesc[1]}`);
      return json(res, 200, { ok: true });
    }

    // ---------- comentários: leitura (2 fontes de artes) e escrita ----------
    const mCom = p.match(/^\/api\/task\/([a-z0-9]+)\/comments$/i);
    if (mCom && req.method === 'GET') {
      const fresh = u.searchParams.get('fresh') === '1';
      const [comRes, taskRes] = await Promise.all([
        fresh ? cuFetch(`/task/${mCom[1]}/comment`, { fresh: true }).then(d => ({ data: d, cachedAt: Date.now() }))
              : cuFetchStale(`/task/${mCom[1]}/comment`),
        (fresh ? cuFetch(`/task/${mCom[1]}`, { fresh: true }).then(d => ({ data: d }))
               : cuFetchStale(`/task/${mCom[1]}`)).catch(() => ({ data: null })),
      ]);
      return json(res, 200, { ...parseComments(comRes.data, taskFiles(taskRes.data)), _cachedAt: comRes.cachedAt });
    }
    if (mCom && req.method === 'POST') {
      const b = await readBody(req);
      const texto = String(b.texto || '').trim();
      if (!texto) return json(res, 400, { erro: 'comentário vazio' });
      await cuWrite(`/task/${mCom[1]}/comment`, 'POST', { comment_text: texto, notify_all: true });
      cuCache.delete(`/task/${mCom[1]}/comment`);
      const raw = await cuFetch(`/task/${mCom[1]}/comment`, { fresh: true });
      const t = await cuFetchStale(`/task/${mCom[1]}`).catch(() => ({ data: null }));
      return json(res, 200, { ok: true, ...parseComments(raw, taskFiles(t.data)), _cachedAt: Date.now() });
    }

    // ---------- config ----------
    if (p === '/api/config' && req.method === 'GET') {
      return json(res, 200, { hasToken: !!config.token, user: config.user || null, temSenha: !!config.senha });
    }
    if (p === '/api/config' && req.method === 'POST') {
      const b = await readBody(req);
      // senha de acesso (login pro túnel): seta/troca/remove sem precisar mexer no token
      if ('senha' in b) { config.senha = String(b.senha || '').trim(); saveConfig(config); }
      if ('token' in b) {
        const token = (b.token || '').trim();
        if (!token) return json(res, 400, { erro: 'token vazio' });
        const ctrl = new AbortController(); const to = setTimeout(() => ctrl.abort(), 10_000);
        let user;
        try {
          const r = await fetch(CU_API + '/user', { headers: { Authorization: token }, signal: ctrl.signal });
          if (!r.ok) return json(res, 401, { erro: 'token recusado pelo ClickUp (HTTP ' + r.status + ')' });
          user = (await r.json()).user;
        } finally { clearTimeout(to); }
        config.token = token; // preserva secret e senha (não sobrescreve o config inteiro)
        config.user = { nome: user.username, email: user.email };
        saveConfig(config);
        cuCache.clear(); enrichAt.clear();
        backgroundSync();
      }
      return json(res, 200, { ok: true, user: config.user || null, temSenha: !!config.senha });
    }

    // planilha aposentada: endpoint fica dormente por segurança
    if (p === '/api/import-sheet' && req.method === 'POST') {
      const r = await importFromSheet();
      return json(res, 200, { ok: true, ...r });
    }

    // ---------- static ----------
    if (req.method === 'GET') return serveStatic(res, p === '/' ? 'index.html' : p);
    res.writeHead(405); res.end();
  } catch (e) {
    const msg = String(e && e.message || e);
    json(res, e.code === 'NO_TOKEN' ? 428 : 500, { erro: msg, code: e.code || null });
  }
});

// ---------------- backup diário automático ----------------
function backupDiario() {
  try {
    const dir = path.join(DATA_DIR, 'backups');
    fs.mkdirSync(dir, { recursive: true });
    const hoje = new Date();
    const nome = 'data-' + hoje.getFullYear() + '-' + String(hoje.getMonth() + 1).padStart(2, '0') + '-' + String(hoje.getDate()).padStart(2, '0') + '.json';
    const alvo = path.join(dir, nome);
    if (!fs.existsSync(alvo) && fs.existsSync(DATA_FILE)) fs.copyFileSync(DATA_FILE, alvo);
    const antigos = fs.readdirSync(dir).filter(f => /^data-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
    while (antigos.length > 14) fs.unlinkSync(path.join(dir, antigos.shift()));
  } catch { /* backup nunca derruba o painel */ }
}
backupDiario();
setInterval(backupDiario, 6 * 3600_000);

server.listen(PORT, () => {
  console.log('');
  console.log('  Central de Posts - Grupo SB · v' + VERSAO);
  console.log('  Aberto em: http://localhost:' + PORT);
  console.log('  (deixe esta janela aberta enquanto usa o painel)');
  console.log('');
});
