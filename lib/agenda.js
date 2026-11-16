'use strict';
/**
 * v4.28: o agendador dos lembretes (roda a cada 60 s e a cada /api/ping do cron-job.org, que acorda o Render).
 *
 * O que manda (Web Push pros aparelhos da pessoa, pelo 1º nome do login):
 *  - D-1 18:00: quem ainda não confirmou o evento de amanhã ("Confirme no B.O.N.E").
 *  - 1 h antes do início: todo mundo da escala.
 *  - Cada etapa com hora (não agente): na hora, "É a vez"; +10 min sem feito, "Atrasou"; +30 min sem feito, escala pro Zion.
 *  - Etapa com prazo ("até"): no prazo sem feito, "Prazo agora"; +30 min sem feito, escala pro Zion.
 * Só pra quem faz a etapa: a raia da pessoa (o responsável fica com as raias que ninguém da escala pegou).
 * Silêncio 22:30 às 06:00, menos pros eventos que começam antes das 07:30 (a Liga das 07:00).
 * Lembrete atrasado (o servidor estava dormindo) sai UMA vez, com "(atrasado)"; com mais de 3 h, não sai mais.
 * Vários lembretes na mesma volta pra mesma pessoa viram uma notificação só (nunca uma rajada).
 * db.alertas = { chave: quando saiu } (não repete; limpa os de mais de 4 dias). db.pushSilencio = { user: { capId: true } }.
 */
const JANELA = 3 * 3600e3, ATRASO = 15 * 60e3, ZION = 'zion';
const ms = (d, h) => Date.parse(d + 'T' + h + ':00-03:00');
const somaD = (iso, n) => new Date(Date.parse(iso + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const hBRT = t => new Date(t - 3 * 3600e3).toISOString().slice(11, 16);
const dBRT = t => new Date(t - 3 * 3600e3).toISOString().slice(0, 10);
const hora = h => (h ? (h.endsWith(':00') ? String(+h.slice(0, 2)) + 'h' : String(+h.slice(0, 2)) + 'h' + h.slice(3)) : '');

module.exports = function criarAgenda({ db, saveDb, cap, push, usuarios, FX }) {
  if (!db.alertas || typeof db.alertas !== 'object' || Array.isArray(db.alertas)) db.alertas = {};
  if (!db.pushSilencio || typeof db.pushSilencio !== 'object') db.pushSilencio = {};
  const sem = x => String(x || '').split(' ')[0].normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  /** O login da pessoa da escala (pelo 1º nome). Sem login (a Malu, até o email chegar), null. */
  const userDe = nome => { const k = sem(nome); const u = usuarios().find(x => sem(x.nome) === k); return u ? u.id : null; };
  let rodando = false;

  /** Os lembretes que valem agora (sem olhar se já saíram). */
  function candidatos(agora) {
    const hoje = dBRT(agora), l = [];
    for (const { c, tipo } of cap.eventosAgenda()) {
      const ps = cap.pessoasDe(c);
      if (!ps.length) continue;
      const usadas = new Set(ps.filter(p => p.papel !== 'principal').map(p => p.papel));
      const daRaia = r => ps.filter(p => !r ? true : p.papel === r || (p.papel === 'principal' && !usadas.has(r)));
      const nomeEv = c.titulo || 'evento';
      const ev0 = nomeEv.length > 32 ? nomeEv.slice(0, 31) + '…' : nomeEv;
      const pos = l.length;
      for (const x of c.dias || []) {
        if (x.d < somaD(hoje, -1) || x.d > somaD(hoje, 1)) continue;
        const ctx = cap.ctxDia(c, x), e = FX.estado(tipo, (c.fluxo && c.fluxo.dias && c.fluxo.dias[x.d]) || {}, ctx);
        const cedo = !!x.h && x.h < '07:30';
        const url = '/?cap=' + c.id + '&d=' + x.d + '&modo=1';
        const base = c.id + '|' + x.d + '|';
        // D-1 18:00: quem não confirmou
        for (const p of ps) {
          const v = cap.confDe(c, x, p.k);
          if (v && !v.velha && v.st === 'ok') continue;
          l.push({ chave: base + 'conf|' + p.k, t: ms(somaD(x.d, -1), '18:00'), para: p, cedo, titulo: 'Amanhã: ' + nomeEv, corpo: (x.h ? 'Às ' + hora(x.h) : 'Amanhã') + (c.local ? ' · ' + c.local : '') + '. Confirme no B.O.N.E se vai.', url: '/?cap=' + c.id + '&d=' + x.d });
        }
        // 1 h antes
        if (x.h) for (const p of ps) l.push({ chave: base + '1h|' + p.k, t: ms(x.d, x.h) - 3600e3, para: p, cedo, titulo: 'Em 1 hora: ' + nomeEv, corpo: 'Começa ' + hora(x.h) + (c.local ? ' · ' + c.local : '') + '. Abra o modo captação.', url, urgente: true });
        // as etapas
        for (const id of FX.GRAFO[tipo].ordem) {
          const n = FX.no(tipo, id), def = n.def;
          if (def.k !== 'step' || def.kind === 'agent' || !def.q) continue;
          const st = e.est[id];
          if (st === 'x' || st === 'done') continue;
          const q = FX.quando(tipo, id, ctx);
          if (!q) continue;
          const t = ms(q.d, q.h), quem = daRaia(n.raia);
          for (const p of quem) {
            if (def.ate) l.push({ chave: base + 'prazo|' + id + '|' + p.k, t, para: p, cedo, titulo: 'Prazo agora: ' + def.t, corpo: nomeEv + ' · até ' + hora(q.h) + '. Marque no B.O.N.E quando fizer.', url });
            else {
              l.push({ chave: base + 'vez|' + id + '|' + p.k, t, para: p, cedo, titulo: hora(q.h) + ' · ' + def.t, corpo: nomeEv + ': ' + ((def.checks || [])[0] || 'é a vez desta etapa'), url, urgente: true });
              l.push({ chave: base + 'atraso|' + id + '|' + p.k, t: t + 10 * 60e3, para: p, cedo, titulo: 'Atrasou 10 min: ' + def.t, corpo: nomeEv + '. Fez? Marque no B.O.N.E. Não deu? Veja o "Se não der".', url, urgente: true });
            }
          }
          if (quem.length) l.push({ chave: base + 'esc|' + id, t: t + 30 * 60e3, zion: true, cedo, linha: '30 min sem marcar: ' + def.t + ' · ' + quem.map(p => p.nome.split(' ')[0]).join(' e '), titulo: '30 min sem marcar: ' + def.t, corpo: nomeEv + ' · ' + quem.map(p => p.nome.split(' ')[0]).join(' e ') + (def.ate ? ' (prazo ' + hora(q.h) + ')' : ' (' + hora(q.h) + ')') + '. Vale ligar.', url: '/?cap=' + c.id + '&d=' + x.d, urgente: true });
        }
      }
      for (let i = pos; i < l.length; i++) l[i].ev = ev0;   // a linha da notificação com vários lembretes leva o evento
    }
    return l;
  }

  /** Uma volta: manda o que venceu e ainda não saiu. Devolve o resumo (pros testes e pro ADMIN). */
  async function tick(agora = Date.now()) {
    if (rodando) return { ocupado: true };
    rodando = true;
    try {
      const hm = hBRT(agora), quieto = hm >= '22:30' || hm < '06:00';
      const porUser = new Map(), marcar = [];
      let pulados = 0, silenciados = 0;
      for (const a of candidatos(agora)) {
        if (agora < a.t || db.alertas[a.chave]) continue;
        if (agora - a.t > JANELA) { marcar.push(a.chave); pulados++; continue; }   // velho demais: não sai mais
        if (quieto && !a.cedo) continue;                                             // espera as 06:00 (se ainda estiver na janela)
        const user = a.zion ? ZION : userDe(a.para.nome);
        if (!user) { marcar.push(a.chave); continue; }                               // sem login: vai pela fila do Ultron (Fase 5)
        const capId = a.chave.split('|')[0];
        if (!a.zion && db.pushSilencio[user] && db.pushSilencio[user][capId]) { marcar.push(a.chave); silenciados++; continue; }
        const atrasado = agora - a.t > ATRASO;
        if (!porUser.has(user)) porUser.set(user, []);
        porUser.get(user).push(Object.assign({}, a, { atrasado }));
        marcar.push(a.chave);
      }
      const enviados = [];
      for (const [user, as] of porUser) {
        as.sort((x, y) => x.t - y.t);
        const um = as.length === 1 ? as[0] : null;
        const dados = um ? { titulo: um.titulo + (um.atrasado ? ' (atrasado)' : ''), corpo: um.corpo, url: um.url, tag: um.chave.split('|').slice(0, 2).join('-'), urgente: !!um.urgente }
          : { titulo: 'B.O.N.E · ' + as.length + ' lembretes', corpo: as.map(x => (x.linha || x.titulo) + (x.titulo.includes(x.ev) ? '' : ' · ' + x.ev) + (x.atrasado ? ' (atrasado)' : '')).join('\n'), url: as[as.length - 1].url, tag: 'varios', urgente: as.some(x => x.urgente) };
        const r = push && push.ligado() ? await push.paraUser(user, dados, { ttl: 3 * 3600, urgente: dados.urgente }) : { enviados: 0, desligado: true };
        enviados.push({ user, n: as.length, titulo: dados.titulo, corpo: dados.corpo, aparelhos: r.enviados || 0 });
      }
      const em = new Date(agora).toISOString();
      for (const k of marcar) db.alertas[k] = em;
      const lim = agora - 4 * 864e5;
      for (const [k, v] of Object.entries(db.alertas)) if (Date.parse(v) < lim) delete db.alertas[k];
      if (marcar.length) saveDb();
      return { enviados, pulados, silenciados, quieto };
    } finally { rodando = false; }
  }
  return { tick, candidatos };
};
