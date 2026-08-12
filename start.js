'use strict';
/*
 * start.js — lançador do painel para hospedagem GRATUITA (Render/Koyeb/qualquer Node).
 *
 * Por que ele existe: nuvem gratuita não tem disco fixo. Toda vez que a máquina
 * reinicia, o data.json local some. Este arquivo resolve isso SEM tocar no server.js:
 *
 *   1. Ao ligar: baixa o data.json de um repositório privado no GitHub.
 *   2. Sobe o server.js normal (nada nele muda).
 *   3. Fica de olho no arquivo: quando o painel salva, ele envia de volta pro GitHub.
 *      Cada envio vira um commit, então você ganha histórico/backup automático.
 *
 * Variáveis de ambiente:
 *   GH_TOKEN   (obrigatória) token fine-grained do GitHub com permissão Contents: Read and write
 *   GH_REPO    (obrigatória) "usuario/repositorio"
 *   GH_PATH    (opcional)    caminho do arquivo no repo. Padrão: data.json
 *   GH_BRANCH  (opcional)    branch. Padrão: main
 *   DATA_DIR   (opcional)    pasta de dados local. Padrão: ./data
 *
 * Sem GH_TOKEN ele roda em modo local (útil pra testar), avisando no log.
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = __dirname;
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
const DATA_FILE = path.join(DATA_DIR, 'data.json');

const GH = {
  token: (process.env.GH_TOKEN || '').trim(),
  repo: (process.env.GH_REPO || '').trim(),
  file: (process.env.GH_PATH || 'data.json').trim().replace(/^\/+/, ''),
  branch: (process.env.GH_BRANCH || 'main').trim(),
};
const API = process.env.GH_API || 'https://api.github.com';
const DEBOUNCE_MS = 15_000;   // espera parar de mexer antes de enviar
const SAFETY_MS = 5 * 60_000; // rede de segurança: envia a cada 5 min se algo ficou pendente

const log = (...a) => console.log('[nuvem]', ...a);

let remoteSha = null;
let remoteSlots = null;   // quantos posts existiam no arquivo remoto (trava anti-perda)
let bootstrapOk = false;
let pending = false;
let sending = false;
let timer = null;

function ghHeaders() {
  return {
    Authorization: 'Bearer ' + GH.token,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'central-de-posts',
  };
}

function contaSlots(texto) {
  try {
    const j = JSON.parse(texto);
    return Array.isArray(j.slots) ? j.slots.length : null;
  } catch { return null; }
}

async function ghGet() {
  const url = `${API}/repos/${GH.repo}/contents/${encodeURI(GH.file)}?ref=${encodeURIComponent(GH.branch)}`;
  const res = await fetch(url, { headers: ghHeaders() });
  if (res.status === 404) return { existe: false };
  if (!res.ok) throw new Error(`GitHub GET ${res.status}: ${(await res.text()).slice(0, 160)}`);
  const j = await res.json();
  let texto = '';
  if (j.content) texto = Buffer.from(j.content, 'base64').toString('utf8');
  else if (j.download_url) texto = await (await fetch(j.download_url, { headers: ghHeaders() })).text(); // arquivo > 1MB
  return { existe: true, sha: j.sha, texto };
}

async function ghPut(texto, sha) {
  const url = `${API}/repos/${GH.repo}/contents/${encodeURI(GH.file)}`;
  const body = {
    message: 'painel: dados ' + new Date().toISOString(),
    content: Buffer.from(texto, 'utf8').toString('base64'),
    branch: GH.branch,
  };
  if (sha) body.sha = sha;
  const res = await fetch(url, { method: 'PUT', headers: { ...ghHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`GitHub PUT ${res.status}: ${(await res.text()).slice(0, 160)}`);
  return (await res.json()).content.sha;
}

async function bootstrap() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!GH.token || !GH.repo) {
    log('MODO LOCAL: sem GH_TOKEN/GH_REPO, os dados ficam só nesta máquina (somem quando ela reinicia).');
    return;
  }
  try {
    const r = await ghGet();
    if (!r.existe) {
      log('nenhum backup no GitHub ainda. O primeiro salvamento do painel cria o arquivo.');
      bootstrapOk = true;
      return;
    }
    const n = contaSlots(r.texto);
    if (n === null) throw new Error('arquivo remoto não é um JSON válido do painel');
    fs.writeFileSync(DATA_FILE, r.texto);
    remoteSha = r.sha;
    remoteSlots = n;
    bootstrapOk = true;
    log(`dados restaurados do GitHub: ${n} posts.`);
  } catch (e) {
    log('FALHA ao restaurar do GitHub:', e.message);
    log('subindo assim mesmo, mas o envio automático fica DESLIGADO pra não sobrescrever seu backup.');
  }
}

async function enviar(motivo) {
  if (!GH.token || !GH.repo || !bootstrapOk || sending) return;
  if (!fs.existsSync(DATA_FILE)) return;
  sending = true;
  pending = false;
  try {
    const texto = fs.readFileSync(DATA_FILE, 'utf8');
    const n = contaSlots(texto);
    if (n === null) { log('arquivo local inválido agora, envio adiado.'); pending = true; return; }
    // trava anti-perda: nunca troca um backup cheio por um arquivo quase vazio
    if (remoteSlots != null && n < Math.max(1, Math.floor(remoteSlots * 0.5))) {
      log(`ENVIO BLOQUEADO: local tem ${n} posts e o backup tem ${remoteSlots}. Confira antes de continuar.`);
      return;
    }
    try {
      remoteSha = await ghPut(texto, remoteSha);
    } catch (e) {
      if (String(e.message).includes('409') || String(e.message).includes('422')) { // sha desatualizado
        const r = await ghGet();
        remoteSha = r.existe ? r.sha : null;
        remoteSha = await ghPut(texto, remoteSha);
      } else throw e;
    }
    remoteSlots = n;
    log(`salvo no GitHub (${n} posts) · ${motivo}`);
  } catch (e) {
    pending = true;
    log('falha ao salvar no GitHub:', e.message, '· tenta de novo em breve');
  } finally { sending = false; }
}

function agendar(motivo) {
  pending = true;
  clearTimeout(timer);
  timer = setTimeout(() => enviar(motivo), DEBOUNCE_MS);
}

function vigiar() {
  if (!GH.token || !GH.repo) return;
  try {
    fs.watch(DATA_DIR, (_evt, arquivo) => {
      if (arquivo && arquivo.replace(/\.tmp$/, '') === 'data.json') agendar('alteração no painel');
    });
    log('vigiando alterações em', DATA_FILE);
  } catch (e) {
    log('fs.watch indisponível, caindo pra verificação periódica:', e.message);
    let ultimo = 0;
    setInterval(() => {
      try {
        const m = fs.statSync(DATA_FILE).mtimeMs;
        if (m !== ultimo) { ultimo = m; agendar('alteração no painel'); }
      } catch {}
    }, 10_000);
  }
  setInterval(() => { if (pending) enviar('rede de segurança'); }, SAFETY_MS);
}

async function encerrar(sinal) {
  log('recebido', sinal, '- salvando antes de desligar...');
  clearTimeout(timer);
  await enviar('desligando');
  process.exit(0);
}

(async () => {
  await bootstrap();
  require('./server.js');   // sobe o painel de verdade, sem nenhuma alteração nele
  vigiar();
  process.on('SIGTERM', () => encerrar('SIGTERM'));
  process.on('SIGINT', () => encerrar('SIGINT'));
})();
