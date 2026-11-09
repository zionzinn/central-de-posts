'use strict';
// =====================================================================
// v4.14 · CAPTAÇÃO NO CALENDÁRIO (pedido do Zion em 09/11/2026)
// "Preciso mudar completamente a aba de captação. ela deve ser mais ou menos igual a aba principal, mas é onde eu
// coloco apenas as tasks de captação. (posso linkar com o dia que vai sair o post / taks de edição. posso linkar com
// mais de uma tarefa. posso dizer quantos roteiros foram gravados (as vezes uma task tem 5 roteiros) e, se por ventura
// no dia nao for possivel gravar todos, eu tambem consigo adicionar outro dia para finalizar a captação. sinalizando
// quais foram gravados e quais nao foram." Escolhas dele: "Colo o link do MKT Hub" e "Roteiros soltos na captação".
//
// O botão Captação da barra liga o MODO CAPTAÇÃO do próprio calendário (Mês e Semana, as setas, o Hoje e as abas das
// empresas como filtro): cada dia mostra as captações gravadas nele. O + do dia recebe o link da task de captação do
// MKT Hub. A folha da captação (clicar no card) tem os dias de gravação (o primeiro e os que entram pra terminar), os
// roteiros (gravado ou não, e em que dia) e os posts ligados (o dia que sai e a task de edição de cada um). Arrastar o
// card muda aquele dia. No calendário dos posts, o post ligado ganha a câmera com o dia da captação.
// Servidor em lib/captacao.js. A regra arte x vídeo (pecaDoPost) continua aqui e em lib/peca.js: mudou lá, muda aqui.
// Saíram (v4.03 e v4.04): o quadro de blocos, a pauta e a criação da task de Captação pelo B.O.N.E.
// =====================================================================
const CAPM = { aberta: null, diaCtx: null, fila: Promise.resolve(), rev: 0, pick: false, busca: '', apaga: false, apagaT: null, novo: null };
/** A versão das captações que este navegador já viu numa resposta de mudança; um /api/state mais velho não sobrepõe. */
function capVersao(r) { if (r > CAPM.rev) CAPM.rev = r; }
function capVersaoOk(r) { return !(r < CAPM.rev); }

// ---------------- arte ou vídeo (a mesma regra do lib/peca.js) ----------------
const CAP_FMT_VIDEO = new Set(['reels', 'video medio', 'video de anuncio']);
const CAP_FMT_ARTE = new Set(['carrossel', 'estatico', 'story', 'stories', 'corte de podcast']);
const CAP_SEM_CAPTACAO = /\bcortes? (do |de )?(podcast|reels)\b|\[cortes?\b|\[edicao|\bedicao (de |do )?depoimento/;   // corte de podcast e edição do que já existe
/** O que o nome do post (o do painel, o da task e o tema da matriz) diz: 'video', 'arte' ou null. */
function capNomeDiz(s) {
  const t = capSemAcento([s.titulo, s.tituloCache, s.matrizSB && s.matrizSB.tema].filter(Boolean).join(' · '));
  if (/\bcaptacao\b/.test(t)) return 'video';
  if (CAP_SEM_CAPTACAO.test(t)) return 'arte';
  if (/\[(reels?|videos?)\]/.test(t)) return 'video';
  if (/\[(carrossel|estatico|story|stories)\]/.test(t)) return 'arte';
  return null;
}
function capSemAcento(t) { return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim(); }
/** 'arte', 'video' ou null (em aberto: o doc pergunta). */
function pecaDoPost(s) {
  if (!s) return null;
  if (s.peca === 'arte' || s.peca === 'video') return s.peca;
  const f = capSemAcento(s.formato);
  if (CAP_FMT_VIDEO.has(f)) return capNomeDiz(s) === 'arte' ? 'arte' : 'video';
  if (CAP_FMT_ARTE.has(f)) return 'arte';
  if (s.banco) return 'arte';                                   // material do banco: já existe, não tem captação
  const n = capNomeDiz(s); if (n) return n;
  const m = capSemAcento(s.matrizSB && s.matrizSB.formato);     // na matriz, o formato é descritivo
  if (!m) return null;
  if (/carrossel|\bstor(y|ies)\b/.test(m) || CAP_SEM_CAPTACAO.test(m)) return 'arte';
  if (/video|reels|documentario|vlog|\bpov\b|react|trend|cinematico|fala direta|contando|bastidor/.test(m)) return 'video';
  if (/foto|print|card|numero|placar|meme|grid|colagem|callout|frase|notificacao|checklist|calendario|quadro|tier|selo|starter|estatic/.test(m)) return 'arte';
  return null;
}

// ---------------- datas, nomes e ícones ----------------
const CAP_DS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
function capMs(iso) { return Date.parse(iso + 'T12:00:00Z'); }
function capSoma(iso, n) { return new Date(capMs(iso) + n * 864e5).toISOString().slice(0, 10); }
function capBr(iso) { return iso.slice(8, 10) + '/' + iso.slice(5, 7); }
/** "Qui 08/10" */
function capDiaL(iso) { return CAP_DS[new Date(capMs(iso)).getUTCDay()] + ' ' + capBr(iso); }
function capDif(a, b) { return Math.round((capMs(a) - capMs(b)) / 864e5); }
/** "9h", "9h30" */
function capHora(h) { return String(h || '').replace(/^0(\d)/, '$1').replace(/:00$/, 'h').replace(/^(\d+):(\d\d)$/, '$1h$2'); }
const capPl = (n, um, varios) => n + ' ' + (n === 1 ? um : varios);
const CAP_ICONS = {
  lixo: '<path d="M5 7h14M10 7V4.5h4V7M7 7l1 13h8l1-13"/>',
  ligar: '<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1"/>',
};
function capIc(nome, cls) {
  if (!CAP_ICONS[nome]) return icon(nome, cls);
  return '<svg class="ic' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" aria-hidden="true">' + CAP_ICONS[nome] + '</svg>';
}

// ---------------- o que cada captação está ----------------
function capLista() { return S.captacoes || []; }
function capPorId(id) { return capLista().find(c => c.id === id) || null; }
function capTitulo(c) { return (c.hub && c.hub.titulo) || c.titulo || 'Captação sem nome'; }
/** No card, o nome sem o "[CAPTAÇÃO]" do começo (no modo captação tudo é captação). */
function capTituloCurto(c) { return capTitulo(c).replace(/^\s*\[?\s*capta[cç][aã]o\s*\]?\s*[:·-]?\s*/i, '') || capTitulo(c); }
function capGravados(c) { return c.roteiros.filter(r => r.g).length; }
function capUltimo(c) { return c.dias.length ? c.dias[c.dias.length - 1].d : null; }
/** gravada (todos os roteiros gravados) · faltou (o último dia passou e tem roteiro sem gravar) · agravar */
function capSit(c) {
  const n = c.roteiros.length, g = capGravados(c), u = capUltimo(c);
  if (n && g === n) return 'gravada';
  if (n && u && u < hojeStr()) return 'faltou';
  return 'agravar';
}
/** Os posts ligados (os que ainda existem). */
function capPostsDe(c) { return c.posts.map(id => S.slots.find(s => s.id === id)).filter(Boolean); }
/** O que aperta: o primeiro prazo de edição (a task do post no MKT Hub) ou o primeiro dia em que um post sai. */
function capLimite(c) {
  let m = null;
  for (const s of capPostsDe(c)) {
    if (s.postado) continue;
    const p = s.hub && s.hub.prazo ? String(s.hub.prazo).slice(0, 10) : '';
    if (p && (!m || p < m.d)) m = { d: p, tipo: 'edicao', s };
    if (s.date && (!m || s.date < m.d)) m = { d: s.date, tipo: 'sai', s };
  }
  return m;
}
/** Alerta da captação que ainda tem roteiro pra gravar: o último dia de gravação encosta no prazo da edição ou no post. */
function capAlerta(c) {
  if (capSit(c) === 'gravada') return null;
  const n = c.roteiros.length, falta = n - capGravados(c), u = capUltimo(c);
  if (capSit(c) === 'faltou') return { c: 'red', t: 'faltou gravar ' + falta, dica: capPl(falta, 'roteiro ficou', 'roteiros ficaram') + ' sem gravar: marque outro dia pra terminar' };
  const l = capLimite(c);
  if (!l || !u) return null;
  const qual = l.tipo === 'edicao' ? 'a edição vence ' : 'o post sai ';
  if (l.d <= u) return { c: 'red', t: l.tipo === 'edicao' ? 'depois do prazo' : 'depois do post', dica: 'A gravação vai até ' + capDiaL(u) + ', mas ' + qual + capDiaL(l.d) };
  if (capDif(l.d, u) <= 2) return { c: 'or', t: 'apertado', dica: 'Grava ' + capDiaL(u) + ' e ' + qual + capDiaL(l.d) };
  return null;
}
/** Na aba de uma empresa: as captações dela e as que ainda não têm empresa. Na Todos, todas. */
function capNaAba(c) { return ehTodos() || !c.aba || c.aba === S.aba; }
function capsDoDia(iso) {
  const l = [];
  for (const c of capLista()) { if (!capNaAba(c)) continue; const i = c.dias.findIndex(x => x.d === iso); if (i >= 0) l.push({ c, i }); }
  return l.sort((a, b) => (a.c.dias[a.i].h || '99').localeCompare(b.c.dias[b.i].h || '99') || capTitulo(a.c).localeCompare(capTitulo(b.c)));
}
function capsDoPost(sid) { return capLista().filter(c => c.posts.includes(sid)); }
function capCorEmpresa(aba) { return aba && typeof temaDaAba === 'function' ? temaDaAba(aba).sb : ''; }

// ---------------- o botão Captação e o modo captação ----------------
/** O botão Captação na barra (só ADMIN): liga e desliga o modo captação. O número é de vídeos dos próximos 14 dias sem captação. */
function capBotao() {
  const b = document.getElementById('btnCap'); if (!b) return;
  const adm = typeof souAdmin === 'function' ? souAdmin() : true;
  b.hidden = !adm;
  if (!adm && S.modoCap) { S.modoCap = false; }
  const n = S.capPendentes || 0;
  document.getElementById('capN').textContent = n ? String(n) : '';
  b.classList.toggle('tem', !!n);
  b.classList.toggle('on', !!S.modoCap);
  b.setAttribute('aria-pressed', S.modoCap ? 'true' : 'false');
  b.dataset.tip = S.modoCap ? 'Voltar pros posts (Esc)'
    : (n ? capPl(n, 'vídeo sai', 'vídeos saem') + ' nos próximos 14 dias sem captação ligada · ' : '') + 'Calendário de captação: as tasks de captação no dia da gravação';
}
function capModo(on) {
  const quer = on === undefined ? !S.modoCap : !!on;
  if (quer === !!S.modoCap) return;
  S.modoCap = quer;
  if (quer) { S.drawer = false; if (S.selecao && S.selecao.size) S.selecao.clear(); S.clip = null; }
  capFechaNovo();
  render();
  if (typeof irParaMes === 'function' && S.view !== 'semana') setTimeout(() => irParaMes(S.mes || mesAtual()), 0);
}

// ---------------- no calendário (modo captação) ----------------
/** O dia no modo captação: o número, o + (nova captação) e os cards das captações gravadas nele. */
function capCelula(c, di, semana) {
  const cell = document.createElement('div');
  if (!c.date) { cell.className = 'day fora' + (semana ? ' big' : ''); return cell; }
  const hoje = hojeStr(), lista = capsDoDia(c.date);
  cell.className = 'day cpday' + (di >= 5 ? ' fds' : '') + (c.date === hoje ? ' hoje' : '') + (semana ? ' big' : '');
  cell.dataset.dia = c.date;
  cell.innerHTML = '<div class="day-top"><span class="dleft"><span class="dnum">' + c.dnum + '</span></span><span class="day-acts">' +
    (souAdmin() ? '<button class="addbtn" title="Nova captação neste dia (cole o link da task do MKT Hub)" aria-label="Nova captação neste dia">' + icon('plus', 's') + '</button>' : '') +
    '</span></div><div class="day-cards"></div>';
  const box = cell.querySelector('.day-cards');
  for (const x of lista) box.appendChild(capCard(x.c, x.i));
  const ab = cell.querySelector('.addbtn');
  if (ab) ab.onclick = ev => { ev.stopPropagation(); capNovo(c.date, ev.currentTarget); };
  dropZone(cell, () => c.date);
  return cell;
}
/** O card da captação no dia i dela. */
function capCard(c, i) {
  const d = document.createElement('div');
  const sit = capSit(c), n = c.roteiros.length, g = capGravados(c), dia = c.dias[i], alerta = capAlerta(c);
  const nd = c.dias.length, posts = capPostsDe(c), l = capLimite(c), resp = c.hub && c.hub.resp;
  d.className = 'card lp cpc s-' + sit + (resp ? ' tem-av' : '');
  d.draggable = souAdmin();
  d.tabIndex = 0;
  d.dataset.cap = c.id; d.dataset.dia = dia.d;
  const cor = capCorEmpresa(c.aba);
  if (cor) d.style.setProperty('--cp-emp', cor);
  // até 12 roteiros, um quadradinho por roteiro (verde = gravado neste dia; verde apagado = gravado noutro dia); mais que isso, uma barra
  const barra = !n ? '' : n > 12 ? '<span class="cpc-barra longa" aria-hidden="true"><i style="width:' + Math.round(100 * g / n) + '%"></i></span>'
    : '<span class="cpc-barra" aria-hidden="true">' + c.roteiros.map(r => '<i class="' + (r.g ? (r.g === dia.d || nd === 1 ? 'g' : 'g outro') : '') + '"></i>').join('') + '</span>';
  const rot = !n ? 'sem roteiros' : g === n ? capPl(n, 'roteiro gravado', 'roteiros gravados') : g + ' de ' + n + ' gravados';
  const postsTxt = posts.length ? capPl(posts.length, 'post', 'posts') + (l ? ' · ' + (l.tipo === 'edicao' ? 'prazo ' : '1º sai ') + lpDiaC(l.d) : '') : 'sem post ligado';
  d.setAttribute('aria-label', 'Captação: ' + capTitulo(c) + '. ' + capDiaL(dia.d) + (nd > 1 ? ', dia ' + (i + 1) + ' de ' + nd : '') + '. ' + rot + '. ' + postsTxt + '.');
  d.innerHTML =
    '<div class="cpc-top"><span class="cpc-et">' + (sit === 'gravada' ? icon('check') + 'Gravada' : 'Captação') + '</span>' +
      (nd > 1 ? '<span class="cpc-dia">dia ' + (i + 1) + ' de ' + nd + '</span>' : '') +
      (dia.h ? '<span class="cpc-h">' + esc(capHora(dia.h)) + '</span>' : '') +
      (alerta ? '<span class="lp-pil ' + alerta.c + '" title="' + esc(alerta.dica) + '">' + icon('alerta') + esc(alerta.t) + '</span>' : '') + '</div>' +
    '<div class="tit">' + esc(capTituloCurto(c)) + '</div>' +
    '<div class="cpc-rot">' + barra + '<span>' + esc(rot) + '</span></div>' +
    '<div class="cpc-posts" title="' + esc(posts.map(s => nomeConta(s.conta) + ': ' + (s.tituloCache || s.titulo || 'post') + (s.date ? ' · sai ' + capDiaL(s.date) : '')).join('\n')) + '">' + icon('film') + '<span>' + esc(postsTxt) + '</span></div>' +
    (resp ? '<span class="lp-av" title="' + esc(resp + ' capta') + '">' + esc(initials(resp)) + '</span>' : '');
  d.addEventListener('dragstart', ev => {
    if (!souAdmin()) { ev.preventDefault(); return; }
    ev.dataTransfer.setData('text/plain', 'cp:' + c.id + ':' + dia.d); ev.dataTransfer.effectAllowed = 'move';
    S.dragging = true; d.classList.add('dragging');
  });
  d.addEventListener('dragend', () => { S.dragging = false; d.classList.remove('dragging'); if (S._renderDepois) { S._renderDepois = false; render(); } });
  d.addEventListener('click', () => { if (!S.dragging) capAbre(c.id, dia.d); });
  d.addEventListener('keydown', ev => { if ((ev.key === 'Enter' || ev.key === ' ') && ev.target === d) { ev.preventDefault(); d.click(); } });
  return d;
}
/** O cabeçalho de cada mês no modo captação: quantas captações e a legenda das três situações. */
function capCabMes(mes) {
  const l = capLista().filter(c => capNaAba(c) && c.dias.some(x => x.d.startsWith(mes)));
  const n = { agravar: 0, gravada: 0, faltou: 0 };
  for (const c of l) n[capSit(c)]++;
  const chip = (k, t) => '<span class="cp-lc s-' + k + (n[k] ? '' : ' zero') + '"><i></i>' + t + '<b>' + n[k] + '</b></span>';
  return { texto: capPl(l.length, 'captação', 'captações') + ' · ' + nomeAba(S.aba),
    legenda: '<span class="mesleg cp-leg">' + chip('agravar', 'A gravar') + chip('gravada', 'Gravada') + chip('faltou', 'Faltou gravar') + '</span>' };
}
/** O número da aba no modo captação: as captações do mês naquela empresa. */
function capNaAbaDoMes(aba, mes) {
  return capLista().filter(c => (aba === ABA_TODOS || !c.aba || c.aba === aba) && c.dias.some(x => x.d.startsWith(mes))).length;
}
/** Soltou o card num dia: aquele dia da captação muda (o gravado nele vai junto). */
async function capSolta(dado, para) {
  const [, id, de] = dado.split(':');
  const c = capPorId(id); if (!c || !para || de === para) return;
  if (c.dias.some(x => x.d === para)) return toast('Essa captação já tem gravação em ' + capDiaL(para), true);
  await capSalva(c.id, cc => capMudaDia(cc, de, para), 'Movida pra ' + capDiaL(para) + ' · Ctrl+Z desfaz');
}

// ---------------- criar: o link da task de captação no dia ----------------
/** O corpo que troca o dia de: pro dia para (o horário e os roteiros gravados nele vão junto). */
function capMudaDia(cc, de, para) {
  if (!cc.dias.some(x => x.d === de) || cc.dias.some(x => x.d === para)) return null;
  return { dias: cc.dias.map(x => x.d === de ? { d: para, h: x.h } : x), roteiros: cc.roteiros.map(r => r.g === de ? { id: r.id, n: r.n, g: para } : { id: r.id, n: r.n, g: r.g }) };
}
function capFechaNovo() { const p = document.getElementById('cpNovo'); if (p) p.remove(); CAPM.novo = null; }
function capNovo(dia, btn) {
  if (CAPM.novo === dia) { capFechaNovo(); return; }
  capFechaNovo(); CAPM.novo = dia;
  const p = document.createElement('div');
  p.className = 'cpnovo'; p.id = 'cpNovo'; p.setAttribute('role', 'dialog'); p.setAttribute('aria-label', 'Nova captação em ' + capDiaL(dia));
  p.innerHTML = '<b>' + icon('camera') + 'Captação em ' + esc(capDiaL(dia)) + '</b>' +
    '<label for="cpNovoLink">Cole o link da task de captação do MKT Hub</label>' +
    '<input id="cpNovoLink" placeholder="https://www.mkthub.space/... ou MKT-1234" autocomplete="off">' +
    '<div class="cpnovo-pe"><span class="cpnovo-msg" id="cpNovoMsg"></span><button type="button" class="mbtn primary" id="cpNovoOk">Criar</button></div>';
  document.body.appendChild(p);
  const r = btn.getBoundingClientRect(), w = 300;
  p.style.left = Math.min(Math.max(8, r.right - w), innerWidth - w - 8) + 'px';
  p.style.top = (r.bottom + p.offsetHeight + 12 > innerHeight ? Math.max(8, r.top - p.offsetHeight - 6) : r.bottom + 6) + 'px';
  const inp = p.querySelector('#cpNovoLink'), msg = p.querySelector('#cpNovoMsg'), ok = p.querySelector('#cpNovoOk');
  const vai = async () => {
    const link = inp.value.trim();
    if (!link) { msg.textContent = 'cole o link'; inp.focus(); return; }
    ok.disabled = true; msg.textContent = 'procurando no MKT Hub…';
    try {
      const j = await api('/api/captacao', { method: 'POST', body: JSON.stringify({ dia, link }) });
      capVersao(j.rev);
      capFechaNovo(); await loadState(false, true); render();
      toast('Captação criada em ' + capDiaL(dia) + (j.aviso ? ' · ' + j.aviso : '') + ' · Ctrl+Z desfaz', !!j.aviso);
      capAbre(j.captacao.id, dia);
    } catch (e) {
      ok.disabled = false;
      if (e.status === 409 && e.data && e.data.id) { capFechaNovo(); toast('Essa task já está numa captação: abri ela pra você pôr o dia novo', true); capAbre(e.data.id); return; }
      msg.textContent = e.message;
    }
  };
  ok.onclick = vai;
  inp.addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); vai(); } if (ev.key === 'Escape') { ev.stopPropagation(); capFechaNovo(); } });
  setTimeout(() => inp.focus(), 20);
}
document.addEventListener('mousedown', ev => { const p = document.getElementById('cpNovo'); if (p && !p.contains(ev.target) && !ev.target.closest('.addbtn')) capFechaNovo(); }, true);

// ---------------- salvar ----------------
/**
 * Salva na fila: cada salvamento espera o anterior e monta o corpo na hora, com a captação mais nova (corpo pode ser
 * uma função que recebe a captação atual). Assim 3 cliques rápidos em "gravado" valem os 3, e um não desfaz o outro.
 */
function capSalva(id, corpo, ok) {
  const vez = CAPM.fila.then(() => capSalvaJa(id, corpo, ok));
  CAPM.fila = vez.catch(() => {});
  return vez;
}
async function capSalvaJa(id, corpo, ok) {
  const atual = capPorId(id); if (!atual) return false;
  const b = typeof corpo === 'function' ? corpo(atual) : corpo;
  if (!b) return false;
  try {
    const j = await api('/api/captacao/' + id, { method: 'PATCH', body: JSON.stringify(b) });
    capVersao(j.rev);
    const i = capLista().findIndex(c => c.id === id);
    if (i >= 0 && j.captacao) S.captacoes[i] = j.captacao;
    render(); capRedesenha();
    if (ok || j.aviso) toast((ok || '') + (j.aviso ? (ok ? ' · ' : '') + j.aviso : ''), !!j.aviso);
    loadState(false, true).then(() => { render(); capRedesenha(); }).catch(() => {});
    return true;
  } catch (e) {
    if (e.status === 409 && e.data && e.data.id) { toast('Essa task já está noutra captação', true); return false; }
    toast(e.message, true); capRedesenha(); return false;
  }
}

// ---------------- a folha da captação ----------------
function capAbre(id, diaCtx) {
  const c = capPorId(id); if (!c) return;
  CAPM.aberta = id; CAPM.diaCtx = diaCtx || null; CAPM.pick = false; CAPM.busca = ''; CAPM.apaga = false;
  capDesenhaFolha();
  document.getElementById('ovCap').classList.add('open');
}
function capRedesenha() { const ov = document.getElementById('ovCap'); if (ov && ov.classList.contains('open') && CAPM.aberta) capDesenhaFolha(); }
/** Chamado depois do Ctrl+Z e quando o documento fecha: a folha aberta mostra o que mudou. */
function capAoVoltar() { capRedesenha(); }
/** O dia que o "gravado" ganha: o do card que abriu a folha; senão o último que já chegou; senão o primeiro. */
function capDiaPadrao(c) {
  const ds = c.dias.map(x => x.d), hoje = hojeStr();
  if (CAPM.diaCtx && ds.includes(CAPM.diaCtx)) return CAPM.diaCtx;
  const ja = ds.filter(d => d <= hoje);
  return ja.length ? ja[ja.length - 1] : ds[0] || '';
}
function capDesenhaFolha() {
  const c = capPorId(CAPM.aberta);
  const ov = document.getElementById('ovCap');
  if (!c) { if (ov) ov.classList.remove('open'); return; }
  // o que está sendo digitado (roteiro novo, nota, nome de roteiro, link) sobrevive ao redesenho depois de um salvamento
  const ant = document.activeElement, emFolha = ant && ant.closest && ant.closest('#ovCap');
  const foco = emFolha && (ant.id ? '#' + ant.id : ant.dataset.cpn ? '[data-cpn="' + ant.dataset.cpn + '"]' : ant.dataset.cpdia ? '[data-cpdia="' + ant.dataset.cpdia + '"]' : ant.dataset.cphora ? '[data-cphora="' + ant.dataset.cphora + '"]' : '');
  const texto = emFolha && (ant.tagName === 'TEXTAREA' || (ant.tagName === 'INPUT' && !/^(date|time)$/.test(ant.type))) ? { v: ant.value, a: ant.selectionStart, b: ant.selectionEnd } : null;
  const rascNovo = (document.getElementById('cpNovoRot') || {}).value || '';
  const h = c.hub, n = c.roteiros.length, g = capGravados(c), sit = capSit(c), alerta = capAlerta(c);
  const empresa = (h && h.empresa) || (c.aba ? nomeAba(c.aba) : '');
  const link = (h && h.url) || c.taskUrl;
  document.getElementById('cpHead').innerHTML =
    '<div class="cp-eyebrow"' + (c.aba ? ' style="--cp-emp:' + capCorEmpresa(c.aba) + '"' : '') + '>' + icon('camera') + 'Captação' + (empresa ? ' · ' + esc(empresa) : '') + '</div>' +
    // sem a task do Hub (link que o Hub não achou, ou o Hub fora do ar), o nome se escreve aqui
    (h ? '<h2 class="cp-tit" title="' + esc(capTitulo(c)) + '">' + esc(capTituloCurto(c)) + '</h2>'
      : '<input id="cpTitulo" class="cp-tit cp-titinp" value="' + esc(c.titulo || '') + '" placeholder="Nome da captação" maxlength="120" autocomplete="off" aria-label="Nome da captação">') +
    '<div class="cp-meta">' +
      (h ? (link ? '<a class="cp-hub" href="' + esc(link) + '" target="_blank" rel="noopener" title="Abrir a task no MKT Hub"' : '<span class="cp-hub"') + (h.etapa ? ' style="--cp-et:' + esc(h.etapa.cor) + '"' : '') + '><i></i>' +
        esc([h.codigo, h.etapa && h.etapa.nome].filter(Boolean).join(' · ') || 'MKT Hub') + (link ? icon('external') + '</a>' : '</span>') : '') +
      (h && h.resp ? '<span>' + icon('users') + esc(h.resp) + ' capta</span>' : '') +
      (h && h.prazo ? '<span>' + icon('calendar') + 'prazo no Hub ' + esc(capDiaL(String(h.prazo).slice(0, 10))) + '</span>' : '') +
    '</div>' +
    (!c.taskId ? '<div class="cp-semtask">' + icon('alerta') + '<span>' + (c.taskUrl ? 'O link não achou a task no MKT Hub (ou o Hub não respondeu).' : 'Sem task do MKT Hub.') + '</span>' +
      '<input id="cpLink" placeholder="Cole o link da task de captação" value="' + esc(c.taskUrl || '') + '" autocomplete="off"><button type="button" class="mbtn" data-cp="link">Ligar</button></div>' : '');

  // ---- dias ----
  const temG = d => c.roteiros.some(r => r.g === d);
  const dias = c.dias.map((x, i) =>
    '<div class="cp-diarow' + (x.d < hojeStr() ? ' passou' : x.d === hojeStr() ? ' hoje' : '') + '">' +
      '<span class="cp-dn">' + (c.dias.length > 1 ? 'Dia ' + (i + 1) : 'Dia') + '</span>' +
      '<input type="date" value="' + x.d + '" data-cpdia="' + i + '" aria-label="Dia ' + (i + 1) + ' da gravação">' +
      '<input type="time" value="' + esc(x.h || '') + '" data-cphora="' + i + '" aria-label="Horário do dia ' + (i + 1) + '">' +
      '<span class="cp-dg">' + (c.roteiros.filter(r => r.g === x.d).length ? capPl(c.roteiros.filter(r => r.g === x.d).length, 'gravado', 'gravados') : '') + '</span>' +
      '<button type="button" class="cp-x" data-cptira="' + i + '"' + (temG(x.d) || c.dias.length === 1 ? ' disabled' : '') +
        ' title="' + (temG(x.d) ? 'Tem roteiro gravado neste dia: desmarque antes' : c.dias.length === 1 ? 'A captação precisa de um dia' : 'Tirar este dia') + '" aria-label="Tirar o dia ' + (i + 1) + '">' + icon('x') + '</button>' +
    '</div>').join('');
  const falta = n - g;
  // ---- roteiros ----
  const ds = c.dias.map(x => x.d);
  const rots = c.roteiros.map(r =>
    '<div class="cp-rot' + (r.g ? ' g' : '') + '" data-rid="' + r.id + '">' +
      '<button type="button" class="cp-chk" data-cpg="' + r.id + '" role="checkbox" aria-checked="' + (r.g ? 'true' : 'false') + '" title="' + (r.g ? 'Gravado: clique pra desmarcar' : 'Marcar como gravado') + '">' + (r.g ? icon('check') : '') + '</button>' +
      '<input class="cp-rn" value="' + esc(r.n) + '" data-cpn="' + r.id + '" aria-label="Nome do roteiro" maxlength="120">' +
      (r.g ? (ds.length > 1 ? '<select class="cp-rd" data-cprd="' + r.id + '" aria-label="Dia em que foi gravado">' + ds.map(d => '<option value="' + d + '"' + (d === r.g ? ' selected' : '') + '>' + esc(capDiaL(d)) + '</option>').join('') + '</select>'
        : '<span class="cp-rd1">' + esc(capDiaL(r.g)) + '</span>') : '<span class="cp-rpend">a gravar</span>') +
      '<button type="button" class="cp-x" data-cprx="' + r.id + '" title="Tirar o roteiro" aria-label="Tirar o roteiro ' + esc(r.n) + '">' + icon('x') + '</button>' +
    '</div>').join('');
  // ---- posts ----
  const posts = capPostsDe(c);
  const linhaPost = s => {
    const st = s.statusCache, prazo = s.hub && s.hub.prazo ? String(s.hub.prazo).slice(0, 10) : '';
    return '<div class="cp-post" data-psid="' + s.id + '">' +
      '<span class="cdot" style="background:' + contaCor(s.conta) + '"></span>' +
      '<span class="cp-pt"><b>' + esc(s.tituloCache || s.titulo || 'Post sem nome') + '</b>' +
        '<small>' + esc(nomeConta(s.conta)) + (s.date ? ' · sai ' + esc(capDiaL(s.date)) : ' · sem dia') +
        (prazo ? ' · edição até ' + esc(capDiaL(prazo)) : '') + (st && st.nome ? ' · ' + esc(st.nome) : '') + '</small></span>' +
      '<button type="button" class="cp-x" data-cppx="' + s.id + '" title="Desligar o post" aria-label="Desligar o post">' + icon('x') + '</button></div>';
  };
  const pick = CAPM.pick ? capPicker(c) : '';
  document.getElementById('cpBody').innerHTML =
    (alerta ? '<div class="cp-alerta ' + alerta.c + '">' + icon('alerta') + '<span>' + esc(alerta.dica) + '</span></div>' : '') +
    '<section class="cp-sec"><h3>Dias de gravação</h3><div class="cp-dias">' + dias + '</div>' +
      '<div class="cp-maisdia">' + (falta && n ? '<span class="cp-faltam">' + capPl(falta, 'roteiro falta', 'roteiros faltam') + '</span>' : '') +
        '<button type="button" class="mbtn" data-cp="dia">' + icon('plus') + (falta && n && sit !== 'agravar' ? 'Outro dia pra terminar' : 'Outro dia') + '</button></div></section>' +
    '<section class="cp-sec"><h3>Roteiros <span class="cp-cont">' + (n ? g + ' de ' + n + ' gravados' : 'nenhum ainda') + '</span></h3>' +
      (n ? '<div class="cp-prog" aria-hidden="true"><i style="width:' + Math.round(100 * g / n) + '%"></i></div>' : '') +
      '<div class="cp-rots">' + rots + '</div>' +
      '<textarea id="cpNovoRot" class="cp-novorot" rows="1" placeholder="Novo roteiro (Enter). Cole uma lista: um roteiro por linha"></textarea></section>' +
    '<section class="cp-sec"><h3>Posts ligados <span class="cp-cont">' + (posts.length ? capPl(posts.length, 'post', 'posts') : 'nenhum ainda') + '</span></h3>' +
      '<div class="cp-posts">' + posts.map(linhaPost).join('') + '</div>' +
      (CAPM.pick ? pick : '<button type="button" class="mbtn" data-cp="pick">' + capIc('ligar') + 'Ligar post ou task de edição</button>') + '</section>' +
    '<section class="cp-sec"><h3>Nota</h3><textarea id="cpNota" rows="2" maxlength="500" placeholder="Onde, quem aparece, o que levar…">' + esc(c.nota || '') + '</textarea></section>';
  document.getElementById('cpFoot').innerHTML =
    '<button type="button" class="mbtn cp-del' + (CAPM.apaga ? ' armado' : '') + '" data-cp="del"' + (CAPM.apaga ? '' : ' title="Excluir a captação" aria-label="Excluir a captação"') + '>' + capIc('lixo') + (CAPM.apaga ? 'Confirmar: excluir' : '') + '</button>' +
    '<span class="cp-pe">' + (CAPM.apaga ? 'Sai só do B.O.N.E: a task no MKT Hub continua lá.' : '') + '</span>' +
    '<button type="button" class="mbtn primary" data-close-cp>Pronto</button>';
  capLigaFolha(c);
  const nr = document.getElementById('cpNovoRot');
  if (nr && rascNovo && !nr.value) { nr.value = rascNovo; if (/\n/.test(rascNovo)) nr.rows = Math.min(8, rascNovo.split('\n').length); }
  if (foco) {
    const el = document.querySelector('#ovCap ' + foco);
    if (el) { if (texto) el.value = texto.v; el.focus(); if (texto) try { el.setSelectionRange(texto.a, texto.b); } catch (e) {} }
  }
}
/** A lista de posts pra ligar: os que saem de 14 dias atrás a 60 pra frente, vídeo primeiro; a busca também aceita o link da task. */
function capPicker(c) {
  const q = capSemAcento(CAPM.busca), hoje = hojeStr(), lo = capSoma(hoje, -14), hi = capSoma(hoje, 60);
  const taskQ = (CAPM.busca.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i) || [])[0] || (CAPM.busca.match(/MKT-\d+/i) || [])[0] || '';
  let l = S.slots.filter(s => !c.posts.includes(s.id) && !s.postado && s.date && s.date >= lo && s.date <= hi && !(s.sugestao && !s.taskId));
  if (taskQ) {
    const t = taskQ.toLowerCase();
    l = l.filter(s => String(s.taskId || '').toLowerCase() === t || (s.hub && String(s.hub.codigo || '').toLowerCase() === t) || String(s.taskUrl || '').toLowerCase().includes(t));
  } else if (q) l = l.filter(s => capSemAcento([s.tituloCache, s.titulo, nomeConta(s.conta), s.hub && s.hub.codigo, s.date && capDiaL(s.date)].filter(Boolean).join(' ')).includes(q));
  l.sort((a, b) => ((pecaDoPost(b) === 'video') - (pecaDoPost(a) === 'video')) || a.date.localeCompare(b.date));
  l = l.slice(0, 40);
  return '<div class="cp-pick"><input id="cpBusca" placeholder="Buscar post (nome, conta, dia) ou colar o link da task de edição" value="' + esc(CAPM.busca) + '" autocomplete="off">' +
    '<div class="cp-pl">' + (l.length ? l.map(s => '<button type="button" class="cp-po" data-cpliga="' + s.id + '">' +
      '<span class="cdot" style="background:' + contaCor(s.conta) + '"></span><span class="cp-pt"><b>' + esc(s.tituloCache || s.titulo || 'Post sem nome') + '</b>' +
      '<small>' + esc(nomeConta(s.conta)) + ' · sai ' + esc(capDiaL(s.date)) + (s.hub && s.hub.codigo ? ' · ' + esc(s.hub.codigo) : '') + '</small></span>' +
      (pecaDoPost(s) === 'video' ? '<span class="cp-vid">' + icon('camera') + 'vídeo</span>' : '') + '</button>').join('')
      : '<div class="cp-pvazio">' + (taskQ ? 'Nenhum post do calendário está ligado a essa task.' : 'Nenhum post encontrado.') + '</div>') + '</div>' +
    '<div class="cp-pickpe"><button type="button" class="mbtn" data-cp="pickfim">Fechar a busca</button></div></div>';
}
function capLigaFolha(c) {
  const ov = document.getElementById('ovCap');
  ov.querySelectorAll('[data-close-cp]').forEach(b => b.onclick = () => closeOv('ovCap'));
  const rs = cc => cc.roteiros.map(r => ({ id: r.id, n: r.n, g: r.g }));
  ov.querySelectorAll('[data-cp]').forEach(b => b.onclick = async () => {
    const a = b.dataset.cp;
    if (a === 'dia') {
      const base = capUltimo(c) || hojeStr();
      let d = capSoma(base < hojeStr() ? hojeStr() : base, 1);
      while (c.dias.some(x => x.d === d)) d = capSoma(d, 1);
      if (await capSalva(c.id, cc => cc.dias.some(x => x.d === d) ? null : { dias: cc.dias.concat([{ d, h: '' }]) }, 'Dia novo: ' + capDiaL(d) + ' (mude a data se quiser) · Ctrl+Z desfaz')) {
        setTimeout(() => { const el = document.querySelector('[data-cpdia="' + capPorId(c.id).dias.findIndex(x => x.d === d) + '"]'); if (el) el.focus(); }, 30);
      }
    } else if (a === 'pick') { CAPM.pick = true; CAPM.busca = ''; capDesenhaFolha(); setTimeout(() => { const i = document.getElementById('cpBusca'); if (i) i.focus(); }, 20); }
    else if (a === 'pickfim') { CAPM.pick = false; capDesenhaFolha(); }
    else if (a === 'link') { const v = document.getElementById('cpLink').value.trim(); if (v) await capSalva(c.id, { link: v }, 'Task ligada · Ctrl+Z desfaz'); }
    else if (a === 'del') {
      if (!CAPM.apaga) { CAPM.apaga = true; clearTimeout(CAPM.apagaT); CAPM.apagaT = setTimeout(() => { CAPM.apaga = false; capRedesenha(); }, 4000); capDesenhaFolha(); return; }
      try { capVersao((await api('/api/captacao/' + c.id, { method: 'DELETE' })).rev); closeOv('ovCap'); await loadState(false, true); render(); toast('Captação excluída (a task do MKT Hub continua lá) · Ctrl+Z desfaz'); }
      catch (e) { toast(e.message, true); }
    }
  });
  // dias
  ov.querySelectorAll('[data-cpdia]').forEach(inp => inp.onchange = () => {
    const i = +inp.dataset.cpdia, de = c.dias[i].d, para = inp.value;
    if (!para) { inp.value = de; return; }
    if (c.dias.some((x, j) => j !== i && x.d === para)) { toast('Esse dia já está na captação', true); inp.value = de; return; }
    capSalva(c.id, cc => capMudaDia(cc, de, para), 'Dia mudado pra ' + capDiaL(para) + ' · Ctrl+Z desfaz');
  });
  ov.querySelectorAll('[data-cphora]').forEach(inp => inp.onchange = () => {
    const d = c.dias[+inp.dataset.cphora].d, h = inp.value || '';
    capSalva(c.id, cc => ({ dias: cc.dias.map(x => x.d === d ? { d: x.d, h } : x) }));
  });
  ov.querySelectorAll('[data-cptira]').forEach(b => b.onclick = () => {
    const d = c.dias[+b.dataset.cptira].d;
    capSalva(c.id, cc => ({ dias: cc.dias.filter(x => x.d !== d) }), 'Dia tirado · Ctrl+Z desfaz');
  });
  // roteiros
  ov.querySelectorAll('[data-cpg]').forEach(b => b.onclick = () => {
    const id = b.dataset.cpg, r = c.roteiros.find(x => x.id === id), gd = capDiaPadrao(c);
    if (!r.g && !gd) return toast('A captação precisa de um dia pra marcar o gravado', true);
    // na hora: o check muda já (o salvamento entra na fila e a folha se redesenha com o que o servidor guardou)
    const quer = b.getAttribute('aria-checked') !== 'true';
    b.setAttribute('aria-checked', quer ? 'true' : 'false'); b.innerHTML = quer ? icon('check') : ''; b.closest('.cp-rot').classList.toggle('g', quer);
    capSalva(c.id, cc => ({ roteiros: rs(cc).map(x => x.id === id ? Object.assign(x, { g: quer ? (x.g || gd) : '' }) : x) }));
  });
  ov.querySelectorAll('[data-cprd]').forEach(sel => sel.onchange = () => {
    const id = sel.dataset.cprd, g = sel.value;
    capSalva(c.id, cc => ({ roteiros: rs(cc).map(x => x.id === id ? Object.assign(x, { g }) : x) }));
  });
  ov.querySelectorAll('[data-cpn]').forEach(inp => {
    const salva = () => {
      const id = inp.dataset.cpn, r = c.roteiros.find(x => x.id === id), v = inp.value.replace(/\s+/g, ' ').trim();
      if (!r || v === r.n) return;
      if (!v) { inp.value = r.n; return; }
      capSalva(c.id, cc => ({ roteiros: rs(cc).map(x => x.id === id ? Object.assign(x, { n: v }) : x) }));
    };
    inp.onblur = salva;
    inp.onkeydown = ev => { if (ev.key === 'Enter') { ev.preventDefault(); inp.blur(); } if (ev.key === 'Escape') { ev.stopPropagation(); const r = c.roteiros.find(x => x.id === inp.dataset.cpn); inp.value = r ? r.n : ''; inp.blur(); } };
  });
  ov.querySelectorAll('[data-cprx]').forEach(b => b.onclick = () => {
    const id = b.dataset.cprx;
    capSalva(c.id, cc => ({ roteiros: rs(cc).filter(x => x.id !== id) }), 'Roteiro tirado · Ctrl+Z desfaz');
  });
  const novo = document.getElementById('cpNovoRot');
  if (novo) novo.onkeydown = ev => {
    if (ev.key !== 'Enter' || ev.shiftKey) return;
    ev.preventDefault();
    const bruto = novo.value, nomes = bruto.split(/\r?\n/).map(t => t.replace(/^\s*(?:[-•*]|\d+[.)])\s*/, '').replace(/\s+/g, ' ').trim()).filter(Boolean);
    if (!nomes.length) return;
    novo.value = ''; novo.rows = 1;
    capSalva(c.id, cc => ({ roteiros: rs(cc).concat(nomes.map(nm => ({ n: nm, g: '' }))) }), nomes.length > 1 ? nomes.length + ' roteiros novos · Ctrl+Z desfaz' : '')
      .then(okk => { const i = document.getElementById('cpNovoRot'); if (!i) return; if (!okk && !i.value) i.value = bruto; i.focus(); });
  };
  if (novo) novo.addEventListener('paste', () => setTimeout(() => { if (/\n/.test(novo.value)) novo.rows = Math.min(8, novo.value.split('\n').length); }, 0));
  // posts
  ov.querySelectorAll('[data-cppx]').forEach(b => b.onclick = () => { const sid = b.dataset.cppx; capSalva(c.id, cc => ({ posts: cc.posts.filter(id => id !== sid) }), 'Post desligado · Ctrl+Z desfaz'); });
  ov.querySelectorAll('[data-cpliga]').forEach(b => b.onclick = () => { const sid = b.dataset.cpliga; capSalva(c.id, cc => cc.posts.includes(sid) ? null : { posts: cc.posts.concat([sid]) }, 'Post ligado · Ctrl+Z desfaz'); });
  const busca = document.getElementById('cpBusca');
  if (busca) busca.oninput = () => { CAPM.busca = busca.value; const pos = busca.selectionStart; capDesenhaFolha(); const i = document.getElementById('cpBusca'); if (i) { i.focus(); i.setSelectionRange(pos, pos); } };
  if (busca) busca.onkeydown = ev => { if (ev.key === 'Escape') { ev.stopPropagation(); CAPM.pick = false; capDesenhaFolha(); } };
  // nota
  const nota = document.getElementById('cpNota');
  if (nota) nota.onblur = () => { const v = nota.value.trim(); if (v !== (c.nota || '')) capSalva(c.id, cc => v === (cc.nota || '') ? null : { nota: v }); };
  const tit = document.getElementById('cpTitulo');
  if (tit) {
    tit.onblur = () => { const v = tit.value.replace(/\s+/g, ' ').trim(); if (v !== (c.titulo || '')) capSalva(c.id, cc => v === (cc.titulo || '') ? null : { titulo: v }); };
    tit.onkeydown = ev => { if (ev.key === 'Enter') { ev.preventDefault(); tit.blur(); } if (ev.key === 'Escape') { ev.stopPropagation(); tit.value = c.titulo || ''; tit.blur(); } };
  }
  const link = document.getElementById('cpLink');
  if (link) link.onkeydown = ev => { if (ev.key === 'Enter') { ev.preventDefault(); ov.querySelector('[data-cp="link"]').click(); } };
}

// ---------------- no calendário dos posts ----------------
/**
 * A câmera no card do post: ligado a uma captação, o dia da gravação ("gravado" quando a captação terminou); vídeo sem
 * captação, a câmera (e "captar" quando a copy ou o roteiro foi aprovado). Arte sem captação não ganha nada.
 */
function capMarca(s, e) {
  if (s.postado || (e && (e.k === 'ar' || e.k === 'esp'))) return '';
  const cs = capsDoPost(s.id);
  if (cs.length) {
    const c = cs[0], n = c.roteiros.length, g = capGravados(c), sit = capSit(c);
    const t = 'Captação: ' + capTitulo(c) + ' · ' + c.dias.map(x => capDiaL(x.d)).join(' e ') + (n ? ' · ' + g + ' de ' + n + ' roteiros gravados' : '');
    if (sit === 'gravada') return '<span class="lp-mk cap feito" title="' + esc(t) + '">' + icon('check') + '<span class="t">gravado</span></span>';
    const hoje = hojeStr(), prox = (c.dias.find(x => x.d >= hoje) || c.dias[c.dias.length - 1] || {}).d;
    return '<span class="lp-mk cap ok' + (sit === 'faltou' ? ' falta' : '') + '" title="' + esc(t) + '">' + icon('camera') + (prox ? '<span class="t">' + esc(lpDiaC(prox)) + '</span>' : '') + '</span>';
  }
  if (pecaDoPost(s) !== 'video' || (s.sugestao && !s.taskId)) return '';
  // a task de produção já passou da edição (em aprovação, ajustar ou pronta): a captação ficou pra trás
  if (typeof stBucket === 'function' && ['pronto', 'aprovar', 'alterar'].includes(stBucket(s))) return '';
  if (s.aprov && s.aprov.c && s.aprov.c.st === 'aprovado') return '<span class="lp-mk cap pede" title="Roteiro aprovado: pra captar. Falta ligar a uma captação (botão Captação)">' +
    icon('camera') + '<span class="t">captar</span></span>';
  return '<span class="lp-mk cap" title="Vídeo: tem captação">' + icon('camera') + '</span>';
}
