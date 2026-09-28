// Login pelo Zoho (v3.82). Pedido do Zion em 27/09/2026: a tela de entrada só tem "Entrar com o Zoho" e o
// painel sabe quem é cada um pela conta da empresa. Usa o "Sign in using Zoho" (OpenID Connect):
//   1) /auth/zoho manda pro Zoho com um "state" aleatório guardado num cookie (contra login forjado)
//   2) o Zoho volta em /auth/zoho/retorno com um código de 2 minutos
//   3) o servidor troca o código pelo id_token direto com o Zoho (conexão TLS do servidor, com o client secret;
//      pela especificação do OpenID, 3.1.3.7, nesse caminho o TLS já garante de quem veio o token) e confere
//      público (client_id), emissor (accounts.zoho.*), validade e e-mail verificado
//   4) o e-mail tem que estar na lista abaixo; aí abre uma sessão assinada de 30 dias (cookie HttpOnly)
// Tudo liga só com ZOHO_CLIENT_ID e ZOHO_CLIENT_SECRET nas variáveis de ambiente (Render). Sem elas (o PC pelo
// INICIAR.bat, por exemplo) o painel segue como antes: senha opcional.
// O segredo nunca vai pro código, pro git nem pro chat.
'use strict';
const crypto = require('crypto');

// Quem entra, com os e-mails de cada um. ADMIN: aprova e pede alteração, vê o tempo de todo mundo e exporta o
// CSV, mexe no GM automático. Usuário: todo o resto do dia a dia e vê o próprio tempo. (Decisão do Zion, 27/09/2026.)
const USUARIOS = [
  { id: 'zion', nome: 'Zion', papel: 'admin', emails: ['zion.bagatoli@seubone.com'] },
  { id: 'maria', nome: 'Maria', papel: 'admin', emails: ['mariaclara@seubone.com'] },
  { id: 'richard', nome: 'Richard', papel: 'usuario', emails: ['richard.oliveira@seubone.com'] },
  { id: 'elis', nome: 'Elis', papel: 'usuario', emails: ['elis.lopes@seubone.com'] },
  { id: 'klenio', nome: 'Klenio', papel: 'usuario', emails: ['klenio.braz@grupoquatro5.com', 'klenio.braz@seubone.com'] },
  { id: 'bia', nome: 'Bia', papel: 'usuario', emails: ['anny.beatriz@grupoquatro5.com', 'anny.beatriz@seubone.com'] },
  { id: 'samuel', nome: 'Samuel', papel: 'usuario', emails: ['samuel.melo@grupoquatro5.com', 'samuel.melo@seubone.com'] },
];
const PORE_EMAIL = new Map();
for (const u of USUARIOS) for (const e of u.emails) PORE_EMAIL.set(e.toLowerCase(), u);
const PORID = new Map(USUARIOS.map(u => [u.id, u]));

const CLIENT_ID = String(process.env.ZOHO_CLIENT_ID || '').trim();
const CLIENT_SECRET = String(process.env.ZOHO_CLIENT_SECRET || '').trim();
const CONTAS = String(process.env.ZOHO_CONTAS || 'https://accounts.zoho.com').replace(/\/+$/, '');
const APP_URL = String(process.env.APP_URL || '').replace(/\/+$/, '');
const SESSAO_DIAS = 30;
const COOKIE = 'sb_sess', COOKIE_ESTADO = 'sb_zst', COOKIE_VOLTA = 'sb_volta';

const b64u = b => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const deB64u = s => Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64');

module.exports = function criarAuth(ctx) {
  const { json, parseCookies, segredo } = ctx;
  const ligado = !!(CLIENT_ID && CLIENT_SECRET);
  // chave das sessões: SB_SECRET se existir; senão uma derivada do client secret do Zoho (fica igual entre
  // reinícios do Render, que apagam o config.json); senão o segredo local do config.json
  const CHAVE = process.env.SB_SECRET ? String(process.env.SB_SECRET)
    : CLIENT_SECRET ? crypto.createHash('sha256').update('bone-sessao|' + CLIENT_SECRET).digest('hex') : segredo;

  const assina = txt => b64u(crypto.createHmac('sha256', CHAVE).update(txt).digest());
  function iguais(a, b) { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); }

  function criaSessao(u, email) {
    const corpo = b64u(JSON.stringify({ u: u.id, e: email, exp: Date.now() + SESSAO_DIAS * 864e5 }));
    return corpo + '.' + assina(corpo);
  }
  /** Quem está logado (ou null). A lista manda: se a pessoa sair da lista, a sessão dela para de valer na hora. */
  function sessao(req) {
    if (!ligado) return null;
    const v = parseCookies(req.headers.cookie)[COOKIE];
    if (!v || v.indexOf('.') < 1) return null;
    const [corpo, sig] = v.split('.');
    if (!iguais(sig, assina(corpo))) return null;
    let d; try { d = JSON.parse(deB64u(corpo).toString('utf8')); } catch (e) { return null; }
    if (!d || !(d.exp > Date.now())) return null;
    const u = PORID.get(d.u);
    if (!u || !u.emails.includes(String(d.e || '').toLowerCase())) return null;
    return { id: u.id, nome: u.nome, papel: u.papel, email: d.e };
  }
  const seguro = req => /^https/i.test(String(req.headers['x-forwarded-proto'] || '')) || /^https:/i.test(APP_URL);
  function cookie(req, nome, valor, maxAge) {
    return nome + '=' + valor + '; HttpOnly; SameSite=Lax; Path=/; Max-Age=' + maxAge + (seguro(req) ? '; Secure' : '');
  }
  function base(req) {
    if (APP_URL) return APP_URL;
    const proto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() || 'http';
    return proto + '://' + req.headers.host;
  }
  const retorno = req => base(req) + '/auth/zoho/retorno';
  /** Pra onde voltar depois do login: só um caminho do próprio painel (nunca outro site, nunca /auth, /login ou /api). */
  function voltaValida(v) {
    const s = String(v || '');
    return s.length <= 400 && /^\/(?![\/\\])[!-~]*$/.test(s) && !s.includes('\\') && !/^\/(auth|login|api)(\/|\?|$)/i.test(s) ? s : '';
  }
  function vai(res, para, cookies) {
    const h = { Location: para, 'Cache-Control': 'no-store' };
    if (cookies) h['Set-Cookie'] = cookies;
    res.writeHead(302, h); res.end();
  }

  /** Troca o código pelo id_token e devolve o e-mail verificado (ou lança um erro com o código pra tela de login). */
  async function emailDoCodigo(req, u) {
    // o Zoho diz em qual centro de dados a conta está; só aceita servidores do próprio Zoho (nunca um endereço qualquer)
    const dc = String(u.searchParams.get('accounts-server') || '');
    const servidor = /^https:\/\/accounts\.zoho\.[a-z.]{2,12}$/i.test(dc) ? dc : CONTAS;
    const corpo = new URLSearchParams({ grant_type: 'authorization_code', client_id: CLIENT_ID, client_secret: CLIENT_SECRET, redirect_uri: retorno(req), code: String(u.searchParams.get('code') || '') });
    let r, j;
    const ctrl = new AbortController(), t = setTimeout(() => ctrl.abort(), 15000);
    try {
      r = await fetch(servidor + '/oauth/v2/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: String(corpo), signal: ctrl.signal });
      j = await r.json().catch(() => ({}));
    } catch (e) { throw Object.assign(new Error('zoho fora do ar: ' + e.message), { codigo: 'zoho' }); }
    finally { clearTimeout(t); }
    if (!r.ok || j.error || !j.id_token) throw Object.assign(new Error('token recusado: ' + (j.error || r.status)), { codigo: 'token' });
    const partes = String(j.id_token).split('.');
    if (partes.length !== 3) throw Object.assign(new Error('id_token inválido'), { codigo: 'token' });
    let d; try { d = JSON.parse(deB64u(partes[1]).toString('utf8')); } catch (e) { throw Object.assign(new Error('id_token ilegível'), { codigo: 'token' }); }
    const aud = Array.isArray(d.aud) ? d.aud : [d.aud];
    if (!aud.includes(CLIENT_ID)) throw Object.assign(new Error('id_token de outro app'), { codigo: 'token' });
    if (!/^(https:\/\/)?accounts\.zoho\.[a-z.]+$/i.test(String(d.iss || ''))) throw Object.assign(new Error('emissor estranho: ' + d.iss), { codigo: 'token' });
    if (!(Number(d.exp) * 1000 > Date.now() - 60e3)) throw Object.assign(new Error('id_token vencido'), { codigo: 'token' });
    if (d.email_verified === false || d.email_verified === 'false') throw Object.assign(new Error('e-mail não verificado no Zoho'), { codigo: 'verificado' });
    const email = String(d.email || '').toLowerCase().trim();
    if (!email) throw Object.assign(new Error('o Zoho não mandou o e-mail'), { codigo: 'token' });
    return email;
  }

  async function rota(req, res, p, u) {
    // começa o login: manda pro Zoho com um state novo
    if (p === '/auth/zoho' && req.method === 'GET') {
      if (!ligado) return vai(res, '/login?erro=desligado'), true;
      const estado = crypto.randomBytes(18).toString('hex');
      const q = new URLSearchParams({ scope: 'openid email profile', client_id: CLIENT_ID, response_type: 'code', redirect_uri: retorno(req), access_type: 'online', state: estado });
      return vai(res, CONTAS + '/oauth/v2/auth?' + q, cookie(req, COOKIE_ESTADO, estado, 600)), true;
    }
    // volta do Zoho
    if (p === '/auth/zoho/retorno' && req.method === 'GET') {
      const limpa = cookie(req, COOKIE_ESTADO, '', 0);
      if (!ligado) return vai(res, '/login?erro=desligado', limpa), true;
      if (u.searchParams.get('error')) return vai(res, '/login?erro=cancelado', limpa), true;
      const esperado = parseCookies(req.headers.cookie)[COOKIE_ESTADO];
      const veio = String(u.searchParams.get('state') || '');
      if (!esperado || !veio || !iguais(esperado, veio)) return vai(res, '/login?erro=estado', limpa), true;
      try {
        const email = await emailDoCodigo(req, u);
        const usuario = PORE_EMAIL.get(email);
        if (!usuario) { console.log('[login] e-mail fora da lista tentou entrar'); return vai(res, '/login?erro=sem-acesso', limpa), true; }
        console.log('[login] ' + usuario.nome + ' entrou pelo Zoho');
        const destino = voltaValida(parseCookies(req.headers.cookie)[COOKIE_VOLTA]) || '/';
        return vai(res, destino, [limpa, cookie(req, COOKIE_VOLTA, '', 0), cookie(req, COOKIE, criaSessao(usuario, email), SESSAO_DIAS * 86400)]), true;
      } catch (e) {
        console.log('[login] ' + e.message);
        return vai(res, '/login?erro=' + (e.codigo || 'token'), limpa), true;
      }
    }
    // quem sou eu (a tela usa pra saber o nome, o papel e se o login do Zoho está ligado)
    if (p === '/api/eu' && req.method === 'GET') {
      const eu = sessao(req);
      return json(res, 200, { zoho: ligado, logado: !!eu, usuario: eu }), true;
    }
    // sair
    if (p === '/api/logout' && req.method === 'POST') {
      res.setHeader('Set-Cookie', [cookie(req, COOKIE, '', 0), 'sb_auth=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0']);
      return json(res, 200, { ok: true, zoho: ligado }), true;
    }
    return false;
  }

  rota.ligado = () => ligado;
  /** Cookie curto (10 min) com a página que a pessoa tentou abrir sem login; null se não vale guardar. */
  rota.lembraVolta = (req, caminho) => { const v = voltaValida(caminho); return v && v !== '/' ? cookie(req, COOKIE_VOLTA, encodeURIComponent(v), 600) : null; };
  rota.sessao = sessao;
  rota.usuarios = () => USUARIOS.map(u => ({ id: u.id, nome: u.nome, papel: u.papel }));
  return rota;
};
module.exports.USUARIOS = USUARIOS;
