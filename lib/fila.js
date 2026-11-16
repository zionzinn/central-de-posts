'use strict';
/**
 * v4.29: a fila de mensagens pro Ultron. O B.O.N.E não fala com WhatsApp nem com o SSB: o que precisa sair fora dele
 * entra aqui e o Ultron (tarefa agendada no PC do Zion, com o Chrome logado) lê, manda e marca enviado ou falhou.
 *
 * db.filaMsgs = [{ id, chave, canal: 'whatsapp' | 'whatsapp_grupo' | 'ssb', para, texto, cap?, criadoEm, enviarApos,
 *   st: 'pendente' | 'enviado' | 'falhou', enviadoEm?, erro?, tentativas }]
 * Toda mensagem começa com "🤖 Ultron:" e nunca leva travessão. A mesma chave não entra duas vezes.
 * Guarda as 300 últimas; enviada há mais de 7 dias sai.
 */
const crypto = require('crypto');
const CANAIS = ['whatsapp', 'whatsapp_grupo', 'ssb'];

module.exports = function criarFila({ db, saveDb, readBody, json }) {
  if (!Array.isArray(db.filaMsgs)) db.filaMsgs = [];
  const limpa = t => {
    let s = String(t || '').replace(/[—–]/g, ',').replace(/\r\n?/g, '\n').trim().slice(0, 3000);
    if (!s.startsWith('🤖 Ultron:')) s = '🤖 Ultron: ' + s;
    return s;
  };
  function poe(m) {
    if (!CANAIS.includes(m.canal) || !m.texto) return null;
    if (m.chave && db.filaMsgs.some(x => x.chave === m.chave)) return null;
    const agora = new Date().toISOString();
    const n = { id: 'm' + crypto.randomBytes(5).toString('hex'), chave: String(m.chave || '').slice(0, 300), canal: m.canal, para: String(m.para || '').slice(0, 80),
      texto: limpa(m.texto), ...(m.cap ? { cap: m.cap } : {}), criadoEm: agora, enviarApos: m.enviarApos || agora, st: 'pendente', tentativas: 0 };
    db.filaMsgs.push(n);
    const lim = Date.now() - 7 * 864e5;
    db.filaMsgs = db.filaMsgs.filter(x => !(x.st === 'enviado' && Date.parse(x.enviadoEm || x.criadoEm) < lim)).slice(-300);
    saveDb();
    return n;
  }
  const pode = req => !req.eu || req.eu.papel === 'admin' || req.eu.papel === 'ultron';
  async function rota(req, res, p) {
    if (p === '/api/ultron/fila' && req.method === 'GET') {
      if (!pode(req)) return json(res, 403, { erro: 'só o Ultron ou ADMIN' }), true;
      const u = new URL(req.url, 'http://x'), st = u.searchParams.get('st') || 'pendente', agora = new Date().toISOString();
      const l = db.filaMsgs.filter(m => (st === 'todas' || m.st === st) && (st !== 'pendente' || m.enviarApos <= agora));
      return json(res, 200, { mensagens: l }), true;
    }
    const m = p.match(/^\/api\/ultron\/fila\/(m[0-9a-f]{10})$/);
    if (m && req.method === 'POST') {
      if (!pode(req)) return json(res, 403, { erro: 'só o Ultron ou ADMIN' }), true;
      const msg = db.filaMsgs.find(x => x.id === m[1]);
      if (!msg) return json(res, 404, { erro: 'mensagem não encontrada' }), true;
      const b = await readBody(req), st = String(b.st || '');
      if (!['enviado', 'falhou', 'pendente'].includes(st)) return json(res, 400, { erro: 'st: enviado, falhou ou pendente' }), true;
      if (msg.st === 'enviado' && st !== 'enviado') return json(res, 409, { erro: 'mensagem já enviada' }), true;
      msg.st = st; msg.tentativas = (msg.tentativas || 0) + (st === 'enviado' ? 0 : 1);
      if (st === 'enviado') { msg.enviadoEm = new Date().toISOString(); delete msg.erro; }
      else if (st === 'falhou') msg.erro = String(b.erro || 'sem detalhe').slice(0, 300);
      saveDb();
      return json(res, 200, { ok: true, mensagem: msg }), true;
    }
    return false;
  }
  rota.poe = poe;
  return rota;
};
