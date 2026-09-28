// Banco de cada empresa (v3.83). Pedido do Zion em 28/09/2026: "preciso mudar o jeito que é o banco hoje em dia.
// remover tudo e adicionar", com as seções de cada empresa:
//   SeuBoné: Reutilizar, Drive de conteúdos, Referência de posts
//   Carbone e Weevo: Cortes de podcasts, Drive de conteúdos, Referência de posts
//   Onevo: Drive de conteúdos, Referência de posts
// Cada item é um link + um texto (o que é). Arrastar o item pro dia cria o post com o link já no campo certo.
// Decisão do Zion: Reutilizar SAI do banco quando vira post (é 1 pra 1); Drive, Referência e Cortes FICAM, contam
// quantas vezes viraram post e saem no Concluído. Tudo desfaz com Ctrl+Z (a pilha é a do servidor).
// Mora em db.banco (vai no data.json, que no Render sobe inteiro pro GitHub): ~200 bytes por item.
'use strict';
const crypto = require('crypto');

const SECOES = {
  'SEUBONÉ': ['reutilizar', 'drive', 'referencia'],
  'CARBONE': ['cortes', 'drive', 'referencia'],
  'WEEVO': ['cortes', 'drive', 'referencia'],
  'ONEVO': ['drive', 'referencia'],
};
const SAI_AO_USAR = new Set(['reutilizar']);
const TITULO_OBRIGATORIO = new Set(['drive']);            // "links do Drive + título do que é"
const MAX_POR_SECAO = 200;                                 // cada item pesa no data.json de todo envio pro GitHub
const limpaTexto = t => String(t || '').replace(/[<>]/g, '').replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 140);
const chaveUrl = u => String(u || '').trim().replace(/^https?:\/\/(www\.)?/i, '').replace(/[?#].*$/, '').replace(/\/+$/, '').toLowerCase();

module.exports = function criarBanco(ctx) {
  const { db, saveDb, readBody, json, pushUndo, montaSlot } = ctx;
  if (!Array.isArray(db.banco)) db.banco = [];

  const copia = o => JSON.parse(JSON.stringify(o));
  const acha = id => db.banco.findIndex(x => x.id === id);
  function urlOk(u) { return /^https?:\/\/\S+$/i.test(u) && u.length <= 1000; }

  /** O post que nasce de um item (o link vai no campo "Drive / referência" do post, que abre pela folha). */
  function postDoItem(it, conta, date) {
    const b = { conta, date, drive: it.url, titulo: null, obs: '', formato: '' };
    if (it.sec === 'reutilizar') { b.titulo = 'Reutilizar' + (it.titulo ? ': ' + it.titulo : ''); }
    else if (it.sec === 'drive') { b.titulo = it.titulo || null; }
    else if (it.sec === 'cortes') { b.titulo = it.titulo || 'Corte de podcast'; b.formato = 'corte de podcast'; }
    else if (it.sec === 'referencia') { b.titulo = it.titulo || null; }
    return b;
  }

  async function rota(req, res, p) {
    if (!p.startsWith('/api/banco')) return false;
    const quem = req.eu ? req.eu.nome : '';

    // guardar um link numa seção
    if (p === '/api/banco' && req.method === 'POST') {
      const b = await readBody(req);
      const aba = String(b.aba || ''), sec = String(b.sec || '');
      if (!SECOES[aba]) return json(res, 400, { erro: 'empresa inválida' }), true;
      if (!SECOES[aba].includes(sec)) return json(res, 400, { erro: 'essa seção não existe no banco dessa empresa' }), true;
      const url = String(b.url || '').trim();
      if (!urlOk(url)) return json(res, 400, { erro: 'cole um link válido (começa com https://)' }), true;
      const titulo = limpaTexto(b.titulo);
      if (TITULO_OBRIGATORIO.has(sec) && !titulo) return json(res, 400, { erro: 'diga o que é esse conteúdo do Drive' }), true;
      const daSecao = db.banco.filter(x => x.aba === aba && x.sec === sec);
      const igual = daSecao.find(x => chaveUrl(x.url) === chaveUrl(url));
      if (igual) return json(res, 409, { erro: 'esse link já está nessa seção' + (igual.titulo ? ' ("' + igual.titulo + '")' : ''), id: igual.id }), true;
      if (daSecao.length >= MAX_POR_SECAO) return json(res, 400, { erro: 'essa seção já tem ' + MAX_POR_SECAO + ' links: conclua os que já foram usados' }), true;
      const it = { id: 'b' + crypto.randomBytes(4).toString('hex'), aba, sec, url, titulo, usos: 0, criadoEm: new Date().toISOString(), por: quem };
      db.banco.unshift(it);
      pushUndo({ tipo: 'banco', desc: 'guardar no banco', antes: [], criados: [it.id], slots: [] });
      saveDb();
      return json(res, 200, { ok: true, item: it }), true;
    }

    const m = p.match(/^\/api\/banco\/(b[0-9a-f]{8})(\/usar)?$/);
    if (!m) return json(res, 404, { erro: 'rota do banco não existe' }), true;
    const i = acha(m[1]);
    if (i < 0) return json(res, 404, { erro: 'esse item não está mais no banco' }), true;
    const it = db.banco[i];

    // arrastou pro dia: vira post (Reutilizar sai do banco; o resto fica e conta o uso)
    if (m[2] && req.method === 'POST') {
      const b = await readBody(req);
      const conta = String(b.conta || ''), date = String(b.date || '');
      if (!db.contas[conta] || db.contas[conta].aba !== it.aba) return json(res, 400, { erro: 'escolha uma conta da ' + it.aba }), true;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json(res, 400, { erro: 'dia inválido' }), true;
      const slot = montaSlot(postDoItem(it, conta, date));
      const antes = [{ item: copia(it), pos: i }];
      db.slots.push(slot);
      const saiu = SAI_AO_USAR.has(it.sec);
      if (saiu) db.banco.splice(i, 1);
      else { it.usos = (it.usos || 0) + 1; it.usadoEm = new Date().toISOString(); }
      pushUndo({ tipo: 'banco', desc: 'post do banco', antes, criados: [], slots: [slot.id] });
      saveDb();
      return json(res, 200, { ok: true, slot, item: saiu ? null : it, saiu }), true;
    }
    // corrigir o link ou o texto
    if (!m[2] && req.method === 'PATCH') {
      const b = await readBody(req);
      const antes = [{ item: copia(it), pos: i }];
      if ('url' in b) {
        const url = String(b.url || '').trim();
        if (!urlOk(url)) return json(res, 400, { erro: 'cole um link válido (começa com https://)' }), true;
        const igual = db.banco.find(x => x.id !== it.id && x.aba === it.aba && x.sec === it.sec && chaveUrl(x.url) === chaveUrl(url));
        if (igual) return json(res, 409, { erro: 'esse link já está nessa seção', id: igual.id }), true;
        it.url = url;
      }
      if ('titulo' in b) {
        const titulo = limpaTexto(b.titulo);
        if (TITULO_OBRIGATORIO.has(it.sec) && !titulo) return json(res, 400, { erro: 'diga o que é esse conteúdo do Drive' }), true;
        it.titulo = titulo;
      }
      pushUndo({ tipo: 'banco', desc: 'editar item do banco', antes, criados: [], slots: [] });
      saveDb();
      return json(res, 200, { ok: true, item: it }), true;
    }
    // Concluído (ou excluir): sai do banco
    if (!m[2] && req.method === 'DELETE') {
      pushUndo({ tipo: 'banco', desc: 'tirar do banco', antes: [{ item: copia(it), pos: i }], criados: [], slots: [] });
      db.banco.splice(i, 1);
      saveDb();
      return json(res, 200, { ok: true }), true;
    }
    return json(res, 405, { erro: 'método não aceito' }), true;
  }

  /** Ctrl+Z de uma ação do banco (chamado pelo /api/undo do servidor). */
  rota.desfaz = e => {
    for (const id of e.slots || []) db.slots = db.slots.filter(s => s.id !== id);
    for (const id of e.criados || []) db.banco = db.banco.filter(x => x.id !== id);
    for (const { item, pos } of e.antes || []) {
      const j = acha(item.id);
      if (j >= 0) db.banco[j] = item; else db.banco.splice(Math.min(pos, db.banco.length), 0, item);
    }
    saveDb();
  };

  /**
   * Uma vez só (v3.83): o banco antigo sai ("remover tudo", pedido do Zion). Referências gerais e os posts sem dia
   * que eram do banco antigo (Reutilizáveis da planilha, Criativos e as categorias da Carbone) ficam 30 dias em
   * db.removidosV383 (dá pra devolver) e no backup; os posts sem dia comuns continuam, na seção Sem dia.
   */
  rota.migra = (backupAgora, log) => {
    if (!db.migracoes || typeof db.migracoes !== 'object') db.migracoes = {};
    if (db.removidosV383 && Date.now() > Date.parse(db.removidosV383.ate || 0)) { delete db.removidosV383; saveDb(); }
    if (db.migracoes.v383) return;
    const refs = Array.isArray(db.referencias) ? db.referencias : [];
    const velhos = db.slots.filter(s => !s.date && (s.origem === 'banco' || s.origem === 'criativo'));
    if (refs.length || velhos.length) {
      backupAgora('antes do banco novo v3.83');
      db.removidosV383 = {
        em: new Date().toISOString(), ate: new Date(Date.now() + 30 * 864e5).toISOString(),
        motivo: 'banco antigo (pedido do Zion em 28/09/2026: remover tudo e criar as seções novas de cada empresa)',
        referencias: refs, slots: velhos.map(copia),
      };
      const fora = new Set(velhos.map(s => s.id));
      db.slots = db.slots.filter(s => !fora.has(s.id));
    }
    delete db.referencias;
    db.migracoes.v383 = { em: new Date().toISOString(), referencias: refs.length, slots: velhos.length };
    saveDb();
    log('[v3.83] banco novo: ' + (refs.length || velhos.length ? refs.length + ' referência(s) e ' + velhos.length + ' post(s) do banco antigo guardados 30 dias em removidosV383' : 'o banco antigo estava vazio'));
  };
  return rota;
};
module.exports.SECOES = SECOES;
