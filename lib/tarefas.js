// Tarefas da copywriter (v3.80). Decisões do Zion em 27/09/2026:
//   - duas tarefas por empresa: MATRIZ (por enquanto só na SeuBoné, que é onde o formulário existe) e COPY (todas)
//   - a tarefa é: tipo + empresa (aba) + período (de/até) + quem faz. Os posts dela são os do período.
//   - o relógio é da tarefa (lib/tempo.js); o painel anota sozinho qual post estava aberto enquanto ele rodava
//   - ela manda pra aprovação; o Zion aprova post a post (ou tudo de uma vez) ou pede alteração com nota
//   - matriz aprovada libera a copy daquele post; copy aprovada libera a produção (v3.81, task do MKT Hub)
// O estado de aprovação mora no POST (slot.aprov = { m: {...}, c: {...} }), porque é do post e não da tarefa:
//   { st: 'enviado' | 'aprovado' | 'alterar', em, por (quem mandou), ap (quem aprovou ou pediu), apEm, nota, pedido }
// Tarefa não guarda "concluída": ela está concluída quando todos os posts dela estão aprovados (conta na hora).
'use strict';
const crypto = require('crypto');

const ABAS_COM_MATRIZ = ['SEUBONÉ'];
const MAX_DIAS = 31;

const dataOk = d => /^\d{4}-\d{2}-\d{2}$/.test(String(d || '')) && !isNaN(Date.parse(d + 'T12:00:00Z'));
const limpaNome = t => String(t || '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 24);
const brData = d => d.slice(8, 10) + '/' + d.slice(5, 7);
const hojeBRT = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
const addDias = (iso, n) => new Date(Date.parse(iso + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);

module.exports = function criarTarefas(ctx) {
  const { db, saveDb, readBody, json, undoSlots, tempo } = ctx;
  if (!db.tarefas || typeof db.tarefas !== 'object' || Array.isArray(db.tarefas)) db.tarefas = {};

  const abaDaConta = c => db.contas[c] ? db.contas[c].aba : null;
  const K = tf => tf.tipo === 'matriz' ? 'm' : 'c';

  /** Os posts da tarefa: os do período e da empresa (matriz: só os cards da matriz). Postado e sugestão ficam de fora. */
  function itens(tf) {
    return db.slots.filter(s => s.date && s.date >= tf.de && s.date <= tf.ate && abaDaConta(s.conta) === tf.aba
      && !s.postado && !(s.sugestao && !s.taskId) && (tf.tipo !== 'matriz' || !!s.matrizSB));
  }
  function concluida(tf, lista) {
    const k = K(tf), l = lista || itens(tf);
    return l.length > 0 && l.every(s => s.aprov && s.aprov[k] && s.aprov[k].st === 'aprovado');
  }
  /** O que vai pro /api/state: as tarefas não arquivadas, com a lista de posts já calculada. */
  function publicas() {
    return Object.values(db.tarefas).filter(tf => !tf.arquivadaEm).map(tf => {
      const l = itens(tf);
      const o = { id: tf.id, tipo: tf.tipo, aba: tf.aba, de: tf.de, ate: tf.ate, por: tf.por, seg: tf.seg || 0, criadaEm: tf.criadaEm, itens: l.map(s => s.id), concluida: concluida(tf, l) };
      if (tf.hub && rota.hubPublico) o.hub = rota.hubPublico(tf);      // v3.84: a mãe no MKT Hub e o envio em andamento
      return o;
    }).sort((a, b) => a.de.localeCompare(b.de));
  }
  /** v3.84: post que foi pro MKT Hub tem a aprovação lá (na tarefa mãe), enquanto o painel estiver ligado ao Hub. */
  const noHub = (s, k) => !!(s.aprov && s.aprov[k] && s.aprov[k].hub) && !!(ctx.hubLigado && ctx.hubLigado());
  /** v3.84: a tarefa tem mãe no Hub ainda sem aprovação (ou está indo pra lá): o painel precisa dela pra acompanhar o Hub. */
  const hubAberto = tf => !!(tf.hub && ((tf.hub.job && tf.hub.job.st === 'enviando') || (tf.hub.maes || []).some(m => m.estado !== 'aprovada' && m.estado !== 'sumiu')));
  function conflito(tipo, aba, de, ate, exceto) {
    return Object.values(db.tarefas).find(t => t.id !== exceto && !t.arquivadaEm && t.tipo === tipo && t.aba === aba && t.de <= ate && t.ate >= de);
  }
  function valida(b, atual) {
    const tipo = atual ? atual.tipo : (b.tipo === 'matriz' || b.tipo === 'copy' ? b.tipo : null);
    if (!tipo) return { erro: 'tipo inválido (matriz ou copy)' };
    const aba = atual ? atual.aba : String(b.aba || '');
    if (!db.abas.includes(aba)) return { erro: 'empresa inválida' };
    if (tipo === 'matriz' && !ABAS_COM_MATRIZ.includes(aba)) return { erro: 'por enquanto a matriz existe só na SeuBoné' };
    const de = 'de' in b ? String(b.de) : atual.de, ate = 'ate' in b ? String(b.ate) : atual.ate;
    if (!dataOk(de) || !dataOk(ate)) return { erro: 'datas inválidas' };
    if (de > ate) return { erro: 'o começo vem depois do fim' };
    if ((Date.parse(ate) - Date.parse(de)) / 864e5 + 1 > MAX_DIAS) return { erro: 'período de no máximo ' + MAX_DIAS + ' dias' };
    const por = 'por' in b ? limpaNome(b.por) : atual.por;
    if (!por) return { erro: 'diga quem faz a tarefa' };
    const c = conflito(tipo, aba, de, ate, atual && atual.id);
    if (c) return { erro: 'já tem tarefa de ' + tipo + ' aberta nesse período (' + brData(c.de) + ' a ' + brData(c.ate) + ', ' + c.por + ')', conflito: c.id };
    return { tipo, aba, de, ate, por };
  }

  /**
   * Faxina (na subida e a cada 6 h): tarefa concluída arquiva sozinha 7 dias depois do fim do período;
   * tarefa arquivada há mais de 120 dias sai (o tempo dela continua nas somas de lib/tempo.js).
   */
  function faxina() {
    const hoje = hojeBRT(), agora = new Date().toISOString();
    let mexeu = false;
    for (const tf of Object.values(db.tarefas)) {
      if (!tf.arquivadaEm && tf.ate < addDias(hoje, -7) && concluida(tf)) { tf.arquivadaEm = agora; tf.auto = true; mexeu = true; }
      if (tf.arquivadaEm && Date.now() - Date.parse(tf.arquivadaEm) > 120 * 864e5 && !hubAberto(tf)) { delete db.tarefas[tf.id]; mexeu = true; }
    }
    if (mexeu) saveDb();
  }

  async function rota(req, res, p) {
    if (!p.startsWith('/api/tarefas')) return false;

    if (p === '/api/tarefas' && req.method === 'GET') return json(res, 200, { tarefas: publicas() }), true;

    if (p === '/api/tarefas' && req.method === 'POST') {
      const v = valida(await readBody(req));
      if (v.erro) return json(res, v.conflito ? 409 : 400, { erro: v.erro, conflito: v.conflito || null }), true;
      const id = 't' + crypto.randomBytes(4).toString('hex');
      db.tarefas[id] = { id, ...v, criadaEm: new Date().toISOString(), seg: 0 };
      saveDb();
      return json(res, 200, { ok: true, tarefa: publicas().find(t => t.id === id) }), true;
    }

    const m = p.match(/^\/api\/tarefas\/(t[0-9a-f]{8})(?:\/([a-z]+))?$/);
    if (!m) return false;
    const tf = db.tarefas[m[1]];
    if (!tf) return json(res, 404, { erro: 'tarefa não encontrada' }), true;
    const acao = m[2] || '';

    // detalhe: o que a tela não tem no /api/state (tempo de cada post e o tamanho de cada copy)
    if (!acao && req.method === 'GET') {
      const tempos = {}, docs = {};
      for (const s of itens(tf)) {
        if (tempo) tempos[s.id] = tempo.tempoDoPost(s.id);
        const d = s.docId && db.docs ? db.docs[s.docId] : null;
        if (d && !d.excluido) docs[s.id] = { id: d.id, palavras: d.palavras || 0, atualizadoEm: d.atualizadoEm || null, por: d.por || '' };
      }
      return json(res, 200, { tarefa: publicas().find(t => t.id === tf.id) || null, tempos, docs }), true;
    }
    if (!acao && req.method === 'PATCH') {
      const b = await readBody(req);
      // v3.84: com login, só quem faz a tarefa (ou um ADMIN) troca o "quem faz" (a tarefa vai pro MKT Hub no nome dessa pessoa)
      const chave = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
      if (req.eu && req.eu.papel !== 'admin' && 'por' in b && chave(limpaNome(b.por)) !== chave(tf.por) && chave(req.eu.nome) !== chave(tf.por))
        return json(res, 403, { erro: 'só quem faz a tarefa (' + tf.por + ') ou um ADMIN troca quem faz' }), true;
      const v = valida(b, tf);
      if (v.erro) return json(res, v.conflito ? 409 : 400, { erro: v.erro }), true;
      Object.assign(tf, { de: v.de, ate: v.ate, por: v.por });
      saveDb();
      return json(res, 200, { ok: true, tarefa: publicas().find(t => t.id === tf.id) }), true;
    }
    if (!acao && req.method === 'DELETE') {
      if (hubAberto(tf)) return json(res, 409, { erro: 'essa tarefa tem posts no MKT Hub ainda sem aprovação: use "Concluir tarefa" (o painel continua acompanhando o Hub)' }), true;
      delete db.tarefas[tf.id]; saveDb();                 // o tempo dela continua nas somas do relógio
      return json(res, 200, { ok: true }), true;
    }
    if (req.method !== 'POST') return false;
    const b = await readBody(req);

    if (acao === 'arquivar' || acao === 'desarquivar') {
      if (acao === 'arquivar') tf.arquivadaEm = new Date().toISOString();
      else {
        const c = conflito(tf.tipo, tf.aba, tf.de, tf.ate, tf.id);
        if (c) return json(res, 409, { erro: 'já tem outra tarefa aberta nesse período' }), true;
        delete tf.arquivadaEm; delete tf.auto;
      }
      saveDb();
      return json(res, 200, { ok: true }), true;
    }

    // v3.82: com login, quem fez é a conta logada (o navegador não escolhe o nome)
    const quem = req.eu ? req.eu.nome : limpaNome(b.quem);
    if (!quem) return json(res, 400, { erro: 'preencha o seu perfil (nome) antes' }), true;
    if (req.eu && req.eu.papel !== 'admin' && (acao === 'aprovar' || acao === 'alterar' || acao === 'reabrir'))
      return json(res, 403, { erro: 'só ADMIN (Zion ou Maria) aprova ou pede alteração' }), true;
    const k = K(tf), agora = new Date().toISOString();
    const daTarefa = new Map(itens(tf).map(s => [s.id, s]));
    const alvo = ids => (Array.isArray(ids) ? ids : [ids]).map(id => daTarefa.get(String(id))).filter(Boolean);
    const nome = k === 'm' ? 'matriz' : 'copy';

    // v3.84: o que já está no MKT Hub é aprovado (ou volta pra alterar) lá, e vai de novo pelo botão do Hub
    const msgHub = l => 'a aprovação ' + (l.length > 1 ? 'desses posts' : 'desse post') + ' é no MKT Hub, na tarefa mãe' + (l[0].aprov[k].sub ? ' (subtarefa ' + l[0].aprov[k].sub + ')' : '');
    // ela manda pra aprovação (os posts marcados)
    if (acao === 'enviar') {
      // v3.84: com a escrita no Hub ligada, mandar pra aprovação é pelo Hub (a aprovação não pode escapar dele)
      if (ctx.hubEscrita && ctx.hubEscrita()) return json(res, 409, { erro: 'com o MKT Hub ligado, a matriz e a copy vão pelo botão do MKT Hub (Mandar pro MKT Hub)' }), true;
      const todos = alvo(b.slots).filter(s => !(s.aprov && s.aprov[k] && s.aprov[k].st === 'aprovado'));
      const lista = todos.filter(s => !noHub(s, k));
      if (!lista.length && todos.length) return json(res, 409, { erro: msgHub(todos) + ': mande de novo pelo botão do MKT Hub' }), true;
      if (!lista.length) return json(res, 400, { erro: 'nenhum post pra mandar' }), true;
      undoSlots('mandar ' + lista.length + ' ' + nome + (lista.length > 1 ? 's' : '') + ' pra aprovação', lista);
      for (const s of lista) {
        const ant = (s.aprov && s.aprov[k]) || {};
        const novo = { st: 'enviado', em: agora, por: quem };
        const pedido = ant.st === 'alterar' ? ant.nota : ant.pedido;   // o que o Zion tinha pedido fica visível na revisão
        if (pedido) novo.pedido = pedido;
        s.aprov = Object.assign({}, s.aprov, { [k]: novo });
      }
      saveDb();
      return json(res, 200, { ok: true, enviados: lista.length }), true;
    }
    // o Zion aprova (um, vários ou todos os que estão esperando)
    if (acao === 'aprovar') {
      const todos = alvo(b.slots).filter(s => s.aprov && s.aprov[k] && s.aprov[k].st === 'enviado');
      const lista = todos.filter(s => !noHub(s, k));
      if (!lista.length && todos.length) return json(res, 409, { erro: msgHub(todos) }), true;
      if (!lista.length) return json(res, 400, { erro: 'nada esperando aprovação' }), true;
      undoSlots('aprovar ' + lista.length + ' ' + nome + (lista.length > 1 ? 's' : ''), lista);
      for (const s of lista) s.aprov[k] = Object.assign({}, s.aprov[k], { st: 'aprovado', ap: quem, apEm: agora });
      saveDb();
      return json(res, 200, { ok: true, aprovados: lista.length, concluida: concluida(tf) }), true;
    }
    // pede alteração com nota (volta pra ela)
    if (acao === 'alterar') {
      const [s] = alvo(b.slotId);
      if (!s) return json(res, 400, { erro: 'post fora desta tarefa' }), true;
      if (noHub(s, k)) return json(res, 409, { erro: msgHub([s]) + ': peça a alteração lá' }), true;
      const nota = String(b.nota || '').replace(/\s+/g, ' ').trim().slice(0, 500);
      if (!nota) return json(res, 400, { erro: 'escreva o que precisa mudar' }), true;
      undoSlots('pedir alteração na ' + nome, [s]);
      s.aprov = Object.assign({}, s.aprov, { [k]: Object.assign({}, (s.aprov && s.aprov[k]) || { por: tf.por, em: agora }, { st: 'alterar', ap: quem, apEm: agora, nota }) });
      saveDb();
      return json(res, 200, { ok: true }), true;
    }
    // desfaz uma aprovação ou um pedido de alteração: volta a esperar aprovação
    if (acao === 'reabrir') {
      const [s] = alvo(b.slotId);
      if (!s || !s.aprov || !s.aprov[k]) return json(res, 400, { erro: 'post sem aprovação' }), true;
      if (noHub(s, k)) return json(res, 409, { erro: msgHub([s]) }), true;
      undoSlots('reabrir aprovação da ' + nome, [s]);
      const a = Object.assign({}, s.aprov[k], { st: 'enviado' });
      delete a.ap; delete a.apEm; delete a.nota;
      s.aprov = Object.assign({}, s.aprov, { [k]: a });
      saveDb();
      return json(res, 200, { ok: true }), true;
    }
    return false;
  }

  rota.publicas = publicas;
  rota.faxina = faxina;
  rota.itens = itens;               // v3.84: lib/hubenvio.js usa a mesma lista de posts da tarefa
  rota.hubPublico = null;           // v3.84: server.js liga no resumo do Hub (lib/hubenvio.js)
  return rota;
};
