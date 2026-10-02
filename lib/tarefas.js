// Tarefas da copywriter (v3.80). Decisões do Zion em 27/09/2026:
//   - duas tarefas por empresa: MATRIZ (por enquanto só na SeuBoné, que é onde o formulário existe) e COPY (todas)
//   - a tarefa é: tipo + empresa (aba) + período (de/até) + quem faz. Os posts dela são os do período.
//   - o relógio é da tarefa (lib/tempo.js); o painel anota sozinho qual post estava aberto enquanto ele rodava
//   - ela manda pra aprovação; o Zion aprova post a post (ou tudo de uma vez) ou pede alteração com nota
//   - matriz aprovada libera a copy daquele post; copy aprovada libera a produção (v3.81, task do MKT Hub)
// O estado de aprovação mora no POST (slot.aprov = { m: {...}, c: {...} }), porque é do post e não da tarefa:
//   { st: 'enviado' | 'aprovado' | 'alterar', em, por (quem mandou), ap (quem aprovou ou pediu), apEm, nota, pedido }
// Tarefa não guarda "concluída": ela está concluída quando todos os posts dela estão aprovados (conta na hora).
// v3.88 (fluxo novo, pedido do Zion em 30/09/2026): a tarefa de matriz CRIA os cards amarelos dos dias dela e não
// passa mais por aprovação (concluída = todos os cards com os 7 campos); só a copy é aprovada, aqui no B.O.N.E (a
// matriz e a copy não vão mais pro MKT Hub). Concluir (arquivar) a tarefa é só do ADMIN.
'use strict';
const crypto = require('crypto');
const { lerRoteiro } = require('./peca.js');                 // v4.03: o roteiro de captação só com o modelo conta como vazio
const { htmlParaTexto } = require('./hubenvio.js');

const MAX_DIAS = 31;

const dataOk = d => /^\d{4}-\d{2}-\d{2}$/.test(String(d || '')) && !isNaN(Date.parse(d + 'T12:00:00Z'));
const limpaNome = t => String(t || '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 24);
const brData = d => d.slice(8, 10) + '/' + d.slice(5, 7);
const hojeBRT = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
const addDias = (iso, n) => new Date(Date.parse(iso + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);

module.exports = function criarTarefas(ctx) {
  const { db, saveDb, readBody, json, undoSlots, tempo } = ctx;
  const criaCards = ctx.criaCards || (() => []), limpaCards = ctx.limpaCards || (() => 0), mzCheio = ctx.mzCheio || (() => false);
  const criaPosts = ctx.criaPosts || (() => []), limpaPosts = ctx.limpaPosts || (() => 0);   // v4.00: tarefa de copy sem matriz
  const ABAS_COM_MATRIZ = ctx.abasMatriz || ['SEUBONÉ'];   // v3.91: SeuBoné e Weevo (lib/matrizes.js)
  if (!db.tarefas || typeof db.tarefas !== 'object' || Array.isArray(db.tarefas)) db.tarefas = {};

  const abaDaConta = c => db.contas[c] ? db.contas[c].aba : null;
  const K = tf => tf.tipo === 'matriz' ? 'm' : 'c';

  /** Os posts da tarefa: os do período e da empresa (matriz: só os cards da matriz). Postado e sugestão ficam de fora. */
  function itens(tf) {
    return db.slots.filter(s => s.date && s.date >= tf.de && s.date <= tf.ate && abaDaConta(s.conta) === tf.aba
      && !s.postado && !(s.sugestao && !s.taskId) && (tf.tipo !== 'matriz' || !!s.matrizSB));
  }
  function concluida(tf, lista) {
    const l = lista || itens(tf);
    if (tf.tipo === 'matriz') return l.length > 0 && l.every(s => mzCheio(s.matrizSB, s));   // v3.88: matriz não tem aprovação
    return l.length > 0 && l.every(s => s.aprov && s.aprov.c && s.aprov.c.st === 'aprovado');
  }
  /** O que vai pro /api/state: as tarefas não arquivadas, com a lista de posts já calculada. */
  function publicas() {
    return Object.values(db.tarefas).filter(tf => !tf.arquivadaEm).map(tf => {
      const l = itens(tf);
      const o = { id: tf.id, tipo: tf.tipo, aba: tf.aba, de: tf.de, ate: tf.ate, por: tf.por, seg: tf.seg || 0, criadaEm: tf.criadaEm, itens: l.map(s => s.id), concluida: concluida(tf, l) };
      if (tf.tipo === 'copy' && Array.isArray(tf.contas)) o.contas = tf.contas;   // v4.00: onde ela cria os posts DD_MM
      if (tf.hub && rota.hubPublico) o.hub = rota.hubPublico(tf);      // v3.84: a mãe no MKT Hub e o envio em andamento
      return o;
    }).sort((a, b) => a.de.localeCompare(b.de));
  }
  /** v3.84: post que foi pro MKT Hub tinha a aprovação lá. v3.88: a aprovação é sempre aqui (a migração tirou a marca do Hub). */
  const noHub = () => false;
  /**
   * v3.85: tarefa excluída (ou apagada na faxina) solta os posts que estavam no MKT Hub sem aprovação: eles voltam pra
   * mandar de novo, sem trava. O que já foi aprovado continua aprovado. No Hub nada muda (a mãe fica lá).
   */
  function soltaDoHub(tf) {
    if (!tf.hub || !Array.isArray(tf.hub.maes)) return 0;
    const k = K(tf), abertas = new Set(tf.hub.maes.filter(m => m.estado !== 'aprovada').map(m => m.id));
    let n = 0;
    for (const s of db.slots) {
      const a = s.aprov && s.aprov[k];
      if (a && a.hub && abertas.has(a.hub) && a.st !== 'aprovado') { const x = Object.assign({}, s.aprov); delete x[k]; s.aprov = x; n++; }
    }
    return n;
  }
  /** v4.00: as contas em que a tarefa de copy cria os posts DD_MM: as escolhidas (só da empresa) ou, sem lista, todas. */
  function contasDaTarefa(lista, aba) {
    const daAba = Object.keys(db.contas).filter(c => db.contas[c].aba === aba);
    if (!Array.isArray(lista)) return daAba;
    return daAba.filter(c => lista.includes(c));
  }
  function conflito(tipo, aba, de, ate, exceto) {
    return Object.values(db.tarefas).find(t => t.id !== exceto && !t.arquivadaEm && t.tipo === tipo && t.aba === aba && t.de <= ate && t.ate >= de);
  }
  function valida(b, atual) {
    const tipo = atual ? atual.tipo : (b.tipo === 'matriz' || b.tipo === 'copy' ? b.tipo : null);
    if (!tipo) return { erro: 'tipo inválido (matriz ou copy)' };
    const aba = atual ? atual.aba : String(b.aba || '');
    if (!db.abas.includes(aba)) return { erro: 'empresa inválida' };
    if (tipo === 'matriz' && !ABAS_COM_MATRIZ.includes(aba)) return { erro: 'por enquanto a matriz existe só na SeuBoné e na Weevo' };
    const de = 'de' in b ? String(b.de) : atual.de, ate = 'ate' in b ? String(b.ate) : atual.ate;
    if (!dataOk(de) || !dataOk(ate)) return { erro: 'datas inválidas' };
    if (de > ate) return { erro: 'o começo vem depois do fim' };
    if ((Date.parse(ate) - Date.parse(de)) / 864e5 + 1 > MAX_DIAS) return { erro: 'período de no máximo ' + MAX_DIAS + ' dias' };
    const por = 'por' in b ? limpaNome(b.por) : (atual ? atual.por : '');   // v3.90: sem "por" na tarefa nova era erro 500
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
      if (tf.arquivadaEm && Date.now() - Date.parse(tf.arquivadaEm) > 120 * 864e5) { soltaDoHub(tf); delete db.tarefas[tf.id]; mexeu = true; }
    }
    if (mexeu) saveDb();
  }

  /**
   * v3.89: a copy de UM post, sem precisar da tarefa (o documento e a tela "Pra aprovar" usam): a Elis manda pra
   * aprovação; o ADMIN aprova, pede alteração (com nota) ou desfaz. Mesmo formato de slot.aprov.c da tarefa.
   */
  async function copyDoPost(req, res, sid) {
    const s = db.slots.find(x => x.id === sid);
    if (!s) return json(res, 404, { erro: 'post não encontrado' }), true;
    const b = await readBody(req);
    const acao = String(b.acao || '');
    const quem = req.eu ? req.eu.nome : limpaNome(b.quem);
    if (!quem) return json(res, 400, { erro: 'preencha o seu perfil (nome) antes' }), true;
    const a = (s.aprov && s.aprov.c) || null, agora = new Date().toISOString();
    const grava = (desc, novo) => {
      undoSlots(desc, [s]);
      s.aprov = Object.assign({}, s.aprov, { c: novo }); saveDb();
      return json(res, 200, { ok: true, aprov: novo }), true;
    };
    if (acao === 'enviar') {
      if (a && a.st === 'aprovado') return json(res, 409, { erro: 'esta copy já foi aprovada' }), true;
      if (a && a.st === 'enviado') return json(res, 409, { erro: 'esta copy já está em aprovação' }), true;
      const d = s.docId && db.docs ? db.docs[s.docId] : null;
      if (!d || d.excluido || !(d.palavras > 0) || lerRoteiro(htmlParaTexto(d.html)).vazio) return json(res, 400, { erro: 'o documento da copy ainda está vazio' }), true;
      const novo = { st: 'enviado', em: agora, por: quem };
      const pedido = a && a.st === 'alterar' ? a.nota : a && a.pedido;   // o que tinha sido pedido fica visível na revisão
      if (pedido) novo.pedido = pedido;
      return grava('mandar a copy pra aprovação', novo);
    }
    if (!['aprovar', 'alterar', 'reabrir'].includes(acao)) return json(res, 400, { erro: 'ação inválida' }), true;
    if (req.eu && req.eu.papel !== 'admin') return json(res, 403, { erro: 'só ADMIN (Zion ou Maria) aprova ou pede alteração' }), true;
    if (acao === 'aprovar') {
      if (!a || a.st !== 'enviado') return json(res, 400, { erro: 'esta copy não está esperando aprovação' }), true;
      return grava('aprovar a copy', Object.assign({}, a, { st: 'aprovado', ap: quem, apEm: agora }));
    }
    if (acao === 'alterar') {
      if (!a || (a.st !== 'enviado' && a.st !== 'aprovado')) return json(res, 400, { erro: 'esta copy não está em aprovação' }), true;
      const nota = String(b.nota || '').replace(/\s+/g, ' ').trim().slice(0, 500);
      if (!nota) return json(res, 400, { erro: 'escreva o que precisa mudar' }), true;
      return grava('pedir alteração na copy', Object.assign({}, a, { st: 'alterar', ap: quem, apEm: agora, nota }));
    }
    if (!a || (a.st !== 'aprovado' && a.st !== 'alterar')) return json(res, 400, { erro: 'nada pra desfazer' }), true;
    const x = Object.assign({}, a, { st: 'enviado' }); delete x.ap; delete x.apEm; delete x.nota;
    return grava('desfazer a aprovação da copy', x);
  }

  async function rota(req, res, p) {
    const mc = p.match(/^\/api\/slots\/([a-z0-9]+)\/copy$/i);          // v3.89
    if (mc) return req.method === 'POST' ? copyDoPost(req, res, mc[1]) : false;
    if (!p.startsWith('/api/tarefas')) return false;

    if (p === '/api/tarefas' && req.method === 'GET') return json(res, 200, { tarefas: publicas() }), true;

    if (p === '/api/tarefas' && req.method === 'POST') {
      const b = await readBody(req);
      if (!('por' in b) && req.eu) b.por = req.eu.nome;           // v3.90: com login, sem dizer quem faz = quem criou
      const v = valida(b);
      if (v.erro) return json(res, v.conflito ? 409 : 400, { erro: v.erro, conflito: v.conflito || null }), true;
      const id = 't' + crypto.randomBytes(4).toString('hex');
      db.tarefas[id] = { id, ...v, criadaEm: new Date().toISOString(), seg: 0 };
      // v4.00: a tarefa de copy guarda as contas escolhidas (sem dizer: todas da empresa; a do relógio de um post: nenhuma)
      if (v.tipo === 'copy') db.tarefas[id].contas = b.semCards ? [] : contasDaTarefa(b.contas, v.aba);
      // v3.88: a tarefa de matriz cria os cards amarelos dos dias dela (o relógio de um card sem tarefa pede semCards)
      const cards = v.tipo === 'matriz' && !b.semCards ? criaCards(db.tarefas[id]).length : 0;
      // v4.00: a de copy cria o post DD_MM de cada dia sem post, em cada conta escolhida
      const posts = v.tipo === 'copy' ? criaPosts(db.tarefas[id]).length : 0;
      saveDb();
      return json(res, 200, { ok: true, tarefa: publicas().find(t => t.id === id), cards, posts }), true;
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
      const mudouPer = v.de !== tf.de || v.ate !== tf.ate;
      Object.assign(tf, { de: v.de, ate: v.ate, por: v.por });
      const cards = tf.tipo === 'matriz' && mudouPer ? criaCards(tf).length : 0;     // v3.88: dia novo no período ganha card
      const posts = tf.tipo === 'copy' && mudouPer ? criaPosts(tf).length : 0;        // v4.00: e na de copy, o post DD_MM
      saveDb();
      return json(res, 200, { ok: true, tarefa: publicas().find(t => t.id === tf.id), cards, posts }), true;
    }
    if (!acao && req.method === 'DELETE') {
      const soltos = soltaDoHub(tf);                        // v3.85: sem trava; o que estava no Hub sem aprovação volta pra mandar de novo
      const cardsRemovidos = tf.tipo === 'matriz' ? limpaCards(tf) : 0;   // v3.88: os cards vazios que ela criou saem junto
      const postsRemovidos = tf.tipo === 'copy' ? limpaPosts(tf) : 0;      // v4.00: e os posts DD_MM que ninguém mexeu
      delete db.tarefas[tf.id]; saveDb();                 // o tempo dela continua nas somas do relógio
      return json(res, 200, { ok: true, soltos, cardsRemovidos, postsRemovidos }), true;
    }
    if (req.method !== 'POST') return false;
    const b = await readBody(req);

    if (acao === 'arquivar' || acao === 'desarquivar') {
      if (req.eu && req.eu.papel !== 'admin') return json(res, 403, { erro: 'só ADMIN (Zion ou Maria) conclui a tarefa' }), true;   // v3.88
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
    // v3.88: a matriz não passa mais por aprovação (só a copy)
    if (tf.tipo === 'matriz' && ['enviar', 'aprovar', 'alterar', 'reabrir'].includes(acao))
      return json(res, 400, { erro: 'a matriz não passa mais por aprovação: só a copy é aprovada' }), true;
    const k = K(tf), agora = new Date().toISOString();
    const daTarefa = new Map(itens(tf).map(s => [s.id, s]));
    const alvo = ids => (Array.isArray(ids) ? ids : [ids]).map(id => daTarefa.get(String(id))).filter(Boolean);
    const nome = k === 'm' ? 'matriz' : 'copy';

    // v3.84: o que já está no MKT Hub é aprovado (ou volta pra alterar) lá, e vai de novo pelo botão do Hub
    const msgHub = l => 'a aprovação ' + (l.length > 1 ? 'desses posts' : 'desse post') + ' é no MKT Hub, na tarefa mãe' + (l[0].aprov[k].sub ? ' (subtarefa ' + l[0].aprov[k].sub + ')' : '');
    // ela manda pra aprovação (os posts marcados)
    if (acao === 'enviar') {
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
