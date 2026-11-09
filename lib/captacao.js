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
// Dados (regra 11): db.captacoes = { id: { id, taskId, taskUrl, titulo, doc?, dias: [{ d, h }], roteiros: [{ id, n, g, t? }],
// posts: [ids], nota, em, por } }, ~150 bytes + ~40 por roteiro, opcional. O quadro antigo (db.capBlocos e
// slot.capBloco) sai uma vez só, com backup antes, sem converter nada (escolha do Zion: "Começar do zero").
// =====================================================================
'use strict';
const crypto = require('crypto');
const { pecaDoPost } = require('./peca.js');

const MAX_DIAS = 10, MAX_ROT = 40, MAX_POSTS = 40, MAX_TEXTO = 8000;   // v4.16: o roteiro completo, até ~8 mil letras

module.exports = function criarCaptacao(ctx) {
  const { db, saveDb, readBody, json, soAdmin, hub, pushUndo, backupAgora } = ctx;
  if (!db.captacoes || typeof db.captacoes !== 'object' || Array.isArray(db.captacoes)) db.captacoes = {};
  const caps = () => db.captacoes;
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
    return {
      id: c.id, taskId: c.taskId || null, taskUrl: c.taskUrl || '', titulo: c.titulo || '', nota: c.nota || '',
      dias: (c.dias || []).map(x => ({ d: x.d, h: x.h || '' })),
      doc: c.doc || '',   // v4.16: o doc dos roteiros (um só pra captação, escolha do Zion)
      roteiros: (c.roteiros || []).map(r => Object.assign({ id: r.id, n: r.n, g: r.g || '', tt: r.t ? r.t.length : 0 }, completo ? { t: r.t || '' } : {})),
      posts: (c.posts || []).filter(id => porId.has(id)), em: c.em, por: c.por || '',
      hub: t ? { codigo: t.codigo || '', url: t.url || c.taskUrl || '', titulo: t.titulo || '', st: t.st || '', resp: t.resp || '', prazo: t.prazo || null,
        etapa: t.etapa ? { nome: t.etapa.nome || '', cor: t.etapa.cor || '#8E8E93' } : null, empresa: t.empresa ? (t.empresa.nome || '') : '' } : null,
      aba: abaDe(c, t, porId),
    };
  }
  const publicos = () => { const porId = slotPor(); return Object.values(caps()).map(c => publico(c, porId)); };
  /** O post está ligado a alguma captação? (a limpeza das tarefas não leva post ligado) */
  const temPost = sid => Object.values(caps()).some(c => (c.posts || []).includes(sid));
  // a task de edição já passou da edição (em aprovação, ajustar ou pronta): a captação ficou pra trás
  const EDITADO = new Set(['aprovar', 'aprovação líder', 'revisão solicitada', 'alterar', 'publicar', 'completo', 'banco de criativos']);
  /** Vídeos que saem nos próximos 14 dias sem captação ligada (o número do botão Captação, só pro ADMIN). */
  function pendentes() {
    const hoje = hojeBRT(), ate = soma(hoje, 14), ligados = new Set();
    for (const c of Object.values(caps())) for (const id of c.posts || []) ligados.add(id);
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
    if ('nota' in b) c.nota = String(b.nota || '').replace(/[ \t]+/g, ' ').trim().slice(0, 500);
    // v4.16: o doc dos roteiros (o link; vazio tira)
    if ('doc' in b) {
      const d = String(b.doc || '').trim();
      if (d && !urlOk(d)) return { erro: 'o link do doc precisa começar com http' };
      if (urlOk(d)) c.doc = urlOk(d); else delete c.doc;
    }
    if ('dias' in b) {
      if (!Array.isArray(b.dias) || b.dias.length > MAX_DIAS) return { erro: 'dias inválidos (até ' + MAX_DIAS + ')' };
      const vistos = new Set(), dias = [];
      for (const x of b.dias) {
        const d = x && x.d, h = String((x && x.h) || '');
        if (!dataOk(d)) return { erro: 'dia inválido' };
        if (!horaOk(h)) return { erro: 'horário inválido' };
        if (vistos.has(d)) return { erro: 'esse dia já está na captação' };
        vistos.add(d); dias.push({ d, h });
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
    for (const c of e.antes || []) caps()[c.id] = copia(c);
    muda(); saveDb();
  }
  const quem = (req, b) => linha((req.eu && req.eu.nome) || (b && b.por) || '', 40);

  async function rota(req, res, p) {
    if (p === '/api/captacao' && req.method === 'GET') return json(res, 200, { captacoes: publicos(), pendentes: pendentes() }), true;
    if (p === '/api/captacao' && req.method === 'POST') {
      if (soAdmin(req, res)) return true;
      const b = await readBody(req);
      if (b.dia !== null && b.dia !== undefined && b.dia !== '' && !dataOk(b.dia)) return json(res, 400, { erro: 'dia inválido' }), true;
      const c = { id: 'ca' + crypto.randomBytes(4).toString('hex'), taskId: null, taskUrl: '', titulo: linha(b.titulo, 120),
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
        : 'link' in b ? 'trocar a task' : 'titulo' in b ? 'mudar o nome da captação' : 'nota' in b ? 'mudar a nota' : 'doc' in b ? 'mudar o doc dos roteiros' : 'editar captação';
      pushUndo({ tipo: 'captacoes', desc, antes: [copia(caps()[atual.id])], criados: [] });
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
  return rota;
};
