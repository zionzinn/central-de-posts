// =====================================================================
// v4.14 · CAPTAÇÃO NO CALENDÁRIO (pedido do Zion em 09/11/2026)
// "Preciso mudar completamente a aba de captação. ela deve ser mais ou menos igual a aba principal, mas é onde eu
// coloco apenas as tasks de captação. (posso linkar com o dia que vai sair o post / taks de edição. posso linkar com
// mais de uma tarefa. posso dizer quantos roteiros foram gravados (as vezes uma task tem 5 roteiros) e, se por ventura
// no dia nao for possivel gravar todos, eu tambem consigo adicionar outro dia para finalizar a captação. sinalizando
// quais foram gravados e quais nao foram." Escolhas dele: "Colo o link do MKT Hub" (a task de captação nasce no Hub e
// aqui ganha o dia) e "Roteiros soltos na captação" (nome curto, gravado ou não; os posts ligados são à parte).
//
// Uma CAPTAÇÃO é: a task do MKT Hub (o link colado; título, etapa, quem capta, prazo e empresa vêm de lá e ficam só na
// memória), os dias de gravação (o primeiro e os que entram "pra finalizar"), os roteiros (gravado = o dia em que foi
// gravado) e os posts ligados (o dia que sai e a task de edição de cada um vêm do próprio post).
// Saem o quadro de blocos (v4.03) e a criação da task de Captação pelo B.O.N.E (v4.04): a task nasce no Hub.
// Dados (regra 11): db.captacoes = { id: { id, taskId, taskUrl, titulo, aba?, doc?, de?, dias: [{ d, h }], roteiros: [{ id, n, g, t? }],
// posts: [ids], nota, em, por } }, ~150 bytes + ~40 por roteiro, opcional. v4.20: de = a captação de onde esta saiu (o que
// faltou gravar virou uma captação nova, com a mesma task do MKT Hub). v4.21: tipo = 'evento' (o evento da semana: nasce pelo nome,
// sem task do Hub), local (onde é) e resp = { id, nome } (o responsável que o Zion escolhe, das pessoas do MKT Hub). v4.23: st =
// 'concluido' ou 'desmarcado' (só no evento; sem ele, agendado) e stEm (quando mudou). v4.24 (só no evento): tipoCap (o tipo de
// captação), apoio = [{ id, nome }] (até 6, além do resp) e ent = { drive?, galeria?, stories? } (a entrega). O quadro antigo (db.capBlocos e
// slot.capBloco) sai uma vez só, com backup antes, sem converter nada (escolha do Zion: "Começar do zero").
// v4.25 (só no evento): o fluxograma vira regra (lib/fluxos.js). fluxoTipo = liga|cec|exp|wsc|wsw|ime|nenhum (sem ele, o
// sistema deduz pelo título), escala = [{ id, nome, papel, h }] (quem vai além do resp, com papel e horário; o apoio da v4.24
// migrou pra cá com papel 'apoio'), dias[].hf (a hora de fim), ent.tasks = [links] (as tasks de depoimento) e
// fluxo = { dias: { 'AAAA-MM-DD': { rotas: { decId: i }, etapas: { etapaId: [ { por, em } | null ] } } }, hist: [...] }.
// v4.26 (só no evento): conf = { 'AAAA-MM-DD': { chave (1º nome sem acento): { nome, st: 'ok'|'nao', motivo?, h, em, por, origem } } }
// (a confirmação de cada pessoa da escala; vale pro horário em que foi dada: mudou a hora, volta a pendente) e
// db.escalaSemanas = { 'AAAA-MM-DD' (a segunda): { por, em } } (a escala da semana fechada).
// v4.29 (rotas do Ultron, com X-Ultron-Token): ext (a chave do evento no SSB, pra achar o card de novo), origem 'ultron',
// escalaSug = { escala, em, por } (a escala sugerida, que o Zion aplica na folha) e vespera = { depoentes, reserva, cassioOk,
// arrobasOk, figurinhaOk, salaOk, roteiroOk, obs, por: { campo: quem } } (o Ultron só preenche campo vazio ou que ele mesmo preencheu).
// v4.31: vespera.backdropOk (Imersão); a véspera marca sozinha os checks da etapa "Combinar véspera" (por "véspera") e a
// auditoria do dia seguinte (o que falta de entrega e de etapa) sai no publico completo.
// =====================================================================
'use strict';
const crypto = require('crypto');
const { pecaDoPost } = require('./peca.js');
const FX = require('./fluxos.js');   // v4.25: o fluxograma é a regra

const MAX_DIAS = 10, MAX_ROT = 40, MAX_POSTS = 40, MAX_TEXTO = 8000;   // v4.16: o roteiro completo, até ~8 mil letras
const ST_EVENTO = ['concluido', 'desmarcado'];
const MAX_APOIO = 6, MAX_ESCALA = 8, MAX_TASKS = 20, MAX_HIST = 300;   // v4.24: até 6 pessoas de apoio por evento   // v4.23: a situação do evento (sem ela, agendado)

module.exports = function criarCaptacao(ctx) {
  const { db, saveDb, readBody, json, soAdmin, hub, pushUndo, backupAgora } = ctx;
  if (!db.captacoes || typeof db.captacoes !== 'object' || Array.isArray(db.captacoes)) db.captacoes = {};
  const caps = () => db.captacoes;
  if (!db.escalaSemanas || typeof db.escalaSemanas !== 'object' || Array.isArray(db.escalaSemanas)) db.escalaSemanas = {};   // v4.26
  // a versão das captações: sobe a cada mudança. O navegador ignora um /api/state que saiu antes da última mudança dele
  // (senão um estado velho chegando atrasado desmarcaria o "gravado" que acabou de marcar). Começa na hora em que o
  // servidor ligou, então nunca volta pra trás depois de um reinício.
  let rev = Date.now();
  const muda = () => ++rev;
  const hojeBRT = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
  const dataOk = d => /^\d{4}-\d{2}-\d{2}$/.test(String(d || '')) && !isNaN(Date.parse(d + 'T12:00:00Z'));
  const soma = (iso, n) => new Date(Date.parse(iso + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
  const horaOk = h => h === '' || /^([01]\d|2[0-3]):[0-5]\d$/.test(h);
  const linha = (t, max) => String(t || '').replace(/\s+/g, ' ').trim().slice(0, max);
  const urlOk = u => /^https?:\/\//i.test(String(u || '').trim()) ? String(u).trim().slice(0, 500) : '';
  const copia = c => JSON.parse(JSON.stringify(c));
  /** v4.16: o roteiro completo (as quebras de linha ficam; espaço sobrando no fim da linha sai). */
  const texto = t => String(t || '').replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/\n{4,}/g, '\n\n\n').trim().slice(0, MAX_TEXTO);
  const norm = x => String(x || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const slotPor = () => new Map(db.slots.map(s => [s.id, s]));

  // ---------------- v4.14: o quadro antigo sai (uma vez só) ----------------
  // Escolha do Zion (09/11/2026): "Começar do zero". Nada é convertido: os blocos (db.capBlocos) e a marca nos posts
  // (slot.capBloco) saem do data.json depois do backup. Ficam no backup e no histórico do repositório de dados.
  (function tiraQuadroAntigo() {
    if (!db.migracoes || typeof db.migracoes !== 'object') db.migracoes = {};
    if (db.migracoes.v414) return;
    const blocos = db.capBlocos && typeof db.capBlocos === 'object' ? Object.keys(db.capBlocos).length : 0;
    const comBloco = db.slots.filter(s => s.capBloco);
    if (blocos || comBloco.length) {
      if (typeof backupAgora === 'function') backupAgora('antes da v4.14 (o quadro de blocos de captação sai)');
      for (const s of comBloco) delete s.capBloco;
      console.log('[v4.14] o quadro antigo de captação saiu: ' + blocos + ' bloco(s) e ' + comBloco.length + ' post(s) marcados (estão no backup)');
    }
    delete db.capBlocos;
    db.migracoes.v414 = { em: new Date().toISOString(), blocos, posts: comBloco.length };
    saveDb();
  })();

  // ---------------- v4.25: o apoio vira escala (uma vez só, com backup antes) ----------------
  (function apoioViraEscala() {
    if (db.migracoes.v425) return;
    const com = Object.values(caps()).filter(c => Array.isArray(c.apoio));
    if (com.length && typeof backupAgora === 'function') backupAgora('antes da v4.25 (o apoio do evento vira escala)');
    for (const c of com) {
      const l = c.apoio.filter(p => p && p.nome).map(p => ({ id: p.id || '', nome: p.nome, papel: 'apoio', h: '' }));
      if (l.length) c.escala = (c.escala || []).concat(l);
      delete c.apoio;
    }
    db.migracoes.v425 = { em: new Date().toISOString(), eventos: com.length };
    if (com.length) console.log('[v4.25] apoio virou escala em ' + com.length + ' evento(s) (estão no backup)');
    saveDb();
  })();

  // ---------------- v4.25: o fluxo do evento ----------------
  /** O tipo de fluxo que vale: o escolhido ou o deduzido do título. null = sem fluxo. */
  function tipoFluxo(c, aba) {
    if (c.tipo !== 'evento') return null;
    if (c.fluxoTipo === 'nenhum') return null;
    if (c.fluxoTipo && FX.TIPOS[c.fluxoTipo]) return c.fluxoTipo;
    return FX.inferir(c.titulo, aba || c.aba);
  }
  const escalaDe = c => (Array.isArray(c.escala) ? c.escala : []);
  const ctxDia = (c, x) => ({ d: x.d, h: x.h || '', hf: x.hf || '', nEscala: (c.resp && c.resp.nome ? 1 : 0) + escalaDe(c).length });
  /** O resumo do fluxo pra tela: por dia, feitas/total e a próxima etapa; completo leva o estado e as marcas de cada etapa. */
  function fluxoPub(c, tipo, completo) {
    if (!tipo) return null;
    const fx = c.fluxo || {}, ds = fx.dias || {}, dias = {};
    for (const x of c.dias || []) {
      const st = ds[x.d] || {}, ctx = ctxDia(c, x), e = FX.estado(tipo, st, ctx);
      const pr = e.prox ? FX.no(tipo, e.prox) : null;
      const o = { feitas: e.feitas, total: e.total, prox: pr ? { id: e.prox, t: pr.def.t, q: FX.quando(tipo, e.prox, ctx) } : null, fim: FX.fimDe(tipo, x.h, x.hf) };
      if (completo) {
        o.rotas = e.rotas; o.auto = e.auto; o.manual = st.rotas || {}; o.est = e.est;
        o.marcas = {}; o.horas = {};
        for (const id of FX.GRAFO[tipo].ordem) {
          const m = (st.etapas || {})[id];
          if (m && m.some(Boolean)) o.marcas[id] = m.map(v => (v ? { por: v.por || '', em: v.em || '' } : null));
          const q = FX.quando(tipo, id, ctx); if (q) o.horas[id] = q;
        }
      }
      dias[x.d] = o;
    }
    const r = { tipo, nome: FX.nome(tipo), auto: !c.fluxoTipo, dias };
    if (completo) r.hist = (fx.hist || []).slice(-60);
    return r;
  }
  /** Quem está logado é da escala do evento (o resp ou alguém da escala)? Pelo primeiro nome, sem acento. */
  const primeiro = n => norm(String(n || '').split(' ')[0]);
  const daEscala = (c, eu) => !!eu && [c.resp].concat(escalaDe(c)).some(p => p && p.nome && primeiro(p.nome) === primeiro(eu.nome));

  // ---------------- v4.26: a confirmação de cada pessoa ----------------
  /** As pessoas do evento: o responsável e a escala (sem repetir). */
  const pessoasDe = c => { const l = [], vistos = new Set(); for (const p of [c.resp].concat(escalaDe(c))) { if (!p || !p.nome) continue; const k = primeiro(p.nome); if (vistos.has(k)) continue; vistos.add(k); l.push({ k, nome: p.nome, papel: p === c.resp ? 'principal' : (p.papel || 'apoio') }); } return l; };
  /** A confirmação que vale de uma pessoa num dia (a dada pra outra hora não vale mais: volta a pendente). */
  function confDe(c, x, k) {
    const v = c.conf && c.conf[x.d] && c.conf[x.d][k];
    if (!v) return null;
    if ((v.h || '') !== (x.h || '')) return Object.assign({}, v, { velha: true });
    return v;
  }
  /** Todos confirmaram (ok) o dia? Com fluxo, marca sozinho o "Captador confirmou que vai"; se alguém tira, desmarca. */
  function confAmarra(c, x) {
    const tipo = tipoFluxo(c, c.aba);
    if (!tipo) return;
    const id = tipo + '-capt', n = FX.no(tipo, id);
    if (!n) return;
    const ps = pessoasDe(c), todos = ps.length > 0 && ps.every(p => { const v = confDe(c, x, p.k); return v && !v.velha && v.st === 'ok'; });
    const fx = c.fluxo || { dias: {}, hist: [] }; fx.dias = fx.dias || {}; fx.hist = fx.hist || [];
    const st = fx.dias[x.d] || { rotas: {}, etapas: {} }; st.etapas = st.etapas || {};
    const m = st.etapas[id] || [], tem = !!m[0], agora = new Date().toISOString();
    if (todos && !tem) { st.etapas[id] = [{ por: 'confirmação da escala', em: agora }]; fx.hist.push({ em: agora, por: 'confirmação da escala', d: x.d, e: id, i: 0, v: true }); }
    else if (!todos && tem && m[0].por === 'confirmação da escala') { delete st.etapas[id]; fx.hist.push({ em: agora, por: 'confirmação da escala', d: x.d, e: id, i: 0, v: false }); }
    else return;
    fx.dias[x.d] = st; c.fluxo = fx;
  }
  // ---------------- v4.31: a véspera marca os checks da etapa de combinar ----------------
  const dep2 = v => (v.depoentes || []).filter(Boolean).length >= 2 && !!v.reserva && v.cassioOk === true;
  const VESP = { 'cec-vesp': [dep2, 'arrobasOk', 'figurinhaOk', 'salaOk', 'roteiroOk'], 'liga-arroba-u': ['arrobasOk', 'figurinhaOk'],
    'exp-vesp': ['arrobasOk', 'figurinhaOk'], 'wsc-vesp': ['arrobasOk', 'figurinhaOk'], 'wsw-vesp': ['arrobasOk', 'figurinhaOk'], 'ime-vesp': ['arrobasOk', 'figurinhaOk', 'backdropOk'] };
  function vespAmarra(c) {
    const tipo = tipoFluxo(c, c.aba);
    if (!tipo) return;
    const v = c.vespera || {}, agora = new Date().toISOString();
    for (const [id, regras] of Object.entries(VESP)) {
      if (!FX.no(tipo, id)) continue;
      const n = (FX.no(tipo, id).def.checks || []).length;
      for (const x of c.dias || []) {
        const fx = c.fluxo || { dias: {}, hist: [] }; fx.dias = fx.dias || {}; fx.hist = fx.hist || [];
        const st = fx.dias[x.d] || { rotas: {}, etapas: {} }; st.etapas = st.etapas || {};
        const m = (st.etapas[id] || []).slice(0, n); while (m.length < n) m.push(null);
        let mudou = false;
        regras.forEach((r, i) => {
          const ok = typeof r === 'function' ? r(v) : v[r] === true;
          if (ok && !m[i]) { m[i] = { por: 'véspera', em: agora }; mudou = true; fx.hist.push({ em: agora, por: 'véspera', d: x.d, e: id, i, v: true }); }
          else if (!ok && m[i] && m[i].por === 'véspera') { m[i] = null; mudou = true; fx.hist.push({ em: agora, por: 'véspera', d: x.d, e: id, i, v: false }); }
        });
        if (!mudou) continue;
        if (m.some(Boolean)) st.etapas[id] = m; else delete st.etapas[id];
        fx.dias[x.d] = st; c.fluxo = fx;
      }
    }
  }
  // ---------------- v4.31: a auditoria do dia seguinte ----------------
  const CARBONE = ['liga', 'cec', 'exp', 'wsc'];
  /** O que falta num dia do evento: a entrega (Drive, Galeria, stories, tasks) e as etapas da equipe sem marcar. */
  function auditoria(c, x) {
    const tipo = tipoFluxo(c, c.aba);
    if (!tipo) return null;
    const e = c.ent || {}, faltas = [];
    if (!e.drive) faltas.push('link do Drive');
    if (CARBONE.includes(tipo) && tipo !== 'cec' && !e.galeria) faltas.push('álbum da Galeria');
    if (tipo === 'cec' && !(e.tasks || []).length) faltas.push('tasks de depoimento');
    if (e.stories === undefined || e.stories === null) faltas.push('nº de stories');
    const est = FX.estado(tipo, (c.fluxo && c.fluxo.dias && c.fluxo.dias[x.d]) || {}, ctxDia(c, x));
    const etapas = FX.GRAFO[tipo].ordem.filter(id => { const n = FX.no(tipo, id); return n.def.k === 'step' && n.def.kind !== 'agent' && !/-aud$/.test(id) && est.est[id] !== 'x' && est.est[id] !== 'done'; })
      .map(id => FX.no(tipo, id).def.t);
    return { ok: !faltas.length && !etapas.length, faltas, etapas, feitas: est.feitas, total: est.total };
  }
  /** A confirmação pra tela: por dia, uma por pessoa (ok, nao ou pendente). */
  function confPub(c) {
    const r = {};
    for (const x of c.dias || []) {
      const o = {};
      for (const p of pessoasDe(c)) { const v = confDe(c, x, p.k); o[p.k] = v ? { st: v.velha ? '' : v.st, motivo: v.motivo || '', em: v.em || '', origem: v.origem || 'bone', por: v.por || '', velha: !!v.velha } : { st: '' }; }
      r[x.d] = o;
    }
    return r;
  }

  // ---------------- leitura ----------------
  /** A task do Hub na memória (título, etapa, quem capta, prazo e empresa). */
  const taskDe = c => (c.taskId && hub && hub.acha ? hub.acha(c.taskId) : null);
  /** A empresa da captação: a da task no Hub; sem ela, a que mais aparece nos posts ligados. */
  function abaDe(c, t, porId) {
    if (t && t.empresa) {
      const e = norm(t.empresa.slug || t.empresa.nome);
      const a = e && (db.abas || []).find(x => { const k = norm(x); return k && (e.includes(k) || k.includes(e)); });
      if (a) return a;
    }
    const conta = {};
    for (const id of c.posts || []) { const s = porId.get(id); const a = s && db.contas[s.conta] && db.contas[s.conta].aba; if (a) conta[a] = (conta[a] || 0) + 1; }
    const m = Object.entries(conta).sort((a, b) => b[1] - a[1])[0];
    return m ? m[0] : null;
  }
  /**
   * A captação pra tela. v4.16: o roteiro leva o tamanho do texto (tt); o texto completo (t) só vai com
   * completo = true (a folha aberta e as respostas de mudança), pra não engordar o /api/state de 20 em 20 segundos.
   */
  function publico(c, porId, completo) {
    const t = taskDe(c);
    const o = {
      id: c.id, taskId: c.taskId || null, taskUrl: c.taskUrl || '', titulo: c.titulo || '', nota: c.nota || '',
      dias: (c.dias || []).map(x => Object.assign({ d: x.d, h: x.h || '' }, x.hf ? { hf: x.hf } : {})),   // v4.25: hf = a hora de fim
      doc: c.doc || '',   // v4.16: o doc dos roteiros (um só pra captação, escolha do Zion)
      roteiros: (c.roteiros || []).map(r => Object.assign({ id: r.id, n: r.n, g: r.g || '', tt: r.t ? r.t.length : 0 }, completo ? { t: r.t || '' } : {})),
      posts: (c.posts || []).filter(id => porId.has(id)), em: c.em, por: c.por || '',
      hub: t ? { codigo: t.codigo || '', url: t.url || c.taskUrl || '', titulo: t.titulo || '', st: t.st || '', resp: t.resp || '', prazo: t.prazo || null,
        etapa: t.etapa ? { nome: t.etapa.nome || '', cor: t.etapa.cor || '#8E8E93' } : null, empresa: t.empresa ? (t.empresa.nome || '') : '' } : null,
      aba: (c.aba && (db.abas || []).includes(c.aba) ? c.aba : null) || abaDe(c, t, porId),   // v4.17: a escolhida vence a do MKT Hub
      abaFixa: !!(c.aba && (db.abas || []).includes(c.aba)),
      de: c.de && caps()[c.de] ? c.de : null,   // v4.20: continuação de outra captação (o que faltou gravar)
      tipo: c.tipo === 'evento' ? 'evento' : 'captacao',   // v4.21: os eventos da semana (opção Eventos no modo captação)
      local: c.local || '',
      resp: c.resp && c.resp.nome ? { id: c.resp.id || '', nome: c.resp.nome } : null,   // v4.21: o responsável escolhido
      tipoCap: c.tipo === 'evento' ? (c.tipoCap || '') : '',   // v4.24: o tipo de captação do evento
      // v4.25: a escala (quem vai além do resp, com papel e horário); o apoio da v4.24 segue saindo (todos da escala) pra tela antiga
      escala: c.tipo === 'evento' ? escalaDe(c).map(p => ({ id: p.id || '', nome: p.nome, papel: p.papel || 'apoio', h: p.h || '' })) : [],
      apoio: c.tipo === 'evento' ? escalaDe(c).map(p => ({ id: p.id || '', nome: p.nome })) : [],
      ent: c.tipo === 'evento' && c.ent ? { drive: c.ent.drive || '', galeria: c.ent.galeria || '', stories: c.ent.stories === undefined ? null : c.ent.stories, tasks: (c.ent.tasks || []).slice() } : { drive: '', galeria: '', stories: null, tasks: [] },   // v4.24: a entrega (v4.25: + tasks)
      st: c.tipo === 'evento' && ST_EVENTO.includes(c.st) ? c.st : '', stEm: c.tipo === 'evento' && ST_EVENTO.includes(c.st) ? (c.stEm || null) : null,   // v4.23: concluído ou desmarcado
      fluxoTipo: c.tipo === 'evento' ? (c.fluxoTipo || '') : '',   // v4.25: o escolhido ('' = deduzido do título)
      conf: c.tipo === 'evento' ? confPub(c) : {},   // v4.26: quem confirmou (por dia, pela chave do 1º nome)
      escalaSug: c.tipo === 'evento' && c.escalaSug ? copia(c.escalaSug) : null,   // v4.29: a sugerida pelo Ultron
      vespera: c.tipo === 'evento' && c.vespera ? copia(c.vespera) : null,         // v4.29: as combinações da véspera
      origem: c.origem || '', ext: c.ext || '',
    };
    o.fluxo = fluxoPub(c, tipoFluxo(c, o.aba), completo);   // v4.25
    // v4.31: a auditoria dos dias que já passaram (no /api/state, só os últimos 14 dias com algo faltando)
    if (o.fluxo) { const h = hojeBRT(), lim = soma(h, -14), au = {}; for (const x of c.dias || []) if (x.d < h && (completo || x.d >= lim)) { const a = auditoria(c, x); if (completo || (a && !a.ok)) au[x.d] = a; } if (Object.keys(au).length) o.auditoria = au; }
    return o;
  }
  const publicos = () => { const porId = slotPor(); return Object.values(caps()).map(c => publico(c, porId)); };
  /** O post está ligado a alguma captação? (a limpeza das tarefas não leva post ligado) */
  const temPost = sid => Object.values(caps()).some(c => (c.posts || []).includes(sid));
  // a task de edição já passou da edição (em aprovação, ajustar ou pronta): a captação ficou pra trás
  const EDITADO = new Set(['aprovar', 'aprovação líder', 'revisão solicitada', 'alterar', 'publicar', 'completo', 'banco de criativos']);
  /** Vídeos que saem nos próximos 14 dias sem captação ligada (o número do botão Captação, só pro ADMIN). */
  function pendentes() {
    const hoje = hojeBRT(), ate = soma(hoje, 14), ligados = new Set();
    for (const c of Object.values(caps())) if (!(c.tipo === 'evento' && c.st === 'desmarcado')) for (const id of c.posts || []) ligados.add(id);   // v4.23: evento desmarcado não capta
    const lista = db.slots.filter(s => !s.postado && s.date && s.date >= hoje && s.date <= ate && !ligados.has(s.id));
    return (hub && hub.sobrepoe ? hub.sobrepoe(lista) : lista)
      .filter(s => pecaDoPost(s) === 'video' && !(s.sugestao && !s.taskId) && !(s.taskId && s.statusCache && EDITADO.has(String(s.statusCache.status || '').trim()))).length;
  }
  /** As tasks das captações recentes, pro Hub reler (a subtarefa não vem na lista do Hub). */
  const refs = () => { const lo = soma(hojeBRT(), -30); return Object.values(caps()).filter(c => c.taskId && (!c.dias.length || c.dias[c.dias.length - 1].d >= lo)).map(c => c.taskId); };

  // ---------------- escrita ----------------
  /** Aplica o que veio da tela numa cópia da captação. Devolve { c } ou { erro }. */
  function aplica(atual, b, porId) {
    const c = copia(atual);
    if ('titulo' in b) c.titulo = linha(b.titulo, 120);
    // v4.21: onde é e quem é o responsável (das pessoas do MKT Hub; sem o Hub, só o nome); vazio tira
    if ('local' in b) { const l = linha(b.local, 120); if (l) c.local = l; else delete c.local; }
    if ('resp' in b) {
      if (!b.resp) delete c.resp;
      else {
        const nome = linha(b.resp.nome, 80);
        if (!nome) return { erro: 'responsável sem nome' };
        c.resp = { id: linha(b.resp.id, 64), nome };
      }
    }
    // v4.23: o evento concluído ou desmarcado (vazio volta pra agendado). Só o evento: a captação segue pelos roteiros gravados
    if ('st' in b) {
      if (c.tipo !== 'evento') return { erro: 'só o evento tem concluído e desmarcado' };
      if (!b.st) { delete c.st; delete c.stEm; }
      else if (ST_EVENTO.includes(b.st)) { if (c.st !== b.st) c.stEm = new Date().toISOString(); c.st = b.st; }
      else return { erro: 'situação inválida (concluido ou desmarcado)' };
    }
    // v4.24 (só no evento): o tipo de captação, o apoio (além do responsável principal) e a entrega (Drive, Galeria, stories)
    if (('tipoCap' in b || 'apoio' in b || 'ent' in b || 'escala' in b || 'fluxoTipo' in b || 'escalaSug' in b) && c.tipo !== 'evento') return { erro: 'tipo, escala, fluxo e entrega são só do evento' };
    if ('escalaSug' in b) { if (b.escalaSug) return { erro: 'a escala sugerida vem do Ultron' }; delete c.escalaSug; }   // v4.29: o Zion descarta
    // v4.25: o tipo de fluxo ('' volta pro deduzido do título; 'nenhum' tira o fluxo)
    if ('fluxoTipo' in b) {
      const v = String(b.fluxoTipo || '');
      if (!v) delete c.fluxoTipo; else if (v === 'nenhum' || FX.TIPOS[v]) c.fluxoTipo = v; else return { erro: 'tipo de fluxo inválido' };
    }
    // v4.25: a escala inteira (quem vai além do resp, com papel e horário)
    if ('escala' in b) {
      if (!Array.isArray(b.escala) || b.escala.length > MAX_ESCALA) return { erro: 'escala inválida (até ' + MAX_ESCALA + ' pessoas)' };
      const vistos = new Set(), l = [];
      for (const p of b.escala) {
        const nome = linha(p && p.nome, 80);
        if (!nome) return { erro: 'pessoa da escala sem nome' };
        const papel = String((p && p.papel) || 'apoio');
        if (!FX.PAPEIS[papel]) return { erro: 'papel inválido na escala' };
        const h = String((p && p.h) || '');
        if (!horaOk(h)) return { erro: 'horário inválido na escala' };
        const k = nome.toLowerCase();
        if (vistos.has(k)) return { erro: nome + ' está duas vezes na escala' };
        vistos.add(k); l.push({ id: linha(p.id, 64), nome, papel, h });
      }
      if (l.length) c.escala = l; else delete c.escala;
    }
    if ('tipoCap' in b) { const t = linha(b.tipoCap, 40); if (t) c.tipoCap = t; else delete c.tipoCap; }
    if ('apoio' in b) {
      if (!Array.isArray(b.apoio) || b.apoio.length > MAX_APOIO) return { erro: 'apoio inválido (até ' + MAX_APOIO + ' pessoas)' };
      // v4.25: o apoio (tela da v4.24) mexe na escala: quem continua guarda o papel e o horário; quem entra vem como apoio
      const vistos = new Set(), l = [], antes = new Map(escalaDe(c).map(p => [p.nome.toLowerCase(), p]));
      for (const p of b.apoio) {
        const nome = linha(p && p.nome, 80);
        if (!nome) return { erro: 'pessoa do apoio sem nome' };
        const k = nome.toLowerCase();
        if (vistos.has(k)) continue;
        vistos.add(k);
        const v = antes.get(k);
        l.push(v ? copia(v) : { id: linha(p.id, 64), nome, papel: 'apoio', h: '' });
      }
      delete c.apoio;
      if (l.length) c.escala = l; else delete c.escala;
    }
    if ('ent' in b) {
      if (!b.ent || typeof b.ent !== 'object') return { erro: 'entrega inválida' };
      const e = Object.assign({}, c.ent);
      for (const k of ['drive', 'galeria']) if (k in b.ent) {
        const v = String(b.ent[k] || '').trim();
        if (v && !urlOk(v)) return { erro: 'o link ' + (k === 'drive' ? 'do Drive' : 'da Galeria') + ' precisa começar com http' };
        if (v) e[k] = urlOk(v); else delete e[k];
      }
      if ('tasks' in b.ent) {   // v4.25: os links das tasks de depoimento (MKT Hub)
        if (!Array.isArray(b.ent.tasks) || b.ent.tasks.length > MAX_TASKS) return { erro: 'tasks inválidas (até ' + MAX_TASKS + ')' };
        const ts = [];
        for (const x of b.ent.tasks) { const v = String(x || '').trim(); if (!v) continue; if (!urlOk(v)) return { erro: 'o link da task precisa começar com http' }; if (!ts.includes(urlOk(v))) ts.push(urlOk(v)); }
        if (ts.length) e.tasks = ts; else delete e.tasks;
      }
      if ('stories' in b.ent) {
        const s = b.ent.stories;
        if (s === '' || s === null || s === undefined) delete e.stories;
        else { const n = Number(s); if (!Number.isInteger(n) || n < 0 || n > 999) return { erro: 'nº de stories de 0 a 999' }; e.stories = n; }
      }
      if (Object.keys(e).length) c.ent = e; else delete c.ent;
    }
    if ('nota' in b) c.nota = String(b.nota || '').replace(/[ \t]+/g, ' ').trim().slice(0, 500);
    // v4.17: a empresa da captação (vazio volta pra automática: a da task no MKT Hub ou a dos posts)
    if ('aba' in b) {
      if (b.aba === '' || b.aba === null) delete c.aba;
      else if ((db.abas || []).includes(b.aba)) c.aba = b.aba;
      else return { erro: 'empresa inválida' };
    }
    // v4.16: o doc dos roteiros (o link; vazio tira)
    if ('doc' in b) {
      const d = String(b.doc || '').trim();
      if (d && !urlOk(d)) return { erro: 'o link do doc precisa começar com http' };
      if (urlOk(d)) c.doc = urlOk(d); else delete c.doc;
    }
    if ('dias' in b) {
      if (!Array.isArray(b.dias) || b.dias.length > MAX_DIAS) return { erro: 'dias inválidos (até ' + MAX_DIAS + ')' };
      const vistos = new Set(), dias = [], hfAntes = new Map((atual.dias || []).map(x => [x.d, x.hf || '']));
      for (const x of b.dias) {
        const d = x && x.d, h = String((x && x.h) || '');
        if (!dataOk(d)) return { erro: 'dia inválido' };
        if (!horaOk(h)) return { erro: 'horário inválido' };
        if (vistos.has(d)) return { erro: 'esse dia já está na captação' };
        // v4.25: a hora de fim (sem ela no pedido, fica a de antes daquele dia: a tela antiga manda só d e h)
        const hf = x && 'hf' in x ? String(x.hf || '') : (hfAntes.get(d) || '');
        if (!horaOk(hf)) return { erro: 'hora de fim inválida' };
        if (hf && h && hf <= h) return { erro: 'a hora de fim precisa ser depois do início' };
        vistos.add(d); dias.push(hf ? { d, h, hf } : { d, h });
      }
      c.dias = dias.sort((x, y) => x.d.localeCompare(y.d));
    }
    if ('roteiros' in b) {
      if (!Array.isArray(b.roteiros) || b.roteiros.length > MAX_ROT) return { erro: 'roteiros inválidos (até ' + MAX_ROT + ')' };
      const ids = new Set(), rs = [], antes = new Map((atual.roteiros || []).map(r => [r.id, r]));
      for (const x of b.roteiros) {
        const n = linha(x && x.n, 120);
        if (!n) return { erro: 'roteiro sem nome' };
        const velho = x && antes.get(x.id);
        let id = x && /^r[0-9a-f]{6}$/.test(String(x.id || '')) ? x.id : 'r' + crypto.randomBytes(3).toString('hex');
        while (ids.has(id)) id = 'r' + crypto.randomBytes(3).toString('hex');
        ids.add(id);
        const r = { id, n, g: x && x.g ? String(x.g) : '' };
        // v4.16: o roteiro completo; sem ele no pedido, fica o de antes (marcar gravado não apaga o texto)
        const t = x && 't' in x ? texto(x.t) : (velho && velho.t) || '';
        if (t) r.t = t;
        rs.push(r);
      }
      c.roteiros = rs;
    }
    // gravado = um dos dias da captação (tirar um dia com roteiro gravado nele não pode: o gravado se perderia)
    const dset = new Set(c.dias.map(x => x.d));
    if (c.roteiros.some(r => r.g && !dset.has(r.g))) return { erro: 'tem roteiro gravado num dia que não está mais na captação' };
    if ('posts' in b) {
      if (!Array.isArray(b.posts) || b.posts.length > MAX_POSTS) return { erro: 'posts inválidos (até ' + MAX_POSTS + ')' };
      const ps = [...new Set(b.posts.map(String))];
      if (ps.some(id => !porId.has(id))) return { erro: 'post não encontrado' };
      c.posts = ps;
    }
    return { c };
  }
  /** O link colado: acha a task no MKT Hub (na memória ou direto no Hub). Sem Hub ou sem achar, guarda só o link. */
  async function ligaTask(c, link) {
    const u = String(link || '').trim();
    if (!u) { c.taskId = null; c.taskUrl = ''; return {}; }
    const t = hub && hub.resolveLink ? await hub.resolveLink(u).catch(() => null) : null;
    if (t && t.id && !t.erro) {
      const outra = Object.values(caps()).find(x => x.id !== c.id && x.taskId && String(x.taskId).toLowerCase() === String(t.id).toLowerCase());
      if (outra) return { dup: outra.id };
      c.taskId = String(t.id).toLowerCase(); c.taskUrl = urlOk(t.url) || urlOk(u);
      return { achou: true };
    }
    if (!urlOk(u)) {
      if (t && t.erro) return { erro: 'o MKT Hub não respondeu agora: cole o link inteiro da task (o código sozinho precisa do Hub)' };
      if (/MKT-\d+|[0-9a-f]{8}-[0-9a-f]{4}-/i.test(u)) return { erro: 'não achei essa task no MKT Hub: confira o código ou cole o link' };
      return { erro: 'cole o link (ou o código MKT) da task de captação do MKT Hub' };
    }
    c.taskId = null; c.taskUrl = urlOk(u);
    return { achou: false, aviso: t && t.erro ? 'o MKT Hub não respondeu: ficou só o link' : 'a task não apareceu no MKT Hub: ficou só o link' };
  }
  function desfaz(e) {
    for (const id of e.criados || []) delete caps()[id];
    // v4.25: as marcas do fluxo não entram no desfazer (são da equipe, marcadas no celular): o card volta, as marcas ficam
    for (const c of e.antes || []) { const ag = caps()[c.id], n = copia(c); if (ag && ag.fluxo) n.fluxo = ag.fluxo; else delete n.fluxo; caps()[c.id] = n; }
    muda(); saveDb();
  }
  const quem = (req, b) => linha((req.eu && req.eu.nome) || (b && b.por) || '', 40);
  let PESS = { l: null, em: 0 };   // v4.21: as pessoas do MKT Hub (10 min)

  async function rota(req, res, p) {
    if (p === '/api/captacao' && req.method === 'GET') return json(res, 200, { captacoes: publicos(), pendentes: pendentes(), escalaSemanas: db.escalaSemanas }), true;
    // v4.26: fechar (ou reabrir) a escala da semana (ADMIN). seg = a segunda da semana
    if (p === '/api/captacao/escala-semana' && req.method === 'POST') {
      if (soAdmin(req, res)) return true;
      const b = await readBody(req);
      if (!dataOk(b.seg) || new Date(Date.parse(b.seg + 'T12:00:00Z')).getUTCDay() !== 1) return json(res, 400, { erro: 'a semana começa numa segunda (AAAA-MM-DD)' }), true;
      if (b.fechada) db.escalaSemanas[b.seg] = { por: quem(req, b) || 'sem login', em: new Date().toISOString() };
      else delete db.escalaSemanas[b.seg];
      saveDb();
      return json(res, 200, { ok: true, escalaSemanas: db.escalaSemanas, rev: muda() }), true;
    }
    if (p === '/api/captacao' && req.method === 'POST') {
      if (soAdmin(req, res)) return true;
      const b = await readBody(req);
      if (b.dia !== null && b.dia !== undefined && b.dia !== '' && !dataOk(b.dia)) return json(res, 400, { erro: 'dia inválido' }), true;
      const evento = b.tipo === 'evento';   // v4.21: o evento nasce pelo nome (a task do MKT Hub é opcional)
      if (evento && !linha(b.titulo, 120) && !String(b.link || '').trim()) return json(res, 400, { erro: 'escreva o nome do evento' }), true;
      const c = { id: 'ca' + crypto.randomBytes(4).toString('hex'), taskId: null, taskUrl: '', titulo: linha(b.titulo, 120), ...(evento ? { tipo: 'evento' } : {}),
        // v4.17: criada na aba de uma empresa, a captação é dessa empresa (na Todos, fica a da task no MKT Hub)
        ...(b.aba && (db.abas || []).includes(b.aba) ? { aba: b.aba } : {}),
        dias: b.dia ? [{ d: b.dia, h: horaOk(String(b.h || '')) ? String(b.h || '') : '' }] : [], roteiros: [], posts: [], nota: '', em: new Date().toISOString(), por: quem(req, b) };
      const r = await ligaTask(c, b.link);
      if (r.erro) return json(res, 400, { erro: r.erro }), true;
      if (r.dup) return json(res, 409, { erro: 'essa task já está numa captação', id: r.dup }), true;
      if (!c.taskId && !c.taskUrl && !c.titulo) return json(res, 400, { erro: 'cole o link da task de captação do MKT Hub' }), true;
      caps()[c.id] = c;
      pushUndo({ tipo: 'captacoes', desc: 'criar captação', antes: [], criados: [c.id] });
      saveDb();
      return json(res, 200, { ok: true, captacao: publico(c, slotPor(), true), aviso: r.aviso || '', rev: muda() }), true;
    }
    // v4.20: o que falta gravar vira uma captação nova (pedido do Zion em 09/11/2026: "eu preciso que eu consiga criar outra
    // 'task' de captação no bone de acordo com o roteiro NAO captado. pq fica mostrando que a task fica fora do prazo mas
    // nao está pq foi captado os outros 2 roteiros"; escolhas: "Eu marco na hora" os posts que vão junto e o "Outro dia pra
    // terminar" vira isto). A nova leva os roteiros marcados (só os não gravados), o dia escolhido e os posts marcados, com
    // a mesma task do MKT Hub (de = a original). A original fica com o resto; se tudo o que ficou está gravado, os dias dela
    // viram só os dias em que gravou (e o aviso de prazo, que olhava o último dia, some). Ctrl+Z desfaz as duas juntas.
    // v4.21: as pessoas do MKT Hub (ativas), pra escolher o responsável do evento. Guardadas 10 min; sem o Hub, lista vazia
    // e o aviso (a folha deixa escrever o nome).
    if (p === '/api/captacao/pessoas' && req.method === 'GET') {
      try {
        if (!PESS.l || Date.now() - PESS.em > 10 * 60e3) {
          if (!hub || typeof hub.pede !== 'function' || (typeof hub.ligado === 'function' && !hub.ligado())) throw new Error('sem MKT Hub');
          const r = await hub.pede('/pessoas'), l = Array.isArray(r) ? r : ((r && r.dados) || []);
          PESS = { l: l.filter(x => x && x.id && x.nome && x.ativo !== false).map(x => ({ id: String(x.id), nome: String(x.nome) })).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')), em: Date.now() };
        }
        return json(res, 200, { pessoas: PESS.l }), true;
      } catch (e) { return json(res, 200, { pessoas: [], erro: 'o MKT Hub não respondeu agora: escreva o nome' }), true; }
    }
    const ms = p.match(/^\/api\/captacao\/(ca[0-9a-f]{8})\/separar$/);
    if (ms && req.method === 'POST') {
      if (soAdmin(req, res)) return true;
      const atual = caps()[ms[1]];
      if (!atual) return json(res, 404, { erro: 'captação não encontrada' }), true;
      const b = await readBody(req), porId = slotPor();
      if (!dataOk(b.dia)) return json(res, 400, { erro: 'escolha o dia da captação nova' }), true;
      const h = String(b.h || '');
      if (!horaOk(h)) return json(res, 400, { erro: 'horário inválido' }), true;
      const rots = atual.roteiros || [], vao = new Set((Array.isArray(b.roteiros) ? b.roteiros : []).map(String));
      if (!vao.size) return json(res, 400, { erro: 'marque pelo menos um roteiro' }), true;
      if ([...vao].some(id => !rots.some(r => r.id === id))) return json(res, 400, { erro: 'roteiro não encontrado nesta captação' }), true;
      if (rots.some(r => vao.has(r.id) && r.g)) return json(res, 400, { erro: 'roteiro gravado fica onde foi gravado' }), true;
      const ficam = rots.filter(r => !vao.has(r.id));
      if (!ficam.length) return json(res, 400, { erro: 'todos os roteiros iriam: pra mudar a captação inteira de dia, troque o dia dela' }), true;
      const psVao = [...new Set((Array.isArray(b.posts) ? b.posts : []).map(String))];
      if (psVao.some(id => !(atual.posts || []).includes(id))) return json(res, 400, { erro: 'post que não está ligado a esta captação' }), true;
      const orig = copia(atual);
      orig.roteiros = ficam;
      orig.posts = (atual.posts || []).filter(id => !psVao.includes(id));
      if (ficam.every(r => r.g)) { const gs = new Set(ficam.map(r => r.g)); const ds = (atual.dias || []).filter(x => gs.has(x.d)); if (ds.length) orig.dias = ds; }
      let id = 'ca' + crypto.randomBytes(4).toString('hex');
      while (caps()[id]) id = 'ca' + crypto.randomBytes(4).toString('hex');
      const aba = publico(atual, porId).aba;   // a empresa que vale hoje na original
      const nova = { id, taskId: atual.taskId || null, taskUrl: atual.taskUrl || '', titulo: atual.titulo || '', de: atual.id,
        ...(aba ? { aba } : {}), ...(atual.doc ? { doc: atual.doc } : {}),
        ...(atual.tipo ? { tipo: atual.tipo } : {}), ...(atual.local ? { local: atual.local } : {}), ...(atual.resp ? { resp: copia(atual.resp) } : {}), ...(atual.escala ? { escala: copia(atual.escala) } : {}), ...(atual.fluxoTipo ? { fluxoTipo: atual.fluxoTipo } : {}), ...(atual.tipoCap ? { tipoCap: atual.tipoCap } : {}),   // v4.21
        dias: [{ d: b.dia, h }], roteiros: rots.filter(r => vao.has(r.id)).map(copia), posts: psVao, nota: '', em: new Date().toISOString(), por: quem(req, b) };
      pushUndo({ tipo: 'captacoes', desc: 'gravar o que falta em outro dia', antes: [copia(atual)], criados: [nova.id] });
      caps()[atual.id] = orig; caps()[nova.id] = nova; saveDb();
      return json(res, 200, { ok: true, captacao: publico(orig, porId, true), nova: publico(nova, porId, true), rev: muda() }), true;
    }
    // v4.25: marcar a etapa do fluxo (ou escolher a rota de uma decisão). Quem está na escala do evento marca as etapas dele;
    // ADMIN marca tudo; etapa de agente (Ultron ou B.O.N.E) só ADMIN. Etapa trancada não marca: a de cima vem antes.
    // v4.26: a confirmação de quem está na escala (Confirmo / Não dá). A pessoa confirma por ela; ADMIN por qualquer um.
    // origem: bone (padrão); whatsapp ou ssb só ADMIN (quando a pessoa respondeu fora e o Zion registra).
    // ---------------- v4.29: as rotas do Ultron (também valem pro ADMIN logado) ----------------
    const ultronOuAdmin = () => !req.eu || req.eu.papel === 'admin' || req.eu.papel === 'ultron';
    // os eventos de um período, completos (escala, confirmação, véspera, fluxo)
    if (p === '/api/captacoes' && req.method === 'GET') {
      if (!ultronOuAdmin()) return json(res, 403, { erro: 'só o Ultron ou ADMIN' }), true;
      const u = new URL(req.url, 'http://x'), de = u.searchParams.get('de') || hojeBRT();
      if (!dataOk(de)) return json(res, 400, { erro: 'de e ate em AAAA-MM-DD' }), true;
      const ate = u.searchParams.get('ate') || soma(de, 7);
      if (!dataOk(ate)) return json(res, 400, { erro: 'de e ate em AAAA-MM-DD' }), true;
      const porId = slotPor();
      const l = Object.values(caps()).filter(c => c.tipo === 'evento' && (c.dias || []).some(x => x.d >= de && x.d <= ate)).map(c => publico(c, porId, true));
      return json(res, 200, { de, ate, eventos: l }), true;
    }
    // a varredura: cria ou atualiza o card (só os campos do Ultron; nunca apaga; o resp só entra se estiver vazio)
    if (p === '/api/captacoes/upsert' && req.method === 'POST') {
      if (!ultronOuAdmin()) return json(res, 403, { erro: 'só o Ultron ou ADMIN' }), true;
      const b = await readBody(req), porId = slotPor(), ext = linha(b.ext, 120);
      let atual = b.id ? caps()[String(b.id)] : ext ? Object.values(caps()).find(c => c.ext === ext) : null;
      if (b.id && !atual) return json(res, 404, { erro: 'captação não encontrada' }), true;
      if (atual && atual.tipo !== 'evento') return json(res, 400, { erro: 'o Ultron só mexe em evento' }), true;
      const criado = !atual;
      const base = atual || { id: 'ca' + crypto.randomBytes(4).toString('hex'), taskId: null, taskUrl: '', titulo: '', tipo: 'evento', dias: [], roteiros: [], posts: [], nota: '',
        em: new Date().toISOString(), por: 'Ultron', origem: 'ultron', ...(ext ? { ext } : {}) };
      const mud = {};
      for (const k of ['titulo', 'dias', 'local', 'nota', 'aba']) if (k in b) mud[k] = b[k];
      if ('resp' in b && b.resp && !(base.resp && base.resp.nome)) mud.resp = b.resp;          // o resp só na criação (ou se estiver vazio)
      if ('fluxoTipo' in b && b.fluxoTipo && !base.fluxoTipo) mud.fluxoTipo = b.fluxoTipo;
      if (b.cancelado && !/CANCELADO NO SSB/.test(('nota' in mud ? mud.nota : base.nota) || '')) mud.nota = ('CANCELADO NO SSB. ' + (('nota' in mud ? mud.nota : base.nota) || '')).trim();
      if (criado && !linha(mud.titulo, 120)) return json(res, 400, { erro: 'evento novo precisa do titulo' }), true;
      if (criado && !(Array.isArray(mud.dias) && mud.dias.length)) return json(res, 400, { erro: 'evento novo precisa dos dias' }), true;
      const r = aplica(base, mud, porId);
      if (r.erro) return json(res, 400, { erro: r.erro }), true;
      if (ext && !r.c.ext) r.c.ext = ext;
      for (const x of r.c.dias || []) confAmarra(r.c, x);
      caps()[r.c.id] = r.c; saveDb();
      return json(res, 200, { ok: true, criado, captacao: publico(r.c, porId, true), rev: muda() }), true;
    }
    const mx = p.match(/^\/api\/captacao\/(ca[0-9a-f]{8})\/(escala-sugerida|vespera)$/);
    if (mx && req.method === 'POST') {
      const c = caps()[mx[1]];
      if (!c) return json(res, 404, { erro: 'captação não encontrada' }), true;
      if (c.tipo !== 'evento') return json(res, 400, { erro: 'só no evento' }), true;
      const b = await readBody(req), ultron = !!req.eu && req.eu.papel === 'ultron', porId = slotPor();
      if (mx[2] === 'escala-sugerida') {
        if (!ultronOuAdmin()) return json(res, 403, { erro: 'só o Ultron ou ADMIN' }), true;
        const r = aplica(c, { escala: b.escala }, porId);   // valida igual à escala
        if (r.erro) return json(res, 400, { erro: r.erro }), true;
        c.escalaSug = { escala: r.c.escala || [], em: new Date().toISOString(), por: ultron ? 'Ultron' : quem(req, b) || 'ADMIN' };
        saveDb();
        return json(res, 200, { ok: true, captacao: publico(c, porId, true), rev: muda() }), true;
      }
      // a véspera: quem está na escala, ADMIN ou o Ultron (que só preenche o vazio ou o que ele mesmo preencheu)
      const admin = !req.eu || req.eu.papel === 'admin';
      if (!admin && !ultron && !daEscala(c, req.eu)) return json(res, 403, { erro: 'só quem está na escala (ou ADMIN) mexe na véspera' }), true;
      const v = copia(c.vespera || {}); v.por = v.por || {};
      const por = ultron ? 'Ultron' : quem(req, b) || 'sem login', pulados = [];
      const podeMexer = k => !ultron || v[k] === undefined || v[k] === '' || (Array.isArray(v[k]) && !v[k].some(Boolean)) || v.por[k] === 'Ultron';
      const poe = (k, val) => { if (!podeMexer(k)) { pulados.push(k); return; } if (val === '' || val === null || (Array.isArray(val) && !val.some(Boolean))) { delete v[k]; delete v.por[k]; } else { v[k] = val; v.por[k] = por; } };
      if ('depoentes' in b) { if (!Array.isArray(b.depoentes) || b.depoentes.length > 4) return json(res, 400, { erro: 'depoentes: lista de até 4 nomes' }), true; poe('depoentes', b.depoentes.map(x => linha(x, 80))); }
      for (const k of ['reserva', 'obs']) if (k in b) poe(k, linha(b[k], k === 'obs' ? 400 : 80));
      for (const k of ['cassioOk', 'arrobasOk', 'figurinhaOk', 'salaOk', 'roteiroOk', 'backdropOk']) if (k in b) { if (b[k] !== null && typeof b[k] !== 'boolean') return json(res, 400, { erro: k + ' é sim ou não' }), true; poe(k, b[k] === null ? '' : b[k]); }
      if (!Object.keys(v.por).length) delete c.vespera; else { v.em = new Date().toISOString(); c.vespera = v; }
      vespAmarra(c);   // v4.31: a véspera marca os checks de combinar
      saveDb();
      return json(res, 200, { ok: true, pulados, captacao: publico(c, porId, true), rev: muda() }), true;
    }
    const mc = p.match(/^\/api\/captacao\/(ca[0-9a-f]{8})\/confirmacao$/);
    if (mc && req.method === 'POST') {
      const c = caps()[mc[1]];
      if (!c) return json(res, 404, { erro: 'captação não encontrada' }), true;
      if (c.tipo !== 'evento') return json(res, 400, { erro: 'confirmação é só do evento' }), true;
      const b = await readBody(req);
      const x = (c.dias || []).find(y => y.d === b.d) || (!b.d && c.dias && c.dias.length === 1 ? c.dias[0] : null);
      if (!x) return json(res, 400, { erro: 'dia do evento não encontrado' }), true;
      const ultron = !!req.eu && req.eu.papel === 'ultron';
      const admin = !req.eu || req.eu.papel === 'admin' || ultron;
      if (ultron) {   // v4.29: o que o Ultron leu no WhatsApp ou no SSB ({ pessoa, st: ok | nao_da | pendente, origem, motivo })
        if (!b.nome && b.pessoa) b.nome = b.pessoa;
        if (b.st === 'nao_da') b.st = 'nao';
        if (b.st === 'pendente') b.st = '';
        if (!['whatsapp', 'ssb'].includes(String(b.origem || ''))) return json(res, 400, { erro: 'o Ultron registra com origem whatsapp ou ssb' }), true;
      }
      const alvo = b.nome ? primeiro(b.nome) : req.eu && !ultron ? primeiro(req.eu.nome) : '';
      const pe = pessoasDe(c).find(q => q.k === alvo);
      if (!pe) return json(res, 400, { erro: 'essa pessoa não está na escala deste evento' }), true;
      if (!admin && primeiro(req.eu.nome) !== pe.k) return json(res, 403, { erro: 'cada um confirma por si (ADMIN confirma por qualquer um)' }), true;
      const origem = String(b.origem || 'bone');
      if (!['bone', 'whatsapp', 'ssb'].includes(origem)) return json(res, 400, { erro: 'origem inválida' }), true;
      if (origem !== 'bone' && !admin) return json(res, 403, { erro: 'só ADMIN registra resposta do WhatsApp ou do SSB' }), true;
      const s = String(b.st || '');
      if (!['ok', 'nao', ''].includes(s)) return json(res, 400, { erro: 'resposta inválida (ok, nao ou vazio)' }), true;
      const motivo = linha(b.motivo, 200);
      if (s === 'nao' && motivo.length < 3) return json(res, 400, { erro: 'diga o motivo do "não dá"' }), true;
      if (c.st === 'desmarcado') return json(res, 409, { erro: 'evento desmarcado' }), true;
      // v4.29: o Ultron não passa por cima da resposta que a pessoa deu no B.O.N.E (pra essa hora)
      if (ultron) { const v0 = confDe(c, x, pe.k); if (v0 && !v0.velha && v0.origem === 'bone') return json(res, 409, { erro: pe.nome + ' já respondeu no B.O.N.E', st: v0.st }), true; }
      c.conf = c.conf || {}; c.conf[x.d] = c.conf[x.d] || {};
      if (!s) delete c.conf[x.d][pe.k];
      else c.conf[x.d][pe.k] = Object.assign({ nome: pe.nome, st: s, h: x.h || '', em: new Date().toISOString(), por: ultron ? 'Ultron' : quem(req, b) || pe.nome, origem }, s === 'nao' ? { motivo } : {});
      if (!Object.keys(c.conf[x.d]).length) delete c.conf[x.d];
      if (!Object.keys(c.conf).length) delete c.conf;
      confAmarra(c, x); saveDb();
      return json(res, 200, { ok: true, captacao: publico(c, slotPor(), true), rev: muda() }), true;
    }
    const me = p.match(/^\/api\/captacao\/(ca[0-9a-f]{8})\/etapa$/);
    if (me && req.method === 'POST') {
      const c = caps()[me[1]];
      if (!c) return json(res, 404, { erro: 'captação não encontrada' }), true;
      const b = await readBody(req), porId = slotPor();
      const tipo = tipoFluxo(c, publico(c, porId).aba);
      if (!tipo) return json(res, 400, { erro: 'este card não tem fluxo (escolha o tipo do evento)' }), true;
      const x = (c.dias || []).find(y => y.d === b.d) || (!b.d && c.dias && c.dias.length === 1 ? c.dias[0] : null);
      if (!x) return json(res, 400, { erro: 'dia do evento não encontrado' }), true;
      const ultron = !!req.eu && req.eu.papel === 'ultron';
      // v4.29: o Ultron só marca as etapas dele (o aviso da véspera e a auditoria), nunca rota nem etapa da equipe
      if (ultron && ('rota' in b || !/-(agente|aud)$/.test(String(b.etapa || '')))) return json(res, 403, { erro: 'o Ultron só marca o aviso da véspera e a auditoria' }), true;
      const admin = !req.eu || req.eu.papel === 'admin' || ultron;
      if (!admin && !daEscala(c, req.eu)) return json(res, 403, { erro: 'só quem está na escala deste evento (ou ADMIN) marca as etapas' }), true;
      if (c.st === 'desmarcado') return json(res, 409, { erro: 'evento desmarcado: reabra antes de marcar' }), true;
      const id = String(b.etapa || b.rota || ''), n = FX.no(tipo, id);
      if (!n) return json(res, 400, { erro: 'etapa não encontrada neste fluxo' }), true;
      if (n.def.kind === 'agent' && !admin) return json(res, 403, { erro: 'etapa de agente: só ADMIN marca' }), true;
      const fx = c.fluxo || { dias: {}, hist: [] };
      fx.dias = fx.dias || {}; fx.hist = fx.hist || [];
      const st = fx.dias[x.d] || { rotas: {}, etapas: {} };
      st.rotas = st.rotas || {}; st.etapas = st.etapas || {};
      const e = FX.estado(tipo, st, ctxDia(c, x)), agora = new Date().toISOString(), por = quem(req, b) || 'sem login';
      let h;
      if ('rota' in b) {
        if (n.def.k !== 'dec') return json(res, 400, { erro: 'isso não é uma decisão' }), true;
        if (e.est[id] === 'x' || e.est[id] === 'locked') return json(res, 409, { erro: 'decisão trancada: termine as etapas de cima antes' }), true;
        if (b.i === null || b.i === '' || b.i === undefined) { delete st.rotas[id]; h = { r: id, i: null }; }   // volta pra automática
        else {
          const i = Number(b.i);
          if (!Number.isInteger(i) || i < 0 || i >= n.def.br.length) return json(res, 400, { erro: 'rota inválida' }), true;
          st.rotas[id] = i; h = { r: id, i };
        }
      } else {
        if (n.def.k !== 'step') return json(res, 400, { erro: 'isso é uma decisão: escolha a rota' }), true;
        const cs = n.def.checks || [], i = Number(b.i);
        if (!Number.isInteger(i) || i < 0 || i >= cs.length) return json(res, 400, { erro: 'check inválido' }), true;
        const v = !!b.v;
        if (v && e.est[id] !== 'avail' && e.est[id] !== 'done') {
          const vez = e.prox ? FX.no(tipo, e.prox).def.t : '';
          return json(res, 409, { erro: e.est[id] === 'x' ? 'essa etapa é da rota que não vale' : 'etapa trancada: antes vem "' + (vez || 'a etapa de cima') + '"', trancada: true, prox: e.prox || null }), true;
        }
        const m = (st.etapas[id] || []).slice(0, cs.length);
        while (m.length < cs.length) m.push(null);
        m[i] = v ? { por, em: agora } : null;
        if (m.some(Boolean)) st.etapas[id] = m; else delete st.etapas[id];
        h = { e: id, i, v };
      }
      fx.dias[x.d] = st;
      fx.hist.push(Object.assign({ em: agora, por, d: x.d }, h));
      if (fx.hist.length > MAX_HIST) fx.hist = fx.hist.slice(-MAX_HIST);
      c.fluxo = fx; saveDb();
      return json(res, 200, { ok: true, captacao: publico(c, porId, true), rev: muda() }), true;
    }
    const m = p.match(/^\/api\/captacao\/(ca[0-9a-f]{8})$/);
    // v4.16: a captação inteira (com o texto dos roteiros), pra folha
    if (m && req.method === 'GET') {
      const c = caps()[m[1]];
      return (c ? json(res, 200, { captacao: publico(c, slotPor(), true) }) : json(res, 404, { erro: 'captação não encontrada' })), true;
    }
    if (m && (req.method === 'PATCH' || req.method === 'DELETE')) {
      if (soAdmin(req, res)) return true;
      const atual = caps()[m[1]];
      if (!atual) return json(res, 404, { erro: 'captação não encontrada' }), true;
      if (req.method === 'DELETE') {
        pushUndo({ tipo: 'captacoes', desc: 'excluir captação', antes: [copia(atual)], criados: [] });
        delete caps()[atual.id]; saveDb();
        return json(res, 200, { ok: true, rev: muda() }), true;
      }
      const b = await readBody(req), porId = slotPor();
      const r = aplica(atual, b, porId);
      if (r.erro) return json(res, 400, { erro: r.erro }), true;
      let aviso = '';
      if ('link' in b) {
        const l = await ligaTask(r.c, b.link);
        if (l.erro) return json(res, 400, { erro: l.erro }), true;
        if (l.dup) return json(res, 409, { erro: 'essa task já está noutra captação', id: l.dup }), true;
        aviso = l.aviso || '';
        if (!caps()[atual.id]) return json(res, 404, { erro: 'captação não encontrada' }), true;   // apagada enquanto o Hub respondia
      }
      const desc = 'roteiros' in b ? 'mudar os roteiros' : 'dias' in b ? 'mudar os dias da captação' : 'posts' in b ? 'mudar os posts ligados'
        : 'link' in b ? 'trocar a task' : 'titulo' in b ? 'mudar o nome da captação' : 'nota' in b ? 'mudar a nota' : 'doc' in b ? 'mudar o doc dos roteiros' : 'aba' in b ? 'mudar a empresa da captação'
        : 'resp' in b ? 'mudar o responsável' : 'local' in b ? 'mudar o local'
        : 'tipoCap' in b ? 'mudar o tipo de captação' : 'apoio' in b ? 'mudar o apoio' : 'ent' in b ? 'mudar a entrega'
        : 'escala' in b ? 'mudar a escala' : 'fluxoTipo' in b ? 'mudar o tipo de fluxo'
        : 'st' in b ? (b.st === 'concluido' ? 'concluir o evento' : b.st === 'desmarcado' ? 'desmarcar o evento' : 'reabrir o evento') : 'editar captação';
      pushUndo({ tipo: 'captacoes', desc, antes: [copia(caps()[atual.id])], criados: [] });
      if (r.c.tipo === 'evento') for (const x of r.c.dias || []) confAmarra(r.c, x);   // v4.26: mudou a escala ou a hora: o "confirmou" acompanha
      caps()[atual.id] = r.c; saveDb();
      return json(res, 200, { ok: true, captacao: publico(r.c, porId, true), aviso, rev: muda() }), true;
    }
    return false;
  }
  rota.publicos = publicos;
  rota.pendentes = pendentes;
  rota.temPost = temPost;
  rota.desfaz = desfaz;
  rota.refs = refs;
  rota.rev = () => rev;
  rota.semanas = () => db.escalaSemanas;   // v4.26
  // v4.28: o que o agendador dos lembretes precisa
  rota.eventosAgenda = () => Object.values(caps()).filter(c => c.tipo === 'evento' && c.st !== 'desmarcado').map(c => ({ c, tipo: tipoFluxo(c, c.aba) })).filter(x => x.tipo);
  rota.pessoasDe = pessoasDe;
  rota.ctxDia = ctxDia;
  rota.confDe = confDe;
  rota.auditoria = auditoria;   // v4.31
  rota.tipoDe = c => tipoFluxo(c, c.aba);
  return rota;
};
