// v3.96: o nome do arquivo (ou da pasta) no Google Drive a partir do link. Pedido do Zion em 01/10/2026: "preciso que o
// link fique com o título do Drive (e me dê a opção de colocar um também)". Lê a página pública do Drive (og:title ou
// <title>), sem chave e sem login: só funciona com o link aberto ("Qualquer pessoa com o link"). Link restrito volta
// sem nome e a tela avisa (aí o ADMIN dá o título).
// Segurança: o servidor só busca endereço do Drive e do Docs do Google, montado aqui a partir do id do arquivo (nunca o
// endereço que o usuário colou), com tempo máximo e lendo só o começo da página.
// Teste: DRIVE_ORIGEM_TESTE troca https://drive.google.com (e https://docs.google.com, em /_docs) por um servidor local.
'use strict';
const HOSTS = new Set(['drive.google.com', 'docs.google.com']);
const MAX_BYTES = 400 * 1024;
const TEMPO_MS = 4000;
const UA = 'Mozilla/5.0 (compatible; BONE-GrupoSB/3.96; +https://central-de-posts-v2.onrender.com)';

/** Link do Drive (arquivo, pasta, documento, planilha ou apresentação) no endereço que dá pra ler; outro link, null. */
function linkDoDrive(url) {
  let u; try { u = new URL(String(url || '').trim()); } catch (e) { return null; }
  if (!/^https?:$/.test(u.protocol) || !HOSTS.has(u.hostname.toLowerCase())) return null;
  const p = u.pathname; let m;
  if ((m = p.match(/\/file\/(?:u\/\d+\/)?d\/([\w-]{10,})/))) return 'https://drive.google.com/file/d/' + m[1] + '/view';
  if ((m = p.match(/\/folders\/([\w-]{10,})/))) return 'https://drive.google.com/drive/folders/' + m[1];
  if ((m = p.match(/^\/(document|spreadsheets|presentation)\/(?:u\/\d+\/)?d\/([\w-]{10,})/))) return 'https://docs.google.com/' + m[1] + '/d/' + m[2] + '/edit';
  const id = u.searchParams.get('id');
  if (id && /^[\w-]{10,}$/.test(id) && /^\/(open|uc)$/.test(p)) return 'https://drive.google.com/file/d/' + id + '/view';
  return null;
}
function paraTeste(alvo) {
  const o = process.env.DRIVE_ORIGEM_TESTE;
  if (!o) return alvo;
  return alvo.replace(/^https:\/\/docs\.google\.com/, o + '/_docs').replace(/^https:\/\/drive\.google\.com/, o);
}
function desentidade(t) {
  return String(t || '').replace(/&#x([0-9a-f]{1,6});|&#(\d{1,7});/gi, (x, h, d) => { try { return String.fromCodePoint(h ? parseInt(h, 16) : +d); } catch (e) { return ' '; } })
    .replace(/&quot;/g, '"').replace(/&(#39|apos);/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
}
// o que o Google põe depois do nome no <title> (em português e em inglês)
const SUFIXO = /\s+[-\u2013\u2014]\s+(Google\s+(Drive|Docs|Sheets|Slides|Planilhas|Apresentações|Documentos)|(Documentos|Planilhas|Apresentações)\s+Google)\s*$/i;
// página de login, de acesso negado ou a do próprio Drive: não é o nome do arquivo
const NAO_E_NOME = /sign[\s-]?in|fazer login|^entrar\b|contas do google|google accounts|meet google drive|acesso negado|access denied|precisa de (acesso|permissão)|you need (access|permission)|request access|solicitar acesso|^google\s+(drive|docs|sheets|slides)$|^(page not found|página não encontrada)/i;
/** O nome na página: og:title primeiro (vem sem o " - Google Drive"), depois o <title>. */
function nomeDaPagina(html) {
  let og = '';
  for (const tag of String(html).match(/<meta\b[^>]*>/gi) || []) {
    const at = {}; let a; const re = /([\w:-]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
    while ((a = re.exec(tag))) at[a[1].toLowerCase()] = a[3] !== undefined ? a[3] : a[4];
    if ((at.property || at.name || '').toLowerCase() === 'og:title' && at.content) { og = at.content; break; }
  }
  const ti = String(html).match(/<title[^>]*>([^<]*)<\/title>/i);
  for (const c of [og, ti && ti[1]]) {
    const t = desentidade(c).replace(SUFIXO, '').replace(/\s+/g, ' ').trim();
    if (t && !NAO_E_NOME.test(t)) return t.slice(0, 140);
  }
  return '';
}
/** Lê só o começo da página (o nome fica no <head>): para no </head> ou em 400 KB. */
async function lePouco(r) {
  if (!r.body || typeof r.body.getReader !== 'function') return (await r.text()).slice(0, MAX_BYTES);
  const rd = r.body.getReader(), partes = []; let n = 0;
  while (n < MAX_BYTES) {
    const { done, value } = await rd.read(); if (done) break;
    const b = Buffer.from(value); partes.push(b); n += b.length;
    if (/<\/head>/i.test(b.toString('latin1'))) break;
  }
  try { await rd.cancel(); } catch (e) { /* já acabou */ }
  return Buffer.concat(partes).toString('utf8');
}
/**
 * O nome do arquivo no Drive. Volta { ok: true, nome } ou { ok: false, motivo }, com motivo:
 * 'nao-e-drive' (o link não é do Drive), 'restrito' (pede login: o link não está aberto), 'nao-achou' (o arquivo não
 * existe mais), 'demorou' (passou de 4 s) ou 'falhou' (rede ou resposta estranha). Nunca joga erro.
 */
async function nomeDoDrive(url, tempoMs) {
  const canon = linkDoDrive(url);
  if (!canon) return { ok: false, motivo: 'nao-e-drive' };
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), tempoMs || TEMPO_MS);
  try {
    let alvo = canon;
    for (let i = 0; i < 3; i++) {
      const r = await fetch(paraTeste(alvo), { redirect: 'manual', signal: ctl.signal,
        headers: { 'User-Agent': UA, Accept: 'text/html', 'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.5' } });
      if (r.status >= 300 && r.status < 400) {
        let prox = null; try { prox = new URL(r.headers.get('location') || '', alvo); } catch (e) { /* sem destino */ }
        try { await r.body?.cancel(); } catch (e) { /* nada */ }
        if (!prox || !HOSTS.has(prox.hostname.toLowerCase()) || prox.protocol !== 'https:') return { ok: false, motivo: 'restrito' };   // foi pro login do Google
        alvo = prox.href; continue;
      }
      if (r.status === 404 || r.status === 410) return { ok: false, motivo: 'nao-achou' };
      if (r.status === 401 || r.status === 403) return { ok: false, motivo: 'restrito' };
      if (!r.ok) return { ok: false, motivo: 'falhou' };
      const nome = nomeDaPagina(await lePouco(r));
      return nome ? { ok: true, nome } : { ok: false, motivo: 'restrito' };
    }
    return { ok: false, motivo: 'falhou' };
  } catch (e) {
    return { ok: false, motivo: e && e.name === 'AbortError' ? 'demorou' : 'falhou' };
  } finally { clearTimeout(t); }
}
module.exports = { linkDoDrive, nomeDoDrive, nomeDaPagina };
