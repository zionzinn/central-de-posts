'use strict';
/**
 * v4.28: Web Push sem npm (RFC 8030 + 8291 aes128gcm + 8292 VAPID ES256), só com o crypto e o https do Node.
 *
 * As chaves VAPID vêm do Render (variáveis VAPID_PUBLICA, VAPID_PRIVADA e VAPID_EMAIL), geradas no PC do Zion pelo
 * `gerar-vapid.js` (a privada nunca passa pelo chat nem pelo git). Sem elas o push fica desligado e o resto funciona.
 *
 * db.pushSubs = [{ id, user, nome, endpoint, keys: { p256dh, auth }, em, ua, falhas }] (um por aparelho). O serviço de push
 * respondeu 404 ou 410: a assinatura morreu e sai da lista.
 */
const crypto = require('crypto');
const https = require('https'), http = require('http');

const b64u = b => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const deB64u = s => Buffer.from(String(s || '').replace(/-/g, '+').replace(/_/g, '/'), 'base64');

function chaves() {
  const pub = String(process.env.VAPID_PUBLICA || '').trim(), pri = String(process.env.VAPID_PRIVADA || '').trim();
  const email = String(process.env.VAPID_EMAIL || 'mailto:zion.bagatoli@seubone.com').trim();
  if (!pub || !pri) return null;
  const P = deB64u(pub), d = deB64u(pri);
  if (P.length !== 65 || P[0] !== 4 || d.length !== 32) return { erro: 'VAPID_PUBLICA ou VAPID_PRIVADA em formato errado (rode o gerar-vapid.js de novo)' };
  try {
    const key = crypto.createPrivateKey({ key: { kty: 'EC', crv: 'P-256', d: b64u(d), x: b64u(P.subarray(1, 33)), y: b64u(P.subarray(33, 65)) }, format: 'jwk' });
    return { pub, key, email: /^mailto:|^https:/.test(email) ? email : 'mailto:' + email };
  } catch (e) { return { erro: 'chave VAPID inválida: ' + e.message }; }
}
/** O JWT do VAPID (ES256), um por origem do serviço de push, vale 12 h. */
function jwt(k, aud) {
  const h = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const c = b64u(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: k.email }));
  const sig = crypto.sign('sha256', Buffer.from(h + '.' + c), { key: k.key, dsaEncoding: 'ieee-p1363' });
  return h + '.' + c + '.' + b64u(sig);
}
/** Cifra a mensagem pro aparelho (aes128gcm, um registro só). */
function cifra(sub, texto) {
  const ua = deB64u(sub.keys.p256dh), auth = deB64u(sub.keys.auth);
  if (ua.length !== 65 || auth.length < 16) throw new Error('chaves da assinatura inválidas');
  const ecdh = crypto.createECDH('prime256v1'); ecdh.generateKeys();
  const as = ecdh.getPublicKey(), seg = ecdh.computeSecret(ua);
  const ikm = Buffer.from(crypto.hkdfSync('sha256', seg, auth, Buffer.concat([Buffer.from('WebPush: info\0'), ua, as]), 32));
  const sal = crypto.randomBytes(16);
  const cek = Buffer.from(crypto.hkdfSync('sha256', ikm, sal, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(crypto.hkdfSync('sha256', ikm, sal, Buffer.from('Content-Encoding: nonce\0'), 12));
  const c = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const ct = Buffer.concat([c.update(Buffer.concat([Buffer.from(texto, 'utf8'), Buffer.from([2])])), c.final(), c.getAuthTag()]);
  const rs = Buffer.alloc(4); rs.writeUInt32BE(4096);
  return Buffer.concat([sal, rs, Buffer.from([as.length]), as, ct]);
}
/** Manda um push. Devolve { ok, st } ou { morta: true } (404/410) ou { erro }. */
function envia(k, sub, dados, opts = {}) {
  return new Promise(resolve => {
    let u, corpo;
    try { u = new URL(sub.endpoint); corpo = cifra(sub, JSON.stringify(dados)); } catch (e) { return resolve({ erro: e.message }); }
    const mod = u.protocol === 'http:' ? http : https;
    const req = mod.request(u, { method: 'POST', timeout: 15000, headers: {
      TTL: String(opts.ttl || 3600), Urgency: opts.urgente ? 'high' : 'normal', 'Content-Type': 'application/octet-stream', 'Content-Encoding': 'aes128gcm',
      'Content-Length': corpo.length, Authorization: 'vapid t=' + jwt(k, u.origin) + ', k=' + k.pub,
      ...(opts.topico ? { Topic: String(opts.topico).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32) } : {}) } }, res => {
      res.resume();
      const st = res.statusCode;
      resolve(st === 404 || st === 410 ? { morta: true, st } : st >= 200 && st < 300 ? { ok: true, st } : { erro: 'serviço de push respondeu ' + st, st });
    });
    req.on('timeout', () => req.destroy(new Error('sem resposta do serviço de push')));
    req.on('error', e => resolve({ erro: e.message }));
    req.end(corpo);
  });
}

module.exports = function criarPush(ctx) {
  const { db, saveDb, readBody, json } = ctx;
  if (!Array.isArray(db.pushSubs)) db.pushSubs = [];
  let K = chaves();
  if (K && K.erro) console.error('[push] ' + K.erro);
  const ligado = () => !!(K && !K.erro);
  const quemSou = req => (req.eu ? req.eu.id : 'local');
  /** Manda pra todos os aparelhos de uma pessoa (id do login). Tira as assinaturas mortas. */
  async function paraUser(user, dados, opts) {
    if (!ligado()) return { enviados: 0, desligado: true };
    const subs = db.pushSubs.filter(s => s.user === user);
    let enviados = 0, mortas = 0; const erros = [];
    for (const s of subs) {
      const r = await envia(K, s, dados, opts);
      if (r.ok) { enviados++; s.falhas = 0; }
      else if (r.morta) { mortas++; db.pushSubs = db.pushSubs.filter(x => x !== s); }
      else { erros.push(r.erro); s.falhas = (s.falhas || 0) + 1; if (s.falhas >= 20) db.pushSubs = db.pushSubs.filter(x => x !== s); }
    }
    if (mortas || erros.length) saveDb();
    return { enviados, aparelhos: subs.length, mortas, erros };
  }
  async function rota(req, res, p) {
    if (p === '/api/push/chave' && req.method === 'GET') {
      const eu = quemSou(req);
      return json(res, 200, { ligado: ligado(), chave: ligado() ? K.pub : '', erro: K && K.erro ? 'push desligado: chave VAPID com problema' : '', meus: db.pushSubs.filter(s => s.user === eu).length,
        silencio: Object.keys((db.pushSilencio || {})[eu] || {}) }), true;
    }
    // silenciar os lembretes de um evento (só pra mim; a escalada pro Zion continua)
    if (p === '/api/push/silencio' && req.method === 'POST') {
      const b = await readBody(req), eu = quemSou(req), id = String(b.cap || '');
      if (!/^ca[0-9a-f]{8}$/.test(id) || !(db.captacoes || {})[id]) return json(res, 400, { erro: 'evento não encontrado' }), true;
      db.pushSilencio = db.pushSilencio || {}; db.pushSilencio[eu] = db.pushSilencio[eu] || {};
      if (b.on) db.pushSilencio[eu][id] = true; else delete db.pushSilencio[eu][id];
      if (!Object.keys(db.pushSilencio[eu]).length) delete db.pushSilencio[eu];
      saveDb();
      return json(res, 200, { ok: true, silencio: Object.keys(db.pushSilencio[eu] || {}) }), true;
    }
    if (p === '/api/push/assina' && req.method === 'POST') {
      if (!ligado()) return json(res, 400, { erro: 'os lembretes no celular ainda não foram ligados no servidor' }), true;
      const b = await readBody(req), s = b && b.sub;
      const ep = s && String(s.endpoint || '');
      if (!/^https:\/\//.test(ep) && !(process.env.PUSH_TESTE && /^http:\/\/localhost/.test(ep))) return json(res, 400, { erro: 'assinatura inválida' }), true;
      if (!s.keys || deB64u(s.keys.p256dh).length !== 65 || deB64u(s.keys.auth).length < 16) return json(res, 400, { erro: 'assinatura sem chaves' }), true;
      const user = quemSou(req), nome = req.eu ? req.eu.nome : 'PC local';
      db.pushSubs = db.pushSubs.filter(x => x.endpoint !== ep);
      db.pushSubs.push({ id: crypto.randomBytes(4).toString('hex'), user, nome, endpoint: ep.slice(0, 1000), keys: { p256dh: String(s.keys.p256dh).slice(0, 200), auth: String(s.keys.auth).slice(0, 100) },
        em: new Date().toISOString(), ua: String(req.headers['user-agent'] || '').slice(0, 160), falhas: 0 });
      if (db.pushSubs.length > 200) db.pushSubs = db.pushSubs.slice(-200);
      saveDb();
      return json(res, 200, { ok: true, meus: db.pushSubs.filter(x => x.user === user).length }), true;
    }
    if (p === '/api/push/sai' && req.method === 'POST') {
      const b = await readBody(req), user = quemSou(req), antes = db.pushSubs.length;
      db.pushSubs = db.pushSubs.filter(x => !(x.endpoint === String(b.endpoint || '') && x.user === user));
      if (db.pushSubs.length !== antes) saveDb();
      return json(res, 200, { ok: true }), true;
    }
    // o teste: manda pros MEUS aparelhos (o ADMIN pode mandar pra uma pessoa: { para: 'richard' })
    if (p === '/api/push/teste' && req.method === 'POST') {
      if (!ligado()) return json(res, 400, { erro: 'push desligado' }), true;
      const b = await readBody(req), admin = !req.eu || req.eu.papel === 'admin';
      const user = b.para && admin ? String(b.para) : quemSou(req);
      const r = await paraUser(user, { titulo: 'B.O.N.E', corpo: 'Teste: os lembretes estão chegando neste aparelho.', tag: 'teste', url: '/' }, { ttl: 300 });
      return json(res, 200, Object.assign({ ok: true }, r)), true;
    }
    return false;
  }
  rota.paraUser = paraUser;
  rota.ligado = ligado;
  rota._recarrega = () => { K = chaves(); };   // testes
  return rota;
};
module.exports.cifra = cifra;
module.exports.jwt = jwt;
