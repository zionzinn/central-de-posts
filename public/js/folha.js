'use strict';
// =====================================================================
// v4.07 · AÇÕES DA FOLHA DO POST (o cabeçalho do post que abre por cima do calendário)
// Pedido do Zion (05/10/2026): "organizar melhor essa parte das tasks ... talvez recolher copy matriz, copiar e
// recortar, deixar o botão de ABRIR TASK fora do card e maior pra ficar mais destacado, aprovar arte + editar post tb
// junto". Saiu do index.html (era o tRowDraw) pra cá, em 3 andares:
//   1. o estado: a etapa, a conta, o dia (e os selos de GM e arte aprovada)
//   2. o próximo passo, grande: abrir a task no MKT Hub (sem task, a copy) e o Postei
//   3. os ajustes do post: aprovar arte + editar (um par), GM, collab, formato, ângulo; e o "Mais" com o que é raro
//      (a copy quando tem task, a matriz, copiar e recortar pra outro dia)
// Escolha do Zion entre 2 opções com prints: "A: 3 andares". O botão "Postado" virou "Postei", a palavra do hover do
// card (desde a v4.06 "Postado" é o nome da etapa: o botão parecia dizer que o post já tinha ido ao ar).
// =====================================================================

// ---------------- o menu "Mais" ----------------
const TRM = { el: null, ancora: null };
function trFechaMais() {
  if (TRM.el) { TRM.el.remove(); TRM.el = null; }
  if (TRM.ancora) { TRM.ancora.setAttribute('aria-expanded', 'false'); TRM.ancora = null; }
}
/** Abre o menu embaixo do botão (ou em cima, se não couber). itens: { ic, t, k?, fn } ou '-' (separador). */
function trAbreMais(bt, itens) {
  if (TRM.el) { const era = TRM.ancora === bt; trFechaMais(); if (era) return; }
  const m = document.createElement('div'); m.className = 'tr-menu'; m.setAttribute('role', 'menu');
  m.innerHTML = itens.map((x, i) => x === '-' ? '<i class="tr-sep" role="separator"></i>' :
    '<button type="button" role="menuitem" data-i="' + i + '">' + icon(x.ic) + '<span>' + esc(x.t) + '</span>' + (x.k ? '<kbd>' + esc(x.k) + '</kbd>' : '') + '</button>').join('');
  document.body.appendChild(m);
  const r = bt.getBoundingClientRect(), w = m.offsetWidth, h = m.offsetHeight;
  m.style.left = Math.max(8, Math.min(r.right - w, innerWidth - w - 8)) + 'px';
  m.style.top = (r.bottom + 6 + h > innerHeight - 8 ? Math.max(8, r.top - h - 6) : r.bottom + 6) + 'px';
  m.querySelectorAll('[data-i]').forEach(b => b.onclick = () => { const x = itens[+b.dataset.i]; trFechaMais(); x.fn(); });
  TRM.el = m; TRM.ancora = bt; bt.setAttribute('aria-expanded', 'true');
  const pri = m.querySelector('button'); if (pri) pri.focus({ preventScroll: true });
}
document.addEventListener('mousedown', ev => {
  if (TRM.el && !TRM.el.contains(ev.target) && !(TRM.ancora && TRM.ancora.contains(ev.target))) trFechaMais();
}, true);
// Esc fecha só o menu (a folha continua aberta); setas andam nos itens
document.addEventListener('keydown', ev => {
  if (!TRM.el) return;
  if (ev.key === 'Escape') { ev.preventDefault(); ev.stopImmediatePropagation(); const a = TRM.ancora; trFechaMais(); if (a) a.focus(); return; }
  if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
    ev.preventDefault();
    const bs = [...TRM.el.querySelectorAll('button')], i = bs.indexOf(document.activeElement);
    const j = ev.key === 'ArrowDown' ? (i + 1) % bs.length : (i - 1 + bs.length) % bs.length;
    if (bs[j]) bs[j].focus();
  }
}, true);

// ---------------- v4.08: o título da folha (clicar e escrever) ----------------
// Pedido do Zion (05/10/2026): "quero poder mudar o titulo da task". Escolha dele: "Clicar no título". Clica, escreve,
// Enter salva e Esc cancela. Post com task no MKT Hub: o nome é o da task (a API do Hub não deixa trocar o nome
// daqui), então o título vira o link da task. Matriz (se a folha abrir pra ela): o título é o tema.
const TT = { inp: null, cancela: null };
/** O que o clique no título muda: 'titulo' (o nome do post), 'tema' (matriz), 'hub' (só abre a task) ou null. */
function tTitModo(s) {
  if (isVaga(s) || isSugestao(s)) return null;
  if (s.taskId && ehDoHub(s.taskId)) return 'hub';
  return isMatriz(s) ? 'tema' : 'titulo';
}
/** O nome automático do post que a tarefa de copy cria (DD_MM): não é um título de verdade. */
function tTitAuto(t) { return /^\d{2}_\d{2}$/.test(String(t || '').trim()); }
function tTitDraw(s) {
  const el = $('#tTit'), modo = tTitModo(s), t = folhaTitulo(s);
  TT.inp = null; TT.cancela = null;
  el.classList.toggle('tt', !!modo);
  if (!modo) { el.textContent = t; return; }
  if (modo === 'hub') {
    const lk = linkDaTask(s);
    el.innerHTML = lk
      ? '<a class="tt-hub" href="' + esc(lk) + '" target="_blank" rel="noopener" data-tip="O nome é o da task no MKT Hub: mude lá (abre a task)">' +
        '<span class="tt-txt">' + esc(t) + '</span>' + icon('external', 's') + '</a>'
      : esc(t);
    return;
  }
  el.innerHTML = '<button type="button" class="tt-bt" data-tip="Mudar o título" aria-label="Título: ' + esc(t) + '. Clique pra mudar">' +
    '<span class="tt-txt">' + esc(t) + '</span>' + icon('pencil', 's') + '</button>';
  el.querySelector('.tt-bt').onclick = () => tTitEdita(s);
}
/** O título que a folha mostra: o mesmo do card (no post do banco, o material, a não ser que tenha nome próprio). */
function folhaTitulo(s) { return lpTitulo(s, lpEtapa(s)).t; }
function tTitEdita(s) {
  const el = $('#tTit'), modo = tTitModo(s);
  if (modo !== 'titulo' && modo !== 'tema') return;
  const atual = modo === 'tema' ? ((s.matrizSB && s.matrizSB.tema) || '') : (s.titulo || '');
  el.innerHTML = '<input class="tt-inp" maxlength="200" autocomplete="off" aria-label="' + (modo === 'tema' ? 'Tema do post' : 'Título do post') + '">' +
    '<span class="tt-dica">Enter salva · Esc cancela</span>';
  const inp = el.querySelector('.tt-inp');
  inp.value = atual;
  inp.placeholder = modo === 'tema' ? 'tema do post' : 'nome do post (ex.: Collab com @membro)';
  inp.focus(); inp.select();
  let feito = false;
  const fim = async salva => {
    if (feito) return; feito = true; TT.inp = null; TT.cancela = null;
    const novo = inp.value.replace(/\s+/g, ' ').trim();
    if (!salva || novo === atual) { tTitDraw(s); const b = el.querySelector('.tt-bt'); if (b && !salva) b.focus(); return; }
    const antes = modo === 'tema' ? s.matrizSB : s.titulo;
    if (modo === 'tema') s.matrizSB = Object.assign({}, s.matrizSB, { tema: novo }); else s.titulo = novo;
    tTitDraw(s); render();
    try {
      const r = await api('/api/slots/' + s.id, { method: 'PATCH', body: JSON.stringify(modo === 'tema' ? { matrizSB: { tema: novo } } : { titulo: novo }) });
      if (r && r.slot) { if (modo === 'tema') s.matrizSB = r.slot.matrizSB; else s.titulo = r.slot.titulo; }
      toast(novo ? 'Título salvo · Ctrl+Z desfaz' : 'Título apagado · Ctrl+Z desfaz');
    } catch (e) {
      if (modo === 'tema') s.matrizSB = antes; else s.titulo = antes;
      toast(e.message, true);
    }
    if (S.taskSlot && S.taskSlot.id === s.id && $('#ovTask').classList.contains('open')) tTitDraw(s);
    render();
  };
  inp.addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); fim(true); } });
  inp.addEventListener('blur', () => fim(true));
  TT.inp = inp; TT.cancela = () => fim(false);
}
// Esc no título fecha só a edição (a folha continua aberta)
document.addEventListener('keydown', ev => {
  if (ev.key !== 'Escape' || !TT.inp || document.activeElement !== TT.inp) return;
  ev.preventDefault(); ev.stopImmediatePropagation(); TT.cancela();
}, true);

// ---------------- a folha ----------------
/** Cabeçalho da folha do post: estado, próximo passo e ajustes (redesenha depois de cada mudança). */
function tRowDraw(s) {
  fechaDoBanco();                                   // v3.96: a lista do banco sai junto com a fileira antiga
  trFechaMais();
  tTitDraw(s);                                      // v4.08: clicar no título muda o nome do post
  const row = $('#tRow');
  row.className = 'mrow tr';
  const dateBr = s.date ? s.date.split('-').reverse().join('/') : 'sem data';
  row.innerHTML =
    '<div class="tr-st">' + lpChipEtapa(s) +   // v4.01: a etapa na cor dela
      '<span class="note">' + esc(S.contas[s.conta].nome) + ' · ' + dateBr + '</span>' +
      (isGm(s) ? '<span class="gmpill">' + icon('star', 's') + 'GM</span>' : '') +
      (s.aprovado ? '<span class="aprpill" data-tip="Arte aprovada pela diretoria">' + icon('check', 's') + 'APR</span>' : '') +
    '</div><div class="tr-pri"></div><div class="tr-sec"></div>';
  lpFolha(s);
  const pri = row.querySelector('.tr-pri'), sec = row.querySelector('.tr-sec');
  const mk = (onde, html, cls, tip, tag) => {
    const b = document.createElement(tag || 'button');
    if (!tag) b.type = 'button';
    b.className = 'mbtn' + (cls ? ' ' + cls : '');
    b.innerHTML = html;
    if (tip) b.dataset.tip = tip;
    onde.appendChild(b); return b;
  };
  const lk = linkDaTask(s), doHub = ehDoHub(s.taskId), cod = s.hub && s.hub.codigo;

  // ----- andar 2: o que precisa de atenção (vermelho), o próximo passo grande e o Postei -----
  if (isVaga(s)) {
    const bv = mk(pri, icon('check', 's') + 'já criei (dar baixa)', 'tr-crit', 'Tirar a marca de falta criar (vira post normal)');
    bv.onclick = () => { closeOv('ovTask'); baixarVaga(s); };
  }
  const cdiv = contaDivergente(s);
  if (cdiv) {
    const b = mk(pri, icon('alerta', 's') + 'mover pra ' + esc(nomeConta(cdiv.sugerida)), 'tr-crit', 'O nome da task diz ' + nomeConta(cdiv.sugerida) + ', mas o post está em ' + nomeConta(s.conta));
    b.onclick = () => { closeOv('ovTask'); corrigirConta(s, cdiv.sugerida); };
  }
  // v4.09: post que já está no ar com o link dele (ex.: "Já foi postado"): o próximo passo é ver o post
  const oPost = s.linkPost ? bancoOrigem(s.linkPost) : null, verPost = !!(s.postado && s.linkPost && !lk);
  const semCopyGrande = verPost || (s.postado && !s.docId);       // postado e sem copy: escrever a copy vai pro Mais
  if (lk) {
    const a = mk(pri, icon('external') + '<span>Abrir a task' + (doHub ? ' no MKT Hub' : '') + '</span>' + (cod ? '<span class="tr-cod">' + esc(cod) + '</span>' : ''),
      'tr-big tr-task' + (doHub ? ' hub' : ''), 'Abrir a task de produção' + (doHub ? ' no MKT Hub' : ''), 'a');
    a.href = lk; a.target = '_blank'; a.rel = 'noopener';
  } else if (verPost) {
    const a = mk(pri, icon('external') + '<span>Ver o post no ' + esc(oPost.nome === 'link' ? 'ar' : oPost.nome) + '</span>', 'tr-big tr-ig', 'Abrir o post publicado', 'a');
    a.href = s.linkPost; a.target = '_blank'; a.rel = 'noopener';
  } else if (!semCopyGrande) {
    // sem task: o próximo passo é a copy
    mk(pri, icon('doc') + '<span>' + (s.docId ? 'Abrir a copy' : 'Escrever a copy' + (s.banco ? ' (opcional)' : '')) + '</span>', 'tr-big tr-copy',
      s.docId ? 'Abrir o documento da copy deste post' : 'Criar o documento da copy deste post').onclick = () => { closeOv('ovTask'); abrirCopy(s.id); };
  }
  if (s.drive) {
    const o = bancoOrigem(s.drive), a = mk(pri, icon(o.nome === 'Drive' ? 'folder' : o.icone), 'iconb tr-ext', o.nome === 'Drive' ? 'Abrir o Drive' : 'Abrir o link (' + o.nome + ')', 'a');
    a.href = s.drive; a.target = '_blank'; a.rel = 'noopener';
  }
  if (s.linkRef) { const a = mk(pri, icon('link'), 'iconb tr-ext', 'Abrir o vídeo original', 'a'); a.href = s.linkRef; a.target = '_blank'; a.rel = 'noopener'; }
  if (s.linkPost && !verPost) { const a = mk(pri, icon('external'), 'iconb tr-ext', 'Ver o post publicado (' + oPost.nome + ')', 'a'); a.href = s.linkPost; a.target = '_blank'; a.rel = 'noopener'; }   // v4.09
  // v3.96: "Do banco" no lugar da copy, nos posts sem card da matriz (Carbone, Onevo); o da matriz fica no card do dia
  const abaT = S.contas[s.conta] && S.contas[s.conta].aba;
  if (!s.matrizSB && !s.taskId && !s.postado && bancoSecoes(abaT).some(k => BANCO_MATERIAL.includes(k))) {
    const w = document.createElement('span'); w.className = 'bkancora'; pri.appendChild(w);
    const bb = document.createElement('button'); bb.type = 'button'; bb.className = 'mbtn mzbancobt'; bb.id = 'tBanco';
    bb.setAttribute('aria-haspopup', 'listbox'); bb.setAttribute('aria-expanded', 'false');
    bb.innerHTML = s.banco ? icon(bancoIcone(s.banco.sec)) + '<span class="bkb-t">' + esc(bancoRotulo(s.banco) + (s.banco.titulo ? ': ' + s.banco.titulo : '')) + '</span>' : icon('box') + 'Do banco';
    bb.dataset.tip = s.banco ? 'Material do banco deste post: clique pra trocar ou tirar' : 'Usar um material do banco (corte, depoimento, Drive) no lugar de escrever a copy';
    bb.onclick = ev => abrirDoBanco(ev.currentTarget, s.id);
    w.appendChild(bb);
    if (isBanco(s) && S.temFonte && souAdmin()) mk(pri, icon('hub') + 'Criar task de produção', 'primary', 'Criar a task de arte ou vídeo no MKT Hub com o material do banco (a copy é opcional)').onclick = () => { closeOv('ovTask'); abrirProducao(s.id); };
  }
  const bp = mk(pri, s.postado ? icon('undo') + 'Desmarcar postado' : icon('check') + 'Postei', 'tr-postei tr-fim' + (s.postado ? '' : ' primary'), s.postado ? 'Desmarcar postado' : 'Marcar que este post foi ao ar');
  bp.onclick = async () => { await togglePostado(s); tRowDraw(s); };

  // ----- andar 3: os ajustes do post -----
  const par = document.createElement('span'); par.className = 'tr-par'; sec.insertBefore(par, sec.firstChild);
  const ap = mk(par, icon('check') + (s.aprovado ? 'Arte aprovada' : 'Aprovar arte'), s.aprovado ? 'apron' : '', s.aprovado ? 'Tirar a aprovação (registro local)' : 'Marcar a arte como aprovada (registro local)');
  ap.onclick = async () => {
    const antes = s.aprovado; s.aprovado = !antes; render(); tRowDraw(s);
    try { await api('/api/slots/' + s.id, { method: 'PATCH', body: JSON.stringify({ aprovado: s.aprovado }) }); toast(s.aprovado ? 'Arte aprovada' : 'Aprovação removida'); }
    catch (e) { s.aprovado = antes; render(); tRowDraw(s); toast(e.message, true); }
  };
  const ed = mk(par, icon('pencil') + 'Editar', 'tr-edit', 'Editar o post (conta, data, links, collab)');
  ed.onclick = () => { closeOv('ovTask'); openEdit(s.id); };
  if (s.conta === 'seubone') {                       // GM (só SeuBoné)
    const g = mk(sec, icon('star'), 'iconb' + (isGm(s) ? ' gmon' : ''), isGm(s) ? 'Tirar a grande marca da capa' : 'Marcar grande marca na capa');
    g.setAttribute('aria-label', 'Grande marca na capa'); g.setAttribute('aria-pressed', String(isGm(s)));
    g.onclick = async () => {
      const antes = s.gm; s.gm = gmOverride(s, !isGm(s)); render(); tRowDraw(s);
      try { await api('/api/slots/' + s.id, { method: 'PATCH', body: JSON.stringify({ gm: s.gm }) }); toast(isGm(s) ? 'Grande marca na capa' : 'GM removido'); }
      catch (e) { s.gm = antes; render(); tRowDraw(s); toast(e.message, true); }
    };
  }
  if (s.conta === 'carbone-edu' || s.conta === 'carbone-club') {   // collab Club + Educação em 1 clique
    const sib = s.conta === 'carbone-edu' ? 'carbone-club' : 'carbone-edu', isClb = (s.collab || []).includes(sib);
    const cb = mk(sec, icon('users'), 'iconb' + (isClb ? ' clbon' : ''), isClb ? 'Tirar a collab Club + Educação' : 'Marcar como collab Club + Educação');
    cb.setAttribute('aria-label', 'Collab Club + Educação'); cb.setAttribute('aria-pressed', String(isClb));
    cb.onclick = async () => {
      const antes = (s.collab || []).slice();
      s.collab = isClb ? [] : [sib]; render(); tRowDraw(s);
      try { await api('/api/slots/' + s.id, { method: 'PATCH', body: JSON.stringify({ collab: s.collab }) }); toast(isClb ? 'Collab removido' : 'Collab Club + Educação marcado'); }
      catch (e) { s.collab = antes; render(); tRowDraw(s); toast(e.message, true); }
    };
  }
  // formato
  const fsel = document.createElement('select'); fsel.className = 'mini'; fsel.dataset.tip = 'Formato do post'; fsel.setAttribute('aria-label', 'Formato do post');
  [['', 'formato…'], ['reels', 'reels'], ['carrossel', 'carrossel'], ['estático', 'estático'], ['story', 'story']]
    .forEach(([v, l]) => { const o = document.createElement('option'); o.value = v; o.textContent = l; fsel.appendChild(o); });
  fsel.value = s.formato || '';
  fsel.onchange = async () => {
    const antes = s.formato; s.formato = fsel.value; render();
    try { await api('/api/slots/' + s.id, { method: 'PATCH', body: JSON.stringify({ formato: s.formato }) }); toast('Formato: ' + (s.formato || 'nenhum')); }
    catch (e) { s.formato = antes; render(); fsel.value = antes || ''; toast(e.message, true); }
  };
  sec.appendChild(fsel);
  // ângulo (escolhe um da lista ou escreve um novo)
  const ainp = document.createElement('input'); ainp.className = 'mini anginp'; ainp.setAttribute('list', 'angulosLista'); ainp.setAttribute('aria-label', 'Ângulo do post');
  ainp.placeholder = 'ângulo…'; ainp.value = s.angulo || ''; ainp.dataset.tip = 'Ângulo do post: escolha um ou escreva um novo';
  let dlAng = document.getElementById('angulosLista');
  if (!dlAng) { dlAng = document.createElement('datalist'); dlAng.id = 'angulosLista'; document.body.appendChild(dlAng); }
  dlAng.innerHTML = angulosConhecidos().map(a => '<option value="' + esc(a) + '"></option>').join('');
  ainp.onchange = async () => {
    const novo = ainp.value.trim();
    if (novo === (s.angulo || '')) return;
    const antes = s.angulo; s.angulo = novo; render();
    try { await api('/api/slots/' + s.id, { method: 'PATCH', body: JSON.stringify({ angulo: s.angulo }) }); toast('Ângulo: ' + (s.angulo || 'nenhum')); }
    catch (e) { s.angulo = antes; ainp.value = antes || ''; render(); toast(e.message, true); }
  };
  ainp.addEventListener('keydown', e => { if (e.key === 'Enter') ainp.blur(); });
  sec.appendChild(ainp);
  // o "Mais": o que é raro
  const itens = [];
  if (lk || semCopyGrande) itens.push({ ic: 'doc', t: s.docId ? 'Abrir a copy' : 'Escrever a copy' + (s.banco ? ' (opcional)' : ''), fn: () => { closeOv('ovTask'); abrirCopy(s.id); } });
  if (s.matrizSB) itens.push({ ic: 'sparkle', t: 'Ver a matriz', fn: () => { closeOv('ovTask'); openMatriz(s.id); } });
  if (itens.length) itens.push('-');
  itens.push({ ic: 'box', t: 'Copiar pra outro dia', k: 'Ctrl+C', fn: () => { setClip(s.id, 'copiar'); closeOv('ovTask'); } });
  itens.push({ ic: 'ff', t: 'Recortar pra outro dia', k: 'Ctrl+X', fn: () => { setClip(s.id, 'recortar'); closeOv('ovTask'); } });
  const mais = mk(sec, icon('dots') + 'Mais', 'tr-mais tr-fim', 'Copy, matriz, copiar e recortar pra outro dia');
  mais.id = 'tMais'; mais.setAttribute('aria-haspopup', 'menu'); mais.setAttribute('aria-expanded', 'false');
  mais.onclick = () => trAbreMais(mais, itens);
  if (!pri.children.length) pri.hidden = true;
}
