/* =====================================================================
   B.O.N.E · tarefas da copywriter (v3.80)
   - faixa no topo de cada empresa com os cards de Matriz (SeuBoné e, v3.91, Weevo) e Copy
   - folha da tarefa: explicação, período, relógio, posts do período e aprovação post a post
   - cápsula do relógio no centro de baixo (aparece em qualquer tela, até em cima do doc)
   - avisos "pra aprovar" (pra quem aprova) e "pra alterar" (pra quem faz)
   - v3.84/3.85: a tarefa ia pro MKT Hub (mãe + subtarefas) e a aprovação era lá
   - v3.88 (fluxo novo, pedido do Zion em 30/09/2026): nada vai mais pro Hub. A tarefa de matriz CRIA os cards
     amarelos dos dias dela e não tem aprovação (conta os cards preenchidos); só a copy é aprovada, aqui mesmo.
     Concluir a tarefa é só do ADMIN
   Carregado ANTES do script principal do index.html: aqui só tem funções; tudo que usa S, $, api, esc,
   icon, toast, PERFIL... roda depois, chamado pelo painel. O relógio mora em js/cronometro.js (CRON).
   ===================================================================== */
'use strict';
const TF = { aberta: null, novo: null, det: null, sel: null, exp: new Set(), alt: null, voltar: null, conhecidos: null, pendPer: null, ligar: null, ligarQ: '', ligarLista: null, ligarN: 0, hubTimer: null, hubSeguindo: null, firma: null };
/** v3.91: a empresa tem matriz? (SeuBoné e Weevo: vem do /api/matrizes) */
function tfTemMatriz(aba) { return !!mzDaAba(aba); }
const TF_TIPOS = {
  matriz: { nome: 'Matriz', k: 'm', cor: 'var(--mz)', icone: 'calmz',
    exp: 'Escolha os dias e crie a tarefa: cada dia ganha um card amarelo da matriz. Preencha formato, ângulo, pauta quente, tema, tese, gancho e descrição de cada um. Dê play no relógio quando começar: o painel anota sozinho em qual card você está. Não precisa terminar a matriz pra começar a copy.' },
  copy: { nome: 'Copy', k: 'c', cor: 'var(--blue)', icone: 'doc',
    exp: 'Escreva a copy de cada post do período no documento dele: o card da matriz vira o card da copy. Dê play no relógio quando começar: o painel anota sozinho em qual documento você está. Terminou, mande pra aprovação: o Zion ou a Maria aprovam aqui no B.O.N.E. Copy aprovada vira task de produção no MKT Hub.' },
};
const TF_DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const TF_ICON_PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.5 5.8v12.4a.8.8 0 0 0 1.2.7l9.6-6.2a.8.8 0 0 0 0-1.4L9.7 5.1a.8.8 0 0 0-1.2.7z"/></svg>';
const TF_ICON_PAUSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6.5" y="5.5" width="4" height="13" rx="1.3"/><rect x="13.5" y="5.5" width="4" height="13" rx="1.3"/></svg>';
const TF_ICON_STOP = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6.5" y="6.5" width="11" height="11" rx="2.2"/></svg>';

// ---------------- ajudantes ----------------
function tfEu() { const p = PERFIL.get(); return p ? p.nome : ''; }
function tfChave(t) { return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim(); }
function tfSouDona(t) { return !!tfEu() && tfChave(tfEu()) === tfChave(t.por); }
/** Quem aprova: com login (v3.82), só ADMIN (Zion e Maria); sem login (PC local), quem não é a dona da tarefa. */
function tfPodeAprovar(t) { return S.eu ? S.eu.papel === 'admin' : !tfSouDona(t); }
function tfK(t) { return t.tipo === 'matriz' ? 'm' : 'c'; }
function tfPorId(id) { return (S.tarefas || []).find(t => t.id === id) || null; }
function tfDaAba(aba, tipo) { return (S.tarefas || []).filter(t => t.aba === aba && t.tipo === tipo); }
function tfIso(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function tfSoma(iso, n) { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return tfIso(d); }
function tfSegunda(iso) { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() - (d.getDay() + 6) % 7); return tfIso(d); }
function tfDia(iso) { return TF_DIAS[new Date(iso + 'T12:00:00').getDay()] + ' ' + brData(iso); }
function tfAprov(s, k) { return (s && s.aprov && s.aprov[k]) || null; }
/** v3.84: a aprovação deste post era no MKT Hub. v3.88: sempre aqui (a migração tirou a marca do Hub dos posts). */
function tfNoHub() { return false; }
/** v3.88: pode concluir (arquivar) a tarefa? Com login, só ADMIN; sem login (PC local), todo mundo. */
function tfPodeConcluir() { return !S.eu || S.eu.papel === 'admin'; }
function tfSlots(t) { const m = new Map(S.slots.map(s => [s.id, s])); return t.itens.map(id => m.get(id)).filter(Boolean).sort((a, b) => a.date.localeCompare(b.date) || slotTitulo(a).localeCompare(slotTitulo(b))); }
function tfNomeTarefa(t) { return TF_TIPOS[t.tipo].nome + ' · ' + nomeAba(t.aba); }
/**
 * v3.88: prévia da tarefa de matriz: cada dia do período e o que acontece nele (mesma regra do servidor: na SeuBoné,
 * dia que já tem post fica como está; na Weevo, só um card da matriz que já existe; os outros ganham um card amarelo
 * com o tipo do dia). v3.91: dia antes do começo da matriz (Weevo: 01/10/2026) fica de fora.
 */
function tfDiasMatriz(de, ate, aba) {
  const k = mzDaAba(aba || 'SEUBONÉ') || 'seubone', umPorDia = k === 'seubone', dias = [];
  for (let d = de; d <= ate && dias.length < 40; d = tfSoma(d, 1)) {
    const l = S.slots.filter(s => s.date === d && (s.conta === k || (umPorDia && (s.collab || []).includes(k))));
    const mz = l.find(s => s.matrizSB), td = mzTipoDoDia(d, k);
    dias.push({ d, s: mz || (umPorDia ? l[0] : null) || null, tipo: (td || {}).tipo || '', fora: !td });
  }
  return dias;
}
/** Mesma regra do servidor (lib/tarefas.js), só pra mostrar a prévia antes de criar. */
function tfItensPrevia(tipo, aba, de, ate) {
  const contas = new Set(contasDaAba(aba));
  return S.slots.filter(s => s.date && s.date >= de && s.date <= ate && contas.has(s.conta) && !s.postado && !(s.sugestao && !s.taskId) && (tipo !== 'matriz' || !!s.matrizSB))
    .sort((a, b) => a.date.localeCompare(b.date));
}
/** A matriz está preenchida (os 7 campos) ou a copy está pronta pra mandar (documento com texto)? */
function tfPronto(s, t) {
  if (t.tipo === 'matriz') return !!(s.matrizSB && mzProgresso(s.matrizSB, mzContaDe(s)).cheio);
  const d = TF.det && TF.det.docs ? TF.det.docs[s.id] : null;
  return !!(d && d.palavras >= 15);
}
function tfEstado(s, t) {
  if (t.tipo === 'matriz') return tfPronto(s, t) ? { cod: 'feita', rot: 'preenchida', cor: 'var(--green)' } : { cod: 'fazer', rot: 'a preencher', cor: 'var(--gray)' };   // v3.88
  const a = tfAprov(s, tfK(t));
  if (a && a.st === 'aprovado') return { cod: 'aprovado', rot: 'aprovada', cor: 'var(--green)' };
  if (a && a.st === 'enviado') return { cod: 'enviado', rot: 'em aprovação', cor: 'var(--orange)' };
  if (a && a.st === 'alterar') return { cod: 'alterar', rot: 'pra alterar', cor: 'var(--red)' };
  if (tfPronto(s, t)) return { cod: 'pronto', rot: 'pronta pra mandar', cor: 'var(--blue)' };
  return { cod: 'fazer', rot: 'a fazer', cor: 'var(--gray)' };
}
/** Números do card: copy (aprovadas, em aprovação, pra alterar) ou matriz (v3.88: cards preenchidos, em "aprovado"). */
function tfConta(t) {
  const k = tfK(t), c = { total: 0, aprovado: 0, enviado: 0, alterar: 0 };
  for (const s of tfSlots(t)) {
    c.total++;
    if (t.tipo === 'matriz') { if (tfPronto(s, t)) c.aprovado++; continue; }
    const a = tfAprov(s, k);
    if (a) c[a.st === 'aprovado' ? 'aprovado' : a.st === 'enviado' ? 'enviado' : 'alterar']++;
  }
  return c;
}
/** Tempo (s) deste post nesta tarefa: o que já está salvo + o que está correndo agora no relógio. */
function tfTempoPost(sid, t) {
  const i = t.tipo === 'matriz' ? 0 : 1;
  let s = TF.det && TF.det.tempos && TF.det.tempos[sid] ? TF.det.tempos[sid][i] : 0;
  const e = CRON.estado();
  if (e && e.tarefaId === t.id) s += Math.round((CRON.postsAgora(e)[sid] || 0) / 1000);
  return s;
}
function tfTempoTarefa(t) { const e = CRON.estado(); return (t.seg || 0) + (e && e.tarefaId === t.id ? Math.round(CRON.decorrido(e) / 1000) : 0); }
/** Qual tarefa o card mostra: a do relógio > a que tem hoje > a próxima > a última. */
function tfAtual(aba, tipo) {
  const l = tfDaAba(aba, tipo).filter(t => !t.concluida);
  if (!l.length) return { t: null, outras: 0 };
  const e = CRON.estado(), hoje = hojeStr();
  const t = (e && l.find(x => x.id === e.tarefaId)) || l.find(x => x.de <= hoje && hoje <= x.ate) || l.find(x => x.de > hoje) || l[l.length - 1];
  return { t, outras: l.length - 1 };
}
/** Período livre pra uma tarefa nova que precisa conter "data": a semana dela, sem encostar nas outras. */
function tfPeriodoLivre(tipo, aba, data) {
  let de = tfSegunda(data), ate = tfSoma(de, 6);
  for (const t of tfDaAba(aba, tipo)) {
    if (t.ate < data && t.ate >= de) de = tfSoma(t.ate, 1);
    if (t.de > data && t.de <= ate) ate = tfSoma(t.de, -1);
  }
  return { de, ate };
}
/** Sugestão de período pra tarefa nova: esta semana (até quarta) ou a próxima livre. */
function tfSugerePeriodo(tipo, aba) {
  const l = tfDaAba(aba, tipo), ocupada = w => l.some(t => t.de <= tfSoma(w, 6) && t.ate >= w);
  let de = tfSegunda(hojeStr());
  const dow = new Date().getDay();
  if (ocupada(de) || dow === 0 || dow >= 4) de = tfSoma(de, 7);
  for (let i = 0; i < 8 && ocupada(de); i++) de = tfSoma(de, 7);
  return { de, ate: tfSoma(de, 6) };
}

// ---------------- faixa no topo da empresa ----------------
function renderFaixa() {
  const el = document.getElementById('faixa'); if (!el) return;
  const aba = S.aba;
  const tipos = tfTemMatriz(aba) ? ['matriz', 'copy'] : ['copy'];
  el.innerHTML = tipos.map(tp => tfCardHtml(aba, tp)).join('');
  el.classList.toggle('um', tipos.length === 1);
  el.querySelectorAll('.tc-abre').forEach(b => b.onclick = () => b.dataset.id ? abrirTarefa(b.dataset.id) : novaTarefa(b.dataset.tipo, aba));
  el.querySelectorAll('.tc-rl').forEach(b => b.onclick = ev => { ev.stopPropagation(); tfPlay(b.dataset.id); });
  tfPintaRelogios();
  tfRefresca();
}
/** Assinatura do que muda na folha aberta sem ela mexer: a aprovação de cada post (e a matriz de cada card). */
function tfFirma(t) { const k = tfK(t); return JSON.stringify(tfSlots(t).map(s => t.tipo === 'matriz' ? mzProgresso(s.matrizSB || {}, mzContaDe(s)).n : s.aprov && s.aprov[k])); }
/** A folha aberta acompanha o que outra pessoa fez (aprovou, pediu alteração) sem atrapalhar quem está digitando. */
function tfRefresca() {
  const ov = document.getElementById('ovTarefa');
  if (!ov || !ov.classList.contains('open') || !TF.aberta || TF.novo || TF.alt || TF.ligar) return;
  const t = tfPorId(TF.aberta); if (!t) return;
  const f = tfFirma(t);
  if (f === TF.firma) return;
  const ae = document.activeElement;
  if (ae && ov.contains(ae) && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName) && ae.type !== 'checkbox') return;
  const caixas = [ov.querySelector('.modal'), document.getElementById('tfBody')].filter(Boolean), ys = caixas.map(c => c.scrollTop);
  tfDesenha();
  caixas.forEach((c, i) => { c.scrollTop = ys[i]; });
}
function tfCardHtml(aba, tipo) {
  const T = TF_TIPOS[tipo], { t, outras } = tfAtual(aba, tipo);
  if (!t) {
    return '<div class="tcard vazio" style="--tc:' + T.cor + '"><button class="tc-abre" data-tipo="' + tipo + '">' +
      '<span class="tc-l1"><span class="tc-ic">' + icon(T.icone) + '</span><b>' + T.nome + '</b><span class="tc-per">nenhuma tarefa aberta</span></span>' +
      '<span class="tc-l2"><span class="tc-cta">' + icon('plus') + 'Criar tarefa de ' + T.nome.toLowerCase() + '</span></span></button></div>';
  }
  const c = tfConta(t), dona = tfSouDona(t), aprova = tfPodeAprovar(t), pct = n => c.total ? (n / c.total * 100).toFixed(1) : 0;
  const chips = [];
  if (c.enviado) chips.push('<span class="tc-chip env"><i></i>' + c.enviado + (aprova && !dona ? ' pra aprovar' : ' em aprovação') + '</span>');
  if (c.alterar) chips.push('<span class="tc-chip alt"><i></i>' + c.alterar + ' pra alterar</span>');
  return '<div class="tcard" style="--tc:' + T.cor + '" data-id="' + t.id + '">' +
    '<button class="tc-abre" data-id="' + t.id + '" aria-label="Abrir a tarefa de ' + T.nome + '">' +
      '<span class="tc-l1"><span class="tc-ic">' + icon(T.icone) + '</span><b>' + T.nome + '</b><span class="tc-per">' + brData(t.de) + ' a ' + brData(t.ate) + ' · ' + esc(t.por) + '</span>' +
        (outras ? '<span class="tc-mais" title="mais ' + outras + ' tarefa(s) de ' + T.nome.toLowerCase() + ' aberta(s)">+' + outras + '</span>' : '') + '</span>' +
      '<span class="tc-l2"><span class="tc-bar" aria-hidden="true">' + [['ok', c.aprovado], ['env', c.enviado], ['alt', c.alterar]].filter(x => x[1]).map(x => '<i class="' + x[0] + '" style="width:' + pct(x[1]) + '%"></i>').join('') + '</span>' +
        '<span class="tc-num">' + (tipo === 'matriz' ? c.aprovado + ' de ' + c.total + ' preenchida' + (c.total === 1 ? '' : 's') : (c.aprovado + c.enviado) + ' de ' + c.total + ' feitas') + '</span>' + chips.join('') + '</span>' +
    '</button>' +
    '<span class="tc-rel"><span class="nf tc-nf" data-id="' + t.id + '" role="timer"></span><span class="tc-tot" data-id="' + t.id + '"></span><button class="rl-btn tc-rl" data-id="' + t.id + '"></button></span>' +
  '</div>';
}
/** Estado do botão de relógio de uma tarefa (e o texto dele). */
function tfStBotao(tid) {
  const e = CRON.estado();
  if (!e) return 'parado';
  if (e.tarefaId !== tid) return 'outro';
  return e.rodando ? 'rodando' : 'pausado';
}
/** Repinta só os relógios (cards, folha e cápsula): roda a cada meio segundo enquanto o relógio anda. */
function tfPintaRelogios(e) {
  e = e === undefined ? CRON.estado() : e;
  document.querySelectorAll('#faixa .tcard[data-id]').forEach(card => {
    const id = card.dataset.id, st = tfStBotao(id), t = tfPorId(id);
    const btn = card.querySelector('.tc-rl'), nf = card.querySelector('.tc-nf'), tot = card.querySelector('.tc-tot');
    CRON.pintaBotao(btn, st, st === 'outro' ? 'Trocar o relógio pra esta tarefa' : null);
    btn.style.setProperty('--rl-cor', t && t.tipo === 'copy' ? 'var(--blue)' : 'var(--mz)');
    btn.style.setProperty('--rl-on', t && t.tipo === 'copy' ? '#fff' : '#000');
    const ativo = st === 'rodando' || st === 'pausado';
    nf.hidden = !ativo; tot.hidden = ativo;
    if (ativo) CRON.pintaDigitos(nf, CRON.decorrido(e));
    else if (t) tot.textContent = t.seg ? CRON.fmtLongo(t.seg) : '';
  });
  tfPintaPill(e);
  tfPintaFolhaRelogio(e);
  tfPintaMzRel(e);
}

// ---------------- cápsula (centro de baixo) ----------------
function tfPintaPill(e) {
  const el = document.getElementById('crono'); if (!el) return;
  e = e === undefined ? CRON.estado() : e;
  if (!e) { el.hidden = true; el._id = null; return; }
  if (el.hidden || el._id !== e.id) { el.hidden = false; el._id = e.id; el.classList.remove('nasce'); void el.offsetWidth; el.classList.add('nasce'); }
  const t = tfPorId(e.tarefaId), m = e.atv === 'm';
  el.style.setProperty('--cr', m ? 'var(--mz)' : 'var(--blue)');
  el.classList.toggle('pausado', !e.rodando && !e.ocioso);
  el.classList.toggle('ocioso', !!e.ocioso);
  const tit = e.titulo || (t ? tfNomeTarefa(t) : 'Relógio');
  if (el._tit !== tit) { el._tit = tit; $('#crTit').textContent = tit; }
  const sub = !e.rodando ? 'pausado' : (e.focoTit || 'sem post aberto');
  if (el._sub !== sub) { el._sub = sub; $('#crSub').textContent = sub; }
  const docAberto = !$('#ovDoc').hidden;
  $('#crInfo').disabled = docAberto;
  $('#crInfo').title = docAberto ? '' : 'Abrir a tarefa';
  const alt = $('#crAlt');
  if (alt._r !== e.rodando) { alt._r = e.rodando; alt.innerHTML = e.rodando ? TF_ICON_PAUSE : TF_ICON_PLAY; alt.setAttribute('aria-label', e.rodando ? 'Pausar' : 'Continuar'); alt.dataset.tip = e.rodando ? 'Pausar' : 'Continuar'; }
  if (e.ocioso) {
    const min = Math.max(15, Math.round((Date.now() - e.ocioso.desde) / 60000));
    $('#crOcTxt').textContent = 'Ficou ' + min + ' min sem mexer. Conta na ' + (m ? 'matriz' : 'copy') + '?';
  }
  CRON.pintaDigitos($('#crNf'), CRON.decorrido(e));
}

// ---------------- comandos do relógio ----------------
/** Play/pausa do relógio de uma tarefa (troca de tarefa se outra estiver andando). */
async function tfPlay(id, foco) {
  const t = tfPorId(id); if (!t) return;
  const e = CRON.estado();
  if (e && e.tarefaId === id) { CRON.alternar(); return; }
  if (!tfEu()) { toast('Antes, põe o seu nome no perfil (clique na sua bolinha lá em cima)', true); openPerfil(); return; }
  await tfLiga(t, foco === undefined ? tfFocoAgora(t) : foco);
}
async function tfLiga(t, foco) {
  const s = foco ? S.slots.find(x => x.id === foco) : null;
  const r = await CRON.iniciar({ tarefaId: t.id, atv: tfK(t), aba: t.aba, titulo: tfNomeTarefa(t), por: tfEu(), foco: s ? s.id : null, focoTit: s ? slotTitulo(s) : '' });
  if (r && r.reg) toast(r.curto ? 'O relógio anterior tinha menos de 30 s e não contou' : 'Relógio anterior salvo: ' + CRON.fmtLongo(r.reg.seg));
}
async function tfParar() {
  const e = CRON.estado(); if (!e) return;
  const t = tfPorId(e.tarefaId);
  const r = await CRON.parar();
  if (!r) return;
  if (r.curto) { toast('Menos de 30 s: não contou'); return; }
  toast(CRON.fmtLongo(r.reg.seg) + ' na ' + (t ? TF_TIPOS[t.tipo].nome.toLowerCase() + ' da ' + nomeAba(t.aba) : 'tarefa') + (r.pendente ? ' · sem conexão agora, vai sozinho quando voltar' : ' · salvo'));
}
/** O post que está aberto agora e faz parte da tarefa (o card da matriz). O doc cuida do foco dele sozinho. */
function tfFocoAgora(t) {
  if (t.tipo === 'matriz' && $('#ovMz').classList.contains('open') && MZ_ATUAL && t.itens.includes(MZ_ATUAL)) return MZ_ATUAL;
  return null;
}
/** Chamado quando abre ou fecha o card da matriz ou o doc: diz pro relógio em qual post ela está. */
function tfSincFoco() {
  const e = CRON.estado(); if (!e) return;
  if (!$('#ovDoc').hidden) return;                       // doc aberto: quem manda no foco é o próprio doc
  const t = tfPorId(e.tarefaId);
  const f = t ? tfFocoAgora(t) : null;
  const s = f ? S.slots.find(x => x.id === f) : null;
  CRON.foco(f, s ? slotTitulo(s) : '');
}
/** Relógio a partir de um post (botão no card da matriz e no doc): acha a tarefa do post ou cria a da semana. */
async function tfRelogioDoPost(slotId, tipo) {
  const s = S.slots.find(x => x.id === slotId);
  if (!s || !s.date) { toast('Post sem data não entra em tarefa', true); return; }
  const aba = S.contas[s.conta] && S.contas[s.conta].aba;
  if (tipo === 'matriz' && !tfTemMatriz(aba)) { toast('Por enquanto a matriz existe só na SeuBoné e na Weevo', true); return; }
  let t = (S.tarefas || []).find(x => x.tipo === tipo && x.aba === aba && x.itens.includes(slotId));
  const e = CRON.estado();
  if (t && e && e.tarefaId === t.id) { CRON.alternar(); return; }
  if (!tfEu()) { toast('Antes, põe o seu nome no perfil (clique na sua bolinha lá em cima)', true); openPerfil(); return; }
  if (!t) {
    const p = tfPeriodoLivre(tipo, aba, s.date);
    try {
      const r = await api('/api/tarefas', { method: 'POST', body: JSON.stringify({ tipo, aba, de: p.de, ate: p.ate, por: tfEu(), semCards: true }) });
      t = r.tarefa; S.tarefas = (S.tarefas || []).concat(t);
      toast('Tarefa de ' + TF_TIPOS[tipo].nome.toLowerCase() + ' criada: ' + brData(p.de) + ' a ' + brData(p.ate));
    } catch (err) { toast(err.message, true); return; }
    renderFaixa();
  }
  await tfLiga(t, slotId);
}

// ---------------- folha da tarefa ----------------
function abrirTarefa(id, focoSlot) {
  const t = tfPorId(id); if (!t) { toast('Tarefa não encontrada', true); return; }
  if (TF.aberta !== id) { TF.exp.clear(); TF.alt = null; TF.det = null; TF.ligar = null; }
  TF.sel = null;                                   // marca de novo o que está pronto e ganhou tempo (quando o detalhe chegar)
  TF.aberta = id; TF.novo = null; TF.voltar = null;
  if (focoSlot) TF.exp.add(focoSlot);
  tfDesenha();
  $('#ovTarefa').classList.add('open');
  tfCarregaDetalhe(focoSlot);
}
function novaTarefa(tipo, aba) {
  if (tipo === 'matriz' && !tfTemMatriz(aba)) { toast('Por enquanto a matriz existe só na SeuBoné e na Weevo', true); return; }
  TF.aberta = null; TF.det = null; TF.sel = null; TF.exp.clear(); TF.voltar = null;
  TF.novo = Object.assign({ tipo, aba, por: tfEu() }, tfSugerePeriodo(tipo, aba));
  tfDesenha();
  $('#ovTarefa').classList.add('open');
}
async function tfCarregaDetalhe(focoSlot) {
  const id = TF.aberta; if (!id) return;
  try {
    const d = await api('/api/tarefas/' + id);
    if (TF.aberta !== id) return;
    TF.det = d;
    if (d.tarefa) { const i = S.tarefas.findIndex(x => x.id === id); if (i >= 0) S.tarefas[i] = d.tarefa; }
    tfDesenha();
    if (focoSlot) { const r = document.querySelector('#tfItens .ti[data-id="' + focoSlot + '"]'); if (r) r.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
  } catch (e) { /* sem o detalhe a folha funciona, só sem os tempos por post */ }
}
const TF_VAZIO = new Set();
function tfSel() { return TF.sel || TF_VAZIO; }
/** Marcados pra mandar: na primeira vez, o que está pronto E ganhou tempo no relógio (o que ela fez). */
function tfSelecaoInicial(t) {
  const sel = new Set();
  for (const s of tfSlots(t)) { const st = tfEstado(s, t).cod; if (st === 'pronto' && tfTempoPost(s.id, t) > 0) sel.add(s.id); }
  return sel;
}
function tfDesenha() {
  const novo = TF.novo, t = novo ? null : tfPorId(TF.aberta);
  if (!novo && !t) { closeOv('ovTarefa'); return; }
  const tipo = novo ? novo.tipo : t.tipo, aba = novo ? novo.aba : t.aba, T = TF_TIPOS[tipo];
  const modal = $('#ovTarefa .modal');
  modal.style.setProperty('--tc', T.cor);
  modal.classList.toggle('copy', tipo === 'copy');
  const dona = t ? tfSouDona(t) : true, aprova = t ? tfPodeAprovar(t) : false;
  if (t && TF.det && TF.sel === null) TF.sel = tfSelecaoInicial(t);
  const sel = tfSel();
  // ---- cabeçalho ----
  const irmas = tfDaAba(aba, tipo);
  $('#tfHead').innerHTML =
    '<div class="tf-kick"><i></i>' + T.nome + ' · ' + esc(nomeAba(aba)) + '</div>' +
    '<div class="mtit">' + (novo ? 'Nova tarefa de ' + T.nome.toLowerCase() : T.nome + ' de ' + tfDia(t.de) + ' a ' + tfDia(t.ate)) + (t && t.concluida ? '<span class="tf-concl">' + icon('check') + 'concluída</span>' : '') + '</div>' +
    '<p class="tf-exp">' + T.exp + '</p>' +
    '<div class="tf-irmas">' + irmas.map(x => '<button class="echip' + (t && x.id === t.id ? ' on' : '') + '" data-id="' + x.id + '">' + brData(x.de) + ' a ' + brData(x.ate) + (x.concluida ? ' ✓' : '') + '</button>').join('') +
      '<button class="echip nada' + (novo ? ' on' : '') + '" data-novo="1">' + icon('plus') + 'nova</button></div>';
  // ---- corpo ----
  const de = novo ? novo.de : t.de, ate = novo ? novo.ate : t.ate, por = novo ? novo.por : t.por;
  const segEsta = tfSegunda(hojeStr()), segProx = tfSoma(segEsta, 7);
  const cfg =
    '<div class="tf-cfg">' +
      '<div class="tf-campo"><span class="tf-lbl">Período</span><div class="tf-per">' +
        '<button class="echip' + (de === segEsta && ate === tfSoma(segEsta, 6) ? ' on' : '') + '" data-sem="' + segEsta + '">Esta semana</button>' +
        '<button class="echip' + (de === segProx && ate === tfSoma(segProx, 6) ? ' on' : '') + '" data-sem="' + segProx + '">Próxima semana</button>' +
        '<input type="date" id="tfDe" value="' + de + '" aria-label="começo"><span class="tf-a">a</span><input type="date" id="tfAte" value="' + ate + '" aria-label="fim"></div></div>' +
      '<div class="tf-campo"><span class="tf-lbl">Quem faz</span><input id="tfPor" class="tf-inp" maxlength="24" value="' + esc(por || '') + '" placeholder="nome" autocomplete="off"' + (S.equipe ? ' list="tfEquipe"' : '') + '>' +
        (S.equipe ? '<datalist id="tfEquipe">' + S.equipe.map(n => '<option value="' + esc(n) + '">').join('') + '</datalist>' : '') + '</div>' +
      '<span class="tf-cfgmsg" id="tfCfgMsg"></span>' +
    '</div>';
  let corpo = cfg;
  if (t) {
    corpo +=
      '<div class="tf-rel">' +
        '<button class="rl-btn grande" id="tfPlay"></button>' +
        '<div class="tf-relinfo"><span class="nf tf-nf" id="tfNf" role="timer"></span><span class="tf-relsub" id="tfRelSub"></span></div>' +
        '<div class="tf-reltot"><b id="tfTot"></b><span>no total da tarefa</span></div>' +
        '<button class="mbtn tf-parar" id="tfParar" hidden>' + TF_ICON_STOP + 'Parar e salvar</button>' +
      '</div>';
    const ss = tfSlots(t);
    corpo += '<div class="tf-lhead"><b>' + (tipo === 'matriz' ? 'Cards da matriz' : 'Posts do período') + '</b><span class="tf-n">' + ss.length + '</span>' +
      (tipo === 'matriz' ? '<span class="tf-dica">clique no card pra preencher</span>'
        : dona ? '<span class="tf-dica">marque o que está pronto e mande pra aprovação</span>'
          : aprova ? '<span class="tf-dica">aprove ou peça alteração em cada um</span>' : '<span class="tf-dica">quem aprova: Zion ou Maria (ADMIN)</span>') + '</div>' +
      '<div class="tf-itens" id="tfItens">' + (ss.length ? ss.map(s => tfLinha(s, t, dona, aprova)).join('') : '<div class="tf-vazio">Nenhum ' + (tipo === 'matriz' ? 'card da matriz' : 'post') + ' nesse período.</div>') + '</div>';
  } else if (tipo === 'matriz') {
    // v3.88: a tarefa de matriz cria os cards amarelos: a prévia mostra o que vai acontecer em cada dia
    // v3.91: na Weevo, dia antes do começo da matriz (01/10/2026) não ganha card
    const dias = tfDiasMatriz(de, ate, aba), novos = dias.filter(x => !x.s && !x.fora).length;
    const inicio = (mzCfg(mzDaAba(aba)).inicio || '');
    corpo += '<div class="tf-lhead"><b>Dias da matriz</b><span class="tf-n">' + dias.length + '</span><span class="tf-dica">' + (novos ? novos + ' card' + (novos > 1 ? 's' : '') + ' amarelo' + (novos > 1 ? 's' : '') + ' novo' + (novos > 1 ? 's' : '') : 'nenhum card novo') + '</span></div>' +
      '<div class="tf-itens previa" id="tfItens">' + dias.map(x => '<div class="ti' + (x.s ? '' : x.fora ? ' fora' : ' novo') + '"><span class="ti-dia">' + tfDia(x.d) + '</span>' +
        (x.s ? '<span class="ti-tit">' + esc(slotTitulo(x.s)) + '</span><span class="ti-conta">' + (x.s.matrizSB ? 'já tem card' : 'já tem post') + '</span>'
          : x.fora ? '<span class="ti-tit">antes da matriz' + (inicio ? ' (começa em ' + brData(inicio) + ')' : '') + '</span>'
          : '<span class="ti-tit">card novo' + (x.tipo ? ' · ' + esc(x.tipo) : ' · slot em aberto') + '</span>') + '</div>').join('') + '</div>';
  } else {
    const l = tfItensPrevia(tipo, aba, de, ate);
    corpo += '<div class="tf-lhead"><b>Posts nesse período</b><span class="tf-n">' + l.length + '</span></div>' +
      '<div class="tf-itens previa" id="tfItens">' + (l.length ? l.map(s => '<div class="ti"><span class="ti-dia">' + tfDia(s.date) + '</span><span class="ti-tit">' + esc(slotTitulo(s)) + '</span>' + (contasDaAba(aba).length > 1 ? '<span class="ti-conta">' + esc(contaCurta(s.conta)) + '</span>' : '') + '</div>').join('') : '<div class="tf-vazio">Nenhum post nesse período.</div>') + '</div>';
  }
  $('#tfBody').innerHTML = corpo;
  // ---- rodapé ----
  let pe = '';
  if (novo) pe = '<button class="mbtn primary" id="tfCriar">' + icon('plus') + 'Criar tarefa</button><span class="note">' + (tipo === 'matriz' ? 'cria os cards amarelos; depois é só dar play no relógio' : 'depois é só dar play no relógio') + '</span>';
  else {
    const ss = tfSlots(t);
    if (t.tipo === 'copy') {                           // v3.88: a matriz não passa por aprovação
      const esperando = ss.filter(s => { const a = tfAprov(s, tfK(t)); return a && a.st === 'enviado'; });
      if (dona) pe += '<button class="bt-aprovar" id="tfEnviar"' + (sel.size ? '' : ' disabled') + '><span class="bt-txt"><span>' + tfTxtEnviar(t, sel.size) + '</span></span></button>';
      if (aprova && esperando.length) pe += '<button class="bt-aprovar" id="tfAprovarTudo" data-n="' + esperando.length + '"><span class="bt-txt"><span>Aprovar tudo (' + esperando.length + ')</span></span></button>';
    }
    pe += '<button class="mbtn" id="tfVerTempo">' + icon('clock') + 'Ver o tempo</button>';
    if (tfPodeConcluir()) pe += '<button class="mbtn" id="tfArquivar" data-tip="Tira a tarefa da faixa (o tempo dela continua no relatório)">' + icon('check') + 'Concluir tarefa</button>';   // v3.88: só ADMIN
    pe += '<span class="note" id="tfMsg"></span>';
    pe += '<button class="bin" id="tfExcluir" data-tip="Excluir a tarefa (o tempo dela continua no relatório)" aria-label="Excluir a tarefa">' + BIN_SVG + '</button>';
  }
  $('#tfFoot').innerHTML = pe;
  TF.firma = t ? tfFirma(t) : null;
  tfLigaFolha(t, novo, dona);
  tfPintaFolhaRelogio();
}
function tfTxtEnviar(t, n) { return 'Mandar pra aprovação' + (n ? ' (' + n + ')' : ''); }
/** Link de fora só se for http(s). */
function tfUrl(u) { return /^https?:\/\//i.test(String(u || '')) ? String(u) : ''; }

function tfLinha(s, t, dona, aprova) {
  const k = tfK(t), a = t.tipo === 'copy' ? tfAprov(s, k) : null, est = tfEstado(s, t);
  const tempo = tfTempoPost(s.id, t);
  let prog = '';
  if (t.tipo === 'matriz') {
    const p = mzProgresso(s.matrizSB || {}, mzContaDe(s));
    prog = '<span class="ti-prog" title="' + p.n + ' de ' + p.total + ' campos"><span class="ti-pbar"><i style="width:' + Math.round(100 * p.n / p.total) + '%"></i></span>' + p.n + '/' + p.total + '</span>';
  } else {
    const d = TF.det && TF.det.docs ? TF.det.docs[s.id] : null;
    prog = '<span class="ti-prog">' + (d ? (d.palavras ? d.palavras + ' palavras' : 'doc vazio') : (s.docId ? '…' : 'sem doc')) + '</span>';
  }
  // v3.88: só a copy se manda pra aprovação (a matriz não passa mais por aprovação)
  const podeMarcar = t.tipo === 'copy' && dona && (est.cod === 'pronto' || est.cod === 'alterar');
  const porque = est.cod === 'fazer' ? 'o documento ainda não tem texto' : est.cod === 'enviado' ? 'já está em aprovação' : est.cod === 'aprovado' ? 'já foi aprovada' : '';
  const chk = t.tipo === 'copy' && dona ? '<label class="ti-chk" title="' + esc(podeMarcar ? 'mandar este pra aprovação' : porque) + '"><input type="checkbox" data-sel="' + s.id + '"' + (tfSel().has(s.id) ? ' checked' : '') + (podeMarcar ? '' : ' disabled') + '></label>' : '';
  let acoes = '';
  if (aprova && a && a.st === 'enviado') {
    acoes = '<button class="bt-aprovar mini" data-aprova="' + s.id + '"><span class="bt-txt"><span>Aprovar</span></span></button>' +
      '<button class="bt-edit alterar" data-rot="Pedir alteração" style="--w:136px" data-alt="' + s.id + '" aria-label="Pedir alteração">' + icon('pencil') + '</button>';
  } else if (a && (a.st === 'aprovado' || a.st === 'alterar') && aprova) {
    acoes = '<button class="ti-desf" data-reabre="' + s.id + '" title="Voltar pra esperando aprovação">desfazer</button>';
  }
  // copy aprovada: o post segue pra produção (a task de arte ou vídeo no MKT Hub, ligada aqui)
  if (t.tipo === 'copy' && a && a.st === 'aprovado') {
    const url = linkDaTask(s);
    const cod = s.hub && s.hub.codigo ? s.hub.codigo : (/^MKT-\d+$/i.test(s.taskId || '') ? s.taskId : 'produção');
    const et = s.hub && s.hub.etapa ? '<i style="background:' + esc(s.hub.etapa.cor) + '"></i>' + esc(s.hub.etapa.nome) : '';
    // v3.90: com o Hub ligado, o ADMIN cria a task aqui (tela de produção); ligar uma que já existe continua
    const cria = !s.taskId && S.temFonte && souAdmin();
    acoes += s.taskId
      ? (url ? '<a class="ti-prod" href="' + esc(url) + '" target="_blank" rel="noopener" title="Task de produção no MKT Hub (arte ou vídeo)">' : '<span class="ti-prod" title="Task de produção (arte ou vídeo)">') + icon('hub') + esc(cod) + (et ? '<span class="ti-et">' + et + '</span>' : '') + (url ? '</a>' : '</span>')
        + '<button class="ti-desf" data-ligar="' + s.id + '" title="Trocar a task de produção">trocar</button>'
      : cria
        ? '<button class="mbtn primary ti-criaprod" data-tfprod="' + s.id + '" title="Criar a task de arte ou vídeo no MKT Hub com esta copy de briefing">' + icon('hub') + 'Criar no MKT Hub</button>'
          + '<button class="ti-desf" data-ligar="' + s.id + '" title="Escolher uma task de arte ou vídeo que já existe no MKT Hub">ligar uma que existe</button>'
        : '<button class="mbtn ti-ligar" data-ligar="' + s.id + '" title="Escolher a task de arte ou vídeo deste post no MKT Hub">' + icon('hub') + 'Ligar a task de produção</button>';
  }
  const aberto = TF.exp.has(s.id);
  const notas = [];
  if (a && a.st === 'alterar' && a.nota) notas.push('<div class="ti-nota alt">' + icon('pencil') + '<span><b>' + esc(a.ap || 'Pedido') + ':</b> ' + esc(a.nota) + '</span></div>');
  if (a && a.st === 'enviado' && a.pedido && aprova) notas.push('<div class="ti-nota">' + icon('undo') + '<span><b>Você tinha pedido:</b> ' + esc(a.pedido) + '</span></div>');
  if (a && a.st === 'aprovado' && a.ap) notas.push('<div class="ti-nota ok">' + icon('check') + '<span>Aprovada por <b>' + esc(a.ap) + '</b>' + (a.apEm ? ' em ' + fmtDataHora(Date.parse(a.apEm)) : '') + '</span></div>');
  const ligBox = TF.ligar === s.id ? tfLigarHtml(s) : '';
  const altBox = TF.alt === s.id ? '<div class="ti-altbox"><textarea id="tfAltTxt" rows="2" maxlength="500" placeholder="O que precisa mudar? (ela vê isso no card)"></textarea><div><button class="mbtn" data-altcancela="1">Cancelar</button><button class="mbtn primary" data-altmanda="' + s.id + '">Mandar pedido</button></div></div>' : '';
  return '<div class="ti st-' + est.cod + (aberto ? ' aberto' : '') + '" data-id="' + s.id + '">' +
    '<div class="ti-lin">' + chk +
      '<span class="ti-dia">' + tfDia(s.date) + '</span>' +
      '<button class="ti-tit" data-abre="' + s.id + '" title="Abrir ' + (t.tipo === 'matriz' ? 'o card da matriz' : 'o documento da copy') + '">' + esc(slotTitulo(s)) + '</button>' +
      (contasDaAba(t.aba).length > 1 ? '<span class="ti-conta">' + esc(contaCurta(s.conta)) + '</span>' : '') +
      prog +
      '<span class="ti-tempo" data-tempo="' + s.id + '">' + (tempo ? CRON.fmtLongo(tempo) : '') + '</span>' +
      '<span class="ti-st" style="--stc:' + est.cor + '"><i></i>' + est.rot + '</span>' +
      acoes +
      '<button class="ti-exp" data-exp="' + s.id + '" aria-label="' + (aberto ? 'Esconder o resumo' : 'Ver o resumo') + '" aria-expanded="' + aberto + '">' + icon('chevR') + '</button>' +
    '</div>' + notas.join('') + altBox + ligBox +
    (aberto ? '<div class="ti-res" data-res="' + s.id + '">' + tfResumo(s, t) + '</div>' : '') +
  '</div>';
}
// ---------------- copy aprovada: ligar a task de produção (arte ou vídeo) do MKT Hub (v3.81) ----------------
/** Sem o Hub ligado: abre o post com o campo da task em foco (colar link ou código). Com o Hub: lista as tasks daquele dia. */
function tfAbreLigar(sid, t) {
  if (!S.temFonte) { tfColarLink(sid, t); return; }
  TF.ligar = TF.ligar === sid ? null : sid; TF.ligarQ = ''; TF.ligarLista = null;
  tfDesenha();
  if (TF.ligar) { tfBuscaCandidatas(); setTimeout(() => { const x = $('#tfLigBusca'); if (x) x.focus(); }, 30); }
}
function tfColarLink(sid, t) {
  TF.voltar = t.id; TF.ligar = null;
  closeOv('ovTarefa'); openEdit(sid);
  setTimeout(() => { const x = $('#eTask'); if (x) { x.focus(); x.select(); } }, 180);
}
async function tfBuscaCandidatas() {
  const sid = TF.ligar; if (!sid) return;
  const n = TF.ligarN = (TF.ligarN || 0) + 1;
  try {
    const r = await api('/api/hub/candidatas?slot=' + encodeURIComponent(sid) + (TF.ligarQ ? '&q=' + encodeURIComponent(TF.ligarQ) : ''));
    if (n !== TF.ligarN || TF.ligar !== sid) return;
    TF.ligarLista = r;
  } catch (e) { TF.ligarLista = { erro: e.message, tarefas: [] }; }
  const box = document.querySelector('.ti-ligbox .ti-liglista');
  if (box) box.innerHTML = tfLigarLista();
  tfLigaItens();
}
function tfLigarHtml(s) {
  return '<div class="ti-ligbox"><div class="ti-ligtop">' + icon('hub') +
    '<input id="tfLigBusca" placeholder="procurar no MKT Hub: título ou MKT-0000" value="' + esc(TF.ligarQ || '') + '" autocomplete="off">' +
    '<button class="mbtn" data-ligcola="' + s.id + '">Colar link</button><button class="mbtn" data-ligfecha="1">Cancelar</button></div>' +
    '<div class="ti-liglista">' + tfLigarLista() + '</div></div>';
}
function tfLigarLista() {
  const r = TF.ligarLista;
  if (!r) return '<div class="ti-ligvazio">procurando as tasks do dia no Hub…</div>';
  if (r.erro && !(r.tarefas || []).length) return '<div class="ti-ligvazio">Não consegui ler o Hub: ' + esc(r.erro) + '. Use Colar link.</div>';
  if (!r.tarefas.length) return '<div class="ti-ligvazio">' + (TF.ligarQ ? 'Nada com "' + esc(TF.ligarQ) + '".' : 'Nenhuma task dessa empresa com prazo perto deste dia.') + ' Procure pelo nome ou use Colar link.</div>';
  return r.tarefas.map(x => '<button class="ti-ligit" data-ligtask="' + esc(x.id) + '" data-ligurl="' + esc(x.url || '') + '" data-ligcod="' + esc(x.codigo) + '">' +
    '<span class="ti-ligcod">' + esc(x.codigo) + '</span><span class="ti-ligtit">' + esc(x.titulo) + '</span>' +
    (x.etapa ? '<span class="ti-et"><i style="background:' + esc(x.etapa.cor) + '"></i>' + esc(x.etapa.nome) + '</span>' : '') +
    '<span class="ti-ligpz">' + (x.prazo ? 'prazo ' + brData(x.prazo) : 'sem prazo') + '</span>' +
    (x.ligada ? '<span class="ti-ligja">já ligada em outro post</span>' : '') + '</button>').join('');
}
function tfLigaItens() {
  document.querySelectorAll('.ti-ligit').forEach(b => b.onclick = () => tfLigaTask(TF.ligar, b.dataset.ligurl || b.dataset.ligtask, b.dataset.ligcod));
}
function tfLigaLigar(t) {
  const busca = $('#tfLigBusca');
  if (busca) {
    let tm = null;
    busca.addEventListener('input', () => { TF.ligarQ = busca.value.trim(); clearTimeout(tm); tm = setTimeout(tfBuscaCandidatas, 250); });
    busca.addEventListener('keydown', ev => { if (ev.key === 'Escape') { ev.stopPropagation(); TF.ligar = null; tfDesenha(); } if (ev.key === 'Enter') { ev.preventDefault(); const p = document.querySelector('.ti-ligit'); if (p) p.click(); } });
  }
  document.querySelectorAll('[data-ligcola]').forEach(b => b.onclick = () => tfColarLink(b.dataset.ligcola, t));
  document.querySelectorAll('[data-ligfecha]').forEach(b => b.onclick = () => { TF.ligar = null; tfDesenha(); });
  tfLigaItens();
}
async function tfLigaTask(sid, ref, cod) {
  if (!sid || !ref) return;
  try {
    const r = await api('/api/slots/' + sid, { method: 'PATCH', body: JSON.stringify({ taskUrl: ref }) });
    TF.ligar = null;
    await loadState();
    tfDesenha();
    if (r && r.aviso) toast(r.aviso, true, 9000); else toast('Task de produção ligada: ' + cod + ' · Ctrl+Z desfaz');
  } catch (e) { toast(e.message, true); }
}

/** Resumo pra revisar sem abrir: matriz (os campos) ou copy (o texto, carregado na hora). */
function tfResumo(s, t) {
  if (t.tipo === 'matriz') {
    const m = s.matrizSB || {};
    const campos = [['Formato', m.formato], ['Ângulo', m.angulo], ['Pauta quente', m.pautaQuente], ['Tema', m.tema], ['Tese', m.tese], ['Gancho', m.gancho], ['Descrição', m.descricao]];
    return '<dl class="ti-kv">' + campos.map(([r, v]) => '<dt>' + r + '</dt><dd' + (v ? '' : ' class="vazio"') + '>' + (v ? esc(v) : 'não preenchido') + '</dd>').join('') + '</dl>';
  }
  const d = TF.det && TF.det.docs ? TF.det.docs[s.id] : null;
  if (!d) return '<p class="note">Este post ainda não tem documento de copy.</p>';
  setTimeout(() => tfCarregaTexto(s.id, d.id), 0);
  return '<div class="ti-copy" data-copy="' + s.id + '">carregando o texto…</div>';
}
async function tfCarregaTexto(sid, docId) {
  const el = document.querySelector('[data-copy="' + sid + '"]'); if (!el) return;
  try {
    const r = await api('/api/docs/' + docId);
    const txt = htmlParaTexto(r.doc.html);                // v3.89: com as quebras de linha
    const alvo = document.querySelector('[data-copy="' + sid + '"]'); if (!alvo) return;
    alvo.textContent = txt ? (txt.length > 1400 ? txt.slice(0, 1400) + '…' : txt) : 'Documento vazio.';
  } catch (e) { el.textContent = 'Não consegui carregar o texto: ' + e.message; }
}
function tfLigaFolha(t, novo, dona) {
  const head = $('#tfHead'), body = $('#tfBody'), foot = $('#tfFoot');
  head.querySelectorAll('.tf-irmas [data-id]').forEach(b => b.onclick = () => abrirTarefa(b.dataset.id));
  const bn = head.querySelector('[data-novo]');
  if (bn) bn.onclick = () => novaTarefa(novo ? novo.tipo : t.tipo, novo ? novo.aba : t.aba);
  // período e quem faz: na tarefa nova só guarda; na que existe, salva sozinho
  const mudaPer = (de, ate) => {
    if (novo) { novo.de = de; novo.ate = ate; tfDesenha(); return; }
    tfSalvaCfg({ de, ate });
  };
  body.querySelectorAll('[data-sem]').forEach(b => b.onclick = () => mudaPer(b.dataset.sem, tfSoma(b.dataset.sem, 6)));
  const iDe = $('#tfDe'), iAte = $('#tfAte'), iPor = $('#tfPor');
  const muda = () => { if (iDe.value && iAte.value) mudaPer(iDe.value, iAte.value); };
  iDe.onchange = muda; iAte.onchange = muda;
  iPor.onchange = () => { if (novo) novo.por = iPor.value.trim(); else tfSalvaCfg({ por: iPor.value.trim() }); };
  if (novo) {
    $('#tfCriar').onclick = tfCriar;
    return;
  }
  const play = $('#tfPlay');
  play.onclick = () => tfPlay(t.id);
  $('#tfParar').onclick = tfParar;
  body.querySelectorAll('[data-sel]').forEach(c => c.onchange = () => {
    if (TF.sel === null) TF.sel = new Set(tfSel());
    if (c.checked) TF.sel.add(c.dataset.sel); else TF.sel.delete(c.dataset.sel);
    const b = $('#tfEnviar');
    if (b) { b.disabled = !TF.sel.size; b.querySelector('.bt-txt span').textContent = tfTxtEnviar(t, TF.sel.size); }
  });
  body.querySelectorAll('[data-abre]').forEach(b => b.onclick = () => tfAbrePost(b.dataset.abre, t));
  body.querySelectorAll('[data-exp]').forEach(b => b.onclick = () => { const id = b.dataset.exp; if (TF.exp.has(id)) TF.exp.delete(id); else TF.exp.add(id); tfDesenha(); });
  body.querySelectorAll('[data-aprova]').forEach(b => b.onclick = () => tfAprovar(t, [b.dataset.aprova], b));
  body.querySelectorAll('[data-alt]').forEach(b => b.onclick = () => { TF.alt = b.dataset.alt; tfDesenha(); setTimeout(() => { const x = $('#tfAltTxt'); if (x) x.focus(); }, 30); });
  body.querySelectorAll('[data-altcancela]').forEach(b => b.onclick = () => { TF.alt = null; tfDesenha(); });
  body.querySelectorAll('[data-altmanda]').forEach(b => b.onclick = () => tfPedeAlteracao(t, b.dataset.altmanda));
  const altTxt = $('#tfAltTxt');
  if (altTxt) altTxt.addEventListener('keydown', ev => { if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); tfPedeAlteracao(t, TF.alt); } });
  body.querySelectorAll('[data-reabre]').forEach(b => b.onclick = () => tfReabrir(t, b.dataset.reabre));
  body.querySelectorAll('[data-ligar]').forEach(b => b.onclick = () => tfAbreLigar(b.dataset.ligar, t));
  // v3.90: criar a task de produção (fechou a tela, volta pra tarefa)
  body.querySelectorAll('[data-tfprod]').forEach(b => b.onclick = () => { TF.voltar = t.id; TF.ligar = null; closeOv('ovTarefa'); abrirProducao(b.dataset.tfprod); });
  tfLigaLigar(t);
  const env = $('#tfEnviar'); if (env) env.onclick = () => tfEnviar(t);
  const tudo = $('#tfAprovarTudo'); if (tudo) tudo.onclick = () => tfAprovar(t, tfSlots(t).filter(s => (tfAprov(s, tfK(t)) || {}).st === 'enviado').map(s => s.id), tudo);
  $('#tfVerTempo').onclick = () => { closeOv('ovTarefa'); abrirTempo({ tarefa: t }); };
  const arq = $('#tfArquivar'); if (arq) arq.onclick = () => tfArquivar(t);   // v3.88: só aparece pro ADMIN
  $('#tfExcluir').onclick = () => tfExcluir(t);
}
function tfMsg(txt, erro) { const m = $('#tfCfgMsg'); if (m) { m.textContent = txt || ''; m.classList.toggle('erro', !!erro); } }
async function tfSalvaCfg(mud) {
  const t = tfPorId(TF.aberta); if (!t) return;
  try {
    const r = await api('/api/tarefas/' + t.id, { method: 'PATCH', body: JSON.stringify(mud) });
    // v3.95 (o Zion mudou o período e os cards não apareciam): com card novo, recarrega o estado ANTES de desenhar
    // (a lista da tarefa e o calendário só mostram o card que já está no S.slots)
    if (r.cards) await loadState(false, true);
    const i = S.tarefas.findIndex(x => x.id === t.id); if (i >= 0) S.tarefas[i] = r.tarefa;
    TF.sel = null; tfDesenha(); tfCarregaDetalhe(); renderFaixa();
    tfMsg('salvo');
    if (r.cards) toast(r.cards + ' card' + (r.cards > 1 ? 's' : '') + ' novo' + (r.cards > 1 ? 's' : '') + ' da matriz no calendário');
  } catch (e) { tfDesenha(); tfMsg(e.message, true); }
}
async function tfCriar() {
  const n = TF.novo; if (!n) return;
  n.por = ($('#tfPor').value || '').trim() || tfEu();
  if (!n.por) { tfMsg('Diga quem faz a tarefa', true); $('#tfPor').focus(); return; }
  try {
    const r = await api('/api/tarefas', { method: 'POST', body: JSON.stringify(n) });
    S.tarefas = (S.tarefas || []).concat(r.tarefa);
    TF.novo = null;
    toast(n.tipo === 'matriz' ? 'Tarefa de matriz criada · ' + (r.cards ? r.cards + ' card' + (r.cards > 1 ? 's' : '') + ' amarelo' + (r.cards > 1 ? 's' : '') + ' no calendário' : 'nenhum card novo (os dias já tinham post)')
      : 'Tarefa de copy criada · ' + r.tarefa.itens.length + ' posts');
    if (n.tipo === 'matriz' && r.cards) await loadState();          // os cards novos aparecem no calendário
    renderFaixa();
    abrirTarefa(r.tarefa.id);
  } catch (e) { tfMsg(e.message, true); }
}
/** Abre o card da matriz ou o doc do post. Fechou, volta pra tarefa. */
function tfAbrePost(sid, t) {
  TF.voltar = t.id;
  closeOv('ovTarefa');
  if (t.tipo === 'matriz') openMatriz(sid);
  else abrirCopy(sid);
}
async function tfEnviar(t) {
  if (!tfSel().size) return;
  if (!tfEu()) { toast('Antes, põe o seu nome no perfil', true); openPerfil(); return; }
  const n = tfSel().size, nome = t.tipo === 'matriz' ? 'matriz' : 'copy';
  try {
    await api('/api/tarefas/' + t.id + '/enviar', { method: 'POST', body: JSON.stringify({ slots: [...tfSel()], quem: tfEu() }) });
    TF.sel = new Set();
    await loadState();
    tfDesenha(); tfCarregaDetalhe();
    toast(n + ' ' + (n > 1 ? (nome === 'matriz' ? 'matrizes' : 'copys') : nome) + ' pra aprovação · Ctrl+Z desfaz');
  } catch (e) { toast(e.message, true); }
}
async function tfAprovar(t, ids, btn) {
  if (!ids.length) return;
  if (!tfEu()) { toast('Antes, põe o seu nome no perfil', true); openPerfil(); return; }
  if (btn) btn.disabled = true;
  try {
    const r = await api('/api/tarefas/' + t.id + '/aprovar', { method: 'POST', body: JSON.stringify({ slots: ids, quem: tfEu() }) });
    await loadState();
    const nome = t.tipo === 'matriz' ? 'matriz' : 'copy';
    toast((r.aprovados > 1 ? r.aprovados + ' aprovadas' : 'Aprovada') + (t.tipo === 'matriz' ? ' · a copy já está liberada' : '') + (r.concluida ? ' · tarefa de ' + nome + ' concluída' : '') + ' · Ctrl+Z desfaz');
    tfDesenha();
  } catch (e) { toast(e.message, true); if (btn) btn.disabled = false; }
}
async function tfPedeAlteracao(t, sid) {
  const nota = ($('#tfAltTxt') ? $('#tfAltTxt').value : '').trim();
  if (!nota) { toast('Escreva o que precisa mudar', true); return; }
  if (!tfEu()) { toast('Antes, põe o seu nome no perfil', true); openPerfil(); return; }
  try {
    await api('/api/tarefas/' + t.id + '/alterar', { method: 'POST', body: JSON.stringify({ slotId: sid, nota, quem: tfEu() }) });
    TF.alt = null;
    await loadState();
    tfDesenha();
    toast('Pedido de alteração mandado · Ctrl+Z desfaz');
  } catch (e) { toast(e.message, true); }
}
async function tfReabrir(t, sid) {
  try { await api('/api/tarefas/' + t.id + '/reabrir', { method: 'POST', body: JSON.stringify({ slotId: sid, quem: tfEu() || 'alguém' }) }); await loadState(); tfDesenha(); toast('Voltou pra esperando aprovação'); }
  catch (e) { toast(e.message, true); }
}
async function tfArquivar(t) {
  const c = tfConta(t), faltam = c.total - c.aprovado;
  if (faltam && !confirm('Concluir a tarefa com ' + faltam + (t.tipo === 'matriz' ? ' card' + (faltam > 1 ? 's' : '') + ' ainda sem preencher?' : ' post' + (faltam > 1 ? 's' : '') + ' ainda sem aprovação?') + '\n\n(Ela sai da faixa. O tempo continua no relatório.)')) return;
  const e = CRON.estado();
  if (e && e.tarefaId === t.id) await tfParar();
  try { await api('/api/tarefas/' + t.id + '/arquivar', { method: 'POST', body: '{}' }); closeOv('ovTarefa'); await loadState(); toast('Tarefa concluída'); }
  catch (err) { toast(err.message, true); }
}
async function tfExcluir(t) {
  if (!confirm('Excluir a tarefa de ' + TF_TIPOS[t.tipo].nome.toLowerCase() + ' de ' + brData(t.de) + ' a ' + brData(t.ate) + '?\n\n(' + (t.tipo === 'matriz' ? 'Os cards amarelos que ela criou e continuam vazios saem junto; os preenchidos ficam. ' : 'As aprovações ficam nos posts. ') + 'O tempo continua no relatório.)')) return;
  const e = CRON.estado();
  if (e && e.tarefaId === t.id) await tfParar();
  try { const r = await api('/api/tarefas/' + t.id, { method: 'DELETE' }); closeOv('ovTarefa'); await loadState(); toast('Tarefa excluída' + (r && r.cardsRemovidos ? ' · ' + r.cardsRemovidos + ' card' + (r.cardsRemovidos > 1 ? 's' : '') + ' vazio' + (r.cardsRemovidos > 1 ? 's' : '') + ' saíram junto' : '')); }
  catch (err) { toast(err.message, true); }
}
/** Relógio grande da folha e o tempo de cada post (sem redesenhar a folha inteira). */
function tfPintaFolhaRelogio(e) {
  const ov = document.getElementById('ovTarefa');
  if (!ov || !ov.classList.contains('open') || !TF.aberta) return;
  e = e === undefined ? CRON.estado() : e;
  const t = tfPorId(TF.aberta); if (!t) return;
  const st = tfStBotao(t.id), play = $('#tfPlay'); if (!play) return;
  CRON.pintaBotao(play, st, st === 'outro' ? 'Trocar o relógio pra esta tarefa' : null);
  play.style.setProperty('--rl-cor', t.tipo === 'copy' ? 'var(--blue)' : 'var(--mz)');
  play.style.setProperty('--rl-on', t.tipo === 'copy' ? '#fff' : '#000');
  const meu = st === 'rodando' || st === 'pausado';
  CRON.pintaDigitos($('#tfNf'), meu ? CRON.decorrido(e) : 0, meu);
  const sub = st === 'rodando' ? (e.focoTit ? 'contando em: ' + e.focoTit : 'contando · abra um post pra ele contar no post')
    : st === 'pausado' ? (e.ocioso ? 'pausado: ficou parado (responda na cápsula lá embaixo)' : 'pausado') : st === 'outro' ? 'o relógio está em outra tarefa: ' + (e.titulo || '') : 'parado · dê play quando começar';
  const rs = $('#tfRelSub'); if (rs.textContent !== sub) rs.textContent = sub;
  $('#tfTot').textContent = CRON.fmtLongo(tfTempoTarefa(t));
  $('#tfParar').hidden = !meu;
  document.querySelectorAll('#tfItens [data-tempo]').forEach(x => { const s = tfTempoPost(x.dataset.tempo, t); const v = s ? CRON.fmtLongo(s) : ''; if (x.textContent !== v) x.textContent = v; });
}

// ---------------- card da matriz: botão do relógio (v3.88: a matriz não tem aprovação) ----------------
function tfNaMatriz() {
  const box = $('#mzAprov'); if (box) box.hidden = true;
  tfPintaMzRel();
}
function tfPintaMzRel(e) {
  const b = document.getElementById('mzRel'); if (!b || !$('#ovMz').classList.contains('open')) return;
  e = e === undefined ? CRON.estado() : e;
  const s = S.slots.find(x => x.id === MZ_ATUAL);
  const t = s && (S.tarefas || []).find(x => x.tipo === 'matriz' && x.itens.includes(s.id));
  const st = !e ? 'parado' : (t && e.tarefaId === t.id ? (e.rodando ? 'rodando' : 'pausado') : 'outro');
  CRON.pintaBotao(b, st, st === 'rodando' ? 'Pausar o relógio da matriz' : st === 'pausado' ? 'Continuar o relógio da matriz' : st === 'outro' ? 'Trocar o relógio pra matriz deste post' : 'Começar o relógio da matriz (' + (t ? 'tarefa ' + brData(t.de) + ' a ' + brData(t.ate) : 'cria a tarefa da semana') + ')');
  b.style.setProperty('--rl-cor', 'var(--mz)'); b.style.setProperty('--rl-on', '#000');
  const nf = document.getElementById('mzRelNf');
  if (nf) { const meu = st === 'rodando' || st === 'pausado'; nf.hidden = !meu; if (meu) CRON.pintaDigitos(nf, CRON.decorrido(e)); }
}

// ---------------- selo no card do calendário ----------------
/** Bolinha + C no card, na cor do estado da aprovação da copy. A palavra vai na dica. (v3.88: a matriz não tem mais aprovação.) */
function tfChipsCard(s) {
  const a = s.aprov && s.aprov.c; if (!a) return '';
  const rot = { enviado: 'em aprovação', aprovado: 'aprovada', alterar: 'pra alterar' };
  return '<span class="apv st-' + a.st + '" title="Copy ' + rot[a.st] + (a.st === 'alterar' && a.nota ? ': ' + esc(a.nota) : '') + '"><i></i>C</span>';
}

// ---------------- avisos: pra aprovar (quem aprova) e pra alterar (quem fez) ----------------
function tfChecaAvisos(slots) {
  const agora = {};
  for (const s of slots) { const a = s.aprov && s.aprov.c; if (a) agora[s.id + ':c'] = a.st + '|' + (a.apEm || a.em || ''); }   // v3.88: só a copy tem aprovação
  // primeira carga: só memoriza, senão avisaria de tudo que já estava lá
  if (TF.conhecidos === null) { TF.conhecidos = agora; return; }
  const eu = tfChave(tfEu()), novos = [], aprovados = new Map();
  for (const [ch, v] of Object.entries(agora)) {
    if (TF.conhecidos[ch] === v) continue;
    const [id, k] = ch.split(':');
    const s = slots.find(x => x.id === id); if (!s) continue;
    const a = s.aprov[k], nome = k === 'm' ? 'Matriz' : 'Copy', minha = !!eu && tfChave(a.por) === eu;
    const base = { id, k, conta: nomeConta(s.conta), titulo: nome + ' · ' + slotTitulo(s), data: s.date };
    if (a.st === 'enviado' && !minha && (!S.eu || S.eu.papel === 'admin')) novos.push(Object.assign({ tipo: 'aprovar', por: a.por }, base));
    else if (a.st === 'alterar' && minha) novos.push(Object.assign({ tipo: 'alterar', motivo: a.nota, por: a.ap }, base));
    else if (a.st === 'aprovado' && minha) { const g = (a.ap || 'Alguém') + '|' + k; aprovados.set(g, (aprovados.get(g) || []).concat(s)); }
  }
  // aprovação junta num aviso só por quem aprovou (o "Aprovar tudo" aprova vários de uma vez)
  for (const [g, l] of aprovados) {
    const [ap, k] = g.split('|'), nome = k === 'm' ? 'matriz' : 'copy';
    toast(ap + ' aprovou ' + (l.length > 1 ? l.length + ' ' + (k === 'm' ? 'matrizes' : 'copys') : 'a ' + nome + ' de ' + brData(l[0].date)) + (k === 'm' ? ' · pode fazer a copy' : ''));
  }
  TF.conhecidos = agora;
  if (!novos.length || !ALERTA.ligado()) return;
  const chaves = new Set(novos.map(x => x.id + ':' + x.k));
  pendentesAprovar = pendentesAprovar.filter(x => !chaves.has(x.id + ':' + x.k)).concat(novos).slice(-20);
  if (ALERTA.mudo()) { renderAlerta(); return; }
  renderAlerta(); bipe(); notificaSistema(novos);
}
/** Clique no aviso: abre a tarefa daquele post, já com ele aberto. */
function tfAbrirDoAviso(x) {
  pendentesAprovar = pendentesAprovar.filter(y => !(y.id === x.id && y.k === x.k));
  renderAlerta();
  const s = S.slots.find(y => y.id === x.id); if (!s) return;
  const aba = S.contas[s.conta] && S.contas[s.conta].aba;
  const t = (S.tarefas || []).find(y => y.tipo === (x.k === 'm' ? 'matriz' : 'copy') && y.itens.includes(s.id));
  if (aba && aba !== S.aba) irParaAba(aba);
  if (t) abrirTarefa(t.id, s.id);
  else if (x.k === 'm') openMatriz(s.id); else abrirCopy(s.id);
}

// ---------------- liga tudo (chamado no init do painel) ----------------
function tfInit() {
  $('#crAlt').onclick = () => CRON.alternar();
  $('#crStop').innerHTML = TF_ICON_STOP;
  $('#crStop').onclick = tfParar;
  $('#crInfo').onclick = () => { const e = CRON.estado(); if (e && $('#ovDoc').hidden && tfPorId(e.tarefaId)) abrirTarefa(e.tarefaId); };
  $('#crOcSim').onclick = () => CRON.responderOcioso(true);
  $('#crOcNao').onclick = () => CRON.responderOcioso(false);
  const mzRel = $('#mzRel');
  if (mzRel) { CRON.pintaBotao(mzRel, 'parado'); mzRel.onclick = () => { if (MZ_ATUAL) tfRelogioDoPost(MZ_ATUAL, 'matriz'); }; }
  CRON.on(e => tfPintaRelogios(e));
  CRON.tique(e => tfPintaRelogios(e));
  CRON.onSalvo(j => {
    if (j && j.sessao && j.sessao.tarefaId && j.tarefaSeg != null) { const t = tfPorId(j.sessao.tarefaId); if (t) t.seg = j.tarefaSeg; }
    if (document.getElementById('ovTarefa').classList.contains('open')) tfCarregaDetalhe();
    renderFaixa();
  });
  // o card da matriz e o doc abrindo e fechando dizem pro relógio em qual post ela está
  new MutationObserver(() => {
    tfSincFoco();
    if (!$('#ovMz').classList.contains('open') && TF.voltar && !document.querySelector('.ov.open')) { const id = TF.voltar; TF.voltar = null; setTimeout(() => abrirTarefa(id), 80); }
  }).observe($('#ovMz'), { attributes: true, attributeFilter: ['class'] });
  // editar o post (ligar a task de produção) também volta pra tarefa quando fecha
  new MutationObserver(() => {
    if (!$('#ovEdit').classList.contains('open') && TF.voltar && !document.querySelector('.ov.open')) { const id = TF.voltar; TF.voltar = null; setTimeout(() => abrirTarefa(id), 120); }
  }).observe($('#ovEdit'), { attributes: true, attributeFilter: ['class'] });
  // v3.90: a tela da task de produção também volta pra tarefa quando fecha
  new MutationObserver(() => {
    if (!$('#ovProd').classList.contains('open') && TF.voltar && !document.querySelector('.ov.open')) { const id = TF.voltar; TF.voltar = null; setTimeout(() => abrirTarefa(id), 120); }
  }).observe($('#ovProd'), { attributes: true, attributeFilter: ['class'] });
  new MutationObserver(() => {
    tfSincFoco(); tfPintaPill();
    if ($('#ovDoc').hidden && TF.voltar) { const id = TF.voltar; TF.voltar = null; setTimeout(() => abrirTarefa(id), 120); }
  }).observe($('#ovDoc'), { attributes: true, attributeFilter: ['hidden'] });
  // o doc pede pra ligar o relógio da copy do post dele (ele não tem as tarefas na mão)
  window.addEventListener('message', ev => {
    if (ev.origin !== location.origin || !ev.data || ev.data.bone !== 'doc') return;
    if (ev.data.tipo === 'relogio' && ev.data.slotId) tfRelogioDoPost(ev.data.slotId, 'copy');
  });
  tfPintaRelogios();
}
