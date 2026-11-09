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
const CAPM = { aberta: null, diaCtx: null, fila: Promise.resolve(), rev: 0, redesenhando: false, textos: {}, abertos: new Set(), lendo: null, docEdit: false, menuFecha: null, pick: false, busca: '', apaga: false, apagaT: null, novo: null };
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
  texto: '<path d="M5 6.5h14M5 10.5h14M5 14.5h9M5 18.5h6"/>',
  abre: '<path d="M9 6l6 6-6 6"/>',
  tesoura: '<circle cx="6.5" cy="7" r="2.5"/><circle cx="6.5" cy="17" r="2.5"/><path d="M8.6 8.4L19 16M8.6 15.6L19 8"/>',
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
  if (CPH.pop || CPH.svg || CPH.alvos.length) capHoverFecha();   // o calendário vai ser redesenhado
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
  d.setAttribute('aria-label', 'Captação' + (c.aba ? ' da ' + nomeAba(c.aba) : ' sem empresa') + ': ' + capTitulo(c) + '. ' + capDiaL(dia.d) + (nd > 1 ? ', dia ' + (i + 1) + ' de ' + nd : '') + '. ' + rot + '. ' + postsTxt + '.');
  d.innerHTML =
    // v4.17: a empresa no lugar da palavra "Captação" (o modo já diz que é captação); sem empresa, avisa
    '<div class="cpc-top"><span class="cpc-et' + (c.aba ? '' : ' sem') + '">' + (sit === 'gravada' ? icon('check') + 'Gravada · ' : '') + esc(c.aba ? nomeAba(c.aba) : 'Sem empresa') + '</span>' +
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
  // v4.16: o mouse parado no card mostra o que a captação destrava (os posts, a edição e o dia que sai)
  d.addEventListener('mouseenter', () => capHoverQuando(c, d));
  d.addEventListener('mouseleave', capHoverFecha);
  d.addEventListener('focus', () => { if (d.matches(':focus-visible')) capHoverQuando(c, d); });
  d.addEventListener('blur', capHoverFecha);
  d.addEventListener('dragstart', capHoverFecha);
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
/** v4.16: guarda o texto completo dos roteiros que vieram na resposta (o /api/state só traz o tamanho). */
function capGuardaTextos(c) { if (c && c.roteiros) for (const r of c.roteiros) if ('t' in r) CAPM.textos[r.id] = r.t || ''; }
/** Pede a captação inteira (com os textos) quando a folha abre e algum roteiro tem texto que ainda não veio. */
function capLeTextos(id) {
  const c = capPorId(id); if (!c || CAPM.lendo === id) return;
  if (!c.roteiros.some(r => r.tt && !(r.id in CAPM.textos))) return;
  CAPM.lendo = id;
  api('/api/captacao/' + id).then(j => { capGuardaTextos(j.captacao); }).catch(() => {}).finally(() => { CAPM.lendo = null; capRedesenha(); });
}
/**
 * v4.16: o que foi colado no roteiro novo. Com "ROTEIRO 1 ..." no começo de alguma linha, cada um desses vira um roteiro
 * e as linhas de baixo viram o texto completo dele (o que vem antes do primeiro fica de fora). Sem isso, uma linha = um roteiro.
 */
function capQuebraLista(bruto) {
  const linhas = String(bruto || '').replace(/\r\n?/g, '\n').split('\n'), cab = /^\s*(?:[-•*]\s*)?roteiro\s*\d+/i;
  const limpa = t => t.replace(/\s+/g, ' ').trim().slice(0, 120);
  if (!linhas.some(l => cab.test(l))) return linhas.map(l => limpa(l.replace(/^\s*(?:[-•*]|\d+[.)])\s*/, ''))).filter(Boolean).map(n => ({ n, t: '' }));
  const out = []; let at = null;
  for (const l of linhas) {
    if (cab.test(l)) { at = { n: limpa(l.replace(/^\s*[-•*]\s*/, '')), t: [] }; out.push(at); }
    else if (at) at.t.push(l);
  }
  return out.map(x => ({ n: x.n, t: x.t.join('\n').trim() }));
}
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
      const j = await api('/api/captacao', { method: 'POST', body: JSON.stringify(Object.assign({ dia, link }, ehTodos() ? {} : { aba: S.aba })) });   // v4.17: criada na aba da empresa, fica nela
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
    capVersao(j.rev); capGuardaTextos(j.captacao);
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
  if (CAPM.aberta !== id) CAPM.abertos = new Set();
  CAPM.docEdit = false;
  CAPM.aberta = id; CAPM.diaCtx = diaCtx || null; CAPM.pick = false; CAPM.busca = ''; CAPM.apaga = false;
  capHoverFecha();
  capDesenhaFolha();
  document.getElementById('ovCap').classList.add('open');
  capLeTextos(id);
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
/**
 * Redesenha a folha. Ao trocar o HTML, o Chrome dispara o blur do campo focado ainda dentro do documento: os campos
 * olham CAPM.redesenhando pra não salvar pela metade (nem pôr o mesmo roteiro de novo a cada redesenho).
 */
function capDesenhaFolha() { CAPM.redesenhando = true; try { capDesenhaFolhaJa(); } finally { CAPM.redesenhando = false; } }
function capDesenhaFolhaJa() {
  if (CAPM.menuFecha) CAPM.menuFecha(false);
  const c = capPorId(CAPM.aberta);
  const ov = document.getElementById('ovCap');
  if (!c) { if (ov) ov.classList.remove('open'); return; }
  // o que está sendo digitado (roteiro novo, nota, nome de roteiro, link) sobrevive ao redesenho depois de um salvamento
  const ant = document.activeElement, emFolha = ant && ant.closest && ant.closest('#ovCap');
  const chave = emFolha && ['cpn', 'cpdia', 'cphora', 'cprt'].find(k => ant.dataset[k] !== undefined);
  const foco = emFolha && (ant.id ? '#' + ant.id : chave ? '[data-' + chave + '="' + ant.dataset[chave] + '"]' : '');
  const texto = emFolha && (ant.tagName === 'TEXTAREA' || (ant.tagName === 'INPUT' && !/^(date|time)$/.test(ant.type))) ? { v: ant.value, a: ant.selectionStart, b: ant.selectionEnd } : null;
  const rascNovo = (document.getElementById('cpNovoRot') || {}).value || '';
  const h = c.hub, n = c.roteiros.length, g = capGravados(c), sit = capSit(c), alerta = capAlerta(c);
  const link = (h && h.url) || c.taskUrl;
  document.getElementById('cpHead').innerHTML =
    '<div class="cp-eyebrow"' + (c.aba ? ' style="--cp-emp:' + capCorEmpresa(c.aba) + '"' : '') + '>' + icon('camera') + 'Captação</div>' +
    // sem a task do Hub (link que o Hub não achou, ou o Hub fora do ar), o nome se escreve aqui
    (h ? '<h2 class="cp-tit" title="' + esc(capTitulo(c)) + '">' + esc(capTituloCurto(c)) + '</h2>'
      : '<input id="cpTitulo" class="cp-tit cp-titinp" value="' + esc(c.titulo || '') + '" placeholder="Nome da captação" maxlength="120" autocomplete="off" aria-label="Nome da captação">') +
    '<div class="cp-meta">' +
      // v4.17: a empresa (diz em que aba a captação aparece; a Todos mostra todas)
      // v4.18: um botão que abre o menu do painel (a lista do sistema saía branca e sem texto no Windows)
      '<button type="button" id="cpEmp" class="cp-empsel' + (c.aba ? '' : ' sem') + '" aria-haspopup="menu" aria-expanded="false" title="Empresa da captação: ela aparece na aba dessa empresa e na Todos"' +
        (c.aba ? ' style="--cp-emp:' + capCorEmpresa(c.aba) + '"' : '') + '><i></i><span>' + esc(c.aba ? nomeAba(c.aba) : 'Escolha a empresa') + '</span>' + icon('chevR', 'cp-empseta') + '</button>' +
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
      '<input class="cp-rn" value="' + esc(r.n) + '" data-cpn="' + r.id + '" aria-label="Título do roteiro" maxlength="120">' +
      // v4.16: só o título aparece; o roteiro completo fica guardado nele (o botão abre)
      '<span class="cp-racoes"><button type="button" class="cp-rtog' + (r.tt || CAPM.textos[r.id] ? ' tem' : '') + (CAPM.abertos.has(r.id) ? ' on' : '') + '" data-cpabre="' + r.id + '" aria-expanded="' + CAPM.abertos.has(r.id) + '" title="' +
          (r.tt || CAPM.textos[r.id] ? 'Ver o roteiro completo' : 'Pôr o roteiro completo') + '" aria-label="Roteiro completo de ' + esc(r.n) + '">' + capIc('texto') + capIc('abre', 'cp-rseta') + '</button></span>' +
      (r.g ? (ds.length > 1 ? '<select class="cp-rd" data-cprd="' + r.id + '" aria-label="Dia em que foi gravado">' + ds.map(d => '<option value="' + d + '"' + (d === r.g ? ' selected' : '') + '>' + esc(capDiaL(d)) + '</option>').join('') + '</select>'
        : '<span class="cp-rd1">' + esc(capDiaL(r.g)) + '</span>') : '<span class="cp-rpend">a gravar</span>') +
      '<button type="button" class="cp-x" data-cprx="' + r.id + '" title="Tirar o roteiro" aria-label="Tirar o roteiro ' + esc(r.n) + '">' + icon('x') + '</button>' +
    '</div>' + (CAPM.abertos.has(r.id) ? capDetalhe(r) : '')).join('');
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
    '<section class="cp-sec"><h3>Roteiros <span class="cp-cont">' + (n ? g + ' de ' + n + ' gravados' : 'nenhum ainda') + '</span>' + capDocCab(c) + '</h3>' + (CAPM.docEdit ? capDocEdit(c) : '') +
      (n ? '<div class="cp-prog" aria-hidden="true"><i style="width:' + Math.round(100 * g / n) + '%"></i></div>' : '') +
      // v4.15: a linha do roteiro novo já parece um roteiro (a caixinha vazia na frente) e tem o botão Adicionar;
      // o que foi escrito entra sozinho ao sair do campo (o Zion escreveu e não sabia que era pra apertar Enter)
      '<div class="cp-rots">' + rots +
        '<div class="cp-rotnovo"><span class="cp-chk fantasma" aria-hidden="true"></span>' +
          '<textarea id="cpNovoRot" class="cp-novorot" rows="1" placeholder="' + (n ? 'Mais um roteiro' : 'Escreva o roteiro') + ' e aperte Enter" aria-label="Roteiro novo"></textarea>' +
          '<button type="button" class="mbtn cp-addrot" data-cp="addrot">' + icon('plus') + 'Adicionar</button></div></div>' +
      (n ? '' : '<p class="cp-dica">Cada roteiro ganha a caixinha de gravado. Colou uma lista? Vira um roteiro por linha.</p>') + '</section>' +
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
/** v4.16: o roteiro aberto: o texto completo. */
function capDetalhe(r) {
  const lendo = r.tt && !(r.id in CAPM.textos), t = lendo ? '' : (CAPM.textos[r.id] || '');
  const linhas = Math.min(16, Math.max(4, t.split('\n').length + 1));
  return '<div class="cp-rdet" data-rdet="' + r.id + '">' +
    '<textarea class="cp-rtx" data-cprt="' + r.id + '" rows="' + linhas + '" maxlength="8000" ' + (lendo ? 'disabled placeholder="Carregando o roteiro…"' : 'placeholder="Cole aqui o roteiro completo: fala, cenas, tomadas"') + ' aria-label="Roteiro completo">' + esc(t) + '</textarea></div>';
}
/**
 * v4.18: o menu da empresa da captação, no desenho dos menus do painel (o "Pra qual conta?" do banco): as 4 empresas
 * com a bolinha da cor delas e o visto na atual. Setas andam, Enter escolhe, Esc fecha só o menu (a folha fica).
 */
function capMenuEmpresa(btn, c) {
  if (CAPM.menuFecha) { CAPM.menuFecha(true); return; }
  const m = document.createElement('div');
  m.className = 'vagapop bk-escolhe cp-empmenu'; m.id = 'cpEmpMenu'; m.setAttribute('role', 'menu'); m.setAttribute('aria-label', 'Empresa da captação');
  m.innerHTML = '<h4>Empresa da captação</h4>' + (S.abas || []).map(a => '<button type="button" role="menuitemradio" aria-checked="' + (a === c.aba) + '" data-aba="' + esc(a) + '">' +
    '<i style="background:' + capCorEmpresa(a) + '"></i><span>' + esc(nomeAba(a)) + '</span>' + (a === c.aba ? icon('check') : '') + '</button>').join('');
  document.body.appendChild(m);
  const r = btn.getBoundingClientRect(), mr = m.getBoundingClientRect();
  m.style.left = Math.max(8, Math.min(r.left, innerWidth - mr.width - 8)) + 'px';
  m.style.top = (r.bottom + 6 + mr.height > innerHeight - 8 ? Math.max(8, r.top - mr.height - 6) : r.bottom + 6) + 'px';
  btn.setAttribute('aria-expanded', 'true');
  const itens = [...m.querySelectorAll('button')];
  const fecha = foco => {
    document.removeEventListener('mousedown', fora, true); document.removeEventListener('keydown', tecla, true);
    m.remove(); CAPM.menuFecha = null;
    if (btn.isConnected) { btn.setAttribute('aria-expanded', 'false'); if (foco) btn.focus(); }
  };
  const fora = ev => { if (!m.contains(ev.target) && !btn.contains(ev.target)) fecha(false); };
  const tecla = ev => {
    if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); fecha(true); return; }
    if (ev.key === 'Tab') { fecha(false); return; }
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      ev.preventDefault();
      const i = itens.indexOf(document.activeElement), n = itens.length;
      itens[((i < 0 ? 0 : i) + (ev.key === 'ArrowDown' ? 1 : -1) + n) % n].focus();
    }
  };
  itens.forEach(b => b.onclick = () => { fecha(true); capTrocaEmpresa(c, b.dataset.aba); });
  CAPM.menuFecha = fecha;
  setTimeout(() => { document.addEventListener('mousedown', fora, true); document.addEventListener('keydown', tecla, true); (itens.find(b => b.dataset.aba === c.aba) || itens[0]).focus(); }, 0);
}
/** Troca a empresa (a escolha fica fixa, mesmo que seja a mesma que vinha do MKT Hub) e avisa onde ela aparece. */
function capTrocaEmpresa(c, a) {
  if (!a) return;
  const sai = !ehTodos() && S.aba !== a;
  capSalva(c.id, cc => (cc.aba === a && cc.abaFixa ? null : { aba: a }), 'Captação da ' + nomeAba(a) + (sai ? ': agora aparece na aba ' + nomeAba(a) + ' e na Todos' : '') + ' · Ctrl+Z desfaz');
}
/** v4.16: o doc dos roteiros (um só pra captação): o link que abre, o lápis pra trocar; sem doc, o botão pra pôr. */
function capDocCab(c) {
  if (CAPM.docEdit) return '';
  if (c.doc) return '<span class="cp-doccab"><a class="cp-docc" href="' + esc(c.doc) + '" target="_blank" rel="noopener" title="Abrir o doc dos roteiros">' + icon('doc') + 'Doc dos roteiros' + icon('external') + '</a>' +
    '<button type="button" class="cp-x" data-cp="docedit" title="Trocar ou tirar o link do doc" aria-label="Trocar o link do doc dos roteiros">' + icon('pencil') + '</button></span>';
  return '<button type="button" class="cp-docadd" data-cp="docedit">' + icon('doc') + 'Doc dos roteiros</button>';
}
function capDocEdit(c) {
  return '<div class="cp-rdocl">' + icon('doc') + '<input id="cpDoc" value="' + esc(c.doc || '') + '" placeholder="Cole o link do doc dos roteiros (vazio tira)" autocomplete="off" aria-label="Link do doc dos roteiros">' +
    '<button type="button" class="mbtn primary" data-cp="docok">Salvar</button></div>';
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
  // o roteiro novo: Enter, o botão Adicionar ou sair do campo põem o que foi escrito (uma linha = um roteiro)
  const novo = document.getElementById('cpNovoRot');
  const addRot = fica => {
    if (!novo) return;
    const bruto = novo.value, itens = capQuebraLista(bruto), comTexto = itens.filter(x => x.t).length;
    if (!itens.length) { if (fica) novo.focus(); return; }
    novo.value = ''; novo.rows = 1;
    capSalva(c.id, cc => ({ roteiros: rs(cc).concat(itens.map(x => Object.assign({ n: x.n, g: '' }, x.t ? { t: x.t } : {}))) }),
      itens.length > 1 ? capPl(itens.length, 'roteiro novo', 'roteiros novos') + (comTexto ? ' (' + (comTexto === itens.length ? 'todos' : comTexto) + ' com o texto completo)' : '') + ' · Ctrl+Z desfaz' : comTexto ? 'Roteiro novo com o texto completo · Ctrl+Z desfaz' : '')
      .then(okk => { const i = document.getElementById('cpNovoRot'); if (!i) return; if (!okk && !i.value) i.value = bruto; if (fica || !okk) i.focus(); });
  };
  ov.querySelectorAll('[data-cp]').forEach(b => b.onclick = async () => {
    const a = b.dataset.cp;
    if (a === 'addrot') addRot(true);
    else if (a === 'docedit') { CAPM.docEdit = true; capDesenhaFolha(); setTimeout(() => { const i = document.getElementById('cpDoc'); if (i) { i.focus(); i.select(); } }, 20); }
    else if (a === 'docok') salvaDoc();
    else if (a === 'dia') {
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
    inp.onblur = () => { if (!CAPM.redesenhando && inp.isConnected) salva(); };
    inp.onkeydown = ev => { if (ev.key === 'Enter') { ev.preventDefault(); inp.blur(); } };
  });
  // v4.16: abrir e fechar o roteiro completo; o texto salva ao sair do campo; o doc ao sair, no Enter ou ao colar
  ov.querySelectorAll('[data-cpabre]').forEach(b => b.onclick = () => {
    const id = b.dataset.cpabre, abre = !CAPM.abertos.has(id);
    if (abre) CAPM.abertos.add(id); else CAPM.abertos.delete(id);
    capDesenhaFolha(); capLeTextos(c.id);
    if (abre) setTimeout(() => { const t = document.querySelector('[data-cprt="' + id + '"]'); if (t && !t.value && !t.disabled) t.focus(); }, 20);
  });
  ov.querySelectorAll('[data-cprt]').forEach(t => {
    t.oninput = () => { t.rows = Math.min(16, Math.max(4, t.value.split('\n').length + 1)); };
    t.onblur = () => {
      if (CAPM.redesenhando || !t.isConnected || t.disabled) return;
      const id = t.dataset.cprt, v = t.value;
      if (v.trim() === (CAPM.textos[id] || '').trim()) return;
      CAPM.textos[id] = v.trim();
      capSalva(c.id, cc => ({ roteiros: rs(cc).map(x => x.id === id ? Object.assign(x, { t: v }) : x) }), v.trim() ? '' : 'Texto do roteiro apagado · Ctrl+Z desfaz');
    };
  });
  // v4.16: o doc dos roteiros (Enter, Salvar, colar ou sair do campo salvam; Esc desiste)
  const docIn = document.getElementById('cpDoc');
  const salvaDoc = () => {
    if (!docIn) return;
    const v = docIn.value.trim(); CAPM.docEdit = false;
    if (v === (c.doc || '')) { capDesenhaFolha(); return; }
    capSalva(c.id, { doc: v }, v ? 'Doc dos roteiros ligado · Ctrl+Z desfaz' : 'Doc dos roteiros tirado · Ctrl+Z desfaz').then(ok => { if (!ok) { CAPM.docEdit = true; capRedesenha(); } });
  };
  if (docIn) {
    docIn.onkeydown = ev => {
      if (ev.key === 'Enter') { ev.preventDefault(); salvaDoc(); }
    };
    docIn.onblur = () => { if (!CAPM.redesenhando && docIn.isConnected && CAPM.docEdit) salvaDoc(); };
    docIn.addEventListener('paste', () => setTimeout(() => { if (docIn.isConnected && CAPM.docEdit) salvaDoc(); }, 0));
    const ok = ov.querySelector('[data-cp="docok"]'); if (ok) ok.onmousedown = ev => ev.preventDefault();
  }
  ov.querySelectorAll('[data-cprx]').forEach(b => b.onclick = () => {
    const id = b.dataset.cprx;
    capSalva(c.id, cc => ({ roteiros: rs(cc).filter(x => x.id !== id) }), 'Roteiro tirado · Ctrl+Z desfaz');
  });
  if (novo) {
    novo.onkeydown = ev => {
      if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); addRot(true); }
    };
    // sair do campo põe o roteiro; o blur do redesenho (o texto passa pro campo novo) não conta
    novo.onblur = () => { if (!CAPM.redesenhando && novo.isConnected && novo.value.trim()) addRot(false); };
    novo.addEventListener('paste', () => setTimeout(() => { if (/\n/.test(novo.value)) novo.rows = Math.min(8, novo.value.split('\n').length); }, 0));
    const ad = ov.querySelector('[data-cp="addrot"]');
    if (ad) ad.onmousedown = ev => ev.preventDefault();   // o clique no botão não tira o foco do campo (senão entrava 2 vezes)
  }
  // posts
  ov.querySelectorAll('[data-cppx]').forEach(b => b.onclick = () => { const sid = b.dataset.cppx; capSalva(c.id, cc => ({ posts: cc.posts.filter(id => id !== sid) }), 'Post desligado · Ctrl+Z desfaz'); });
  ov.querySelectorAll('[data-cpliga]').forEach(b => b.onclick = () => { const sid = b.dataset.cpliga; capSalva(c.id, cc => cc.posts.includes(sid) ? null : { posts: cc.posts.concat([sid]) }, 'Post ligado · Ctrl+Z desfaz'); });
  const busca = document.getElementById('cpBusca');
  if (busca) busca.oninput = () => { CAPM.busca = busca.value; const pos = busca.selectionStart; capDesenhaFolha(); const i = document.getElementById('cpBusca'); if (i) { i.focus(); i.setSelectionRange(pos, pos); } };
  if (busca) busca.onkeydown = ev => { if (ev.key === 'Escape') { ev.stopPropagation(); CAPM.pick = false; capDesenhaFolha(); } };
  // nota
  const nota = document.getElementById('cpNota');
  if (nota) nota.onblur = () => { if (CAPM.redesenhando || !nota.isConnected) return; const v = nota.value.trim(); if (v !== (c.nota || '')) capSalva(c.id, cc => v === (cc.nota || '') ? null : { nota: v }); };
  const emp = document.getElementById('cpEmp');
  if (emp) emp.onclick = () => capMenuEmpresa(emp, c);
  const tit = document.getElementById('cpTitulo');
  if (tit) {
    tit.onblur = () => { if (CAPM.redesenhando || !tit.isConnected) return; const v = tit.value.replace(/\s+/g, ' ').trim(); if (v !== (c.titulo || '')) capSalva(c.id, cc => v === (cc.titulo || '') ? null : { titulo: v }); };
    tit.onkeydown = ev => { if (ev.key === 'Enter') { ev.preventDefault(); tit.blur(); } };
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

// ---------------- v4.16: o mouse na captação mostra o que ela destrava ----------------
// Pedido do Zion (09/11/2026): "preciso de uma visualização de quando sai a task de edição vinculada a task de captação.
// passando o mouse por cima e vendo as tasks que destravam com aquela captação. talvez no dia que esta no bone e tudo
// mais". No modo captação, o mouse parado no card abre o balão com os posts ligados (o prazo da edição, que é o da task
// do post no MKT Hub, o dia em que sai e a etapa) e acende, no calendário, os dias da edição e do post que estão na
// tela, com a seta saindo do card (o mesmo desenho do hover dos posts, v4.01).
const CPH = { timer: null, pop: null, svg: null, alvos: [] };
function capHoverFecha() {
  clearTimeout(CPH.timer);
  if (CPH.pop) CPH.pop.remove();
  if (CPH.svg) CPH.svg.remove();
  for (const el of CPH.alvos) { el.classList.remove('cp-alvo', 'cph-origem'); const r = el.querySelector(':scope > .cp-alvos'); if (r) r.remove(); }
  const g = document.getElementById('grid'); if (g) g.classList.remove('cph-on');
  CPH.pop = CPH.svg = null; CPH.alvos = [];
}
/** Espera um tiquinho: passar o mouse por cima de vários cards não fica piscando. */
function capHoverQuando(c, card) {
  capHoverFecha();
  const ov = document.getElementById('ovCap');
  if (S.dragging || (ov && ov.classList.contains('open'))) return;
  CPH.timer = setTimeout(() => { if (card.isConnected && card.matches(':hover, :focus-visible')) capHoverAbre(capPorId(c.id) || c, card); }, 260);
}
/** Curva suave de (x1, y1) até (x2, y2), com a barriga pro lado (não sobe e desce como a dos posts) e a ponta da seta. */
function capCurva(x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1, k = 0.16, cx = (x1 + x2) / 2 + dy * k * Math.sign(dx || 1), cy = (y1 + y2) / 2 - Math.abs(dx) * k;
  const a = Math.atan2(y2 - cy, x2 - cx), L = 9, f = n => n.toFixed(1);
  return {
    d: 'M' + f(x1) + ' ' + f(y1) + ' Q' + f(cx) + ' ' + f(cy) + ' ' + f(x2) + ' ' + f(y2),
    s: 'M' + f(x2 - L * Math.cos(a - 0.5)) + ' ' + f(y2 - L * Math.sin(a - 0.5)) + ' L' + f(x2) + ' ' + f(y2) + ' L' + f(x2 - L * Math.cos(a + 0.5)) + ' ' + f(y2 - L * Math.sin(a + 0.5)),
  };
}
/** O nome curto do post pra etiqueta do dia (sem o "[Reels]" da frente). */
function capCurto(s) { const t = String(s.tituloCache || s.titulo || 'post').replace(/^\s*\[[^\]]*\]\s*/, ''); return t.length > 24 ? t.slice(0, 23).trimEnd() + '…' : t; }
/** Dias pra editar: da última gravação até o prazo da edição (0 = no dia; negativo = antes de gravar). */
function capFolgaTxt(f) {
  if (f === null) return '';
  return '<em>' + (f < 0 ? 'antes da gravação!' : f === 0 ? 'no dia da gravação' : capPl(f, 'dia pra editar', 'dias pra editar')) + '</em>';
}
function capHoverAbre(c, card) {
  capHoverFecha();
  const u = capUltimo(c), vw = innerWidth, vh = innerHeight, r = card.getBoundingClientRect(), g = document.getElementById('grid');
  const folga = d => (d && u ? capDif(d, u) : null), cor = f => (f === null ? '' : f <= 0 ? 'red' : f <= 2 ? 'or' : '');
  const chave = s => (s.hub && s.hub.prazo ? String(s.hub.prazo).slice(0, 10) : '') || s.date || '9';
  const itens = capPostsDe(c).slice().sort((a, b) => chave(a).localeCompare(chave(b))).map(s => {
    const ed = s.hub && s.hub.prazo ? String(s.hub.prazo).slice(0, 10) : '';
    return { s, ed, sai: s.date || '', e: typeof lpEtapa === 'function' ? lpEtapa(s) : null, fEd: folga(ed), fSai: folga(s.date) };
  });
  // os dias que estão na tela: a edição (no rosa da produção) e o dia que sai (na cor da conta)
  const alvos = new Map();
  const poe = (d, x) => { if (d) { if (!alvos.has(d)) alvos.set(d, []); alvos.get(d).push(x); } };
  for (const it of itens) {
    if (it.ed) poe(it.ed, { m: 'var(--e-prod)', ic: capIc('tesoura'), txt: 'edição · ' + capCurto(it.s), c: cor(it.fEd) });
    if (it.sai) poe(it.sai, { m: contaCor(it.s.conta), ic: icon('calendar'), txt: (it.s.postado ? 'saiu · ' : 'sai · ') + capCurto(it.s), c: it.ed ? '' : cor(it.fSai) });
  }
  const naTela = new Map();
  if (g) alvos.forEach((l, d) => {
    const cell = g.querySelector('.cpday[data-dia="' + d + '"]'); if (!cell) return;
    const q = cell.getBoundingClientRect();
    if (q.bottom > 60 && q.top < vh - 10 && q.right > 0 && q.left < vw) naTela.set(d, cell);
  });
  // o balão
  const pop = document.createElement('div');
  pop.className = 'cph-pop'; pop.setAttribute('role', 'tooltip');
  const fora = d => (d && !naTela.has(d) ? '<i>fora da tela</i>' : '');
  pop.innerHTML = '<div class="cph-tit">' + (itens.length ? 'Destrava ' + capPl(itens.length, 'post', 'posts') : 'Nenhum post ligado ainda') + '</div>' +
    '<div class="cph-grava">' + icon('camera') + '<span>Grava ' + esc(c.dias.map(x => capDiaL(x.d) + (x.h ? ' ' + capHora(x.h) : '')).join(' e ') || 'sem dia') + '</span></div>' +
    (itens.length ? '<div class="cph-lista">' + itens.map(it => {
      const s = it.s, e = it.e, k = e && LP.NOME[e.k] ? e.k : '';
      return '<div class="cph-p">' +
        '<div class="cph-l1"><span class="cdot" style="background:' + contaCor(s.conta) + '"></span><b>' + esc(contaCurta(s.conta)) + '</b>' +
          '<span class="cph-t">' + esc(s.tituloCache || s.titulo || 'Post sem nome') + '</span>' +
          (k ? '<span class="cph-et" style="--c:var(--e-' + (e.lider ? 'lider' : k) + ')">' + esc(LP.NOME[k]) + '</span>' : '') + '</div>' +
        '<div class="cph-l2">' +
          (it.ed ? '<span class="cph-d ' + cor(it.fEd) + '">' + capIc('tesoura') + '<span>edição até <b>' + esc(capDiaL(it.ed)) + '</b></span>' + capFolgaTxt(it.fEd) + fora(it.ed) + '</span>'
            : '<span class="cph-d sem">' + capIc('tesoura') + '<span>sem prazo de edição no MKT Hub</span></span>') +
          (it.sai ? '<span class="cph-d ' + (it.ed ? '' : cor(it.fSai)) + '">' + icon('calendar') + '<span>' + (s.postado ? 'saiu ' : 'sai ') + '<b>' + esc(capDiaL(it.sai)) + '</b></span>' + fora(it.sai) + '</span>' : '') +
        '</div></div>';
    }).join('') + '</div>' + (naTela.size || !alvos.size ? '' : '<div class="cph-dica">' + (S.view === 'semana' ? 'Esses dias não estão nesta semana: no Mês dá pra ver tudo junto.' : 'Esses dias não estão na tela: role o calendário.') + '</div>')
      : '<div class="cph-dica">Ligue os posts e as tasks de edição na folha da captação.</div>');
  document.body.appendChild(pop);
  CPH.pop = pop;
  // os dias acesos: contorno tracejado no índigo da captação e uma etiqueta por post
  // v4.18: o holofote: o resto do calendário apaga e ficam o dia da gravação e os dias acesos (o Zion não via os dias)
  const origem = card.closest('.cpday');
  if (g && naTela.size) { g.classList.add('cph-on'); if (origem) { origem.classList.add('cph-origem'); CPH.alvos.push(origem); } }
  naTela.forEach((cell, d) => {
    cell.classList.add('cp-alvo'); CPH.alvos.push(cell);
    const box = document.createElement('div'); box.className = 'cp-alvos';
    box.innerHTML = alvos.get(d).map(x => '<span class="cp-alvo-rot' + (x.c ? ' ' + x.c : '') + '" style="--m:' + x.m + '">' + x.ic + '<span>' + esc(x.txt) + '</span></span>').join('');
    cell.appendChild(box);
  });
  // o balão fica do lado do card ou num canto da tela, onde não cobre os dias acesos nem o card (senão, onde cobre menos)
  const pw = pop.offsetWidth, ph = pop.offsetHeight, evita = [...naTela.values()].map(el => el.getBoundingClientRect()).concat([r]);
  const yy = y => Math.max(8, Math.min(vh - ph - 8, y)), xx = x => Math.max(8, Math.min(vw - pw - 8, x));
  const cand = [[r.right + 10, yy(r.top)], [r.left - pw - 10, yy(r.top)], [xx(r.left), r.bottom + 8], [xx(r.left), r.top - ph - 8],
    [vw - pw - 12, vh - ph - 12], [12, vh - ph - 12], [vw - pw - 12, 64], [12, 64]];
  const cabe = ([x, y]) => x >= 8 && y >= 8 && x + pw <= vw - 8 && y + ph <= vh - 8;
  const cobre = ([x, y]) => evita.reduce((t, q) => t + Math.max(0, Math.min(x + pw, q.right) - Math.max(x, q.left)) * Math.max(0, Math.min(y + ph, q.bottom) - Math.max(y, q.top)), 0);
  const dentro = cand.filter(cabe);
  const pos = dentro.find(p => !cobre(p)) || dentro.sort((a, b) => cobre(a) - cobre(b))[0] || [xx(r.right + 10), yy(r.top)];
  pop.style.left = pos[0] + 'px'; pop.style.top = pos[1] + 'px';
  // a seta: do card até cada etiqueta, por cima do calendário
  const etiq = [...document.querySelectorAll('.cp-alvo .cp-alvo-rot')].filter(el => !card.closest('.cpday').contains(el));
  if (!etiq.length) return;
  const NS = 'http://www.w3.org/2000/svg', svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'cph-svg'); svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('width', vw); svg.setAttribute('height', vh);
  for (const el of etiq) {
    // sai do lado do card que olha pra etiqueta (de baixo, se ela está na mesma coluna) e chega na ponta dela
    const q = el.getBoundingClientRect(), qx = q.left + q.width / 2, qy = q.top + q.height / 2, mesmaCol = qx > r.left && qx < r.right;
    const dir = qx > r.left + r.width / 2;
    const x1 = mesmaCol ? Math.max(r.left + 14, Math.min(r.right - 14, qx)) : dir ? r.right + 2 : r.left - 2;
    const y1 = mesmaCol ? (qy > r.bottom ? r.bottom + 2 : r.top - 2) : r.top + r.height / 2;
    const x2 = mesmaCol ? qx : dir ? q.left - 3 : q.right + 3, y2 = mesmaCol ? (qy > r.bottom ? q.top - 3 : q.bottom + 3) : qy;
    const cv = capCurva(x1, y1, x2, y2);
    const p = document.createElementNS(NS, 'path'); p.setAttribute('class', 'lp-lig'); p.setAttribute('d', cv.d); p.setAttribute('pathLength', '1');
    const a = document.createElementNS(NS, 'path'); a.setAttribute('class', 'lp-seta'); a.setAttribute('d', cv.s);
    svg.append(p, a);
  }
  document.body.appendChild(svg);
  CPH.svg = svg;
}
window.addEventListener('scroll', () => { if (CPH.pop || CPH.svg) capHoverFecha(); }, true);
window.addEventListener('resize', capHoverFecha);
document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && CPH.pop) { capHoverFecha(); ev.stopPropagation(); } }, true);   // Esc com o balão só fecha o balão (o modo captação fica)

// v4.17: Esc na folha da captação fecha guardando o que foi escrito: antes de a folha fechar, o campo com o cursor sai
// (e o "sair do campo" de cada um salva: roteiro novo, texto, nome do roteiro, doc, nota). A busca de posts e o
// campo do link da captação nova continuam com o Esc deles (fechar a busca, desistir de criar).
document.addEventListener('keydown', ev => {
  if (ev.key !== 'Escape') return;
  const ov = document.getElementById('ovCap'), a = document.activeElement;
  if (ov && ov.classList.contains('open') && a && ov.contains(a) && a.id !== 'cpBusca' && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) a.blur();
}, true);
