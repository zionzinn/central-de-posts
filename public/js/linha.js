'use strict';
// =====================================================================
// v4.01 · LINHA DO POST (pedido do Zion em 02/10/2026; visual aprovado no canvas "B.O.N.E Linha do Post")
// Pedido: "deixar MAIS claro o dia que o post tem que ser entregue e o dia que o post vai ao ar ... as cores e
// status estão confusos ... está confuso o que é do MKT Hub e o que é do B.O.N.E" e "hover buttons, ou animações
// que acontecem quando passa o mouse".
//
// A regra do visual (uma só, em todo o painel):
//   COR = onde o post está · PALAVRA = o que falta · DIA DO CALENDÁRIO = dia que sai · CAIXINHA = dia que fica pronto
//   Matriz (amarelo, tracejado) e Copy (azul): no B.O.N.E · Produção (rosa) e Pronto (verde): no MKT Hub ·
//   No ar (cinza, sai da frente): no Instagram. Laranja e vermelho só como ALERTA (pílula ou data):
//   laranja = esperando aprovação ou vence hoje/amanhã; vermelho = voltou pra alterar ou atrasou.
//
// Decisões do Zion (02/10/2026): as duas datas na folha do post só MOSTRAM (a entrega é do MKT Hub e muda lá; o dia
// que sai é o do calendário); a task de produção continua só do ADMIN. Nada aqui grava dado novo nem cria rota:
// é desenho em cima do que o /api/state já traz.
// =====================================================================

const LP = {
  ORDEM: ['mz', 'copy', 'prod', 'pronto', 'ar'],
  NOME: { mz: 'Matriz', copy: 'Copy', prod: 'Produção', pronto: 'Pronto', ar: 'No ar' },
  ONDE: { mz: 'no B.O.N.E', copy: 'no B.O.N.E', prod: 'no MKT Hub', pronto: 'no MKT Hub', ar: 'no Instagram' },
};
// ícones que o painel ainda não tinha (o resto vem do icon() do index.html)
const LP_ICONS = {
  hour: '<path d="M7 3.5h10M7 20.5h10"/><path d="M8 3.5c0 4 4 5.5 4 8.5s-4 4.5-4 8.5M16 3.5c0 4-4 5.5-4 8.5s4 4.5 4 8.5"/>',
  send: '<path d="M4 12l16-8-6 16-2.5-6.5L4 12z"/>',
  ponto: '<circle cx="12" cy="12" r="3.4"/>',
  traco: '<path d="M7 12h10"/>',
};
function lpIc(nome, cls) {
  if (!LP_ICONS[nome]) return icon(nome, cls);
  return '<svg class="ic' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" aria-hidden="true">' + LP_ICONS[nome] + '</svg>';
}

// ---------------- datas ----------------
function lpMs(iso) { return Date.parse(iso + 'T12:00:00Z'); }
/** Dias de b até a (a - b). */
function lpDif(a, b) { return Math.round((lpMs(a) - lpMs(b)) / 864e5); }
const LP_DS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
/** "qui 08" */
function lpDiaC(iso) { return LP_DS[new Date(lpMs(iso)).getUTCDay()] + ' ' + iso.slice(8, 10); }
/** "qui 08/10" */
function lpDiaL(iso) { return lpDiaC(iso) + '/' + iso.slice(5, 7); }
function lpRel(n) { return n < 0 ? (n === -1 ? 'ontem' : 'há ' + (-n) + ' dias') : n === 0 ? 'hoje' : n === 1 ? 'amanhã' : 'em ' + n + ' dias'; }
function lpPrimeiro(nome) { return String(nome || '').trim().split(/\s+/)[0] || ''; }
/** A conta tem matriz (SeuBoné e Weevo)? Sem matriz, a linha começa na copy. */
function lpTemMatriz(conta) { const a = S.contas[conta] && S.contas[conta].aba; return !!(a && mzDaAba(a)); }
/** A tarefa (matriz ou copy) que cobre o post: diz quem preenche ou escreve. */
function lpTarefa(s, tipo) { return (S.tarefas || []).find(t => t.tipo === tipo && (t.itens || []).includes(s.id)) || null; }

// ---------------- em que etapa o post está ----------------
/**
 * A etapa do post e o que o card mostra: k (mz, copy, prod, pronto, ar; 'esp' = falta criar ou sugestão, que têm
 * desenho próprio), a palavra do que falta (sub) ou a pílula de alerta (pil), a data que importa (dt), os pontinhos
 * da matriz (mzd), se pede atenção (alerta), de quem é a vez (av) e as ações do hover (a primeira com texto é a do momento).
 */
function lpEtapa(s) {
  const e = { k: 'copy', sub: '', pil: null, dt: null, mzd: null, alerta: false, av: '', avNome: '', acoes: [] };
  const hoje = hojeStr(), nS = s.date ? lpDif(s.date, hoje) : null;
  const ac = (id, txt, ic) => e.acoes.push({ id, txt: txt || '', ic: ic || '' });
  const pessoa = (nome, verbo) => { if (nome) { e.av = initials(nome); e.avNome = lpPrimeiro(nome) + ' ' + verbo; } };
  // matriz e copy: o dia que sai, pra saber quanto tempo falta (vermelho se já passou; não entra na Atenção)
  const dtSai = () => {
    e.dt = nS === null ? { c: '', ic: 'calendar', t: 'sem dia no calendário', b: '' }
      : { c: nS < 0 ? 'red' : nS <= 2 ? 'or' : '', ic: 'calendar', t: 'sai', b: lpRel(nS), dica: 'Vai ao ar ' + lpDiaL(s.date) };
  };
  if (s.postado) {
    e.k = 'ar'; e.sub = s.date ? 'saiu ' + lpDiaC(s.date) : 'postado';
    ac('despostar', 'Desmarcar', 'undo'); ac('del');
    return e;
  }
  if (isVaga(s) || isSugestao(s)) { e.k = 'esp'; return e; }
  const adm = souAdmin(), podeProd = adm && S.temFonte;
  if (s.taskId) {
    const b = stBucket(s), prazo = (s.hub && s.hub.prazo) || '', lk = linkDaTask(s);
    const onde = s.hub ? ' (' + [s.hub.codigo, s.statusCache && s.statusCache.nome].filter(Boolean).join(', ') + ')' : '';
    if (b === 'pronto') {
      e.k = 'pronto'; e.sub = 'pode postar';
      if (nS === 0) { e.pil = { c: 'ok', t: 'sai hoje', ic: 'calendar' }; e.sub = ''; }
      else if (nS !== null && nS < 0) { e.pil = { c: 'red', t: 'atrasado', ic: 'alerta' }; e.alerta = true; e.sub = ''; }
      if (prazo) e.dt = { c: 'feita', ic: 'check', t: 'entregue · prazo ' + lpDiaC(prazo), b: '', dica: 'Arte pronta no MKT Hub' + onde };
      ac('postar', 'Postei', 'check'); if (lk) ac('hub', '', 'external'); if (s.docId) ac('copy', '', 'doc'); ac('del');
      return e;
    }
    e.k = 'prod';
    pessoa(s.assigneeCache || s.responsavelManual, 'faz');
    if (!s.statusCache) e.sub = ehDoHub(s.taskId) ? 'sem etapa' : 'task ligada';
    else if (b === 'aprovar') e.pil = { c: 'or', t: 'em aprovação', ic: 'hour', dica: 'Arte em aprovação no MKT Hub' + onde };
    else if (b === 'alterar') { e.pil = { c: 'red', t: 'ajustar', ic: 'pencil', dica: 'A arte voltou pra ajustar no MKT Hub' + onde }; e.alerta = true; }
    else if (b === 'producao') e.sub = 'fazendo';
    else e.sub = 'na fila';
    if (prazo) {
      const nE = lpDif(prazo, hoje), d = 'Entrega no MKT Hub: ' + lpDiaL(prazo) + onde;
      if (b === 'aprovar') e.dt = { c: 'feita', ic: 'check', t: 'entregue · prazo ' + lpDiaC(prazo), b: '', dica: d };
      else if (s.date && prazo > s.date) { e.dt = { c: 'red', ic: 'box', t: 'entrega ' + lpDiaC(prazo), b: 'após o post', dica: d + ' · marcada DEPOIS do dia do post (' + lpDiaL(s.date) + ')' }; e.alerta = true; }
      else if (nE < 0) { e.dt = { c: 'red', ic: 'box', t: 'entrega ' + lpDiaC(prazo), b: 'atrasada', dica: d + ' · atrasada ' + (-nE) + (nE === -1 ? ' dia' : ' dias') }; e.alerta = true; }
      else if (nE <= 1) { e.dt = { c: 'or', ic: 'box', t: 'entrega ' + lpDiaC(prazo), b: lpRel(nE), dica: d }; e.alerta = true; }
      else e.dt = { c: '', ic: 'box', t: 'entrega ' + lpDiaC(prazo), b: lpRel(nE), dica: d };
    } else if (ehDoHub(s.taskId)) e.dt = { c: '', ic: 'box', t: 'sem entrega no MKT Hub', b: '' };
    if (lk) ac('hub', 'Abrir no MKT Hub', 'external'); else ac('abrir', 'Abrir', 'doc');
    ac('postar', '', 'check'); if (s.docId) ac('copy', '', 'doc'); ac('del');
    return e;
  }
  if (isCopy(s)) {
    const ce = copyEstado(s), a = s.aprov && s.aprov.c, tf = lpTarefa(s, 'copy');
    if (ce.cod === 'enviado') {
      e.pil = { c: 'or', t: 'esperando aprovação', ic: 'hour', dica: 'Copy pronta, esperando aprovação' + (a && a.por ? ' (enviada por ' + a.por + (a.em ? ' ' + brData(a.em.slice(0, 10)) : '') + ')' : '') }; dtSai();
      if (adm) { ac('aprovar', 'Aprovar', 'check'); ac('copy', '', 'doc'); } else ac('copy', 'Abrir a copy', 'doc');
    } else if (ce.cod === 'alterar') {
      e.pil = { c: 'red', t: 'pra alterar', ic: 'pencil', dica: 'Pra alterar' + (a && a.nota ? ': ' + a.nota : '') + (a && a.ap ? ' (pedido por ' + a.ap + ')' : '') }; e.alerta = true; dtSai();
      pessoa((a && a.por) || (tf && tf.por), 'altera');
      ac('copy', 'Abrir a copy', 'doc');
    } else if (ce.cod === 'aprovado') {
      if (S.temFonte) e.pil = { c: 'neu', t: 'falta a task', ic: 'plus' }; else e.sub = 'aprovada';
      e.dt = { c: nS !== null && nS < 0 ? 'red' : 'feita', ic: 'check', t: 'aprovada · sai', b: nS === null ? 'sem dia' : lpRel(nS) };
      if (podeProd) { ac('producao', 'Criar task de produção', 'send'); ac('copy', '', 'doc'); } else ac('copy', 'Abrir a copy', 'doc');
    } else {
      e.sub = 'escrevendo'; dtSai(); pessoa(tf && tf.por, 'escreve');
      ac('copy', 'Abrir a copy', 'doc');
    }
    if (s.matrizSB) ac('matriz', '', 'sparkle');
    ac('del');
    return e;
  }
  if (isBanco(s)) {
    // v3.96: o material do banco entra no lugar da copy (a copy é opcional); o próximo passo é a task de produção
    e.sub = 'do banco'; e.subDica = 'Material do banco: ' + bancoRotulo(s.banco) + (s.banco.titulo ? ' · ' + s.banco.titulo : '') + ' (a copy é opcional)'; dtSai();
    if (podeProd) ac('producao', 'Criar task de produção', 'send'); else ac('abrir', 'Abrir', 'box');
    ac('del');
    return e;
  }
  if (isMatriz(s)) {
    e.k = 'mz';
    const p = mzProgresso(s.matrizSB, mzContaDe(s));
    e.sub = p.cheio ? 'pronta pra copy' : p.n ? 'preenchendo' : 'a preencher';
    e.mzd = p;
    const tf = lpTarefa(s, 'matriz'); pessoa(tf && tf.por, 'preenche');
    if (p.cheio) { ac('copy', 'Escrever a copy', 'pencil'); ac('matriz', '', 'sparkle'); } else ac('matriz', 'Preencher', 'pencil');
    ac('del');
    return e;
  }
  // post sem matriz, sem copy e sem task (ex.: os DD_MM da tarefa de copy, v4.00): o próximo passo é a copy
  e.sub = 'a escrever'; dtSai();
  const tf = lpTarefa(s, 'copy'); pessoa(tf && tf.por, 'escreve');
  ac('copy', 'Escrever a copy', 'pencil'); ac('del');
  return e;
}
/** A barra de cima do card: Matriz, Copy, Produção, Pronto (sem a Matriz nas contas que não têm). f feita · n agora · x pulada. */
function lpProg(s, e) {
  const ks = (lpTemMatriz(s.conta) || s.matrizSB ? ['mz'] : []).concat(['copy', 'prod', 'pronto']);
  const cur = LP.ORDEM.indexOf(e.k);
  return ks.map(k => {
    const i = LP.ORDEM.indexOf(k);
    const pulou = (k === 'mz' && !s.matrizSB) || (k === 'copy' && !s.docId && !s.banco);
    return { k, st: e.k === 'ar' || i < cur ? (pulou ? 'x' : 'f') : i === cur ? 'n' : '' };
  });
}

// ---------------- o card ----------------
function lpTitulo(s, e) {
  if (e.k === 'mz') { const m = s.matrizSB || {}; return { t: m.tema || (m.tipo ? m.tipo + ' · tema a definir' : 'escolher o tipo'), vazio: !m.tema }; }
  if (isBanco(s)) return { t: s.banco.titulo || (s.matrizSB && s.matrizSB.tema) || bancoRotulo(s.banco), vazio: false };
  return { t: slotTitulo(s), vazio: false };
}
function lpContaTag(s) { return '<div class="contatag">' + esc(contaCurta(s.conta)) + '</div>'; }
/** As marquinhas que pedem olho: grande marca, data fixa, collab, a câmera do vídeo e conta trocada (esta corrige em 1 clique). */
function lpMarcas(s, e) {
  let h = '';
  const gmPede = !isGm(s) && S.aba === 'SEUBONÉ' && s.date && (e.k === 'mz' || e.k === 'copy') && gmCadenciaDia(s.date);
  if (isGm(s)) h += '<span class="lp-mk gm" title="Grande marca na capa">' + icon('star') + '</span>';
  else if (gmPede) h += '<span class="lp-mk gm pede" title="Dia de grande marca na capa (GM)">' + icon('star') + '</span>';
  if (s.fixo) h += '<span class="lp-mk pin" title="Data fixa: não se move no empurrar">' + icon('pin') + '</span>';
  const clb = s.collab || [];
  if (clb.length) h += '<span class="lp-mk clb" title="Collab: ' + esc([s.conta].concat(clb).map(nomeConta).join(' + ')) + '">' +
    [s.conta].concat(clb).map(c => '<i style="background:' + contaCor(c) + '"></i>').join('') + '</span>';
  h += capMarca(s, e);                                  // v4.03: vídeo (câmera), pra captar ou o dia da captação (js/captacao.js)
  const cdiv = contaDivergente(s);
  if (cdiv) h += '<button type="button" class="lp-mk cdiv" data-ac="cdiv" title="O nome da task diz ' + esc(nomeConta(cdiv.sugerida)) + ', mas este post está em ' +
    esc(nomeConta(s.conta)) + '. Clique pra mover pra ' + esc(nomeConta(cdiv.sugerida)) + ' (Ctrl+Z desfaz).">' + icon('alerta') + '</button>';
  return h ? '<span class="lp-marcas">' + h + '</span>' : '';
}
function lpDt(d) {
  return '<span class="lp-dt' + (d.c ? ' ' + d.c : '') + '"' + (d.dica ? ' title="' + esc(d.dica) + '"' : '') + '>' + lpIc(d.ic) +
    '<span>' + esc(d.t) + (d.b ? ' <b>' + esc(d.b) + '</b>' : '') + '</span></span>';
}
/** A data do card. Na lente "fica pronto" o card já está no dia da entrega, então ele diz o dia que sai. */
function lpDataHtml(s, e) {
  if (S.lente === 'ent' && s.date && s.hub && s.hub.prazo) {
    if (e.k === 'ar') return '';                          // o "saiu …" já está escrito ao lado da etapa
    const nS = lpDif(s.date, hojeStr());
    return lpDt({ c: nS < 0 ? 'red' : nS <= 1 ? 'or' : '', ic: 'calendar', t: 'sai ' + lpDiaC(s.date), b: lpRel(nS), dica: 'Vai ao ar ' + lpDiaL(s.date) });
  }
  if (e.mzd) {
    const p = e.mzd;
    return '<span class="lp-dt mzd" title="' + p.n + ' de ' + p.total + ' campos da matriz preenchidos">' + p.n + ' de ' + p.total +
      '<span class="lp-mzd">' + Array.from({ length: p.total }, (_, i) => '<i' + (i < p.n ? ' class="f"' : '') + '></i>').join('') + '</span></span>';
  }
  return e.dt ? lpDt(e.dt) : '';
}
const LP_AC = {
  postar: 'Postei: marcar que foi ao ar', despostar: 'Desmarcar postado', aprovar: 'Aprovar a copy (Ctrl+Z desfaz)',
  producao: 'Criar a task de produção no MKT Hub', copy: 'Abrir a copy', matriz: 'Ver a matriz', hub: 'Abrir a task no MKT Hub',
  abrir: 'Abrir o post', del: 'Excluir este post do painel',
};
/** Botões do hover: a ação do momento (com texto) e os atalhos (só ícone). */
function lpAcoesHtml(s, e) {
  if (!e.acoes.length) return '';
  return '<div class="lp-acoes">' + e.acoes.map(a => {
    const tip = LP_AC[a.id];
    if (a.id === 'del') return '<button type="button" class="lp-ac lp-ib lp-del" data-ac="del" data-tip="' + tip + '" aria-label="' + tip + '">' + BIN_SVG + '</button>';
    const miolo = (a.ic ? lpIc(a.ic) : '') + (a.txt ? '<span>' + esc(a.txt) + '</span>' : '');
    const cls = 'lp-ac ' + (a.txt ? 'lp-pri' : 'lp-ib') + ' ac-' + a.id;
    const extra = a.txt ? ' title="' + esc(tip) + '"' : ' data-tip="' + esc(tip) + '" aria-label="' + esc(tip) + '"';
    if (a.id === 'hub') return '<a class="' + cls + '" data-ac="hub" href="' + esc(linkDaTask(s)) + '" target="_blank" rel="noopener"' + extra + '>' + miolo + '</a>';
    return '<button type="button" class="' + cls + '" data-ac="' + a.id + '"' + extra + '>' + miolo + '</button>';
  }).join('') + '</div>';
}
/** O que o leitor de tela fala do card. */
function lpRotulo(s, e, titulo) {
  return titulo + ': ' + LP.NOME[e.k] + (e.pil ? ', ' + e.pil.t : e.sub ? ', ' + e.sub : '') + '. ' +
    (s.date ? 'Sai ' + lpDiaL(s.date) : 'Sem dia') + (s.hub && s.hub.prazo ? ', fica pronto ' + lpDiaL(s.hub.prazo) : '') + '.';
}
/** Monta o card novo dentro do elemento que o cardEl criou (o arrastar, o clique e o hover ficam no cardEl). */
function lpMonta(d, s, e, multi) {
  const tt = lpTitulo(s, e), dt = lpDataHtml(s, e), mk = lpMarcas(s, e);
  d.className = 'card lp e-' + e.k + (isGm(s) ? ' gm' : '') + (e.av ? ' tem-av' : '') + (multi ? ' temconta' : '') + (S.lpEstoura === s.id ? ' lp-estoura' : '');
  d.dataset.etapa = e.k;
  if (e.alerta) d.dataset.alerta = '1';
  d.tabIndex = 0;
  d.setAttribute('aria-label', lpRotulo(s, e, tt.t));
  d.innerHTML =
    '<span class="lp-kp" aria-hidden="true">' + lpProg(s, e).map(p => '<i class="s-' + p.k + (p.st ? ' ' + p.st : '') + '"></i>').join('') + '</span>' +
    (multi ? lpContaTag(s) : '') +
    '<div class="lp-ka"><span class="lp-et">' + LP.NOME[e.k] + '</span>' +
      (e.pil ? '<span class="lp-pil ' + e.pil.c + '"' + (e.pil.dica ? ' title="' + esc(e.pil.dica) + '"' : '') + '>' + lpIc(e.pil.ic) + esc(e.pil.t) + '</span>' : e.sub ? '<span class="lp-sub"' + (e.subDica ? ' title="' + esc(e.subDica) + '"' : '') + '>' + esc(e.sub) + '</span>' : '') +
    '</div>' +
    '<div class="tit' + (tt.vazio ? ' vazio' : '') + '">' + esc(tt.t) + '</div>' +
    (S.view === 'semana' && s.obs ? '<div class="obsline">' + esc(s.obs) + '</div>' : '') +
    (dt || mk ? '<div class="lp-pe">' + (dt || '<span class="lp-dt"></span>') + mk + '</div>' : '') +
    (e.av ? '<span class="lp-av" title="' + esc(e.avNome) + '">' + esc(e.av) + '</span>' : '') +
    lpAcoesHtml(s, e) +
    (S.lpEstoura === s.id ? '<span class="lp-boom" aria-hidden="true"></span><span class="lp-ok" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span>' : '');
  d.querySelectorAll('[data-ac]').forEach(b => b.addEventListener('click', ev => {
    ev.stopPropagation();
    if (b.tagName === 'A') return;                        // o link do MKT Hub abre sozinho em outra aba
    ev.preventDefault(); lpAcao(b.dataset.ac, s);
  }));
}
function lpAcao(id, s) {
  lpDesliga();
  if (id === 'postar') return lpPostei(s);
  if (id === 'despostar') return togglePostado(s);
  if (id === 'aprovar') return apAcao(s.id, 'aprovar');
  if (id === 'producao') return abrirProducao(s.id);
  if (id === 'copy') return abrirCopy(s.id);
  if (id === 'matriz') return openMatriz(s.id);
  if (id === 'abrir') return isBanco(s) && s.matrizSB ? openMatriz(s.id) : openTask(s.id);
  if (id === 'cdiv') { const c = contaDivergente(s); if (c) corrigirConta(s, c.sugerida); return; }
  if (id === 'del') return lpExclui(s);
}
async function lpExclui(s) {
  if (!confirm('Excluir "' + slotTitulo(s) + '"?\n\n(Ctrl+Z desfaz.)')) return;
  try {
    await api('/api/slots/' + s.id, { method: 'DELETE' });
    S.slots = S.slots.filter(x => x.id !== s.id); S.selecao.delete(s.id);
    render(); renderSelbar();
    toast('Excluído · Ctrl+Z desfaz');
  } catch (e) { toast(e.message, true); }
}
/** Postei: marca postado e o card comemora (a festa nasce junto com o card redesenhado). */
function lpPostei(s) {
  S.lpEstoura = s.id;
  togglePostado(s);
  setTimeout(() => {
    if (S.lpEstoura !== s.id) return;
    S.lpEstoura = null;
    const c = document.querySelector('.card[data-id="' + s.id + '"]');
    if (c) { c.classList.remove('lp-estoura'); c.querySelectorAll('.lp-boom,.lp-ok').forEach(x => x.remove()); }
  }, 1500);
}

// ---------------- hover: liga o dia que fica pronto ao dia que sai ----------------
// Passar o mouse num post da produção acende o dia da entrega (caixinha) e desenha a seta até o card (vermelha se
// atrasou). Na caixinha do dia, as setas vão até os posts que ficam prontos ali. Tudo num SVG por cima da grade,
// abaixo do cabeçalho do mês, e some no mouseleave ou em qualquer redesenho.
const LPL = { svg: null, alvo: null, focos: [], timer: 0 };
function lpDesliga() {
  clearTimeout(LPL.timer);
  if (LPL.svg) { LPL.svg.remove(); LPL.svg = null; }
  if (LPL.alvo) {
    LPL.alvo.classList.remove('lp-alvo'); LPL.alvo.style.removeProperty('--lp-mc'); LPL.alvo.style.removeProperty('--lp-mc-on');
    LPL.alvo.querySelectorAll('.lp-alvo-rot').forEach(x => x.remove()); LPL.alvo = null;
  }
  LPL.focos.forEach(c => c.classList.remove('lp-foco')); LPL.focos = [];
}
/** Espera um tiquinho antes de desenhar: passar o mouse por cima de vários cards não fica piscando. */
function lpQuando(fn) { clearTimeout(LPL.timer); LPL.timer = setTimeout(fn, 90); }
function lpPonto(el, g) { const r = el.getBoundingClientRect(), gr = g.getBoundingClientRect(); return { x: r.left - gr.left, y: r.top - gr.top, w: r.width, h: r.height }; }
/** Curva com a barriga pra cima e a ponta da seta no fim. */
function lpCurva(x1, y1, x2, y2) {
  const cx = (x1 + x2) / 2, cy = Math.min(y1, y2) - 46 - Math.abs(x2 - x1) * 0.06;
  const a = Math.atan2(y2 - cy, x2 - cx), L = 9, f = n => n.toFixed(1);
  return {
    d: 'M' + f(x1) + ' ' + f(y1) + ' Q' + f(cx) + ' ' + f(cy) + ' ' + f(x2) + ' ' + f(y2),
    s: 'M' + f(x2 - L * Math.cos(a - 0.5)) + ' ' + f(y2 - L * Math.sin(a - 0.5)) + ' L' + f(x2) + ' ' + f(y2) + ' L' + f(x2 - L * Math.cos(a + 0.5)) + ' ' + f(y2 - L * Math.sin(a + 0.5)),
  };
}
function lpMarcaDia(cell, cor, ic, txt) {
  cell.classList.add('lp-alvo'); cell.style.setProperty('--lp-mc', cor);
  // a cor do texto da etiqueta acompanha o fundo (a marca da Carbone no claro é quase preta)
  cell.style.setProperty('--lp-mc-on', cor === 'var(--sb)' ? 'var(--on-sb)' : /e-red/.test(cor) ? 'var(--e-red-on)' : '#000');
  const r = document.createElement('span'); r.className = 'lp-alvo-rot'; r.innerHTML = lpIc(ic) + '<span>' + esc(txt) + '</span>';
  cell.appendChild(r); LPL.alvo = cell;
}
function lpDesenha(cor, curvas) {
  const g = document.getElementById('grid'), NS = 'http://www.w3.org/2000/svg';
  if (!g || !curvas.length) return;
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'lp-lsvg'); svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('width', g.scrollWidth); svg.setAttribute('height', g.scrollHeight);
  svg.style.setProperty('--lp-mc', cor);
  for (const cv of curvas) {
    const p = document.createElementNS(NS, 'path'); p.setAttribute('class', 'lp-lig'); p.setAttribute('d', cv.d); p.setAttribute('pathLength', '1');
    const a = document.createElementNS(NS, 'path'); a.setAttribute('class', 'lp-seta'); a.setAttribute('d', cv.s);
    svg.append(p, a);
  }
  g.appendChild(svg); LPL.svg = svg;
}
/** Hover no card: o outro dia do post (a entrega, ou o dia que sai na lente "fica pronto") acende e a seta liga os dois. */
function lpLigaCard(s, card) {
  lpDesliga();
  if (S.dragging || !s.taskId || !s.hub || !s.hub.prazo || !s.date || s.hub.prazo === s.date) return;
  const g = document.getElementById('grid'); if (!g || !g.contains(card)) return;
  const ent = S.lente === 'ent', outro = ent ? s.date : s.hub.prazo;
  const cell = g.querySelector('.day[data-dia="' + outro + '"]'); if (!cell) return;
  const e = lpEtapa(s), folga = lpDif(s.date, s.hub.prazo);
  let txt, cor;
  if (!ent) {
    const atrasou = !!(e.dt && e.dt.c === 'red');
    txt = atrasou && folga > 0 ? 'era pra ficar pronto ' + lpDiaC(s.hub.prazo) + ' · atrasou'
      : 'fica pronto ' + lpDiaC(s.hub.prazo) + (folga > 0 ? ' · ' + folga + (folga === 1 ? ' dia antes' : ' dias antes') : ' · depois do post!');
    cor = folga < 0 || atrasou ? 'var(--e-red)' : 'var(--e-prod)';
  } else {
    txt = (e.k === 'ar' ? 'saiu ' : 'sai ') + lpDiaC(s.date) + (folga > 0 ? ' · ' + folga + (folga === 1 ? ' dia depois' : ' dias depois') : ' · antes da entrega!');
    cor = folga < 0 ? 'var(--e-red)' : 'var(--sb)';
  }
  lpMarcaDia(cell, cor, ent ? 'calendar' : 'box', txt);
  const c = lpPonto(cell, g), k = lpPonto(card, g), direita = k.x > c.x;
  lpDesenha(cor, [lpCurva(c.x + c.w / 2, c.y + c.h - 30, direita ? k.x - 4 : k.x + k.w + 4, k.y + k.h / 2)]);
}
/** Hover na caixinha do dia: acende o dia e liga a caixinha aos posts que ficam prontos ali. */
function lpLigaEntregas(dia, btn) {
  lpDesliga();
  if (S.lente === 'ent' || S.dragging) return;
  const lista = (entMapa()[dia] || []), g = document.getElementById('grid'), cell = btn.closest('.day');
  if (!lista.length || !g || !cell) return;
  lpMarcaDia(cell, 'var(--e-prod)', 'box', lista.length + (lista.length > 1 ? ' posts ficam prontos aqui' : ' post fica pronto aqui'));
  const b = lpPonto(btn, g), curvas = [];
  for (const s of lista) {
    const k = g.querySelector('.card[data-id="' + s.id + '"]'); if (!k) continue;
    k.classList.add('lp-foco'); LPL.focos.push(k);
    const p = lpPonto(k, g);
    if (k.closest('.day') !== cell) curvas.push(lpCurva(b.x + b.w / 2, b.y + b.h, p.x + p.w / 2, p.y - 3));
  }
  lpDesenha('var(--e-prod)', curvas);
}

// ---------------- legenda do mês: 6 botões em 4 grupos (no lugar do filtro de 16 opções) ----------------
const LP_DICA = {
  mz: 'Matriz: o plano do post (tema, tese, gancho), no B.O.N.E',
  copy: 'Copy: o texto do post, escrito e aprovado no B.O.N.E',
  prod: 'Produção: a arte ou o vídeo sendo feito no MKT Hub',
  pronto: 'Pronto: arte aprovada no MKT Hub, é só postar',
  ar: 'No ar: já foi postado no Instagram',
  alerta: 'Atenção: voltou pra alterar, a entrega atrasou ou vence hoje/amanhã, ou o post pronto passou do dia',
};
function lpLegendaMes(lista) {
  const n = { mz: 0, copy: 0, prod: 0, pronto: 0, ar: 0, alerta: 0 };
  for (const s of lista) { const e = lpEtapa(s); if (e.k in n) n[e.k]++; if (e.alerta) n.alerta++; }
  const f = S.filtro;
  const chip = k => '<button type="button" class="lp-lc e-' + k + (n[k] ? '' : ' zero') + (f === k ? ' on' : '') + '" data-f="' + k + '" aria-pressed="' + (f === k) + '" title="' +
    esc(LP_DICA[k] + ' · passe o mouse pra ver, clique pra filtrar') + '"><i></i>' + (k === 'alerta' ? 'Atenção' : LP.NOME[k]) + '<b>' + n[k] + '</b></button>';
  const grp = (rot, ks) => '<span class="lp-grp"><span class="lp-gl">' + rot + '</span><span class="lp-chips">' + ks.map(chip).join('') + '</span></span>';
  return '<span class="mesleg lp-leg">' +
    grp('no B.O.N.E', mzDaAba(S.aba) ? ['mz', 'copy'] : ['copy']) + grp('no MKT Hub', ['prod', 'pronto']) + grp('no Instagram', ['ar']) + grp('precisa agir', ['alerta']) +
  '</span>';
}
/** Hover na legenda = prévia (o resto apaga); clique = filtro (clique de novo tira). Nada é redesenhado: é só CSS. */
function lpLigaLegenda(raiz) {
  raiz.querySelectorAll('.lp-lc').forEach(b => {
    b.onmouseenter = () => { S.lpPrevia = b.dataset.f; lpVer(); };
    b.onmouseleave = () => { S.lpPrevia = null; lpVer(); };
    b.onclick = () => { S.filtro = S.filtro === b.dataset.f ? 'todos' : b.dataset.f; S.lpPrevia = null; lpVer(); };
  });
}
function lpVer() {
  const v = S.lpPrevia || (S.filtro && S.filtro !== 'todos' ? S.filtro : '');
  if (v) document.body.dataset.lpVer = v; else delete document.body.dataset.lpVer;
  document.querySelectorAll('.lp-lc').forEach(x => { const on = x.dataset.f === S.filtro; x.classList.toggle('on', on); x.setAttribute('aria-pressed', on); });
}

// ---------------- lente: cada post no dia em que ele SAI ou em que FICA PRONTO ----------------
/** O dia em que o card aparece no calendário (na lente "fica pronto", só os posts com entrega no MKT Hub). */
function lpDiaNaLente(s) { return S.lente === 'ent' ? ((s.taskId && s.hub && s.hub.prazo) || null) : s.date; }
function lpPintaLente() {
  const g = document.getElementById('lente'); if (!g) return;
  g.dataset.lente = S.lente;
  g.querySelectorAll('button[data-l]').forEach(b => { const on = b.dataset.l === S.lente; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); b.tabIndex = on ? 0 : -1; });
  document.body.classList.toggle('lente-ent', S.lente === 'ent');
}
/** Troca a lente e os cards andam (animação FLIP: cada card sai de onde estava e vai até o dia novo). */
function lpTrocaLente(nova) {
  if (S.lente === nova) return;
  lpDesliga();
  const antes = lpFotografa();
  S.lente = nova; lpPintaLente();
  render();
  lpAnimaTroca(antes);
}
function lpFotografa() {
  const m = new Map(), h = innerHeight;
  document.querySelectorAll('#grid .card[data-id]').forEach(c => {
    const r = c.getBoundingClientRect();
    if (r.bottom > -60 && r.top < h + 60) m.set(c.dataset.id, { r, el: c });
  });
  return m;
}
function lpAnimaTroca(antes) {
  if (!Element.prototype.animate || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const h = innerHeight, mola = 'cubic-bezier(.22,1.2,.36,1)', vistos = new Set();
  let nasce = 0;
  document.querySelectorAll('#grid .card[data-id]').forEach(c => {
    const id = c.dataset.id, a = antes.get(id), r = c.getBoundingClientRect();
    if (a) {
      vistos.add(id);
      const dx = a.r.left - r.left, dy = a.r.top - r.top;
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) c.animate([{ transform: 'translate(' + dx + 'px,' + dy + 'px)' }, { transform: 'none' }], { duration: 620, easing: mola });
    } else if (r.bottom > 0 && r.top < h) {
      c.animate([{ opacity: 0, transform: 'translateY(10px) scale(.86)' }, { opacity: 1, transform: 'none' }], { duration: 560, delay: Math.min(nasce++, 14) * 30, easing: mola, fill: 'backwards' });
    }
  });
  // o que saiu da vista (na lente "fica pronto": matriz, copy e post sem entrega) some no lugar onde estava
  antes.forEach((a, id) => {
    if (vistos.has(id)) return;
    const f = a.el;
    f.classList.add('lp-fantasma');
    Object.assign(f.style, { position: 'fixed', left: a.r.left + 'px', top: a.r.top + 'px', width: a.r.width + 'px', height: a.r.height + 'px', margin: '0' });
    document.body.appendChild(f);
    const an = f.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(.9)' }], { duration: 320, easing: 'ease-out', fill: 'forwards' });
    an.onfinish = () => f.remove();
    setTimeout(() => f.remove(), 700);
  });
}

// ---------------- folha do post: a linha do post e as duas datas (só mostram) ----------------
/** Etiqueta da etapa (no cabeçalho da folha do post). Na produção, vem o nome exato da etapa no MKT Hub (Em andamento...). */
function lpChipEtapa(s) {
  const e = lpEtapa(s);
  if (e.k === 'esp') return '';
  const hubNome = (e.k === 'prod' || e.k === 'pronto') && s.statusCache && s.statusCache.nome;
  const det = hubNome || (e.pil ? e.pil.t : e.sub);
  return '<span class="lp-chip e-' + e.k + '" title="' + esc(LP.NOME[e.k] + ' · ' + LP.ONDE[e.k]) + '"><i></i>' + LP.NOME[e.k] +
    (det ? '<span>' + esc(det) + '</span>' : '') + '</span>';
}
function lpFolha(s) {
  const box = document.getElementById('tLinha'); if (!box) return;
  const e = lpEtapa(s);
  if (e.k === 'esp') { box.hidden = true; box.innerHTML = ''; return; }
  box.hidden = false;
  const comMz = lpTemMatriz(s.conta) || !!s.matrizSB;
  const ks = (comMz ? ['mz'] : []).concat(['copy', 'prod', 'pronto', 'ar']);
  const cur = LP.ORDEM.indexOf(e.k), a = s.aprov && s.aprov.c, hoje = hojeStr();
  const prazo = (s.hub && s.hub.prazo) || '', nS = s.date ? lpDif(s.date, hoje) : null;
  const pal = e.pil ? e.pil.t : e.sub;
  const passos = ks.map(k => {
    const i = LP.ORDEM.indexOf(k);
    const pulou = (k === 'mz' && !s.matrizSB) || (k === 'copy' && !s.docId && !s.banco);
    const st = e.k === 'ar' || i < cur ? (pulou ? 'x' : 'f') : i === cur ? 'n' : 'v';
    const det = {
      mz: st === 'x' ? 'não passou' : st === 'f' ? 'preenchida' : st === 'n' ? (e.mzd ? e.mzd.n + ' de ' + e.mzd.total + ' campos' : pal) : 'a fazer',
      copy: st === 'x' ? 'não passou' : st === 'f' || (st === 'n' && a && a.st === 'aprovado')
        ? (s.banco && !s.docId ? 'material do banco' : a && a.st === 'aprovado' ? 'aprovada' + (a.ap ? ' por ' + lpPrimeiro(a.ap) : '') : 'escrita')
        : st === 'n' ? pal : comMz ? 'depois da matriz' : 'a escrever',
      prod: st === 'f' ? 'arte aprovada' : st === 'n' ? [lpPrimeiro(s.assigneeCache || s.responsavelManual), (s.statusCache && s.statusCache.nome) || pal].filter(Boolean).join(' · ') : 'nasce com a task',
      pronto: st === 'f' ? 'entregue' : st === 'n' ? pal : 'depois da arte',
      ar: st === 'f' ? (s.date ? 'saiu ' + lpDiaC(s.date) : 'postado') : s.date ? 'sai ' + lpDiaC(s.date) : 'sem dia',
    }[k];
    const ic = st === 'f' ? lpIc('check') : st === 'n' ? lpIc('ponto', 'cheio') : st === 'x' ? lpIc('traco') : '';
    return '<div class="lpf-no s-' + k + ' ' + st + '"><span class="lpf-bo">' + ic + '</span><b>' + LP.NOME[k] + '</b><small>' + esc(det || '') + '</small></div>';
  });
  const posCur = e.k === 'ar' ? ks.length - 1 : Math.max(0, ks.indexOf(e.k));
  const trilho = Math.round(100 * posCur / (ks.length - 1));
  // o degradê das etapas ocupa o trilho inteiro: a parte cheia mostra só o pedaço até a etapa de agora
  const degrade = trilho > 0 ? 'background-size:' + (10000 / trilho).toFixed(1) + '% 100%' : '';
  // as duas datas
  let ent;
  if (prazo) {
    const nE = lpDif(prazo, hoje), entregue = e.k === 'pronto' || e.k === 'ar' || (e.k === 'prod' && stBucket(s) === 'aprovar');
    const rel = entregue ? 'entregue' : nE < 0 ? 'atrasada ' + (-nE) + (nE === -1 ? ' dia' : ' dias') : lpRel(nE);
    const cls = entregue ? 'feita' : nE < 0 ? 'red' : nE <= 1 ? 'or' : 'neu';
    ent = '<div class="lpf-dc ent"><span class="lpf-dl">' + icon('box') + 'Fica pronto (entrega)</span><span class="lpf-dv">' + lpDiaL(prazo) + '</span>' +
      '<span class="lpf-dr ' + cls + '">' + rel + '</span><span class="lpf-src">prazo da task ' + esc(s.hub.codigo || '') + ' no MKT Hub</span></div>';
  } else {
    const podeCriar = souAdmin() && S.temFonte && !s.taskId && ((a && a.st === 'aprovado') || isBanco(s));
    const pq = !s.taskId ? 'A entrega nasce junto com a task de produção no MKT Hub.'
      : ehDoHub(s.taskId) ? 'A task ' + ((s.hub && s.hub.codigo) || '') + ' não tem entrega marcada no MKT Hub.' : 'A task deste post não é do MKT Hub, então não tem entrega aqui.';
    ent = '<div class="lpf-nada"><b>Fica pronto: ainda não tem</b><span>' + esc(pq) + '</span>' +
      (podeCriar ? '<button type="button" class="mbtn primary lpf-criar" id="lpfCriar">' + lpIc('send') + 'Criar task de produção</button>' : '') + '</div>';
  }
  const sai = s.date
    ? '<div class="lpf-dc sai"><span class="lpf-dl">' + icon('calendar') + 'Vai ao ar (sai)</span><span class="lpf-dv">' + lpDiaL(s.date) + '</span>' +
      '<span class="lpf-dr ' + (s.postado ? 'feita' : nS < 0 ? 'red' : nS <= 1 ? 'or' : 'neu') + '">' + (s.postado ? 'já saiu' : lpRel(nS)) + '</span><span class="lpf-src">o dia dele no calendário</span></div>'
    : '<div class="lpf-nada"><b>Vai ao ar: sem dia</b><span>O post está no banco, sem dia no calendário.</span></div>';
  let folga = '', fcls = '';
  if (prazo && s.date) {
    const f = lpDif(s.date, prazo);
    folga = f > 0 ? f + (f === 1 ? ' dia de folga' : ' dias de folga') : f === 0 ? 'no mesmo dia' : 'fica pronto depois do post!';
    fcls = f < 0 ? ' red' : f === 0 ? ' or' : '';
  }
  const grupos = '<div class="lpf-grupos" style="grid-template-columns:repeat(' + ks.length + ',minmax(0,1fr))">' +
    '<span class="bone" style="grid-column:span ' + (comMz ? 2 : 1) + '">no B.O.N.E</span><span class="hub" style="grid-column:span 2">no MKT Hub</span><span class="ig">no Instagram</span></div>';
  box.style.setProperty('--c', 'var(--e-' + e.k + ')');
  box.innerHTML =
    '<div class="lpf-sec">Linha do post</div>' + grupos +
    '<div class="lpf-nos' + (comMz ? '' : ' sem-mz') + '" style="grid-template-columns:repeat(' + ks.length + ',minmax(0,1fr))"><div class="lpf-trilho" style="--n:' + ks.length + '"><i style="width:' + trilho + '%;' + degrade + '"></i></div>' + passos.join('') + '</div>' +
    '<div class="lpf-sec">As duas datas</div>' +
    '<div class="lpf-datas">' + ent + '<div class="lpf-folga' + fcls + '">' + (folga ? '<svg viewBox="0 0 44 10" aria-hidden="true"><path d="M2 5h40"/></svg><span>' + folga + '</span>' : '') + '</div>' + sai + '</div>' +
    '<p class="lpf-aviso">' + icon('help') + '<span>Aqui só mostra: a entrega é do MKT Hub (muda lá) e o dia que sai é o do calendário (arraste o card pra mudar)' +
      (s.prod ? '. Quando o post muda de dia, o dia do post muda no MKT Hub junto.' : '.') + '</span></p>';
  const cr = document.getElementById('lpfCriar');
  if (cr) cr.onclick = () => { closeOv('ovTask'); abrirProducao(s.id); };
}

// ---------------- liga a lente na barra (chamado no init do painel) ----------------
function lpInit() {
  const g = document.getElementById('lente'); if (!g) return;
  g.querySelector('[data-l="sai"]').insertAdjacentHTML('afterbegin', icon('calendar'));
  g.querySelector('[data-l="ent"]').insertAdjacentHTML('afterbegin', icon('box'));
  g.querySelectorAll('button[data-l]').forEach(b => { b.onclick = () => lpTrocaLente(b.dataset.l); });
  g.addEventListener('keydown', ev => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(ev.key)) return;
    ev.preventDefault();
    lpTrocaLente(S.lente === 'sai' ? 'ent' : 'sai');
    const on = g.querySelector('button.on'); if (on) on.focus();
  });
  lpPintaLente();
}
