'use strict';
// =====================================================================
// v4.27 · MINHAS CAPTAÇÕES E MODO CAPTAÇÃO (Fase 3 da captação de eventos amarrada)
// Minhas: os eventos da pessoa logada nos próximos 14 dias (sem login, todos), com o Confirmo / Não dá e o andamento do
// fluxo. Modo captação: a tela cheia do dia do evento no celular: relógio grande, só as etapas da raia da pessoa,
// checks grandes, a tela fica acesa (Wake Lock). As marcas vão pro servidor (POST /api/captacao/<id>/etapa), que
// destrava e retranca. O app instalado (service worker /sw.js) guarda só a casca da tela.
// =====================================================================
const MC = { defs: null, aberto: null, d: null, todas: false, wake: null, relogio: null, recarga: null, instalar: null, naoDa: null };

// ---------------- o app instalado ----------------
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => {}); });
  navigator.serviceWorker.addEventListener('message', e => {   // v4.28: tocou na notificação com o painel aberto
    const u = e.data && e.data.tipo === 'abre' && e.data.url ? new URL(e.data.url, location.origin) : null;
    if (u) mcAbreDaUrl(u);
  });
}
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); MC.instalar = e; if (S.view === 'minhas') render(); });
const mcInstalado = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const mcIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) && !window.MSStream;

// ---------------- v4.28: os lembretes no celular (Web Push) ----------------
MC.push = null;   // { ligado, chave, meus, silencio, assinado }
async function mcPushEstado() {
  try { MC.push = await api('/api/push/chave'); } catch (e) { MC.push = { ligado: false }; }
  MC.push.suporta = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  MC.push.assinado = false;
  if (MC.push.suporta && MC.push.ligado) {
    try { const reg = await navigator.serviceWorker.getRegistration(); const s = reg && await reg.pushManager.getSubscription(); MC.push.assinado = !!s && Notification.permission === 'granted'; } catch (e) {}
  }
  return MC.push;
}
const mcChave = b => { const s = atob(b.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - b.length % 4) % 4)); return Uint8Array.from(s, c => c.charCodeAt(0)); };
async function mcPushLiga() {
  try {
    const p = await Notification.requestPermission();
    if (p !== 'granted') return toast('Sem a permissão de notificação os lembretes não chegam. Libere nas configurações do navegador.', true);
    const reg = await navigator.serviceWorker.register('/sw.js'); await navigator.serviceWorker.ready;
    let s = await reg.pushManager.getSubscription();
    if (!s) s = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: mcChave(MC.push.chave) });
    await api('/api/push/assina', { method: 'POST', body: JSON.stringify({ sub: s.toJSON() }) });
    toast('Lembretes ligados neste aparelho');
  } catch (e) { toast('Não deu pra ligar os lembretes: ' + e.message, true); }
  await mcPushEstado(); render();
}
async function mcPushTesta() {
  try { const j = await api('/api/push/teste', { method: 'POST', body: '{}' }); toast(j.enviados ? 'Teste enviado pra ' + j.enviados + (j.enviados > 1 ? ' aparelhos' : ' aparelho') : 'Nenhum aparelho recebeu: ligue os lembretes de novo', !j.enviados); }
  catch (e) { toast(e.message, true); }
}
async function mcSilencia(id, on) {
  try { const j = await api('/api/push/silencio', { method: 'POST', body: JSON.stringify({ cap: id, on }) }); MC.push.silencio = j.silencio; render(); toast(on ? 'Lembretes deste evento silenciados (o Zion ainda é avisado se atrasar)' : 'Lembretes deste evento ligados'); }
  catch (e) { toast(e.message, true); }
}
function mcPushHtml() {
  const p = MC.push;
  if (!p) { mcPushEstado().then(() => { if (S.view === 'minhas') render(); }); return ''; }
  if (!p.ligado) return souAdmin() && S.eu ? '<div class="mc-dica mc-push">' + icon('alerta') + '<span>Os lembretes no celular estão desligados no servidor: rode o <b>gerar-vapid.js</b> no PC e cole as chaves no Render.</span></div>' : '';
  if (!p.suporta) return '';
  if (p.assinado) return '<div class="mc-dica mc-push ok">' + icon('check') + '<span>Lembretes ligados neste aparelho</span><button type="button" class="mbtn" id="mcPushTeste">Testar</button></div>';
  return '<div class="mc-dica mc-push">' + icon('alerta') + '<span>Ligue os lembretes: o B.O.N.E avisa a hora de cada etapa e o que atrasou.</span><button type="button" class="mbtn" id="mcPushLiga">Ligar lembretes</button></div>';
}

/** As definições do fluxograma (uma vez; o servidor responde 304 quando não mudou). */
async function mcDefs() {
  if (!MC.defs) MC.defs = await api('/api/fluxos');
  return MC.defs;
}

// ---------------- Minhas captações ----------------
function mcSomaDia(iso, n) { return new Date(Date.parse(iso + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10); }
function mcDiaNome(d) { const h = hojeStr(); return d === h ? 'Hoje' : d === mcSomaDia(h, 1) ? 'Amanhã' : capDiaL(d); }
/** Os meus eventos (dia a dia) de hoje até 13 dias depois. Sem login, os de todo mundo. */
function mcMeus() {
  const h = hojeStr(), ate = mcSomaDia(h, 13), l = [];
  for (const c of capLista()) {
    if (!capEhEvento(c) || capSit(c) === 'desmarcado') continue;
    const eu = S.eu ? capPessoasDe(c).find(p => capSouEu(p.nome)) : null;
    if (S.eu && !eu) continue;
    for (const x of c.dias) if (x.d >= h && x.d <= ate) l.push({ c, x, eu });
  }
  return l.sort((a, b) => a.x.d.localeCompare(b.x.d) || ((a.eu && a.eu.h) || a.x.h || '99').localeCompare((b.eu && b.eu.h) || b.x.h || '99'));
}
function mcMinhas(g) {
  g.classList.add('cpmapa-on', 'mc-on');
  const lb = document.getElementById('mesLabel');
  if (lb) lb.textContent = S.eu ? 'Minhas captações · ' + S.eu.nome.split(' ')[0] : 'Captações dos próximos 14 dias';
  const l = mcMeus();
  const dica = mcInstalado() ? '' : MC.instalar ? '<div class="mc-dica">' + icon('plus') + '<span>Instale o B.O.N.E no celular pra receber os lembretes.</span><button type="button" class="mbtn" id="mcInstala">Instalar</button></div>'
    : mcIOS() ? '<div class="mc-dica">' + icon('plus') + '<span>No iPhone: toque em <b>Compartilhar</b> e em <b>Adicionar à Tela de Início</b>. Os lembretes só chegam pelo app da tela de início.</span></div>' : '';
  if (!l.length) {
    g.innerHTML = '<div class="mc">' + dica + mcPushHtml() + '<div class="cpm-vazio">' + icon('calendar') + '<b>Nenhum evento seu nos próximos 14 dias</b><span>' + (S.eu ? 'Quando o Zion puser você na escala de um evento, ele aparece aqui.' : 'Nenhum evento marcado.') + '</span></div></div>';
  } else {
    let dAnt = '', html = '';
    for (const { c, x, eu } of l) {
      if (x.d !== dAnt) { html += '<h3 class="mc-dia' + (x.d === hojeStr() ? ' hoje' : '') + '">' + esc(mcDiaNome(x.d)) + '</h3>'; dAnt = x.d; }
      const f = c.fluxo && c.fluxo.dias[x.d], pr = f && f.prox, hora = (eu && eu.h) || x.h;
      const v = eu ? capConf(c, x.d, eu.nome) : null, k = eu ? x.d + ':' + c.id : '';
      html += '<article class="mc-ev"' + (c.aba ? ' style="--cp-emp:' + capCorEmpresa(c.aba) + '"' : '') + '>' +
        '<div class="mc-evtop"><span class="mc-h">' + (hora ? esc(capHora(hora)) : 'sem hora') + '</span>' + (eu && eu.papel !== 'principal' ? '<em>' + esc(CAP_PAPEIS[eu.papel] || eu.papel) + '</em>' : eu ? '<em>responsável</em>' : '') +
          (c.aba ? '<span class="mc-emp">' + esc(nomeAba(c.aba)) + '</span>' : '') + '</div>' +
        '<button type="button" class="mc-tit" data-mcfolha="' + c.id + '" data-d="' + x.d + '">' + esc(capTituloCurto(c)) + '</button>' +
        (c.local ? '<div class="mc-local">' + capIc('local') + esc(c.local) + '</div>' : '') +
        (f ? '<div class="mc-fx"><div class="cp-fxbar"><i style="width:' + (f.total ? Math.round(100 * f.feitas / f.total) : 0) + '%"></i></div><span>' + f.feitas + ' de ' + f.total + (pr ? ' · ' + esc(pr.t) : '') + '</span></div>' : '') +
        (v ? '<div class="mc-conf s-' + (v.st || 'pend') + '">' + capConfIc(v) + '<span>' + (v.st === 'ok' ? 'Você confirmou' : v.st === 'nao' ? 'Você disse que não dá: ' + esc(v.motivo || '') : v.velha ? 'A hora mudou: confirme de novo' : 'Confirme se vai') + '</span>' +
          '<span class="mc-confbt"><button type="button" class="mbtn' + (v.st === 'ok' ? ' on' : '') + '" data-mcconf="ok" data-id="' + c.id + '" data-d="' + x.d + '">' + icon('check') + 'Confirmo</button>' +
          '<button type="button" class="mbtn' + (v.st === 'nao' ? ' on' : '') + '" data-mcconf="nao" data-id="' + c.id + '" data-d="' + x.d + '">' + icon('x') + 'Não dá</button></span>' +
          (MC.naoDa === k ? '<span class="mc-nao"><input id="mcNaoMotivo" maxlength="200" placeholder="Por quê?" autocomplete="off" aria-label="Motivo"><button type="button" class="mbtn" data-mcnaook="' + c.id + '" data-d="' + x.d + '">Enviar</button></span>' : '') + '</div>' : '') +
        (f ? '<button type="button" class="mc-abre" data-mcmodo="' + c.id + '" data-d="' + x.d + '">' + capIc('fluxo') + 'Abrir o modo captação</button>' : '') +
        (f && MC.push && MC.push.assinado ? (s => '<button type="button" class="mc-sil' + (s ? ' on' : '') + '" data-mcsil="' + c.id + '" aria-pressed="' + s + '">' + (s ? 'Lembretes silenciados neste evento · religar' : 'Silenciar os lembretes deste evento') + '</button>')((MC.push.silencio || []).includes(c.id)) : '') +   // v4.28
      '</article>';
    }
    g.innerHTML = '<div class="mc">' + dica + mcPushHtml() + html + '</div>';
  }
  const pl = document.getElementById('mcPushLiga'); if (pl) pl.onclick = mcPushLiga;
  const pt = document.getElementById('mcPushTeste'); if (pt) pt.onclick = mcPushTesta;
  g.querySelectorAll('[data-mcsil]').forEach(b => b.onclick = () => mcSilencia(b.dataset.mcsil, b.getAttribute('aria-pressed') !== 'true'));
  const ins = document.getElementById('mcInstala');
  if (ins) ins.onclick = async () => { const e = MC.instalar; MC.instalar = null; if (e) { e.prompt(); try { await e.userChoice; } catch (x) {} } render(); };
  g.querySelectorAll('[data-mcfolha]').forEach(b => b.onclick = () => capAbre(b.dataset.mcfolha, b.dataset.d));
  g.querySelectorAll('[data-mcmodo]').forEach(b => b.onclick = () => mcAbre(b.dataset.mcmodo, b.dataset.d));
  g.querySelectorAll('[data-mcconf]').forEach(b => b.onclick = () => {
    const c = capPorId(b.dataset.id), eu = c && capPessoasDe(c).find(p => !S.eu || capSouEu(p.nome));
    if (!c || !eu) return;
    const v = capConf(c, b.dataset.d, eu.nome);
    if (b.dataset.mcconf === 'ok') return capConfirma(c, b.dataset.d, eu.nome, v.st === 'ok' ? '' : 'ok');
    if (v.st === 'nao') return capConfirma(c, b.dataset.d, eu.nome, '');
    MC.naoDa = b.dataset.d + ':' + c.id; render();
    setTimeout(() => { const i = document.getElementById('mcNaoMotivo'); if (i) i.focus(); }, 0);
  });
  g.querySelectorAll('[data-mcnaook]').forEach(b => b.onclick = () => {
    const c = capPorId(b.dataset.mcnaook), eu = c && capPessoasDe(c).find(p => !S.eu || capSouEu(p.nome)), m = (document.getElementById('mcNaoMotivo') || {}).value || '';
    if (m.trim().length < 3) return toast('Diga o motivo', true);
    MC.naoDa = null; capConfirma(c, b.dataset.d, eu.nome, 'nao', m);
  });
  const nm = document.getElementById('mcNaoMotivo');
  if (nm) nm.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); const b = g.querySelector('[data-mcnaook]'); if (b) b.click(); } };
}

// ---------------- o modo captação (tela cheia) ----------------
/** As etapas na ordem do fluxo, com a raia de cada uma. */
function mcPassos(items, raia, out) {
  for (const it of items) {
    if (it.k === 'step') out.push({ it, raia });
    else if (it.k === 'dec') { out.push({ it, raia }); it.br.forEach(b => mcPassos(b.items, raia, out)); }
    else if (it.k === 'par') it.lanes.forEach(ln => mcPassos(ln.items, ln.papel || raia, out));
  }
  return out;
}
/** As raias que são minhas: o papel da pessoa; o responsável fica com as raias que ninguém da escala pegou. null = todas. */
function mcMinhasRaias(c) {
  if (!S.eu) return null;
  const ps = capPessoasDe(c), eu = ps.find(p => capSouEu(p.nome));
  if (!eu) return null;
  if (eu.papel === 'principal') { const usadas = new Set(ps.filter(p => p.papel !== 'principal').map(p => p.papel)); return r => !usadas.has(r); }
  return r => r === eu.papel;
}
async function mcAbre(id, d) {
  MC.aberto = id; MC.d = d; MC.todas = false;
  let ov = document.getElementById('ovModo');
  if (!ov) { ov = document.createElement('div'); ov.id = 'ovModo'; ov.className = 'mc-ov'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', 'Modo captação'); document.body.appendChild(ov); }
  ov.innerHTML = '<div class="mc-carrega">Abrindo o modo captação…</div>';
  ov.classList.add('open'); document.body.classList.add('mc-travado');
  try {
    await mcDefs();
    await mcRecarrega();
  } catch (e) { toast(e.message, true); mcFecha(); return; }
  mcAcende();
  clearInterval(MC.relogio); MC.relogio = setInterval(mcRelogio, 15e3);
  clearInterval(MC.recarga); MC.recarga = setInterval(() => { if (!document.hidden) mcRecarrega().catch(() => {}); }, 60e3);   // o que os outros marcaram (só com a tela aberta)
  const p = document.querySelector('#ovModo .mc-passo.avail');
  if (p) p.scrollIntoView({ block: 'center' });
}
async function mcRecarrega() {
  const j = await api('/api/captacao/' + MC.aberto);
  const i = capLista().findIndex(c => c.id === MC.aberto);
  if (i >= 0 && j.captacao) S.captacoes[i] = j.captacao;
  mcDesenha(j.captacao);
}
function mcFecha() {
  const ov = document.getElementById('ovModo');
  if (ov) { ov.classList.remove('open'); ov.innerHTML = ''; }
  document.body.classList.remove('mc-travado');
  clearInterval(MC.relogio); clearInterval(MC.recarga); MC.aberto = null;
  if (MC.wake) { MC.wake.release().catch(() => {}); MC.wake = null; }
  render();
}
/** A tela fica acesa enquanto o modo captação está aberto (quando o navegador deixa). */
async function mcAcende() {
  try { if ('wakeLock' in navigator && !MC.wake) { MC.wake = await navigator.wakeLock.request('screen'); MC.wake.addEventListener('release', () => { MC.wake = null; mcRelogio(); }); } } catch (e) { MC.wake = null; }
  mcRelogio();
}
// Esc fecha só o modo captação (antes do Esc do painel, que sairia do modo captação inteiro)
document.addEventListener('keydown', e => { if (e.key === 'Escape' && MC.aberto) { e.preventDefault(); e.stopImmediatePropagation(); mcFecha(); } }, true);
document.addEventListener('visibilitychange', () => { if (!document.hidden && MC.aberto) { mcAcende(); mcRecarrega().catch(() => {}); } });
function mcRelogio() {
  const r = document.getElementById('mcRelogio'); if (!r) return;
  const a = new Date();
  r.textContent = String(a.getHours()).padStart(2, '0') + ':' + String(a.getMinutes()).padStart(2, '0');
  const w = document.getElementById('mcAcesa'); if (w) w.hidden = !MC.wake;
}
function mcDesenha(c) {
  const ov = document.getElementById('ovModo'); if (!ov || !c) return;
  const f = c.fluxo, o = f && f.dias[MC.d];
  if (!f || !o) { ov.innerHTML = '<div class="mc-carrega">Este evento não tem fluxo neste dia.<button type="button" class="mbtn" data-mcx="1">Fechar</button></div>'; ov.querySelector('[data-mcx]').onclick = mcFecha; return; }
  const def = MC.defs.tipos[f.tipo], minha = MC.todas ? null : mcMinhasRaias(c), adm = souAdmin();
  const eu = S.eu ? capPessoasDe(c).find(p => capSouEu(p.nome)) : null, pode = adm || !!eu;
  const x = c.dias.find(y => y.d === MC.d) || {};
  const passos = mcPassos(def.items, null, []).filter(p => o.est[p.it.id] !== 'x' && (!p.raia || !minha || minha(p.raia)));
  const ocultas = minha ? mcPassos(def.items, null, []).filter(p => o.est[p.it.id] !== 'x' && p.raia && !minha(p.raia)).length : 0;
  const quando = id => { const q = o.horas[id]; return q ? (q.d !== MC.d ? capDiaL(q.d) + ' ' : '') + capHora(q.h) : ''; };
  const card = ({ it }) => {
    const s = o.est[it.id], ag = it.kind === 'agent';
    if (it.k === 'dec') {
      return '<section class="mc-passo dec ' + s + '" data-id="' + it.id + '"><div class="mc-pq">' + esc(it.t) + '</div>' +
        (o.auto[it.id] !== undefined && o.manual[it.id] === undefined ? '<div class="mc-auto">o B.O.N.E escolheu pela data e hora</div>' : '') +
        '<div class="mc-rotas">' + it.br.map((b, i) => '<button type="button" class="mc-rota' + (o.rotas[it.id] === i ? ' on' : '') + '" data-mcrota="' + it.id + '" data-i="' + i + '"' + (!adm && !pode ? ' disabled' : '') + '>' + esc(b.lab) + '</button>').join('') + '</div></section>';
    }
    const m = o.marcas[it.id] || [], cs = it.checks || [];
    const travado = (ag && !adm) || !pode;   // v4.32: marca em qualquer ordem
    return '<section class="mc-passo ' + s + (ag ? ' agente' : '') + '" data-id="' + it.id + '">' +
      '<div class="mc-ptop"><span class="mc-ph">' + (it.ate ? 'até ' : '') + esc(quando(it.id) || it.w || '') + '</span>' +
        '<span class="mc-pst">' + (s === 'done' ? icon('check') + 'feito' : s === 'avail' ? 'é a vez' : 'vem depois') + '</span></div>' +
      '<h4>' + esc(it.t) + '</h4><div class="mc-pwho">' + esc(it.who || '') + '</div>' +
      (it.faz && it.faz.length ? '<ul class="mc-faz">' + it.faz.map(t => '<li>' + esc(t) + '</li>').join('') + '</ul>' : '') +
      '<div class="mc-checks">' + cs.map((t, i) => '<button type="button" class="mc-check' + (m[i] ? ' on' : '') + '" role="checkbox" aria-checked="' + !!m[i] + '" data-mcetapa="' + it.id + '" data-i="' + i + '"' + (travado ? ' disabled' : '') + '>' +
        '<span class="mc-cx">' + (m[i] ? icon('check') : '') + '</span><span>' + esc(t) + (m[i] && m[i].por ? '<small>' + esc(m[i].por) + '</small>' : '') + '</span></button>').join('') + '</div>' +
      (it.senao && it.senao.length ? '<details class="mc-senao"><summary>Se não der</summary><ul>' + it.senao.map(t => '<li>' + esc(t) + '</li>').join('') + '</ul></details>' : '') +
      (it.links && it.links.length ? '<div class="mc-links">' + it.links.map(([n, u]) => '<a href="' + esc(u) + '" target="_blank" rel="noopener">' + esc(n) + icon('external') + '</a>').join('') + '</div>' : '') +
    '</section>';
  };
  ov.innerHTML =
    '<header class="mc-cab"><button type="button" class="mc-x" data-mcx="1" aria-label="Fechar o modo captação">' + icon('x') + '</button>' +
      '<div class="mc-cabt"><b>' + esc(capTituloCurto(c)) + '</b><span>' + esc(f.nome) + ' · ' + esc(mcDiaNome(MC.d)) + (x.h ? ' · ' + esc(capHora(x.h)) + (o.fim ? ' às ' + esc(capHora(o.fim)) : '') : '') + '</span></div>' +
      '<div class="mc-rel"><span id="mcRelogio"></span><small id="mcAcesa" hidden>tela acesa</small></div></header>' +
    '<div class="mc-prog"><div class="cp-fxbar"><i style="width:' + (o.total ? Math.round(100 * o.feitas / o.total) : 0) + '%"></i></div><span>' + o.feitas + ' de ' + o.total + '</span></div>' +
    '<div class="mc-lista">' + passos.map(card).join('') +
      (ocultas || MC.todas ? '<button type="button" class="mbtn mc-todas" data-mctodas="1">' + (MC.todas ? 'Ver só as minhas etapas' : 'Ver as ' + ocultas + ' etapas de quem está com você') + '</button>' : '') + '</div>';
  mcRelogio();
  ov.querySelector('[data-mcx]').onclick = mcFecha;
  const td = ov.querySelector('[data-mctodas]'); if (td) td.onclick = () => { MC.todas = !MC.todas; mcDesenha(capPorId(MC.aberto)); };
  ov.querySelectorAll('[data-mcetapa]').forEach(b => b.onclick = () => mcMarca({ etapa: b.dataset.mcetapa, i: +b.dataset.i, v: b.getAttribute('aria-checked') !== 'true' }, b));
  ov.querySelectorAll('[data-mcrota]').forEach(b => b.onclick = () => mcMarca({ rota: b.dataset.mcrota, i: b.classList.contains('on') && o.manual[b.dataset.mcrota] !== undefined ? null : +b.dataset.i }, b));
}
async function mcMarca(corpo, b) {
  if (b) b.classList.add('indo');
  try {
    const j = await api('/api/captacao/' + MC.aberto + '/etapa', { method: 'POST', body: JSON.stringify(Object.assign({ d: MC.d }, corpo)) });
    capVersao(j.rev);
    const i = capLista().findIndex(c => c.id === MC.aberto);
    if (i >= 0 && j.captacao) S.captacoes[i] = j.captacao;
    const y = document.querySelector('#ovModo .mc-lista') ? document.querySelector('#ovModo .mc-lista').scrollTop : 0;
    mcDesenha(j.captacao);
    const l = document.querySelector('#ovModo .mc-lista'); if (l) l.scrollTop = y;
    if (navigator.vibrate && corpo.v) navigator.vibrate(15);
  } catch (e) { toast(e.message, true); if (b) b.classList.remove('indo'); }
}
/** Tocou na notificação (v4.28): /?cap=<id>&d=<dia> abre o modo captação daquele dia. */
function mcAbreDaUrl(u) {
  const id = u.searchParams.get('cap'), d = u.searchParams.get('d');
  if (!id || !capPorId(id)) return;
  if (u.searchParams.get('modo') === '1' && d) mcAbre(id, d); else capAbre(id, d || undefined);
}
// o link da notificação (/?cap=...&d=...&modo=1) abre o evento quando o estado chega
(function () {
  const u = new URL(location.href);
  if (!u.searchParams.get('cap')) return;
  let n = 0;
  const t = setInterval(() => {
    if ((typeof S !== 'undefined' && (S.captacoes || []).length) || ++n > 60) { clearInterval(t); try { history.replaceState(null, '', '/'); } catch (e) {} mcAbreDaUrl(u); }
  }, 250);
})();
