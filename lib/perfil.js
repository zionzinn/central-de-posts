// Perfil de cada pessoa (v3.99). Pedido do Zion em 01/10/2026: "vamos tentar montar uma aba perfil mais ou menos
// assim. me de oq podemos colocar de informação e oq pode ter + prints de como vai ficar . ter vários personagens pra
// pessoa escolher"; ele viu a proposta e os prints e mandou fazer ("pode fazer o commit"). O que vale nesta versão:
//   - 12 personagens originais (public/js/personagens.js), 1 por pessoa (o que já tem dono não pode ser escolhido)
//   - "Comigo agora": o que depende da pessoa agora (copy pra alterar, copy esperando aprovação, copy pra aprovar se é
//     ADMIN, copy pra fazer e matriz das tarefas dela, entrega do MKT Hub atrasada ou em risco nos posts dela)
//   - "Esta semana" (segunda a domingo, horário de Brasília): copys aprovadas (e quantas de primeira, sem pedido de
//     alteração), copys mandadas, o que o ADMIN aprovou e quanto a copy esperou, e o tempo no relógio por dia
//   - Time: o personagem de cada um e quem está online
// Quem vê o quê (decisão 25): o colega vê o personagem e as copys aprovadas na semana; o "Comigo agora" e o tempo
// são só da própria pessoa e do ADMIN (conferido aqui no servidor). Sem nível nesta versão: nível e XP ficam pra
// depois, quando o Zion escolher a regra.
// Custo (regra 11): no data.json entra só db.perfis = { idDaPessoa: { p: personagem, n: nome, em } }, ~60 bytes por
// pessoa, opcional (sem migração). Os números são contados na hora e só quando alguém abre o perfil: nada disso entra
// no /api/state, que o painel pergunta a cada 20 s. Nenhuma leitura nova no MKT Hub (usa o que já está na memória).
'use strict';

// a ordem e os ids precisam bater com public/js/personagens.js (o teste api399 confere)
const PERSONAGENS = ['gancho', 'corte', 'pixel', 'take', 'viral', 'mira', 'pauta', 'voz', 'hype', 'metrica', 'plot', 'ponto'];
const NOMES = { gancho: 'Gancho', corte: 'Corte Seco', pixel: 'Pixel', take: 'Take Único', viral: 'Viral', mira: 'Mira', pauta: 'Pauta',
  voz: 'Microfone Aberto', hype: 'Hype', metrica: 'Métrica', plot: 'Plot Twist', ponto: 'Ponto Cheio' };
const JANELA_HUB = 30;     // entrega atrasada há mais de 30 dias não entra no "Comigo agora" (é dado velho, não pendência)
const MAX_LISTA = 8;       // até 8 itens de cada grupo vão pra tela; o número mostrado é sempre o total

const chave = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const limpaNome = t => String(t || '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 24);
const hojeBRT = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
const addDias = (iso, n) => new Date(Date.parse(iso + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
/** O dia (AAAA-MM-DD, Brasília) de um instante ISO; '' se não for data. */
const diaBRT = iso => { const t = Date.parse(iso || ''); return isNaN(t) ? '' : new Date(t - 3 * 3600e3).toISOString().slice(0, 10); };
function segundaDe(iso) { const d = new Date(iso + 'T12:00:00Z'); return addDias(iso, -((d.getUTCDay() + 6) % 7)); }

/**
 * Como reconhecer a pessoa nos nomes que outros lugares guardam (quem mandou a copy, quem aprovou, o relógio, quem faz
 * a tarefa, o responsável no MKT Hub): o primeiro nome dela e o começo de cada e-mail. Ex.: a Bia entra como
 * anny.beatriz@, então "Anny Beatriz" no Hub também é ela; "Maria Clara" é a Maria.
 */
function marcas(p) {
  const s = new Set([chave(p.nome).split(' ')[0]]);
  for (const e of p.emails || []) s.add(chave(String(e).split('@')[0]).split(/[._-]/)[0]);
  s.delete('');
  return s;
}
const ehDe = (nome, m) => !!nome && m.has(chave(nome).split(' ')[0]);

// a mesma regra da v3.94 (entregas do dia, public/index.html: stBucket e entSit), pra o perfil e o calendário baterem
function balde(v) {
  if (v.postado) return 'postado';
  if (!v.taskId) return 'afazer';
  const st = String((v.statusCache && v.statusCache.status) || '').trim();
  if (['publicar', 'completo', 'banco de criativos'].includes(st)) return 'pronto';
  if (['aprovar', 'aprovação líder', 'revisão solicitada'].includes(st)) return 'aprovar';
  if (st === 'alterar') return 'alterar';
  if (['em progresso', 'pré revisão', 'revisão ia'].includes(st)) return 'producao';
  return 'afazer';
}
function entSit(v, hoje, amanha) {
  if (!v.taskId || !v.hub || !v.hub.prazo) return null;
  const b = balde(v);
  if (v.postado || b === 'aprovar' || b === 'pronto') return 'entregue';
  if (v.statusCache && v.statusCache.status === 'desconhecida') return 'ok';   // v4.10: etapa que o painel não conhece
  const p = v.hub.prazo;
  if (p < hoje) return 'atrasada';
  if (p <= amanha || (v.date && p > v.date)) return 'risco';
  return 'ok';
}

module.exports = function criarPerfil(ctx) {
  const { db, saveDb, readBody, json } = ctx;
  if (!db.perfis || typeof db.perfis !== 'object' || Array.isArray(db.perfis)) db.perfis = {};
  const ligado = () => !!(ctx.ligado && ctx.ligado());
  const usuarios = () => (ctx.usuarios && ctx.usuarios()) || [];
  const online = () => (ctx.online && ctx.online()) || [];
  const itens = ctx.itens || (() => []);
  const mzCheio = ctx.mzCheio || (() => false);

  /** Quem está pedindo. Com o login do Zoho: a conta. Sem login (PC local): o nome do perfil deste navegador. */
  function quem(req, nome) {
    if (ligado()) {
      if (!req.eu) return null;
      const u = usuarios().find(x => x.id === req.eu.id) || {};
      return { id: req.eu.id, nome: req.eu.nome, papel: req.eu.papel, emails: u.emails || [req.eu.email].filter(Boolean) };
    }
    const n = limpaNome(nome);
    return n ? { id: 'local:' + chave(n), nome: n, papel: 'admin', emails: [], local: true } : null;
  }
  function pessoaDoId(id) {
    const u = usuarios().find(x => x.id === id);
    return u ? { id: u.id, nome: u.nome, papel: u.papel, emails: u.emails || [] } : null;
  }
  const personagemDe = id => { const x = db.perfis[id]; return x && PERSONAGENS.includes(x.p) ? x.p : ''; };
  /** Quem escolheu cada personagem: { personagem: { id, nome } }. Quem saiu da lista do login libera o dele. */
  function donos() {
    const o = {};
    for (const [id, x] of Object.entries(db.perfis)) {
      if (!x || !PERSONAGENS.includes(x.p)) continue;
      if (ligado()) { const u = pessoaDoId(id); if (u) o[x.p] = { id, nome: u.nome }; }
      else if (id.startsWith('local:')) o[x.p] = { id, nome: x.n || id.slice(6) };
    }
    return o;
  }
  /** O personagem de alguém pelo nome (bolinha de quem está online e o documento da copy). '' se não escolheu. */
  function doNome(nome) {
    if (!nome) return '';
    if (ligado()) { const u = usuarios().find(x => chave(x.nome) === chave(nome)) || usuarios().find(x => ehDe(nome, marcas(x))); return u ? personagemDe(u.id) : ''; }
    return personagemDe('local:' + chave(limpaNome(nome)));
  }
  const estaOnline = p => online().some(n => chave(n) === chave(p.nome));
  /** O time: com login, a lista de quem entra pelo Zoho; sem login, quem está online agora (e você). */
  function time(eu) {
    let l;
    if (ligado()) l = usuarios().map(u => ({ id: u.id, nome: u.nome, papel: u.papel }));
    else {
      const m = new Map();
      if (eu) m.set(chave(eu.nome), { id: eu.id, nome: eu.nome, papel: eu.papel });
      for (const n of online()) { const k = chave(n); if (k && !m.has(k)) m.set(k, { id: 'local:' + k, nome: limpaNome(n), papel: 'admin' }); }
      l = [...m.values()];
    }
    return l.map(x => ({ id: x.id, nome: x.nome, papel: x.papel, personagem: personagemDe(x.id), online: estaOnline(x), eu: !!eu && x.id === eu.id }));
  }

  const titulo = v => String(v.titulo || v.tituloCache || (v.matrizSB && (v.matrizSB.tema || v.matrizSB.tipo)) || 'Post sem título').slice(0, 90);
  const ordemEm = (a, b) => String(a.em || '').localeCompare(String(b.em || ''));
  const ordemDia = (a, b) => String(a.date || '9').localeCompare(String(b.date || '9')) || ordemEm(a, b);

  /** O perfil de uma pessoa. completo = a própria pessoa ou um ADMIN olhando; senão, só o que o colega pode ver. */
  function monta(p, completo) {
    const m = marcas(p), hoje = hojeBRT(), de = segundaDe(hoje), ate = addDias(de, 6), amanha = addDias(hoje, 1);
    const naSemana = d => !!d && d >= de && d <= ate;
    const admin = p.papel === 'admin';
    const nums = { aprovadas: 0, dePrimeira: 0, mandadas: 0, aprovou: 0, esperaMs: 0, matrizSeg: 0, copySeg: 0 };
    const alterar = [], esperando = [], praAprovar = [];
    const item = (s, extra) => Object.assign({ sid: s.id, conta: s.conta, date: s.date || null, titulo: titulo(s) }, extra);
    for (const s of db.slots) {
      const a = s.aprov && s.aprov.c;
      if (!a) continue;
      if (ehDe(a.por, m)) {
        // de primeira = aprovada sem nunca ter voltado: quem manda de novo depois de "pra alterar" leva o pedido junto (a.pedido)
        if (a.st === 'aprovado' && naSemana(diaBRT(a.apEm))) { nums.aprovadas++; if (!a.pedido) nums.dePrimeira++; }
        if (naSemana(diaBRT(a.em))) nums.mandadas++;
        if (a.st === 'alterar') alterar.push(item(s, { em: a.apEm || a.em || null, quem: a.ap || '', nota: String(a.nota || '').slice(0, 160) }));
        else if (a.st === 'enviado') esperando.push(item(s, { em: a.em || null }));
      }
      if (admin) {
        if (a.st === 'enviado') praAprovar.push(item(s, { em: a.em || null, por: a.por || '' }));
        if (a.st === 'aprovado' && ehDe(a.ap, m) && naSemana(diaBRT(a.apEm))) {
          nums.aprovou++;
          const espera = Date.parse(a.apEm) - Date.parse(a.em);
          if (espera > 0) nums.esperaMs += espera;
        }
      }
    }
    const base = { id: p.id, nome: p.nome, papel: p.papel, personagem: personagemDe(p.id), online: estaOnline(p), semana: { de, ate, hoje } };
    if (!completo) return Object.assign(base, { limitado: true, nums: { aprovadas: nums.aprovadas, dePrimeira: nums.dePrimeira } });

    // tarefas abertas da pessoa: copy que falta fazer (sem ter ido pra aprovação; material do banco não precisa) e matriz
    const fazer = [], matriz = [];
    for (const tf of Object.values(db.tarefas || {})) {
      if (tf.arquivadaEm || !ehDe(tf.por, m)) continue;
      const l = itens(tf);
      if (tf.tipo === 'copy') {
        const falta = l.filter(s => !(s.aprov && s.aprov.c) && !s.banco).length;
        if (falta) fazer.push({ tarefa: tf.id, aba: tf.aba, de: tf.de, ate: tf.ate, falta, total: l.length });
      } else if (tf.tipo === 'matriz' && l.length) {
        const feitos = l.filter(s => mzCheio(s.matrizSB, s)).length;
        if (feitos < l.length) matriz.push({ tarefa: tf.id, aba: tf.aba, de: tf.de, ate: tf.ate, feitos, total: l.length });
      }
    }
    fazer.sort((a, b) => a.de.localeCompare(b.de)); matriz.sort((a, b) => a.de.localeCompare(b.de));

    // entregas do MKT Hub nos posts em que a pessoa é a responsável (mesma regra do calendário, v3.94)
    const atrasadas = [], risco = [];
    if (ctx.sobrepoe) {
      const limite = addDias(hoje, -JANELA_HUB);
      for (const v of ctx.sobrepoe(db.slots.filter(s => s.taskId))) {
        if (!v.hub || !v.hub.prazo || !ehDe(v.assigneeCache, m)) continue;
        const sit = entSit(v, hoje, amanha);
        if (sit !== 'atrasada' && sit !== 'risco') continue;
        const x = { sid: v.id, conta: v.conta, date: v.date || null, prazo: v.hub.prazo, codigo: v.hub.codigo || '', titulo: titulo(v), etapa: (v.statusCache && v.statusCache.nome) || '' };
        if (sit === 'atrasada') { if (v.hub.prazo >= limite) atrasadas.push(x); }
        else risco.push(Object.assign(x, { motivo: v.date && v.hub.prazo > v.date ? 'depois do post' : v.hub.prazo === hoje ? 'vence hoje' : 'vence amanhã' }));
      }
    }
    const porPrazo = (a, b) => a.prazo.localeCompare(b.prazo) || ordemDia(a, b);
    atrasadas.sort(porPrazo); risco.sort(porPrazo);

    // tempo no relógio por dia da semana (somas guardadas por lib/tempo.js: { dia: { pessoa: { aba: [matriz, copy] } } })
    const somas = db.tempo && db.tempo.d && typeof db.tempo.d === 'object' ? db.tempo.d : {};
    const dias = [];
    for (let i = 0; i < 7; i++) {
      const dia = addDias(de, i);
      let mz = 0, cp = 0;
      for (const [por, abas] of Object.entries(somas[dia] || {})) {
        if (!ehDe(por, m)) continue;
        for (const par of Object.values(abas || {})) { mz += +par[0] || 0; cp += +par[1] || 0; }
      }
      nums.matrizSeg += mz; nums.copySeg += cp;
      dias.push({ dia, m: mz, c: cp });
    }

    esperando.sort(ordemEm); praAprovar.sort(ordemEm); alterar.sort(ordemDia);
    const corta = l => ({ n: l.length, itens: l.slice(0, MAX_LISTA) });
    return Object.assign(base, {
      agora: { alterar: corta(alterar), esperando: corta(esperando), praAprovar: admin ? corta(praAprovar) : null, fazer, matriz, atrasadas: corta(atrasadas), risco: corta(risco) },
      nums, dias,
    });
  }

  async function rota(req, res, p, u) {
    if (!p.startsWith('/api/perfil')) return false;
    const semNome = () => (json(res, 400, { erro: 'sem nome: preencha o seu perfil antes', semNome: true }), true);
    if (p === '/api/perfil' && req.method === 'GET') {
      const eu = quem(req, u.searchParams.get('nome'));
      if (!eu) return semNome();
      return json(res, 200, { eu: monta(eu, true), time: time(eu), donos: donos(), personagens: PERSONAGENS, login: ligado() }), true;
    }
    // o perfil de um colega: completo pro ADMIN (e pra própria pessoa); o resto vê só o que o colega pode ver
    const mp = p.match(/^\/api\/perfil\/pessoa\/([a-z0-9:._-]{1,60})$/i);
    if (mp && req.method === 'GET') {
      const eu = quem(req, u.searchParams.get('nome'));
      if (!eu) return semNome();
      const alvo = mp[1] === eu.id ? eu : (ligado() ? pessoaDoId(mp[1]) : null);
      if (!alvo) return json(res, 404, { erro: 'pessoa não encontrada' }), true;
      return json(res, 200, { pessoa: monta(alvo, alvo.id === eu.id || eu.papel === 'admin'), time: time(eu), donos: donos(), login: ligado() }), true;
    }
    // escolher (ou tirar, com personagem vazio) o personagem: 1 por pessoa
    if (p === '/api/perfil/personagem' && req.method === 'POST') {
      const b = await readBody(req);
      const eu = quem(req, b.nome);
      if (!eu) return semNome();
      const pg = String(b.personagem || '');
      if (pg && !PERSONAGENS.includes(pg)) return json(res, 400, { erro: 'esse personagem não existe' }), true;
      const dono = pg ? donos()[pg] : null;
      if (dono && dono.id !== eu.id) return json(res, 409, { erro: NOMES[pg] + ' já foi escolhido por ' + dono.nome, dono: dono.nome }), true;
      const antes = personagemDe(eu.id);
      if (pg) db.perfis[eu.id] = { p: pg, n: eu.nome, em: new Date().toISOString() };
      else delete db.perfis[eu.id];
      if (pg !== antes) { saveDb(); if (ctx.mudou) ctx.mudou(eu, pg); }
      return json(res, 200, { ok: true, personagem: pg, nome: pg ? NOMES[pg] : '' }), true;
    }
    return false;
  }
  rota.doNome = doNome;
  rota.PERSONAGENS = PERSONAGENS;
  return rota;
};
module.exports.PERSONAGENS = PERSONAGENS;
module.exports.NOMES = NOMES;
