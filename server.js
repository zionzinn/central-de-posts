'use strict';
/*
 * B.O.N.E (Bora Organizar Nossas Entregas) - Grupo SB · v3.0 (neo brutal)
 * Servidor local (Node.js >= 18, sem dependências externas).
 * - data/data.json é o BANCO oficial (datas, posts, matriz, documentos, referências)
 * - v3.77: o ClickUp saiu (decisão 8). Cada post guarda só o LINK da task de produção;
 *   a próxima fonte de status/artes é o MKT Hub (API só leitura, v3.78)
 * - Undo universal no servidor (Ctrl+Z no front)
 * - Backup diário automático em data/backups
 */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { pipeline } = require('node:stream');
const zlib = require('node:zlib');
const { parseTab, slotKey, taskIdFromUrl } = require('./lib/sheet-parser.js');

const VERSAO = '3.77'; // precisa bater com FRONT_VERSAO no public/index.html
const PORT = process.env.PORT || 3777;
const ROOT = __dirname;
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data'); // na nuvem: aponte pro disco persistente
const DATA_FILE = path.join(DATA_DIR, 'data.json');
const CONFIG_FILE = process.env.CONFIG_FILE || path.join(ROOT, 'config.json');
const PUBLIC_DIR = path.join(ROOT, 'public');

// ---------------- storage ----------------
fs.mkdirSync(DATA_DIR, { recursive: true }); // garante a pasta de dados (útil na nuvem com disco novo)
if (!fs.existsSync(DATA_FILE)) {
  console.log('Primeira execução: gerando data.json a partir do retrato da planilha...');
  require('node:child_process').execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'seed.mjs')], { stdio: 'inherit' });
}
let db = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
// migrações leves (nunca destrutivas)
if (!Array.isArray(db.referencias)) db.referencias = [];
// matriz da SeuBoné: dias em que o card amarelo já foi gerado (pra não recriar o que você apagou ou arrastou)
if (!db.matrizSBGeradas || typeof db.matrizSBGeradas !== 'object' || Array.isArray(db.matrizSBGeradas)) db.matrizSBGeradas = {};
// cadência automática de GM (grande marca na capa) — só SeuBoné. ancora null = desligado até configurar.
if (!db.gmCadencia || typeof db.gmCadencia !== 'object' || Array.isArray(db.gmCadencia))
  db.gmCadencia = { ativo: false, ancora: null, periodo: 3 };
/**
 * Grava um arquivo sem nunca deixar ele pela metade (v3.71, pedido do Klenio pra VPS):
 * escreve num .tmp ao lado, força o conteúdo pro disco (fsync), troca pelo nome certo (rename,
 * que é atômico no mesmo disco) e força a pasta pro disco também. Se o processo ou a máquina cair
 * no meio, sobra o arquivo antigo inteiro ou o novo inteiro, nunca um pedaço.
 */
function gravaAtomico(arquivo, texto) {
  const tmp = arquivo + '.tmp';
  const fd = fs.openSync(tmp, 'w');
  try { fs.writeFileSync(fd, texto); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  fs.renameSync(tmp, arquivo);
  try { const d = fs.openSync(path.dirname(arquivo), 'r'); try { fs.fsyncSync(d); } finally { fs.closeSync(d); } } catch { /* Windows não abre pasta: tudo bem */ }
}
// Medidor de uso de banda (v3.72): quanto sai por mês e quanto é culpa dos documentos (lib/uso.js)
const USO = require('./lib/uso.js')({ db, fs, dataFile: DATA_FILE, limiteGB: +process.env.USO_LIMITE_GB || 5, comGitHub: !!(process.env.GH_TOKEN && process.env.GH_REPO), precoGB: +process.env.USO_PRECO_GB || 0.15 });
let saveTimer = null, savePendente = false;
/** Grava o banco AGORA se houver algo pendente. Se o disco falhar, não derruba o servidor: tenta de novo em 5 s. */
function gravarAgora() {
  clearTimeout(saveTimer); saveTimer = null;
  if (!savePendente) return true;
  try {
    gravaAtomico(DATA_FILE, JSON.stringify(db, null, 2));
    savePendente = false;
    try { USO.gravou(fs.statSync(DATA_FILE).size); } catch { /* só estatística */ }
    return true;
  } catch (e) {
    console.error('[gravação] não consegui salvar o data.json:', e.message, '· tento de novo em 5 s (os dados seguem na memória)');
    saveTimer = setTimeout(gravarAgora, 5000);
    return false;
  }
}
function saveDb() {
  savePendente = true;
  USO.invalida();                     // o resumo de uso (peso dos documentos) recalcula na próxima consulta
  clearTimeout(saveTimer);
  saveTimer = setTimeout(gravarAgora, 150);
}
// Desligou (deploy novo, docker stop, Ctrl+C): grava o que estiver pendente antes de sair.
// Rodando direto (node server.js, como na VPS) o servidor sai sozinho. Rodando pelo start.js, só grava
// e deixa o start.js mandar pro GitHub e encerrar (o handler dele roda depois deste).
for (const sinal of ['SIGTERM', 'SIGINT']) {
  process.on(sinal, () => {
    gravarAgora();
    if (require.main === module) { console.log('[' + sinal + '] dados gravados, encerrando.'); process.exit(0); }
  });
}

/** Backup avulso antes de mexer em massa nos dados: data/backups/data.backup-AAAA-MM-DD-HHMM.json (guarda os 10 últimos). */
function backupAgora(motivo) {
  gravarAgora();
  const dir = path.join(DATA_DIR, 'backups'); fs.mkdirSync(dir, { recursive: true });
  const d = new Date(), z = n => String(n).padStart(2, '0');
  const nome = 'data.backup-' + d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()) + '-' + z(d.getHours()) + z(d.getMinutes()) + '.json';
  gravaAtomico(path.join(dir, nome), JSON.stringify(db, null, 2));
  console.log('[backup] ' + nome + (motivo ? ' · ' + motivo : ''));
  const avulsos = fs.readdirSync(dir).filter(f => /^data\.backup-\d{4}-\d{2}-\d{2}-\d{4}\.json$/.test(f)).sort();
  while (avulsos.length > 10) { try { fs.unlinkSync(path.join(dir, avulsos.shift())); } catch { break; } }
  return nome;
}

function loadConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); } catch { return {}; }
}
function saveConfig(cfg) { gravaAtomico(CONFIG_FILE, JSON.stringify(cfg, null, 2)); }
let config = loadConfig();
// nuvem: variáveis de ambiente sobrepõem o config.json (senha/secret sem ficar em arquivo)
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
// Pauta do mês (link só-leitura, sem login). O token é derivado do secret, então é estável
// entre reinícios e deploys (no Render o secret vem do ambiente) e não precisa de arquivo.
// Pra invalidar todos os links já enviados: troque o secret.
// Com `aba`, o token é de UMA empresa só: quem tem o link da ONEVO não consegue ver as outras
// nem "alargar" o link tirando o parâmetro (o token não bate com o geral).
function pautaToken(aba) { return crypto.createHmac('sha256', config.secret).update('pauta-do-mes' + (aba ? ':' + aba : '')).digest('hex').slice(0, 24); }
function pautaTokenOk(t, aba) {
  const bom = pautaToken(aba || null), dado = String(t || '');
  if (dado.length !== bom.length) return false;
  try { return crypto.timingSafeEqual(Buffer.from(dado), Buffer.from(bom)); } catch { return false; }
}
function contasDaAbaSrv(aba) { return Object.entries(db.contas || {}).filter(([, c]) => c.aba === aba).map(([k]) => k); }
/** Sem acento, minúsculo e com espaço simples (comparar nomes e títulos). */
function semAcento(t) { return String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim(); }
// quem pode aparecer no "Quem faz" da matriz. Troque por RESPONSAVEIS no ambiente: "Nome A, Nome B".
const RESPONSAVEIS = (process.env.RESPONSAVEIS || process.env.CU_RESPONSAVEIS || 'Samuel Melo, Zion, Anny Beatriz, Klenio Braz').split(',').map(x => x.trim()).filter(Boolean);
/**
 * Link da task de produção (v3.77). Aceita qualquer endereço http. O id é o que identifica a task no card:
 * MKT Hub (MKT-1234), ClickUp antigo (app.clickup.com/t/ID) ou, pra outro sistema, um código curto do próprio link.
 */
function taskDoLink(link) {
  const u = String(link || '').trim();
  if (!u) return { taskId: null, taskUrl: null };
  // MKT Hub: o id (uuid) é o que se guarda; o código MKT-0001 é só o que se mostra (doc da API v1)
  const uuid = u.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  const mkt = u.match(/MKT-\d+/i);
  if (!/^https?:\/\//i.test(u)) {
    if (uuid && uuid[0].length === u.length) return { taskId: uuid[0].toLowerCase(), taskUrl: null };
    return mkt && mkt[0].length === u.length ? { taskId: mkt[0].toUpperCase(), taskUrl: null } : { taskId: null, taskUrl: null };
  }
  if (uuid) return { taskId: uuid[0].toLowerCase(), taskUrl: u };
  if (mkt) return { taskId: mkt[0].toUpperCase(), taskUrl: u };
  const cu = taskIdFromUrl(u);
  if (cu) return { taskId: cu, taskUrl: u };
  return { taskId: 'L' + crypto.createHash('sha1').update(u).digest('hex').slice(0, 10), taskUrl: u };
}

// ---------------- MATRIZ DE CONTEÚDO DA SEUBONÉ ----------------
// Cada dia do mês da SeuBoné nasce com um card AMARELO da matriz: o tipo do dia (Case, Educação...)
// vem da rotação A/B e a copywriter preenche formato, ângulo, tese, gancho... As regras moram em
// lib/matriz-seubone.js. O card só vira "post normal" quando alguém cola o link da task de produção nele.
const MZ = require('./lib/matriz-seubone.js');
const MZ_CONTA = 'seubone';
/** Dia já tem post da SeuBoné (próprio ou collab)? Então a matriz não põe card ali. */
function temPostSeubone(iso) {
  return db.slots.some(s => s.date === iso && (s.conta === MZ_CONTA || (s.collab || []).includes(MZ_CONTA)));
}
function novoSlotMatriz(iso, matrizSB) {
  return {
    id: 's' + crypto.randomBytes(4).toString('hex'),
    conta: MZ_CONTA, date: iso || null, taskId: null, titulo: null, formato: '', angulo: '', obs: '', notas: '',
    gm: '', collab: [], drive: '', linkRef: '', aprovado: false, postado: false, fixo: false,
    responsavelManual: '', origem: 'matriz', cat: '', fonteId: '', matrizSB,
    tituloCache: null, statusCache: null, assigneeCache: null, dueCache: null, atualizadoEm: new Date().toISOString(),
  };
}
/** Cria os cards da matriz nos dias VAZIOS de um mês.
    automático (forcar=false): cada dia só é gerado uma vez na vida; se você apagou ou arrastou o card,
    ele não volta. Manual (forcar=true, botão "gerar o mês"): preenche todo dia vazio de novo. */
function gerarMatrizSB(mes, { forcar = false, desde = null } = {}) {
  if (!db.contas[MZ_CONTA] || !/^\d{4}-\d{2}$/.test(String(mes || ''))) return [];
  const [y, m] = mes.split('-').map(Number);
  const ultimo = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const criados = [];
  for (let d = 1; d <= ultimo; d++) {
    const iso = mes + '-' + String(d).padStart(2, '0');
    if (desde && iso < desde) continue;
    if (!forcar && db.matrizSBGeradas[iso]) continue;
    if (temPostSeubone(iso)) continue;
    const slot = novoSlotMatriz(iso, MZ.novoParaDia(iso));
    db.slots.push(slot);
    db.matrizSBGeradas[iso] = true;
    criados.push(slot.id);
  }
  if (criados.length) saveDb();
  return criados;
}
function hojeRecife() { return new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Recife' }); }
function addMesIso(mes, n) { const [y, m] = mes.split('-').map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); return d.toISOString().slice(0, 7); }
let mzUltimoDia = null;
/** Uma vez por dia: garante a matriz de hoje até o fim do mês que vem depois do próximo (3 meses). */
function autoMatrizSB() {
  try {
    const hoje = hojeRecife();
    if (mzUltimoDia === hoje) return;
    mzUltimoDia = hoje;
    // backup único antes da primeira geração em massa (regra do projeto: nunca escrever em massa sem backup)
    const dir = path.join(DATA_DIR, 'backups'); fs.mkdirSync(dir, { recursive: true });
    const bk = path.join(dir, 'data-antes-matriz-seubone.json');
    if (!fs.existsSync(bk) && fs.existsSync(DATA_FILE)) fs.copyFileSync(DATA_FILE, bk);
    let n = 0;
    for (let i = 0; i < 3; i++) n += gerarMatrizSB(addMesIso(hoje.slice(0, 7), i), { desde: hoje }).length;
    if (n) console.log('[matriz SeuBoné] ' + n + ' card(s) criado(s) nos dias vazios');
  } catch (e) { console.log('[matriz SeuBoné] falhou:', e.message); }
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
function json(res, code, obj, extra) { return jsonTexto(res, code, JSON.stringify(obj), extra); }
function jsonTexto(res, code, body, extra) {
  const h = Object.assign({ 'Content-Type': 'application/json; charset=utf-8', Vary: 'Accept-Encoding' }, extra || {});
  // v3.70: comprime respostas maiores que 1 KB (o /api/state cai de ~93 KB pra ~18 KB).
  // Banda de saída do Render é contada e o plano grátis tem só 5 GB/mês.
  const aceitaGzip = /\bgzip\b/.test((res.req && res.req.headers['accept-encoding']) || '');
  if (aceitaGzip && body.length > 1024) {
    const gz = zlib.gzipSync(body, { level: 6 });
    h['Content-Encoding'] = 'gzip'; h['Content-Length'] = gz.length;
    res.writeHead(code, h);
    USO.resposta(gz.length);
    return res.end(gz);
  }
  h['Content-Length'] = Buffer.byteLength(body);
  res.writeHead(code, h);
  USO.resposta(h['Content-Length']);
  res.end(body);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    // junta os pedaços como Buffer e só decodifica no fim: acento cortado no meio de dois pedaços não corrompe o texto
    const partes = []; let tam = 0;
    req.on('data', c => { partes.push(c); tam += c.length; if (tam > 2e6) reject(new Error('body grande demais')); });
    req.on('end', () => { try { const data = Buffer.concat(partes).toString('utf8'); resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
const estaticoGz = new Map(); // arquivo -> { etag, gz } (comprime uma vez por versão do arquivo)
/**
 * Arquivos da tela (v3.72): com ETag, o navegador pergunta "mudou?" e, se não mudou, recebe só um 304
 * (antes baixava os 335 KB do painel a cada recarga). Texto vai comprimido (335 KB -> ~99 KB).
 * Deploy novo muda o arquivo, muda o ETag, e todo mundo recebe a versão nova na hora.
 */
function serveStatic(res, file) {
  const full = path.join(PUBLIC_DIR, path.normalize(file).replace(/^([.][.][/\\])+/, ''));
  let st = null;
  try { if (full.startsWith(PUBLIC_DIR)) st = fs.statSync(full); } catch { /* não existe */ }
  if (!st || !st.isFile()) { res.writeHead(404); USO.resposta(14); res.end('não encontrado'); return; }
  const tipo = MIME[path.extname(full)] || 'application/octet-stream';
  const etag = 'W/"' + st.size.toString(36) + '-' + Math.floor(st.mtimeMs).toString(36) + '"';
  const h = { 'Content-Type': tipo, 'Cache-Control': 'no-cache', ETag: etag, Vary: 'Accept-Encoding' };
  const req = res.req || { headers: {} };
  if (req.headers['if-none-match'] === etag) { res.writeHead(304, h); USO.resposta(0); return res.end(); }
  const comprime = /^(text\/|application\/(json|manifest))|javascript|svg/.test(tipo) && st.size > 1024 && st.size < 5e6
    && /\bgzip\b/.test(req.headers['accept-encoding'] || '');
  if (comprime) {
    let c = estaticoGz.get(full);
    if (!c || c.etag !== etag) { c = { etag, gz: zlib.gzipSync(fs.readFileSync(full), { level: 9 }) }; estaticoGz.set(full, c); }
    h['Content-Encoding'] = 'gzip'; h['Content-Length'] = c.gz.length;
    res.writeHead(200, h); USO.resposta(c.gz.length); return res.end(c.gz);
  }
  h['Content-Length'] = st.size;
  res.writeHead(200, h); USO.resposta(st.size);
  // pipeline (e não .pipe): se a leitura falhar, fecha a resposta em vez de derrubar o servidor
  pipeline(fs.createReadStream(full), res, () => {});
}

// ===== presença ao vivo: quem está online e em qual aba (via SSE, sem dependência) =====
// v3.73: sem cursores. Cada movimento de mouse virava um envio e um repasse pra todo mundo online:
// era o maior gasto de banda que sobrava. Agora só entrou/saiu/trocou de aba e o sinal de vida de 15 s.
const AOVIVO_CORES = ['#FF5D5D', '#FFB020', '#3DDC97', '#4DA3FF', '#C77DFF', '#FF7AC6', '#00D0C0', '#8AE234', '#FF9F1C', '#5E9BFF'];
const AOVIVO_BICHOS = ['Capivara Chique', 'Jacaré de Terno', 'Suricato Espião', 'Lagartixa MEI', 'Perereca Gamer', 'Gambá Perfumado', 'Pombo Sniper', 'Barata Ninja', 'Sapo Filósofo', 'Tatu Blindado', 'Preguiça Turbo', 'Ornitorrinco Confuso', 'Minhoca Executiva', 'Tamanduá Detetive', 'Quati Boêmio', 'Coruja Insone', 'Morcego Vegano', 'Lontra DJ', 'Furão Hacker', 'Cutia Ansiosa', 'Tucano Influencer', 'Bode Expiatório', 'Peixe-boi Voador', 'Galinha Cyberpunk', 'Porco Espião', 'Jegue Turbinado', 'Camaleão Indeciso', 'Pangolim Blindado', 'Jabuti Foguete', 'Preguiça CLT'];
const aovivo = new Map();      // id -> { id, nome, icone, cor, conta, visto }
const aovivoSSE = new Map();   // id -> res (conexão aberta)
function aovivoCorLivre() { const usadas = new Set([...aovivo.values()].map(p => p.cor)); return AOVIVO_CORES.find(c => !usadas.has(c)) || AOVIVO_CORES[Math.floor(Math.random() * AOVIVO_CORES.length)]; }
function aovivoNomeLivre() { const usados = new Set([...aovivo.values()].map(p => p.nome)); const livres = AOVIVO_BICHOS.filter(n => !usados.has(n)); const pool = livres.length ? livres : AOVIVO_BICHOS; return pool[Math.floor(Math.random() * pool.length)]; }
function aovivoRoster() { return [...aovivo.values()].map(p => ({ id: p.id, nome: p.nome, icone: p.icone || '', cor: p.cor, conta: p.conta })); }
/** Limpa o perfil vindo do navegador: nome curto sem tag, ícone curto (emoji), cor em hex. */
function aovivoPerfilLimpo(b) {
  const nome = String(b.nome || '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 24);
  const icone = String(b.icone || '').trim().slice(0, 8);
  const cor = /^#[0-9a-fA-F]{6}$/.test(String(b.cor || '')) ? String(b.cor) : '';
  return { nome, icone, cor };
}
function sseEnvia(res, evt, obj) { try { const t = 'event: ' + evt + '\ndata: ' + JSON.stringify(obj) + '\n\n'; res.write(t); USO.bruto(Buffer.byteLength(t)); } catch (e) {} }
function aovivoBroadcast(evt, obj, exceto) { for (const [id, r] of aovivoSSE) { if (id === exceto) continue; sseEnvia(r, evt, obj); } }
setInterval(() => { const t = Date.now(); for (const [id, p] of aovivo) { if (t - p.visto > 40000 && !aovivoSSE.has(id)) { aovivo.delete(id); aovivoBroadcast('saiu', { id }); } } }, 20000);

// Documentos (a copy do post, editor estilo Docs em public/doc.html). Rotas em lib/docs.js.
const rotaDocs = require('./lib/docs.js')({ db, saveDb, readBody, json, pushUndo, MZ, backupAgora, usoInvalida: () => USO.invalida() });

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://localhost:${PORT}`);
  const p = u.pathname;
  try {
    // ---------- ping (v3.72): pro cron-job.org manter o Render acordado gastando 2 bytes ----------
    if (p === '/api/ping' && (req.method === 'GET' || req.method === 'HEAD')) {
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Length': 2 });
      USO.resposta(2); return res.end(req.method === 'HEAD' ? undefined : 'ok');
    }
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
    // Rotas públicas da pauta (validam o próprio token).
    const rotaPublica = p === '/api/login' || p === '/api/logout' || p === '/api/pauta' || p === '/api/pauta/obs' || p === '/api/pauta/sugestao' || p === '/api/pauta/parecer';
    if (config.senha && p.startsWith('/api/') && !rotaPublica) {
      if (!validAuthToken(parseCookies(req.headers.cookie).sb_auth)) return json(res, 401, { erro: 'login', precisaLogin: true });
    }

    // ---------- documentos (copy) ----------
    if (p.startsWith('/api/docs') && await rotaDocs(req, res, p, u)) return;

    // ---------- pauta do mês: página só-leitura pra compartilhar por link (sem login, com token) ----------
    if (p === '/api/pauta' && req.method === 'GET') {
      const aba = u.searchParams.get('aba') || null;                 // escopo: uma empresa só, ou tudo
      if (aba && !(db.abas || []).includes(aba)) return json(res, 401, { erro: 'link inválido' });
      if (!pautaTokenOk(u.searchParams.get('token'), aba)) return json(res, 401, { erro: 'link inválido' });
      const mesQ = u.searchParams.get('mes') || '';
      const mes = /^\d{4}-\d{2}$/.test(mesQ) ? mesQ : new Date().toISOString().slice(0, 7);
      const contasOk = aba ? contasDaAbaSrv(aba) : null;
      const slots = db.slots.filter(s => s.date && s.date.startsWith(mes) && (!contasOk || contasOk.includes(s.conta))).map(s => ({
        id: s.id, conta: s.conta, date: s.date,
        titulo: s.titulo || s.tituloCache || '', formato: s.formato || '', angulo: s.angulo || '', gm: s.gm || '',
        postado: !!s.postado, vaga: !!s.vaga, taskId: s.taskId || null, taskUrl: s.taskUrl || null, origem: s.origem || '',
        obs: s.origem === 'banco' ? (s.obs || '') : '',
        notas: s.notas || '',   // observações do post (as do painel + as que chegam pela pauta)
        sugestao: !!s.sugestao, sugeridoPor: s.sugeridoPor || '',
        parecer: s.parecer || null,                       // aprovado/reprovado pela pauta, com motivo
        matrizSB: s.matrizSB || null,                     // card da matriz (SeuBoné): tipo, tema, tese, gancho...
        statusCache: s.statusCache ? { status: s.statusCache.status, color: s.statusCache.color } : null,
        responsavel: s.assigneeCache || s.responsavelManual || '',
      }));
      const gc = db.gmCadencia || {};
      const gmAncoras = [...new Set([
        ...(gc.ancora ? [gc.ancora] : []),
        ...db.slots.filter(s => s.conta === 'seubone' && s.gm === 'sim' && s.date).map(s => s.date),
      ])].sort();
      res.setHeader('Cache-Control', 'no-store');
      return json(res, 200, { mes, escopo: aba, contas: db.contas, abas: aba ? [aba] : db.abas, gmCadencia: { ativo: !!gc.ativo, periodo: gc.periodo || 3 }, gmAncoras, slots, matrizTipos: MZ.TIPOS, temFonte: false, geradoEm: Date.now() });
    }
    // observação vinda pela pauta: ANEXA no caderno do post (nunca apaga o que já estava), com nome e hora
    if (p === '/api/pauta/obs' && req.method === 'POST') {
      const b = await readBody(req);
      const aba = b.aba || null;
      if (aba && !(db.abas || []).includes(aba)) return json(res, 401, { erro: 'link inválido' });
      if (!pautaTokenOk(b.token, aba)) return json(res, 401, { erro: 'link inválido' });
      const texto = String(b.texto || '').replace(/[<>]/g, '').trim().slice(0, 1500);
      if (!texto) return json(res, 400, { erro: 'escreva algo' });
      const nome = String(b.nome || '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 40) || 'alguém pela pauta';
      const contasOk = aba ? contasDaAbaSrv(aba) : null;
      const slot = db.slots.find(s => s.id === String(b.id || '') && s.date && (!contasOk || contasOk.includes(s.conta)));
      if (!slot) return json(res, 403, { erro: 'post fora do escopo deste link' });
      const quando = new Date().toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Recife' });
      const linha = '• ' + nome + ', ' + quando + ' (pela pauta): ' + texto;
      slot.notas = (slot.notas ? slot.notas.replace(/\s+$/, '') + '\n\n' : '') + linha;
      saveDb();
      return json(res, 200, { ok: true, notas: slot.notas });
    }
    // parecer pela pauta: aprovado ou alteração (com motivo), em qualquer post, pronto ou não.
    // v3.77: fica gravado no post (selo no card do painel) e cai nas observações. Não mexe em sistema nenhum.
    if (p === '/api/pauta/parecer' && req.method === 'POST') {
      const b = await readBody(req);
      const aba = b.aba || null;
      if (aba && !(db.abas || []).includes(aba)) return json(res, 401, { erro: 'link inválido' });
      if (!pautaTokenOk(b.token, aba)) return json(res, 401, { erro: 'link inválido' });
      const veredito = b.veredito === 'aprovado' ? 'aprovado' : ((b.veredito === 'alterar' || b.veredito === 'reprovado') ? 'alterar' : '');
      if (!veredito) return json(res, 400, { erro: 'veredito inválido' });
      const motivo = String(b.motivo || '').replace(/[<>]/g, '').trim().slice(0, 1500);
      if (veredito === 'alterar' && !motivo) return json(res, 400, { erro: 'diga o que precisa mudar' });
      const nome = String(b.nome || '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 40) || 'alguém pela pauta';
      const contasOk = aba ? contasDaAbaSrv(aba) : null;
      const slot = db.slots.find(s => s.id === String(b.id || '') && s.date && (!contasOk || contasOk.includes(s.conta)));
      if (!slot) return json(res, 403, { erro: 'post fora do escopo deste link' });
      const quando = new Date().toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Recife' });
      slot.parecer = { veredito, motivo, por: nome, quando: Date.now() };
      const linha = (veredito === 'aprovado' ? '✅ Aprovado por ' : '✏️ Alteração pedida por ') + nome + ', ' + quando + ' (pela pauta)' + (motivo ? ': ' + motivo : '');
      slot.notas = (slot.notas ? slot.notas.replace(/\s+$/, '') + '\n\n' : '') + linha;
      saveDb();
      return json(res, 200, { ok: true, parecer: slot.parecer, notas: slot.notas });
    }
    // sugestão de post num dia vazio, vinda pela pauta: vira um card "SUGESTÃO" naquele dia (sem task).
    // Você aceita colando o link da task nele (a marca de sugestão cai sozinha) ou apaga.
    if (p === '/api/pauta/sugestao' && req.method === 'POST') {
      const b = await readBody(req);
      const aba = b.aba || null;
      if (aba && !(db.abas || []).includes(aba)) return json(res, 401, { erro: 'link inválido' });
      if (!pautaTokenOk(b.token, aba)) return json(res, 401, { erro: 'link inválido' });
      const date = String(b.date || '');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json(res, 400, { erro: 'dia inválido' });
      const conta = String(b.conta || '');
      if (!db.contas[conta]) return json(res, 400, { erro: 'conta inválida' });
      if (aba && !contasDaAbaSrv(aba).includes(conta)) return json(res, 403, { erro: 'conta fora do escopo deste link' });
      const texto = String(b.texto || '').replace(/[<>]/g, '').trim().slice(0, 1500);
      if (!texto) return json(res, 400, { erro: 'escreva a ideia' });
      const nome = String(b.nome || '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 40) || 'alguém pela pauta';
      const formato = ['estático', 'carrossel', 'reels', 'story'].includes(b.formato) ? b.formato : '';
      const quando = new Date().toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Recife' });
      const slot = {
        id: 's' + crypto.randomBytes(4).toString('hex'),
        conta, date, taskId: null,
        titulo: 'SUGESTÃO: ' + texto.split('\n')[0].slice(0, 70), formato, angulo: '', obs: '',
        notas: '• ' + nome + ', ' + quando + ' (sugestão pela pauta): ' + texto,
        gm: '', collab: [], drive: '', linkRef: '', aprovado: false, postado: false, fixo: false,
        responsavelManual: '', origem: 'pauta', cat: '', fonteId: '', sugestao: true, sugeridoPor: nome,
        tituloCache: null, statusCache: null, assigneeCache: null, dueCache: null, atualizadoEm: null,
      };
      db.slots.push(slot); saveDb();
      return json(res, 200, { ok: true, slot: { id: slot.id, conta, date, titulo: slot.titulo, formato, notas: slot.notas, sugestao: true, sugeridoPor: nome } });
    }
    if (p === '/api/pauta/link' && req.method === 'GET') {
      const aba = u.searchParams.get('aba') || null;
      if (aba && !(db.abas || []).includes(aba)) return json(res, 400, { erro: 'conta desconhecida' });
      return json(res, 200, { token: pautaToken(aba), escopo: aba });
    }
    if (p === '/pauta' && req.method === 'GET') return serveStatic(res, 'pauta.html');

    // ---------- estado ----------
    if (p === '/api/state' && req.method === 'GET') {
      const month = u.searchParams.get('month'); // "2026-07"
      let slots = db.slots;
      if (month) {
        // além do mês pedido, inclui a janela de produção (hoje-7 a hoje+10)
        const isoDe = ms => { const d = new Date(ms); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
        const lo = isoDe(Date.now() - 7 * 86_400_000), hi = isoDe(Date.now() + 10 * 86_400_000);
        slots = slots.filter(s => !s.date || s.date.startsWith(month) || (s.date >= lo && s.date <= hi));
      }
      const corpo = JSON.stringify({
        versao: VERSAO,
        contas: db.contas, abas: db.abas,
        slots, referencias: db.referencias,
        temFonte: false,                                  // v3.78: true quando o MKT Hub estiver ligado (status, artes e comentários das tasks)
        temSenha: !!config.senha,
        gmCadencia: db.gmCadencia,
        uso: USO.curto(),
        matrizSB: { conta: MZ_CONTA, tipos: MZ.TIPOS, semanas: MZ.SEMANAS, ancora: MZ.ANCORA, status: MZ.STATUS, obrigatorios: MZ.OBRIGATORIOS, regras: MZ.REGRAS, checklist: MZ.CHECKLIST, responsaveis: RESPONSAVEIS, glossario: MZ.GLOSSARIO },
      });
      // v3.72: o painel pergunta a cada 20 s; se nada mudou, a resposta é um 304 de ~0,3 KB em vez de ~17 KB.
      // O navegador guarda a última resposta e devolve ela pro painel sozinho (nada muda no front).
      const etag = 'W/"' + crypto.createHash('md5').update(corpo).digest('hex').slice(0, 20) + '"';
      if (req.headers['if-none-match'] === etag) { res.writeHead(304, { ETag: etag, 'Cache-Control': 'no-cache', Vary: 'Accept-Encoding' }); USO.resposta(0); return res.end(); }
      return jsonTexto(res, 200, corpo, { ETag: etag, 'Cache-Control': 'no-cache' });
    }

    // ---------- uso de banda do mês (v3.72) ----------
    if (p === '/api/uso' && req.method === 'GET') return json(res, 200, USO.resumo());

    // ---------- criar post (calendário, banco ou criativo) ----------
    // matriz da SeuBoné: preencher os dias vazios de um mês (botão)
    if (p === '/api/matriz-sb/gerar' && req.method === 'POST') {
      const b = await readBody(req);
      if (!/^\d{4}-\d{2}$/.test(String(b.mes || ''))) return json(res, 400, { erro: 'mês inválido' });
      const criados = gerarMatrizSB(b.mes, { forcar: true });
      if (criados.length) undoSlots('gerar matriz da SeuBoné (' + criados.length + ' card' + (criados.length === 1 ? '' : 's') + ')', [], criados);
      return json(res, 200, { ok: true, criados: criados.length });
    }
    if (p === '/api/slots' && req.method === 'POST') {
      const b = await readBody(req);
      if (!b.conta || !db.contas[b.conta]) return json(res, 400, { erro: 'conta inválida' });
      const lk = b.taskUrl ? taskDoLink(b.taskUrl) : { taskId: b.taskId || null, taskUrl: null };
      const slot = {
        id: 's' + crypto.randomBytes(4).toString('hex'),
        conta: b.conta, date: b.date || null,
        taskId: lk.taskId, taskUrl: lk.taskUrl,
        titulo: b.titulo || null, formato: b.formato || '', angulo: b.angulo || '', obs: b.obs || '',
        notas: typeof b.notas === 'string' ? b.notas : '', // caderno livre do post (só do painel)
        gm: (b.gm === 'sim' || b.gm === 'nao') ? b.gm : '',
        collab: Array.isArray(b.collab) ? b.collab.filter(c => db.contas[c] && c !== b.conta) : [],
        drive: b.drive || '', linkRef: b.linkRef || '', aprovado: false, postado: false, fixo: false,
        responsavelManual: String(b.responsavelManual || '').slice(0, 80), origem: ['criativo', 'banco'].includes(b.origem) ? b.origem : 'painel',
        ...(b.matrizSB ? { matrizSB: MZ.limpa(Object.assign({ tipo: b.date ? (MZ.tipoDoDia(b.date).tipo || '') : '' }, b.matrizSB)) } : {}),
        cat: typeof b.cat === 'string' ? b.cat : '', // categoria dentro do banco (ex.: conselho, corte-reels, outros)
        fonteId: typeof b.fonteId === 'string' ? b.fonteId : '', // id do item do banco que gerou este post
        tituloCache: null, statusCache: null, assigneeCache: null, dueCache: null, atualizadoEm: null,
      };
      // VAGA = "falta criar este post". Só faz sentido sem task: se já tem task, não falta criar.
      if (b.vaga && !slot.taskId) slot.vaga = true;
      if (slot.matrizSB) { slot.origem = 'matriz'; if (slot.date) db.matrizSBGeradas[slot.date] = true; }
      undoSlots(slot.vaga ? 'sinalizar falta criar' : (slot.matrizSB ? 'novo card da matriz' : 'novo post'), [], [slot.id]);
      db.slots.push(slot); saveDb();
      return json(res, 200, { ok: true, slot });
    }

    // ---------- EMPURRAR / REAJUSTAR: este post + todos os seguintes da conta ----------
    // DELTA PURO: a base e todos os posts seguintes da MESMA conta (data >= base) andam
    // EXATAMENTE o mesmo tanto de dias. Fixos (pino) e postados não se movem. Sem desvio
    // esperto: mantém o espaçamento e é previsível (arrastou +1, todo mundo +1).
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
        for (const s of mover) s.date = addDiaISO(s.date, dias);
        saveDb();
      }
      return json(res, 200, { ok: true, movidos: mover.length });
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
        for (const s of validos) s.date = op === 'banco' ? null : addDiaISO(s.date, dias);
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
          if (i >= 0) db.slots[i] = cp; else db.slots.push(cp);
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
        'matrizSB' in b ? 'editar card da matriz' :
        'aprovado' in b ? 'mudar aprovação da arte' :
        'fixo' in b ? 'mudar pino de data fixa' :
        'collab' in b ? (Array.isArray(b.collab) && b.collab.length ? 'marcar collab' : 'tirar collab') :
        'formato' in b && Object.keys(b).length === 1 ? 'mudar formato' : 'editar post';
      undoSlots(descUndo, [slot]);
      if (trocaConta) slot.conta = b.conta; // ANTES do collab: collab não pode conter a própria conta
      if ('date' in b) slot.date = b.date || null;
      for (const k of ['titulo', 'formato', 'obs', 'drive', 'linkRef', 'angulo', 'notas']) if (k in b) slot[k] = b[k] || '';
      if ('matrizSB' in b) {                                               // campos da matriz da SeuBoné
        slot.matrizSB = MZ.limpa(b.matrizSB, slot.matrizSB);
        if (slot.matrizSB) slot.postado = slot.matrizSB.status === 'Postado'; // status da matriz e "postado" andam juntos
      }
      if ('responsavelManual' in b) slot.responsavelManual = String(b.responsavelManual || '').slice(0, 80);
      // curadoria das artes pra pauta: quais ficam escondidas e em que ordem aparecem (chave = id ou nome do arquivo)
      const listaStr = v => Array.isArray(v) ? v.map(x => String(x).slice(0, 200)).filter(Boolean).slice(0, 200) : [];
      if ('artesOcultas' in b) slot.artesOcultas = listaStr(b.artesOcultas);
      if ('artesOrdem' in b) slot.artesOrdem = listaStr(b.artesOrdem);
      if ('postado' in b) {
        slot.postado = !!b.postado;
        if (slot.matrizSB) slot.matrizSB.status = slot.postado ? 'Postado' : (slot.matrizSB.status === 'Postado' ? 'Aprovado' : slot.matrizSB.status);
      }
      if ('gm' in b) slot.gm = (b.gm === 'sim' || b.gm === 'nao') ? b.gm : '';
      if ('vaga' in b) slot.vaga = !!b.vaga; // vaga = falta criar este post
      if ('cat' in b) slot.cat = typeof b.cat === 'string' ? b.cat : '';
      if ('aprovado' in b) slot.aprovado = !!b.aprovado;
      if ('fixo' in b) slot.fixo = !!b.fixo;
      if ('collab' in b) slot.collab = Array.isArray(b.collab) ? b.collab.filter(c => db.contas[c] && c !== slot.conta) : [];
      // trocou de conta sem mandar collab: tira a nova conta própria do collab (ninguém faz collab consigo)
      if (trocaConta) slot.collab = (slot.collab || []).filter(c => c !== slot.conta);
      if ('taskUrl' in b) {
        const lk = taskDoLink(b.taskUrl);
        const antes = slot.taskUrl || (slot.taskId ? 'https://app.clickup.com/t/' + slot.taskId : '');
        if (lk.taskUrl !== antes || lk.taskId !== slot.taskId) {
          const trocou = lk.taskId !== slot.taskId;
          slot.taskId = lk.taskId; slot.taskUrl = lk.taskUrl;
          if (trocou) { slot.statusCache = null; slot.tituloCache = null; slot.assigneeCache = null; slot.dueCache = null; }
        }
        // colou a task: o post foi criado, então a vaga cai sozinha (Ctrl+Z devolve tudo junto)
        if (slot.taskId) { slot.vaga = false; slot.sugestao = false; }
      }
      saveDb();
      return json(res, 200, { ok: true, slot });
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

    // ---------- cadência automática de GM (SeuBoné) ----------
    if (p === '/api/gm-cadencia' && req.method === 'POST') {
      const b = await readBody(req);
      const c = db.gmCadencia;
      if ('ativo' in b) c.ativo = !!b.ativo;
      if ('ancora' in b) c.ancora = /^\d{4}-\d{2}-\d{2}$/.test(b.ancora || '') ? b.ancora : null;
      if ('periodo' in b) c.periodo = Math.max(1, Math.min(30, parseInt(b.periodo) || 3));
      // âncora agora é só o ponto de partida: a cadência rola a partir das grandes marcas reais (gm='sim').
      // Por isso não desliga mais quando a âncora vem vazia.
      saveDb();
      return json(res, 200, { ok: true, gmCadencia: c });
    }

    // ---------- presença ao vivo (cursores) ----------
    if (p === '/api/ao-vivo' && req.method === 'GET') {
      const id = (u.searchParams.get('id') || Math.random().toString(36).slice(2, 10)).slice(0, 24);
      // perfil escolhido pela pessoa (nome + ícone + cor). Sem perfil, cai no bicho aleatório só como quebra-galho.
      const pf = aovivoPerfilLimpo({ nome: u.searchParams.get('nome'), icone: u.searchParams.get('icone'), cor: u.searchParams.get('cor') });
      const conta = String(u.searchParams.get('conta') || '').slice(0, 40) || null;
      let peer = aovivo.get(id);
      if (!peer) { peer = { id, nome: pf.nome || aovivoNomeLivre(), icone: pf.icone || '', cor: pf.cor || aovivoCorLivre(), conta, visto: Date.now() }; aovivo.set(id, peer); }
      else { if (pf.nome) peer.nome = pf.nome; if (pf.icone) peer.icone = pf.icone; if (pf.cor) peer.cor = pf.cor; peer.conta = conta || peer.conta; peer.visto = Date.now(); }
      res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no' });
      res.write('retry: 3000\n\n');
      aovivoSSE.set(id, res);
      sseEnvia(res, 'eu', { id: peer.id, nome: peer.nome, icone: peer.icone, cor: peer.cor });
      sseEnvia(res, 'roster', aovivoRoster().filter(x => x.id !== id));
      aovivoBroadcast('entrou', { id: peer.id, nome: peer.nome, icone: peer.icone, cor: peer.cor, conta: peer.conta }, id);
      const ping = setInterval(() => { try { res.write(': ping\n\n'); USO.bruto(8); } catch (e) {} }, 15000);
      req.on('close', () => { clearInterval(ping); aovivoSSE.delete(id); aovivo.delete(id); aovivoBroadcast('saiu', { id }); });
      return;
    }
    // trocou de aba: avisa os outros (1 envio por troca). /mover é a rota das telas antigas (v3.72 ou antes)
    // que ainda estejam abertas: não repassa mais posição de cursor, só a aba, até a pessoa recarregar.
    if ((p === '/api/ao-vivo/aba' || p === '/api/ao-vivo/mover') && req.method === 'POST') {
      const b = await readBody(req);
      const peer = aovivo.get(String(b.id || ''));
      if (!peer) return json(res, 200, { ok: false, reentrar: true });
      peer.visto = Date.now();
      const conta = String(b.conta || '').slice(0, 40) || null;
      if (conta !== peer.conta) { peer.conta = conta; aovivoBroadcast('aba', { id: peer.id, conta }, peer.id); }
      res.writeHead(204); USO.resposta(0); return res.end();
    }
    // a pessoa mudou o perfil (nome/ícone/cor): atualiza em memória e avisa os outros sem derrubar a conexão
    if (p === '/api/ao-vivo/perfil' && req.method === 'POST') {
      const b = await readBody(req);
      const peer = aovivo.get(String(b.id || ''));
      if (!peer) return json(res, 200, { ok: false, reentrar: true });
      const pf = aovivoPerfilLimpo(b);
      if (pf.nome) peer.nome = pf.nome;
      peer.icone = pf.icone || '';
      if (pf.cor) peer.cor = pf.cor;
      peer.visto = Date.now();
      aovivoBroadcast('entrou', { id: peer.id, nome: peer.nome, icone: peer.icone, cor: peer.cor, conta: peer.conta }, peer.id);
      return json(res, 200, { ok: true, nome: peer.nome, icone: peer.icone, cor: peer.cor });
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

    if (p === '/api/config' && req.method === 'GET') return json(res, 200, { temSenha: !!config.senha });
    if (p === '/api/config' && req.method === 'POST') {
      const b = await readBody(req);
      // senha de acesso (login pro túnel): seta/troca/remove sem precisar mexer no token
      if ('senha' in b) { config.senha = String(b.senha || '').trim(); saveConfig(config); }
      return json(res, 200, { ok: true, temSenha: !!config.senha });
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
    json(res, 500, { erro: msg, code: e.code || null });
  }
});

// ---------------- limpeza da v3.77 (uma vez só) ----------------
// Pedido do Zion em 27/09/2026: tirar as tasks de catálogo da SeuBoné que ainda não foram postadas e deixar só a
// matriz nesses dias. As removidas ficam guardadas 30 dias em db.removidosV377 (dá pra devolver) e o histórico do
// GitHub dos dados tem o antes. Também some o que era só do ClickUp: fila de datas pendentes e memória de avisos.
function limpezaV377() {
  try {
    if (!db.migracoes || typeof db.migracoes !== 'object') db.migracoes = {};
    if (db.removidosV377 && Date.now() > Date.parse(db.removidosV377.ate || 0)) { delete db.removidosV377; saveDb(); }
    if (db.migracoes.v377) return;
    backupAgora('antes da limpeza v3.77 (catálogo e ClickUp)');
    const hoje = hojeRecife();
    const ehCatalogo = s => s.conta === MZ_CONTA && !s.postado && !(s.matrizSB && !s.taskId)
      && /catalogo/.test(semAcento((s.titulo || '') + ' ' + (s.tituloCache || '')));
    const alvo = db.slots.filter(ehCatalogo);
    if (alvo.length) {
      db.removidosV377 = {
        em: new Date().toISOString(), ate: new Date(Date.now() + 30 * 86400000).toISOString(),
        motivo: 'tasks de catálogo da SeuBoné ainda não postadas (pedido do Zion em 27/09/2026)',
        slots: alvo.map(copiaSlot),
      };
      const fora = new Set(alvo.map(s => s.id));
      db.slots = db.slots.filter(s => !fora.has(s.id));
    }
    // matriz no lugar, de hoje em diante, só nos dias que ficaram vazios
    let matriz = 0;
    for (const d of [...new Set(alvo.map(s => s.date).filter(d => d && d >= hoje))].sort()) {
      if (temPostSeubone(d)) continue;
      db.slots.push(novoSlotMatriz(d, MZ.novoParaDia(d)));
      db.matrizSBGeradas[d] = true;
      matriz++;
    }
    delete db.dueSync; delete db.avisos; delete db.statusColors;   // restos do ClickUp
    // só os números: as cópias completas ficam 30 dias em db.removidosV377 e no backup (cada KB aqui vai pro GitHub a cada gravação)
    db.migracoes.v377 = { em: new Date().toISOString(), catalogoRemovidos: alvo.length, matrizCriada: matriz };
    saveDb();
    console.log('[v3.77] ' + alvo.length + ' task(s) de catálogo tirada(s), ' + matriz + ' card(s) da matriz no lugar');
  } catch (e) { console.log('[v3.77] limpeza falhou:', e.message); }
}

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
limpezaV377();                                    // antes da matriz do dia: os dias que ficarem vazios ganham o card dela
autoMatrizSB();                                   // depois do backup do dia
setInterval(autoMatrizSB, 3600_000);

server.listen(PORT, () => {
  console.log('');
  console.log('  B.O.N.E (Bora Organizar Nossas Entregas) - Grupo SB · v' + VERSAO);
  console.log('  Aberto em: http://localhost:' + PORT);
  console.log('  (deixe esta janela aberta enquanto usa o painel)');
  console.log('');
});
