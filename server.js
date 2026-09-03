'use strict';
/*
 * B.O.N.E (Bora Organizar Nossas Entregas) - Grupo SB · v3.0 (neo brutal)
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

const VERSAO = '3.42'; // precisa bater com FRONT_VERSAO no public/index.html
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
// último status já avisado por task, pra não repetir aviso quando o status oscila ou o servidor reinicia
if (!db.avisos || typeof db.avisos !== 'object' || Array.isArray(db.avisos)) db.avisos = {};
// cadência automática de GM (grande marca na capa) — só SeuBoné. ancora null = desligado até configurar.
if (!db.gmCadencia || typeof db.gmCadencia !== 'object' || Array.isArray(db.gmCadencia))
  db.gmCadencia = { ativo: false, ancora: null, periodo: 3 };
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

// ---------------- app instalável (PWA) ----------------
// O manifesto e o ícone são SERVIDOS PELO CÓDIGO, não como arquivos na pasta public.
// Motivo prático: a rotina de sincronizar com a pasta da nuvem copia server.js e
// index.html; arquivo solto é o que fica pra trás e quebra só no online.
const ICONE_APP_B64 = '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';
const MANIFESTO = {
  name: 'B.O.N.E · Grupo SB',
  short_name: 'B.O.N.E',
  start_url: '/',
  scope: '/',
  display: 'standalone',
  background_color: '#0F0F0D',
  theme_color: '#FCC100',
  lang: 'pt-BR',
  icons: [
    { src: '/icone.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: '/icone.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
  ],
};

// ---------------- WhatsApp (Z-API) ----------------
// Avisa quando uma task entra em APROVAR. Credenciais vêm do ambiente (Render) ou do
// config.json (uso local); o ambiente sempre ganha. As chaves NUNCA voltam pro navegador.
function zapiCfg() {
  const c = config.zapi || {};
  return {
    instancia: (process.env.ZAPI_INSTANCIA || c.instancia || '').trim(),
    token: (process.env.ZAPI_TOKEN || c.token || '').trim(),
    clientToken: (process.env.ZAPI_CLIENT_TOKEN || c.clientToken || '').trim(),
    destino: String(process.env.ZAPI_DESTINO || c.destino || '').replace(/\D/g, ''),
    // desligada por padrão: o Zion escolheu usar a notificação do computador. Só liga
    // com ZAPI_LIGADO=1 no ambiente ou marcando o checkbox nas configurações.
    ligado: process.env.ZAPI_LIGADO ? process.env.ZAPI_LIGADO !== '0' : c.ligado === true,
  };
}
function zapiPronto() {
  const z = zapiCfg();
  return !!(z.instancia && z.token && z.destino);
}
/** Manda uma mensagem de texto. Devolve {ok, detalhe} e NUNCA derruba o sync. */
async function zapiEnviar(texto) {
  const z = zapiCfg();
  if (!zapiPronto()) return { ok: false, detalhe: 'WhatsApp não configurado' };
  const base = process.env.ZAPI_API || 'https://api.z-api.io';
  const url = `${base}/instances/${z.instancia}/token/${z.token}/send-text`;
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 15_000);
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (z.clientToken) headers['Client-Token'] = z.clientToken;
    const r = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ phone: z.destino, message: texto }), signal: ctrl.signal });
    const corpo = await r.text().catch(() => '');
    if (!r.ok) return { ok: false, detalhe: 'Z-API HTTP ' + r.status + ': ' + corpo.slice(0, 200) };
    return { ok: true, detalhe: corpo.slice(0, 200) };
  } catch (e) {
    return { ok: false, detalhe: String(e && e.message || e) };
  } finally { clearTimeout(to); }
}
/** Texto do aviso de uma task que entrou em aprovar. */
function textoAviso(slot, nome) {
  const conta = (db.contas[slot.conta] && db.contas[slot.conta].nome) || slot.conta;
  const quando = slot.date ? slot.date.split('-').reverse().join('/') : 'sem data';
  return [
    '🟡 *PRA APROVAR* · ' + conta,
    nome || '(sem nome)',
    'Post do dia ' + quando,
    'https://app.clickup.com/t/' + slot.taskId,
  ].join('\n');
}
/** Dispara os avisos das tasks que ACABARAM de entrar em aprovar. */
async function avisarAprovar(transicoes) {
  if (!transicoes.length || !zapiPronto() || !zapiCfg().ligado) return;
  for (const t of transicoes.slice(0, 12)) { // teto por ciclo, pra nunca virar enxurrada
    const r = await zapiEnviar(textoAviso(t.slot, t.nome));
    if (r.ok) { db.avisos[t.taskId] = 'aprovar'; }
    else console.log('[whatsapp] falhou:', r.detalhe);
  }
  saveDb();
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
  const novasAprovacoes = [];
  results.forEach((task, i) => {
    const id = ids[i];
    if (!task || task.__err) return;
    enrichAt.set(id, Date.now());
    const st = { status: normStatus(task.status?.status), color: statusColor(task) };
    const assignee = (task.assignees || []).map(a => a.username).join(', ');
    const due = task.due_date ? Number(task.due_date) : null;
    // ENTROU em aprovar agora? Só avisa se a gente JÁ CONHECIA um status anterior diferente
    // disso. Sem essa trava, um restart do servidor mandaria aviso de tudo que já estava
    // em aprovar. E db.avisos impede repetir quando o status vai e volta.
    if (st.status === 'aprovar' && db.avisos[id] !== 'aprovar') {
      const antes = db.slots.find(s => s.taskId === id && s.statusCache && s.statusCache.status);
      const anterior = antes ? antes.statusCache.status : null;
      if (anterior && anterior !== 'aprovar') {
        const slot = db.slots.find(s => s.taskId === id);
        if (slot) novasAprovacoes.push({ taskId: id, slot, nome: task.name || '' });
      } else if (!anterior) {
        db.avisos[id] = 'aprovar'; // primeira vez que vemos: registra sem avisar
      }
    }
    if (st.status !== 'aprovar' && db.avisos[id]) delete db.avisos[id];
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
  if (novasAprovacoes.length) avisarAprovar(novasAprovacoes).catch(() => {});
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
const TETO_POR_CICLO = 55; // deixa folga no limite do ClickUp (100 req/min) pro uso normal do painel
let rodizioQuente = 0, rodizioFrio = 0;
/** Fatia rotativa de um array, pra tudo entrar em algum ciclo sem estourar o teto. */
function fatiaRotativa(lista, quantas, cursor) {
  if (quantas <= 0) return { fatia: [], cursor };
  if (lista.length <= quantas) return { fatia: lista, cursor: 0 };
  const fatia = [];
  for (let i = 0; i < quantas; i++) fatia.push(lista[(cursor + i) % lista.length]);
  return { fatia, cursor: (cursor + quantas) % lista.length };
}
/**
 * O que vai no proximo ciclo de sync.
 * Buscar as ~95 tasks toda vez dava 76 req/min e raspava o teto do ClickUp (100/min): o que
 * estourava falhava calado e ficava desatualizado. Agora a JANELA QUENTE (semana passada ate
 * 2 semanas a frente, mais os posts sem data) tem prioridade, o resto entra em rodizio, e o
 * TETO e absoluto: nunca sai mais que TETO_POR_CICLO tasks por ciclo, nem que a janela quente
 * sozinha passe disso.
 */
function slotsPraSync() {
  const janela = mesesJanela();
  const agora = Date.now();
  const iso = ms => new Date(ms).toISOString().slice(0, 10);
  const de = iso(agora - 7 * 86400000), ate = iso(agora + 14 * 86400000);
  const candidatos = db.slots.filter(s => s.taskId && (!s.date || janela.has(s.date.slice(0, 7))));
  const quentes = candidatos.filter(s => !s.date || (s.date >= de && s.date <= ate));
  const frios = candidatos.filter(s => s.date && (s.date < de || s.date > ate));
  // a janela quente sozinha ja estoura? entao ela tambem entra em rodizio
  if (quentes.length >= TETO_POR_CICLO) {
    const r = fatiaRotativa(quentes, TETO_POR_CICLO, rodizioQuente);
    rodizioQuente = r.cursor;
    return r.fatia;
  }
  const r = fatiaRotativa(frios, TETO_POR_CICLO - quentes.length, rodizioFrio);
  rodizioFrio = r.cursor;
  return quentes.concat(r.fatia);
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
/** ms -> "AAAA-MM-DD" no fuso da máquina (a entrega do ClickUp é um instante). */
function isoLocal(ms) {
  const d = new Date(Number(ms));
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
/** Primeiro `dow` (0=domingo) a partir de `iso`, INCLUINDO o próprio dia se já for esse. */
function proximoDiaDaSemana(iso, dow) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  let volta = 0;
  while (dt.getDay() !== dow && volta++ < 8) dt.setDate(dt.getDate() + 1);
  return dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0');
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

// ===== presença ao vivo (cursores estilo Figma, via SSE, sem dependência) =====
const AOVIVO_CORES = ['#FF5D5D', '#FFB020', '#3DDC97', '#4DA3FF', '#C77DFF', '#FF7AC6', '#00D0C0', '#8AE234', '#FF9F1C', '#5E9BFF'];
const AOVIVO_BICHOS = ['Capivara Chique', 'Jacaré de Terno', 'Suricato Espião', 'Lagartixa MEI', 'Perereca Gamer', 'Gambá Perfumado', 'Pombo Sniper', 'Barata Ninja', 'Sapo Filósofo', 'Tatu Blindado', 'Preguiça Turbo', 'Ornitorrinco Confuso', 'Minhoca Executiva', 'Tamanduá Detetive', 'Quati Boêmio', 'Coruja Insone', 'Morcego Vegano', 'Lontra DJ', 'Furão Hacker', 'Cutia Ansiosa', 'Tucano Influencer', 'Bode Expiatório', 'Peixe-boi Voador', 'Galinha Cyberpunk', 'Porco Espião', 'Jegue Turbinado', 'Camaleão Indeciso', 'Pangolim Blindado', 'Jabuti Foguete', 'Preguiça CLT'];
const aovivo = new Map();      // id -> { id, nome, cor, conta, anchor, fx, fy, temCursor, visto }
const aovivoSSE = new Map();   // id -> res (conexão aberta)
function aovivoCorLivre() { const usadas = new Set([...aovivo.values()].map(p => p.cor)); return AOVIVO_CORES.find(c => !usadas.has(c)) || AOVIVO_CORES[Math.floor(Math.random() * AOVIVO_CORES.length)]; }
function aovivoNomeLivre() { const usados = new Set([...aovivo.values()].map(p => p.nome)); const livres = AOVIVO_BICHOS.filter(n => !usados.has(n)); const pool = livres.length ? livres : AOVIVO_BICHOS; return pool[Math.floor(Math.random() * pool.length)]; }
function aovivoRoster() { return [...aovivo.values()].map(p => ({ id: p.id, nome: p.nome, cor: p.cor, conta: p.conta, anchor: p.anchor, fx: p.fx, fy: p.fy, temCursor: p.temCursor })); }
function sseEnvia(res, evt, obj) { try { res.write('event: ' + evt + '\ndata: ' + JSON.stringify(obj) + '\n\n'); } catch (e) {} }
function aovivoBroadcast(evt, obj, exceto) { for (const [id, r] of aovivoSSE) { if (id === exceto) continue; sseEnvia(r, evt, obj); } }
setInterval(() => { const t = Date.now(); for (const [id, p] of aovivo) { if (t - p.visto > 40000 && !aovivoSSE.has(id)) { aovivo.delete(id); aovivoBroadcast('saiu', { id }); } } }, 20000);

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
        zapiPronto: zapiPronto() && zapiCfg().ligado,
        gmCadencia: db.gmCadencia,
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
        gm: (b.gm === 'sim' || b.gm === 'nao') ? b.gm : '',
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
      // Se o post nasce com task, ESPERA o nome/status do ClickUp antes de responder (teto de
      // 4s). Antes isso era disparado e esquecido, então o card nascia como "sincronizando" e
      // só ganhava nome no próximo ciclo de fundo, até 75s depois. Se o ClickUp demorar mais
      // que o teto, responde assim mesmo e o nome chega no ciclo seguinte.
      if (slot.taskId) {
        await Promise.race([
          enrichSlots([slot]).catch(() => {}),
          new Promise(r => setTimeout(r, 4000)),
        ]);
      }
      const entrega = queueDue(slot);
      return json(res, 200, { ok: true, slot, entrega });
    }

    // ---------- PRÉVIA DA IMPORTAÇÃO: lê a ENTREGA de cada task e calcula o dia da postagem ----------
    // As tasks já nascem no ClickUp com a data em que precisam estar PRONTAS (sexta, no caso
    // do Zion). O post não sai nesse dia: sai no primeiro dia-da-semana escolhido a partir
    // dela (domingo). Assim a ordem não depende de como os links foram colados: cada post cai
    // onde a própria task manda.
    if (p === '/api/slots/importar/preview' && req.method === 'POST') {
      if (!config.token) return json(res, 400, { erro: 'sem token do ClickUp: não dá pra ler a data de entrega das tasks' });
      const b = await readBody(req);
      const links = Array.isArray(b.links) ? b.links.slice(0, 400) : [];
      const dow = Number.isInteger(b.dow) ? b.dow : 0; // 0 = domingo
      if (!links.length) return json(res, 400, { erro: 'nenhum link' });
      const ids = links.map(l => taskIdFromUrl(l) || String(l).trim());
      const tasks = await mapLimit([...new Set(ids)], 6, id => cuFetch(`/task/${id}`).then(t => ({ id, t })).catch(e => ({ id, erro: String(e.message || e) })));
      const porId = new Map(tasks.map(x => [x.id, x]));
      const linhas = ids.map((id, i) => {
        const r = porId.get(id);
        if (!r || r.erro || !r.t) return { taskId: id, link: links[i], erro: 'task não encontrada no ClickUp' };
        const due = r.t.due_date ? Number(r.t.due_date) : null;
        if (!due) return { taskId: id, link: links[i], nome: r.t.name || '', erro: 'task sem data de entrega' };
        const entrega = isoLocal(due);
        return { taskId: id, link: links[i], nome: r.t.name || '', status: normStatus(r.t.status?.status),
                 entrega, destino: proximoDiaDaSemana(entrega, dow) };
      });
      return json(res, 200, { ok: true, linhas });
    }

    // ---------- IMPORTAR EM LOTE: vários links do ClickUp viram posts de uma vez ----------
    // Pensado pra distribuir um banco de tasks prontas por uma sequência de dias (ex.: 75
    // posts, um em cada domingo). Um único registro de undo pro lote inteiro, então Ctrl+Z
    // desfaz a importação de uma vez, e não post por post.
    if (p === '/api/slots/importar' && req.method === 'POST') {
      const b = await readBody(req);
      if (!b.conta || !db.contas[b.conta]) return json(res, 400, { erro: 'conta inválida' });
      const itens = Array.isArray(b.itens) ? b.itens : [];
      if (!itens.length) return json(res, 400, { erro: 'nada pra importar' });
      if (itens.length > 400) return json(res, 400, { erro: 'lote grande demais (máximo 400 por vez)' });
      const criados = [];
      const pulados = [];
      for (const it of itens) {
        const date = /^\d{4}-\d{2}-\d{2}$/.test(it.date || '') ? it.date : null;
        const taskId = it.taskUrl ? taskIdFromUrl(it.taskUrl) : (it.taskId || null);
        if (!date) { pulados.push({ item: it, motivo: 'data inválida' }); continue; }
        // não duplica: mesma task no mesmo dia e na mesma conta já existe
        if (taskId && db.slots.some(x => x.taskId === taskId && x.date === date && x.conta === b.conta)) {
          pulados.push({ item: it, motivo: 'já existe nesse dia' }); continue;
        }
        criados.push({
          id: 's' + crypto.randomBytes(4).toString('hex'),
          conta: b.conta, date, taskId,
          titulo: it.titulo || null, formato: it.formato || '', angulo: it.angulo || '', obs: it.obs || '',
          notas: '', gm: '', collab: [], drive: '', linkRef: '', cat: '', fonteId: '',
          aprovado: false, postado: false, fixo: false, responsavelManual: '', origem: 'importado',
          tituloCache: null, statusCache: null, assigneeCache: null, dueCache: null, atualizadoEm: null,
        });
      }
      if (!criados.length) return json(res, 200, { ok: true, criados: 0, pulados: pulados.length, detalhes: pulados });
      undoSlots('importar ' + criados.length + ' posts', [], criados.map(s => s.id));
      db.slots.push(...criados); saveDb();
      // nome e status chegam em segundo plano: são muitos, não dá pra segurar a resposta
      enrichSlots(criados).catch(() => {});
      // De propósito NÃO chama queueDue: as tasks importadas já têm no ClickUp a data de
      // entrega que o Zion definiu. Enfileirar aqui encheria o "Aplicar datas" com 75 linhas
      // propondo mudar justamente o que ele acabou de configurar.
      return json(res, 200, { ok: true, criados: criados.length, pulados: pulados.length, detalhes: pulados });
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
      if ('gm' in b) slot.gm = (b.gm === 'sim' || b.gm === 'nao') ? b.gm : '';
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
    // ---------- teste do WhatsApp: manda uma mensagem agora e devolve o que a Z-API respondeu ----------
    if (p === '/api/zapi/teste' && req.method === 'POST') {
      if (!zapiPronto()) return json(res, 400, { erro: 'faltam dados: instância, token e número de destino' });
      const r = await zapiEnviar('✅ Teste do B.O.N.E. Se você recebeu isto, os avisos de "pra aprovar" vão chegar aqui.');
      if (!r.ok) return json(res, 502, { erro: r.detalhe });
      return json(res, 200, { ok: true, detalhe: r.detalhe });
    }

    // ---------- cadência automática de GM (SeuBoné) ----------
    if (p === '/api/gm-cadencia' && req.method === 'POST') {
      const b = await readBody(req);
      const c = db.gmCadencia;
      if ('ativo' in b) c.ativo = !!b.ativo;
      if ('ancora' in b) c.ancora = /^\d{4}-\d{2}-\d{2}$/.test(b.ancora || '') ? b.ancora : null;
      if ('periodo' in b) c.periodo = Math.max(1, Math.min(30, parseInt(b.periodo) || 3));
      if (!c.ancora) c.ativo = false; // sem âncora não tem como calcular
      saveDb();
      return json(res, 200, { ok: true, gmCadencia: c });
    }

    // ---------- presença ao vivo (cursores) ----------
    if (p === '/api/ao-vivo' && req.method === 'GET') {
      const id = (u.searchParams.get('id') || Math.random().toString(36).slice(2, 10)).slice(0, 24);
      let peer = aovivo.get(id);
      if (!peer) { peer = { id, nome: aovivoNomeLivre(), cor: aovivoCorLivre(), conta: null, anchor: null, fx: 0, fy: 0, temCursor: false, visto: Date.now() }; aovivo.set(id, peer); }
      res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no' });
      res.write('retry: 3000\n\n');
      aovivoSSE.set(id, res);
      sseEnvia(res, 'eu', { id: peer.id, nome: peer.nome, cor: peer.cor });
      sseEnvia(res, 'roster', aovivoRoster().filter(x => x.id !== id));
      aovivoBroadcast('entrou', { id: peer.id, nome: peer.nome, cor: peer.cor, conta: peer.conta, temCursor: false }, id);
      const ping = setInterval(() => { try { res.write(': ping\n\n'); } catch (e) {} }, 15000);
      req.on('close', () => { clearInterval(ping); aovivoSSE.delete(id); aovivo.delete(id); aovivoBroadcast('saiu', { id }); });
      return;
    }
    if (p === '/api/ao-vivo/mover' && req.method === 'POST') {
      const b = await readBody(req);
      const peer = aovivo.get(String(b.id || ''));
      if (!peer) return json(res, 200, { ok: false, reentrar: true });
      peer.conta = b.conta || null;
      peer.anchor = (b.anchor && b.anchor.t && b.anchor.k != null) ? { t: String(b.anchor.t), k: String(b.anchor.k) } : null;
      peer.fx = Math.max(0, Math.min(1, +b.fx || 0));
      peer.fy = Math.max(0, Math.min(1, +b.fy || 0));
      peer.temCursor = !!b.temCursor && !!peer.anchor;
      peer.visto = Date.now();
      aovivoBroadcast('mexeu', { id: peer.id, conta: peer.conta, anchor: peer.anchor, fx: peer.fx, fy: peer.fy, temCursor: peer.temCursor }, peer.id);
      return json(res, 200, { ok: true });
    }

    // ---------- manifesto e ícone do app instalável ----------
    if (p === '/manifest.webmanifest' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/manifest+json; charset=utf-8', 'Cache-Control': 'no-cache' });
      return res.end(JSON.stringify(MANIFESTO));
    }
    if (p === '/icone.png' && req.method === 'GET') {
      const buf = Buffer.from(ICONE_APP_B64, 'base64');
      res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': buf.length, 'Cache-Control': 'public, max-age=86400' });
      return res.end(buf);
    }

    if (p === '/api/config' && req.method === 'GET') {
      const z = zapiCfg();
      return json(res, 200, { hasToken: !!config.token, user: config.user || null, temSenha: !!config.senha,
        zapi: { pronto: zapiPronto(), ligado: z.ligado, porAmbiente: !!process.env.ZAPI_TOKEN,
                destino: z.destino ? ('•••• ' + z.destino.slice(-4)) : '' } });
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
      if ('zapi' in b && b.zapi && typeof b.zapi === 'object') {
        const z = config.zapi || {};
        for (const k of ['instancia', 'token', 'clientToken', 'destino']) {
          if (k in b.zapi) z[k] = String(b.zapi[k] || '').trim();
        }
        if ('ligado' in b.zapi) z.ligado = !!b.zapi.ligado;
        config.zapi = z; saveConfig(config);
      }
      const zc = zapiCfg();
      return json(res, 200, { ok: true, user: config.user || null, temSenha: !!config.senha,
        zapi: { pronto: zapiPronto(), ligado: zc.ligado, porAmbiente: !!process.env.ZAPI_TOKEN,
                destino: zc.destino ? ('•••• ' + zc.destino.slice(-4)) : '' } });
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
  console.log('  B.O.N.E (Bora Organizar Nossas Entregas) - Grupo SB · v' + VERSAO);
  console.log('  Aberto em: http://localhost:' + PORT);
  console.log('  (deixe esta janela aberta enquanto usa o painel)');
  console.log('');
});
