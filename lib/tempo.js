// Relógio das tarefas (v3.80): quanto tempo a copywriter leva na matriz e na copy.
// O relógio roda no navegador (public/js/cronometro.js) e só chega aqui quando para: 1 envio por sessão,
// com a divisão por post já feita lá (qual post estava aberto enquanto o relógio rodava).
//
// Tudo mora no data.json, que no Render vai INTEIRO pro GitHub a cada gravação. Por isso é enxuto:
//   s  = sessões dos últimos 14 dias (as únicas que dá pra corrigir):
//        [id, ini, seg, atv, tarefaId, por, aba, posts, manual]
//        ini em segundos, atv 'm' (matriz) ou 'c' (copy), posts = { slotId: segundos } ou 0
//   d  = soma por dia, pessoa e empresa: { dia: { pessoa: { aba: [matriz, copy] } } } (120 dias, depois vira mês)
//   mo = soma por mês, no mesmo formato (fica pra sempre: é pequeno)
//   p  = soma por post: { slotId: [matriz, copy, diaDaUltimaVez] } (some 60 dias depois da última vez)
// As somas (d, mo, p e o seg de cada tarefa) mudam na hora em que a sessão entra, muda ou sai; o relatório
// lê só as somas. Tempo em segundos. Dia no horário de Brasília (UTC-3, sem horário de verão).
'use strict';

const DIA_S = 86400;
const JANELA_SESSOES = 14;   // dias em que a sessão ainda pode ser corrigida
const JANELA_DIAS = 120;     // dias guardados um a um (depois somam no mês)
const JANELA_POSTS = 60;     // dias que o tempo de um post fica guardado depois da última vez
const MAX_SEG = 8 * 3600;    // uma sessão nunca passa de 8 h (relógio esquecido ligado)
const MIN_SEG = 30;          // menos que isso não conta (clique sem querer)

const agoraSeg = () => Math.floor(Date.now() / 1000);
/** Dia (AAAA-MM-DD) em Brasília de um instante em segundos. */
const diaBRT = seg => new Date((seg - 3 * 3600) * 1000).toISOString().slice(0, 10);
const diaNum = dia => Math.floor(Date.parse(dia + 'T00:00:00Z') / 864e5);
const hojeBRT = () => diaBRT(agoraSeg());
const limpaNome = t => String(t || '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 24);
const chave = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const vazio = o => !o || !Object.keys(o).length;

module.exports = function criarTempo(ctx) {
  const { db, saveDb, readBody, json } = ctx;

  function T() {
    if (!db.tempo || typeof db.tempo !== 'object' || Array.isArray(db.tempo)) db.tempo = {};
    const t = db.tempo;
    if (!Array.isArray(t.s)) t.s = [];
    for (const k of ['d', 'mo', 'p']) if (!t[k] || typeof t[k] !== 'object' || Array.isArray(t[k])) t[k] = {};
    t.v = 1;
    return t;
  }
  T();

  /** Soma v no par [matriz, copy] de grupo[chave1][pessoa][aba]; tira o que zerar pra não guardar lixo. */
  function somaPar(grupo, k1, por, aba, i, v) {
    const a = grupo[k1] = grupo[k1] || {};
    const b = a[por] = a[por] || {};
    const par = b[aba] = b[aba] || [0, 0];
    par[i] = Math.max(0, par[i] + v);
    if (!par[0] && !par[1]) delete b[aba];
    if (vazio(b)) delete a[por];
    if (vazio(a)) delete grupo[k1];
  }

  /** Põe (sinal 1) ou tira (sinal -1) uma sessão de todas as somas. */
  function aplica(ss, sinal) {
    const t = T();
    const [, ini, seg, atv, tarefaId, por, aba, posts] = ss;
    const i = atv === 'm' ? 0 : 1, dia = diaBRT(ini), n = diaNum(dia);
    if (n < diaNum(hojeBRT()) - JANELA_DIAS) somaPar(t.mo, dia.slice(0, 7), por, aba, i, seg * sinal);
    else somaPar(t.d, dia, por, aba, i, seg * sinal);
    if (posts && typeof posts === 'object') {
      for (const [sid, v] of Object.entries(posts)) {
        const e = t.p[sid] = t.p[sid] || [0, 0, 0];
        e[i] = Math.max(0, e[i] + v * sinal);
        if (sinal > 0) e[2] = Math.max(e[2], n);
        if (!e[0] && !e[1]) delete t.p[sid];
      }
    }
    const tf = tarefaId && db.tarefas ? db.tarefas[tarefaId] : null;
    // u0 e u = primeiro e último dia em que a tarefa ganhou tempo (pra aparecer no relatório do período em que foi feita)
    if (tf) { tf.seg = Math.max(0, (tf.seg || 0) + seg * sinal); if (sinal > 0) { tf.u = Math.max(tf.u || 0, n); tf.u0 = Math.min(tf.u0 || n, n); } }
  }

  /** Confere e arruma o que veio do navegador. Devolve { ss } ou { erro }. */
  function limpaSessao(b) {
    const manual = !!b.manual;
    const id = String(b.id || '');
    if (!/^[a-z0-9]{6,24}$/.test(id)) return { erro: 'id inválido' };
    const agora = agoraSeg();
    const ini = Math.floor(Number(b.ini));
    if (!Number.isFinite(ini) || ini > agora + 120 || ini < agora - 400 * DIA_S) return { erro: 'início inválido' };
    let seg = Math.round(Number(b.seg));
    if (!Number.isFinite(seg) || seg < (manual ? 60 : MIN_SEG)) return { erro: 'tempo curto demais (menos de ' + (manual ? '1 min' : '30 s') + ')' };
    seg = Math.min(seg, MAX_SEG);
    const por = limpaNome(b.por);
    if (!por) return { erro: 'sem nome: preencha o seu perfil' };
    let tarefaId = String(b.tarefaId || '');
    const tf = tarefaId && db.tarefas ? db.tarefas[tarefaId] : null;
    if (!tf) tarefaId = '';
    // com tarefa, a empresa e a atividade são as dela (o navegador não decide isso)
    const atv = tf ? (tf.tipo === 'matriz' ? 'm' : 'c') : (b.atv === 'm' || b.atv === 'c' ? b.atv : null);
    if (!atv) return { erro: 'atividade inválida' };
    const aba = tf ? tf.aba : String(b.aba || '');
    if (!db.abas.includes(aba)) return { erro: 'empresa inválida' };
    // posts: só os que existem, e a soma nunca passa do total da sessão
    let posts = 0;
    if (b.posts && typeof b.posts === 'object' && !Array.isArray(b.posts)) {
      const ids = new Set(db.slots.map(s => s.id));
      const o = {}; let tot = 0;
      for (const [sid, v] of Object.entries(b.posts).slice(0, 80)) {
        const q = Math.round(Number(v));
        if (!(q > 0) || !ids.has(sid)) continue;
        const cabe = Math.min(q, seg - tot);
        if (cabe <= 0) break;
        o[sid] = cabe; tot += cabe;
      }
      if (!vazio(o)) posts = o;
    }
    const ss = [id, ini, seg, atv, tarefaId, por, aba, posts];
    if (manual) ss.push(1);
    return { ss };
  }

  function fmt(ss) {
    return { id: ss[0], ini: ss[1], seg: ss[2], atv: ss[3], tarefaId: ss[4] || '', por: ss[5], aba: ss[6], posts: ss[7] || {}, manual: !!ss[8], dia: diaBRT(ss[1]) };
  }

  /**
   * Faxina (na subida, a cada 6 h e a cada sessão nova): sessão com mais de 14 dias sai da lista (já está
   * nas somas), dia com mais de 120 dias vira mês, post parado há 60 dias sai. Devolve true se mexeu.
   */
  function poda() {
    const t = T(), hoje = diaNum(hojeBRT());
    let mexeu = false;
    const antes = t.s.length;
    t.s = t.s.filter(x => diaNum(diaBRT(x[1])) >= hoje - JANELA_SESSOES);
    if (t.s.length !== antes) mexeu = true;
    for (const dia of Object.keys(t.d)) {
      if (diaNum(dia) >= hoje - JANELA_DIAS) continue;
      for (const [por, abas] of Object.entries(t.d[dia])) {
        for (const [aba, par] of Object.entries(abas)) {
          if (par[0]) somaPar(t.mo, dia.slice(0, 7), por, aba, 0, par[0]);
          if (par[1]) somaPar(t.mo, dia.slice(0, 7), por, aba, 1, par[1]);
        }
      }
      delete t.d[dia]; mexeu = true;
    }
    for (const [sid, e] of Object.entries(t.p)) if (e[2] < hoje - JANELA_POSTS) { delete t.p[sid]; mexeu = true; }
    return mexeu;
  }

  /** Posts da tarefa que ganharam tempo (pra média por post). */
  function postsComTempo(tf) {
    const t = T(), i = tf.tipo === 'matriz' ? 0 : 1;
    const abaDe = c => db.contas[c] ? db.contas[c].aba : null;
    return db.slots.filter(s => s.date && s.date >= tf.de && s.date <= tf.ate && abaDe(s.conta) === tf.aba && t.p[s.id] && t.p[s.id][i] > 0).length;
  }

  /** Relatório de um período (tela Tempo). Filtros opcionais: pessoa e empresa. */
  function relatorio(q) {
    const t = T(), hoje = hojeBRT();
    const ok = d => /^\d{4}-\d{2}-\d{2}$/.test(d || '');
    let de = ok(q.get('de')) ? q.get('de') : hoje, ate = ok(q.get('ate')) ? q.get('ate') : hoje;
    if (de > ate) [de, ate] = [ate, de];
    const fPor = chave(q.get('por') || ''), fAba = q.get('aba') || '';
    const passa = (por, aba) => (!fPor || chave(por) === fPor) && (!fAba || aba === fAba);
    const pessoas = new Map();
    const conhece = n => { if (!pessoas.has(chave(n))) pessoas.set(chave(n), n); };
    const dias = {}, meses = {}, abas = {}, total = [0, 0], linhas = [];
    const junta = (alvo, k, par) => { const x = alvo[k] = alvo[k] || [0, 0]; x[0] += par[0]; x[1] += par[1]; };
    for (const [dia, pp] of Object.entries(t.d)) {
      for (const [por, ab] of Object.entries(pp)) {
        conhece(por);
        if (dia < de || dia > ate) continue;
        for (const [aba, par] of Object.entries(ab)) {
          if (!passa(por, aba)) continue;
          junta(dias, dia, par); junta(abas, aba, par); total[0] += par[0]; total[1] += par[1];
          if (par[0]) linhas.push([dia, por, aba, 'm', par[0]]);
          if (par[1]) linhas.push([dia, por, aba, 'c', par[1]]);
        }
      }
    }
    for (const [mes, pp] of Object.entries(t.mo)) {
      for (const [por, ab] of Object.entries(pp)) {
        conhece(por);
        if (mes < de.slice(0, 7) || mes > ate.slice(0, 7)) continue;
        for (const [aba, par] of Object.entries(ab)) {
          if (!passa(por, aba)) continue;
          junta(meses, mes, par); junta(abas, aba, par); total[0] += par[0]; total[1] += par[1];
          if (par[0]) linhas.push([mes, por, aba, 'm', par[0]]);
          if (par[1]) linhas.push([mes, por, aba, 'c', par[1]]);
        }
      }
    }
    for (const x of t.s) conhece(x[5]);
    for (const tf of Object.values(db.tarefas || {})) conhece(tf.por);
    linhas.sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]) || a[2].localeCompare(b[2]) || a[3].localeCompare(b[3]));
    const sessoes = t.s.filter(x => { const d = diaBRT(x[1]); return d >= de && d <= ate && passa(x[5], x[6]); })
      .sort((a, b) => b[1] - a[1]).map(fmt);
    // tarefas do período: as de posts do período e as que ganharam tempo nele (a matriz da semana que vem é feita nesta)
    const nDe = diaNum(de), nAte = diaNum(ate);
    const tarefas = Object.values(db.tarefas || {})
      .filter(tf => passa(tf.por, tf.aba) && ((tf.de <= ate && tf.ate >= de) || (tf.u && tf.u0 <= nAte && tf.u >= nDe)))
      .map(tf => ({ id: tf.id, tipo: tf.tipo, aba: tf.aba, de: tf.de, ate: tf.ate, por: tf.por, seg: tf.seg || 0, posts: postsComTempo(tf), arquivada: !!tf.arquivadaEm }))
      .sort((a, b) => b.de.localeCompare(a.de) || a.tipo.localeCompare(b.tipo));
    return { de, ate, hoje, pessoas: [...pessoas.values()].sort((a, b) => a.localeCompare(b)), total, dias, meses, abas, linhas, sessoes, tarefas,
      janela: { sessoes: JANELA_SESSOES, dias: JANELA_DIAS, posts: JANELA_POSTS } };
  }

  async function rota(req, res, p, u) {
    if (!p.startsWith('/api/tempo')) return false;
    T();
    // relógio parou (ou lançamento à mão): entra uma sessão. Mandar de novo o mesmo id não duplica.
    if (p === '/api/tempo/sessao' && req.method === 'POST') {
      const r = limpaSessao(await readBody(req));
      if (r.erro) return json(res, 400, { erro: r.erro }), true;
      const t = T();
      if (t.s.some(x => x[0] === r.ss[0])) return json(res, 200, { ok: true, repetida: true }), true;
      aplica(r.ss, 1);
      // sessão que chega atrasada (fila de quem ficou sem internet) e já passou da janela: vai só pras somas
      if (diaNum(diaBRT(r.ss[1])) >= diaNum(hojeBRT()) - JANELA_SESSOES) t.s.push(r.ss);
      poda();
      saveDb();
      const tf = r.ss[4] && db.tarefas ? db.tarefas[r.ss[4]] : null;
      return json(res, 200, { ok: true, sessao: fmt(r.ss), tarefaSeg: tf ? tf.seg : null }), true;
    }
    const m = p.match(/^\/api\/tempo\/sessao\/([a-z0-9]{6,24})$/);
    if (m && (req.method === 'PATCH' || req.method === 'DELETE')) {
      const t = T();
      const i = t.s.findIndex(x => x[0] === m[1]);
      if (i < 0) return json(res, 404, { erro: 'sessão não encontrada (só dá pra mexer nas dos últimos ' + JANELA_SESSOES + ' dias)' }), true;
      const velha = t.s[i];
      if (req.method === 'DELETE') {
        aplica(velha, -1); t.s.splice(i, 1); saveDb();
        return json(res, 200, { ok: true }), true;
      }
      const b = await readBody(req);
      let seg = Math.round(Number(b.seg));
      if (!(seg >= 60)) return json(res, 400, { erro: 'o mínimo é 1 minuto' }), true;
      seg = Math.min(seg, MAX_SEG);
      const nova = velha.slice();
      nova[2] = seg;
      // diminuiu o tempo: o de cada post diminui na mesma proporção (nunca passa do total)
      if (velha[7] && typeof velha[7] === 'object') {
        const f = Math.min(1, seg / velha[2]), o = {};
        let tot = 0;
        for (const [sid, v] of Object.entries(velha[7])) { const q = Math.min(Math.round(v * f), seg - tot); if (q > 0) { o[sid] = q; tot += q; } }
        nova[7] = vazio(o) ? 0 : o;
      }
      aplica(velha, -1); aplica(nova, 1); t.s[i] = nova; saveDb();
      return json(res, 200, { ok: true, sessao: fmt(nova) }), true;
    }
    if (p === '/api/tempo' && req.method === 'GET') return json(res, 200, relatorio(u.searchParams)), true;
    return false;
  }

  rota.poda = () => { if (poda()) saveDb(); };
  rota.postsComTempo = postsComTempo;
  rota.tempoDoPost = sid => { const e = T().p[sid]; return e ? [e[0], e[1]] : [0, 0]; };
  return rota;
};
module.exports.diaBRT = diaBRT;
