'use strict';
// =====================================================================
// v4.30 · A ABA FLUXOGRAMA (Fase 6 da captação de eventos amarrada)
// O fluxograma do Ultron dentro do B.O.N.E, no PC: Geral (a varredura e a escala destravam o fluxo de cada tipo) e um
// por tipo. Escolhendo um evento de verdade, as etapas pintam com o estado dele (feito, a vez, trancada, rota que não
// vale) e a folha do lado marca os checks no servidor (a mesma regra do modo captação). Linhas em SVG, zoom.
// As definições vêm do /api/fluxos (lib/fluxos.js); nada de regra no navegador: o estado vem pronto do servidor.
// =====================================================================
const FXG = { tipo: 'geral', ev: '', d: '', sel: null, zoom: 1, card: null, carregando: false };
try { const z = +localStorage.getItem('bone.fxgZoom'); if (z >= .4 && z <= 1.3) FXG.zoom = z; } catch (e) {}

/** Os eventos com fluxo pra escolher: dos últimos 7 dias aos próximos 30. */
function fxgEventos() {
  const h = hojeStr(), de = mcSomaDia(h, -7), ate = mcSomaDia(h, 30), l = [];
  for (const c of capLista()) {
    if (!capEhEvento(c) || !c.fluxo || capSit(c) === 'desmarcado') continue;
    for (const x of c.dias) if (x.d >= de && x.d <= ate) l.push({ c, d: x.d, h: x.h });
  }
  return l.sort((a, b) => a.d.localeCompare(b.d) || (a.h || '99').localeCompare(b.h || '99'));
}
async function fxgMostra(g) {
  g.classList.add('cpmapa-on', 'fxg-on');
  const lb = document.getElementById('mesLabel'); if (lb) lb.textContent = 'Fluxograma da captação de eventos';
  if (!MC.defs) {
    g.innerHTML = '<div class="mc-carrega">Carregando o fluxograma…</div>';
    try { await mcDefs(); } catch (e) { g.innerHTML = '<div class="cpm-vazio"><b>Não consegui carregar o fluxograma</b><span>' + esc(e.message) + '</span></div>'; return; }
    if (S.view !== 'fluxo') return;
  }
  // o evento escolhido: o estado completo (com as marcas) vem do servidor
  FXG.card = null;
  if (FXG.ev) {
    const c = capPorId(FXG.ev);
    if (!c || !c.fluxo) FXG.ev = '';
    else {
      FXG.tipo = c.fluxo.tipo;
      if (!FXG.full || FXG.full.id !== c.id || FXG.full.em !== JSON.stringify(c.fluxo.dias)) {
        try { const j = await api('/api/captacao/' + c.id); FXG.full = { id: c.id, em: JSON.stringify(c.fluxo.dias), c: j.captacao }; } catch (e) { toast(e.message, true); }
      }
      FXG.card = FXG.full && FXG.full.c;
      if (FXG.card && !FXG.card.fluxo.dias[FXG.d]) FXG.d = Object.keys(FXG.card.fluxo.dias)[0] || '';
    }
  }
  fxgDesenha(g);
}
function fxgDesenha(g) {
  const D = MC.defs, evs = fxgEventos(), o = FXG.card ? FXG.card.fluxo.dias[FXG.d] : null;
  const tipos = [['geral', 'Geral']].concat(D.ordem.map(k => [k, D.tipos[k].nome]));
  const evOpt = '<option value="">Sem evento (só o modelo)</option>' + evs.map(e => '<option value="' + e.c.id + '|' + e.d + '"' + (FXG.ev === e.c.id && FXG.d === e.d ? ' selected' : '') + '>' +
    esc(capDiaL(e.d) + (e.h ? ' ' + capHora(e.h) : '') + ' · ' + capTituloCurto(e.c)) + '</option>').join('');
  g.innerHTML = '<div class="fxg">' +
    '<div class="fxg-top">' +
      '<div class="fxg-tabs" role="toolbar" aria-label="Tipo de evento">' + tipos.map(([k, n]) => '<button type="button" data-fxt="' + k + '" aria-pressed="' + (FXG.tipo === k) + '"' + (FXG.ev && k !== FXG.tipo ? ' disabled title="Tire o evento pra ver outro tipo"' : '') + '>' + esc(n) + '</button>').join('') + '</div>' +
      '<div class="fxg-tool"><label class="fxg-ev">' + capIc('fluxo') + '<select id="fxgEv" aria-label="Evento de verdade">' + evOpt + '</select></label>' +
        (o ? '<span class="fxg-prog">' + o.feitas + ' de ' + o.total + ' etapas</span>' : '') +
        '<button type="button" class="mbtn" data-fxz="-1" aria-label="Diminuir">−</button><span class="fxg-zv">' + Math.round(FXG.zoom * 100) + '%</span><button type="button" class="mbtn" data-fxz="1" aria-label="Aumentar">+</button><button type="button" class="mbtn" data-fxz="0">100%</button></div>' +
    '</div>' +
    '<div class="fxg-leg"><span><i class="l-done"></i>Feito</span><span><i class="l-avail"></i>É a vez</span><span><i class="l-locked"></i>Trancada</span><span><i class="l-agent"></i>Agente (Ultron ou B.O.N.E)</span><span><i class="l-dec"></i>Decisão</span>' +
      (o ? '' : '<span class="fxg-modelo">Modelo: escolha um evento pra ver o andamento de verdade</span>') + '</div>' +
    '<div class="fxg-main"><div class="fxg-stage" id="fxgStage"><div class="fxg-canvas" id="fxgCanvas"><svg id="fxgEdges" aria-hidden="true"></svg><div id="fxgFlow"></div></div></div>' +
      '<aside class="fxg-panel" id="fxgPanel"></aside></div></div>';
  fxgMonta(o);
  g.querySelectorAll('[data-fxt]').forEach(b => b.onclick = () => { FXG.tipo = b.dataset.fxt; FXG.sel = null; render(); });
  g.querySelector('#fxgEv').onchange = e => { const [id, d] = (e.target.value || '|').split('|'); FXG.ev = id; FXG.d = d; FXG.sel = null; FXG.full = null; if (!id) FXG.tipo = 'geral'; render(); };
  g.querySelectorAll('[data-fxz]').forEach(b => b.onclick = () => { const z = +b.dataset.fxz; FXG.zoom = z ? Math.min(1.3, Math.max(.4, Math.round((FXG.zoom + z * .1) * 10) / 10)) : 1; try { localStorage.setItem('bone.fxgZoom', FXG.zoom); } catch (e) {} fxgDesenha(g); });
}
/** Monta os nós (do jeito do protótipo: colunas, losangos que abrem rotas lado a lado, raias) e as linhas. */
function fxgMonta(o) {
  const D = MC.defs, flow = document.getElementById('fxgFlow'), NOS = {}, LIG = [];
  const est = id => (o && o.est[id]) || '';
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  function place(items, box, prev, raiz) {
    for (const it of items) {
      if (it.k === 'step') {
        const s = raiz ? '' : est(it.id), m = o && o.marcas[it.id] ? o.marcas[it.id].filter(Boolean).length : 0, q = o && o.horas[it.id];
        const b = el('button', 'fxg-no' + (it.kind ? ' ' + it.kind : '') + (s ? ' ' + s : '') + (FXG.sel === it.id ? ' sel' : ''));
        b.type = 'button'; b.dataset.id = it.id;
        b.innerHTML = '<div class="w">' + esc(q ? (it.ate ? 'até ' : '') + (q.d !== FXG.d ? capDiaL(q.d) + ' ' : '') + capHora(q.h) : it.w || '') + '</div><div class="t">' + esc(it.t) + '</div><div class="q">' + esc(it.who || '') + '</div>' +
          (o && !raiz ? '<div class="c">' + (s === 'x' ? 'rota que não vale' : m + '/' + (it.checks || []).length + (s === 'avail' ? ' · é a vez' : s === 'locked' ? ' · trancada' : '')) + '</div>' : '');
        box.appendChild(b); NOS[it.id] = { el: b, def: it };
        prev.forEach(p => LIG.push([p, it.id])); prev = [it.id];
      } else if (it.k === 'dec') {
        const s = est(it.id), b = el('button', 'fxg-dec' + (s ? ' ' + s : '') + (FXG.sel === it.id ? ' sel' : ''), '<span class="shape"></span><span class="txt">' + esc(it.t) + '</span>');
        b.type = 'button'; b.dataset.id = it.id; box.appendChild(b); NOS[it.id] = { el: b, def: it };
        prev.forEach(p => LIG.push([p, it.id]));
        const sp = el('div', 'fxg-split'); box.appendChild(sp); let lasts = [];
        it.br.forEach((br, i) => {
          const col = el('div', 'fxg-col'); sp.appendChild(col);
          const lid = 'lbl:' + it.id + ':' + i, fora = o && o.rotas[it.id] !== undefined && o.rotas[it.id] !== i;
          const lb = el('div', 'fxg-lbl' + (fora ? ' x' : o && o.rotas[it.id] === i ? ' on' : ''), esc(br.lab)); col.appendChild(lb); NOS[lid] = { el: lb, lbl: true };
          LIG.push([it.id, lid]);
          const sq = el('div', 'fxg-seq'); col.appendChild(sq);
          lasts = lasts.concat(place(br.items, sq, [lid], raiz));
        });
        prev = lasts;
      } else if (it.k === 'par') {
        const sp = el('div', 'fxg-split'); box.appendChild(sp); let lasts = [];
        it.lanes.forEach((ln, i) => {
          const col = el('div', 'fxg-col'); sp.appendChild(col);
          const lid = 'lbl:' + it.id + ':' + i, lb = el('div', 'fxg-lbl', esc(ln.lab)); col.appendChild(lb); NOS[lid] = { el: lb, lbl: true };
          prev.forEach(p => LIG.push([p, lid]));
          const sq = el('div', 'fxg-seq'); col.appendChild(sq);
          lasts = lasts.concat(place(ln.items, sq, [lid], raiz));
        });
        prev = lasts;
      }
    }
    return prev;
  }
  const root = el('div', 'fxg-seq'); flow.appendChild(root);
  const ultimo = place(D.raiz, root, [], true);
  const sp = el('div', 'fxg-split'); root.appendChild(sp);
  for (const k of FXG.tipo === 'geral' ? D.ordem : [FXG.tipo]) {
    const col = el('div', 'fxg-col'); sp.appendChild(col);
    const lid = 'lbl:ev:' + k, lb = el('div', 'fxg-lbl ev', esc(D.tipos[k].nome)); col.appendChild(lb); NOS[lid] = { el: lb, lbl: true };
    ultimo.forEach(p => LIG.push([p, lid]));
    const sq = el('div', 'fxg-seq'); col.appendChild(sq);
    place(D.tipos[k].items, sq, [lid], false);
  }
  document.getElementById('fxgCanvas').style.zoom = FXG.zoom;
  FXG.nos = NOS; FXG.lig = LIG;
  flow.onclick = e => { const b = e.target.closest('[data-id]'); if (!b || !NOS[b.dataset.id] || NOS[b.dataset.id].lbl) return; FXG.sel = b.dataset.id; fxgDesenha(document.getElementById('grid')); };
  requestAnimationFrame(() => fxgLinhas(o));
  fxgFolha(o);
}
function fxgLinhas(o) {
  const cv = document.getElementById('fxgCanvas'), svg = document.getElementById('fxgEdges');
  if (!cv || !svg) return;
  const pos = e => { let x = 0, y = 0, c = e; while (c && c !== cv) { x += c.offsetLeft; y += c.offsetTop; c = c.offsetParent; } return { x, y, w: e.offsetWidth, h: e.offsetHeight }; };
  svg.setAttribute('width', cv.scrollWidth); svg.setAttribute('height', cv.scrollHeight);
  const feito = id => o && o.est[id] === 'done', fora = id => o && o.est[id] === 'x';
  let h = '<defs><marker id="fxgAr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path class="m" d="M0 0L10 5L0 10z"/></marker>' +
    '<marker id="fxgArOn" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path class="m on" d="M0 0L10 5L0 10z"/></marker></defs>';
  for (const [a, b] of FXG.lig) {
    const A = FXG.nos[a], Bn = FXG.nos[b]; if (!A || !Bn) continue;
    const pa = pos(A.el), pb = pos(Bn.el), x1 = pa.x + pa.w / 2, y1 = pa.y + pa.h, x2 = pb.x + pb.w / 2, y2 = pb.y, my = y2 - 14;
    const x = (!A.lbl && fora(a)) || (!Bn.lbl && fora(b)) || (A.lbl && A.el.classList.contains('x')) || (Bn.lbl && Bn.el.classList.contains('x'));
    const on = !x && (A.lbl ? A.el.classList.contains('on') || !A.el.classList.contains('x') && feito(a) : feito(a));
    h += '<path class="' + (x ? 'x' : on ? 'on' : '') + '" d="M' + x1 + ' ' + y1 + 'V' + my + 'H' + x2 + 'V' + (y2 - 2) + '" marker-end="url(#' + (on ? 'fxgArOn' : 'fxgAr') + ')"/>';
  }
  svg.innerHTML = h;
}
/** A folha do lado: o que fazer, os checks (marcam no servidor), se não der, links e o histórico da etapa. */
function fxgFolha(o) {
  const p = document.getElementById('fxgPanel'); if (!p) return;
  const D = MC.defs, n = FXG.sel && FXG.nos[FXG.sel];
  if (!n) {
    const f = FXG.tipo === 'geral' ? null : D.tipos[FXG.tipo];
    p.innerHTML = '<div class="fxg-meta">' + (f ? 'Fluxo' : 'Visão geral') + '</div><h2>' + esc(FXG.card ? capTituloCurto(FXG.card) : f ? f.nome : 'Todos os eventos') + '</h2>' +
      '<p class="fxg-hint">' + esc(f ? f.sub : 'A varredura do Ultron destrava a escala da semana, e a escala destrava o fluxo de cada evento.') + '</p>' +
      '<h3>Como usar</h3><ul><li>Clique numa etapa pra ver o que fazer e o checklist.</li><li>Escolha um evento no topo pra ver o andamento dele e marcar daqui.</li><li>Etapa só destrava com as de cima feitas. Desmarcar tranca as de baixo, sem apagar o que já estava marcado.</li><li>Pontilhado é agente: Ultron ou B.O.N.E fazem sozinhos.</li></ul>' +
      '<h3>POPs</h3><p class="fxg-hint"><a href="' + esc(D.links.pop) + '" target="_blank" rel="noopener">Abrir os POPs completos</a></p>';
    return;
  }
  const d = n.def, s = o && o.est[FXG.sel], raiz = D.raiz.some(r => r.id === FXG.sel);
  const stTxt = { locked: 'Trancada: falta a etapa de cima', avail: 'É a vez desta etapa', done: 'Feito', x: 'Rota que não vale' }[s] || (raiz ? 'Semanal (fora do card)' : 'Modelo');
  const adm = souAdmin(), eu = FXG.card && S.eu ? capPessoasDe(FXG.card).find(x => capSouEu(x.nome)) : null, pode = !!o && !raiz && (adm || !!eu);
  const hist = FXG.card ? (FXG.card.fluxo.hist || []).filter(h => (h.e === FXG.sel || h.r === FXG.sel) && h.d === FXG.d).slice(-6).reverse() : [];
  let h = '';
  if (d.k === 'dec') {
    h += '<div class="fxg-meta">Decisão</div><h2>' + esc(d.t) + '</h2><span class="fxg-st ' + (s || '') + '">' + stTxt + '</span>' +
      (o && o.auto[FXG.sel] !== undefined && o.manual[FXG.sel] === undefined ? '<p class="fxg-hint">O B.O.N.E escolheu pela data e hora. Dá pra trocar.</p>' : '') +
      '<div class="fxg-rotas">' + d.br.map((b, i) => '<button type="button" data-fxr="' + i + '" aria-pressed="' + (!!o && o.rotas[FXG.sel] === i) + '"' + (!pode || s === 'locked' || s === 'x' ? ' disabled' : '') + '>' + esc(b.lab) + '</button>').join('') + '</div>' +
      (o && o.manual[FXG.sel] !== undefined && o.auto[FXG.sel] !== undefined ? '<button type="button" class="mbtn" data-fxr="auto">Voltar pra escolha automática</button>' : '');
  } else {
    const m = (o && o.marcas[FXG.sel]) || [], q = o && o.horas[FXG.sel];
    h += '<div class="fxg-meta">' + esc(q ? (d.ate ? 'até ' : '') + capDiaL(q.d) + ' ' + capHora(q.h) : d.w || '') + (d.who ? ' · ' + esc(d.who) : '') + '</div><h2>' + esc(d.t) + '</h2><span class="fxg-st ' + (s || '') + '">' + stTxt + '</span>';
    if (d.faz) h += '<h3>O que fazer</h3><ul>' + d.faz.map(f => '<li>' + esc(f) + '</li>').join('') + '</ul>';
    h += '<h3>Só destrava a próxima se</h3>' + (d.checks || []).map((c, j) => '<label class="fxg-chk"><input type="checkbox" data-fxj="' + j + '"' + (m[j] ? ' checked' : '') +
      (!pode || s === 'locked' || s === 'x' || (d.kind === 'agent' && !adm) ? ' disabled' : '') + '><span>' + esc(c) + (m[j] && m[j].por ? '<small>' + esc(m[j].por) + '</small>' : '') + '</span></label>').join('');
    if (d.auto) h += '<div class="fxg-auto"><b>' + esc(d.auto[0]) + '</b>' + esc(d.auto[1]) + '</div>';
    if (d.senao) h += '<div class="fxg-senao"><b>Se não der:</b><ul>' + d.senao.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul></div>';
    if (d.links && d.links.length) h += '<h3>Links</h3><ul>' + d.links.map(([t, u]) => '<li><a href="' + esc(u) + '" target="_blank" rel="noopener">' + esc(t) + '</a></li>').join('') + '</ul>';
  }
  if (hist.length) h += '<h3>Histórico</h3><ul class="fxg-hist">' + hist.map(x => '<li><b>' + esc(x.por) + '</b> ' + (x.r ? 'escolheu ' + (x.i === null ? 'a automática' : '"' + esc(d.br ? d.br[x.i].lab : '') + '"') : (x.v ? 'marcou' : 'desmarcou') + ' "' + esc((d.checks || [])[x.i] || '') + '"') +
    ' <span>' + esc(new Date(x.em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })) + '</span></li>').join('') + '</ul>';
  h += '<button type="button" class="mbtn fxg-fecha" data-fxfecha="1">Fechar</button>';
  p.innerHTML = h;
  p.querySelectorAll('[data-fxj]').forEach(i => i.onchange = () => fxgMarca({ etapa: FXG.sel, i: +i.dataset.fxj, v: i.checked }));
  p.querySelectorAll('[data-fxr]').forEach(b => b.onclick = () => fxgMarca({ rota: FXG.sel, i: b.dataset.fxr === 'auto' ? null : +b.dataset.fxr }));
  const fc = p.querySelector('[data-fxfecha]'); if (fc) fc.onclick = () => { FXG.sel = null; fxgDesenha(document.getElementById('grid')); };
}
async function fxgMarca(corpo) {
  try {
    const j = await api('/api/captacao/' + FXG.ev + '/etapa', { method: 'POST', body: JSON.stringify(Object.assign({ d: FXG.d }, corpo)) });
    capVersao(j.rev);
    const i = capLista().findIndex(c => c.id === FXG.ev);
    if (i >= 0 && j.captacao) S.captacoes[i] = j.captacao;
    FXG.full = { id: FXG.ev, em: JSON.stringify(j.captacao.fluxo.dias), c: j.captacao };
    const st = document.getElementById('fxgStage'), sx = st ? st.scrollLeft : 0, sy = st ? st.scrollTop : 0;
    FXG.card = j.captacao; fxgDesenha(document.getElementById('grid'));
    const st2 = document.getElementById('fxgStage'); if (st2) { st2.scrollLeft = sx; st2.scrollTop = sy; }
  } catch (e) { toast(e.message, true); fxgDesenha(document.getElementById('grid')); }
}
window.addEventListener('resize', () => { if (S.view === 'fluxo' && FXG.lig) fxgLinhas(FXG.card ? FXG.card.fluxo.dias[FXG.d] : null); });
