// v4.03: QUADRO DE CAPTAÇÃO. Pedido do Zion (02/10/2026): "tem que ter alguma maneira de dividir o bloco de captação
// do jeito que eu quiser, tipo, se elis fizer 4 videos complexos eu divido em duas tasks para dois dias". Escolhas
// dele: o quadro (tela própria) e o filmmaker só no MKT Hub. Os vídeos da semana (pela data em que saem) caem em
// "A organizar" e o ADMIN arrasta pros blocos; cada bloco tem o dia da captação, o horário, quem capta e uma nota.
// O vídeo fica no bloco pelo slot.capBloco (uma fonte só: o bloco não guarda lista). A pauta do bloco (texto pra
// colar no WhatsApp ou na task do MKT Hub) junta o roteiro de cada vídeo, que a Elis escreve no doc (lib/peca.js).
// Dados (regra 11): db.capBlocos e slot.capBloco, opcionais, sem migração.
//
// v4.04: O BLOCO VIRA TASK DE CAPTAÇÃO NO MKT HUB. Decisões do Zion (02/10/2026): 1 task por empresa (cada vídeo vira
// subtarefa na task da empresa dele; o Hub só aceita 1 empresa por task); "Quem capta" é a lista de pessoas do Hub
// (o filmmaker recebe a task e as subtarefas); os pontos se digitam na hora (a tela sugere os da última captação).
// A task leva a pauta do bloco no briefing; cada subtarefa, o roteiro do vídeo (a criação da subtarefa não aceita
// briefing: vai logo depois, no PATCH). Nada duplica: a criação usa a chave guardada antes de mandar (lib/hubenvio.js,
// cria). O envio roda no servidor, um bloco por vez, e a tela acompanha. Depois de mandar, o dia, o horário, quem capta
// e a nota ficam travados no B.O.N.E (mudam no Hub; o dia do bloco acompanha o prazo da task). Vídeo que entra no
// bloco depois vai em "Mandar os novos". O captado volta do Hub: subtarefa que passou da captação (aprovação, publicar,
// completo ou concluída) = vídeo captado, no quadro e no card do calendário.
// Dados (regra 11): bloco.resp (id da pessoa no Hub), bloco.hub { maes[], subs{}, pend{}, job } e db.hubCfg.cap
// (o tipo e os pontos da última captação). Opcionais, sem migração.
'use strict';
const crypto = require('crypto');
const { pecaDoPost, lerRoteiro } = require('./peca.js');

const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const FORMATO_HUB = 'Vídeo';
const RELE_MS = +process.env.MKH_RELE_MS || 3 * 60e3;   // cada subtarefa no máximo a cada 3 min (MKH_RELE_MS: só nos testes)
const RELE_POR_VOLTA = 10;         // no máximo 10 leituras por volta (o Hub aceita 120 por minuto)

module.exports = function criarCaptacao(ctx) {
  const { db, saveDb, readBody, json, soAdmin, htmlParaTexto, hub, envio } = ctx;
  if (!db.capBlocos || typeof db.capBlocos !== 'object' || Array.isArray(db.capBlocos)) db.capBlocos = {};
  const blocos = () => db.capBlocos;
  const hojeBRT = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
  const dataOk = d => /^\d{4}-\d{2}-\d{2}$/.test(String(d || '')) && !isNaN(Date.parse(d + 'T12:00:00Z'));
  const soma = (iso, n) => new Date(Date.parse(iso + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
  const segunda = iso => soma(iso, -((new Date(iso + 'T12:00:00Z').getUTCDay() + 6) % 7));
  const horaOk = h => h === '' || /^([01]\d|2[0-3]):[0-5]\d$/.test(h);
  const brData = d => d.slice(8, 10) + '/' + d.slice(5, 7);
  const diaSemana = d => DIAS[new Date(d + 'T12:00:00Z').getUTCDay()] + ' ' + brData(d);
  const hora = h => String(h || '').replace(/^0(\d)/, '$1').replace(/:00$/, 'h').replace(/^(\d+):(\d\d)$/, '$1h$2');
  const hash = t => crypto.createHash('sha1').update(String(t)).digest('hex').slice(0, 16);
  const urlOk = u => /^https?:\/\//i.test(String(u || '')) ? String(u) : '';
  const nomeConta = s => (db.contas[s.conta] && db.contas[s.conta].nome) || s.conta;
  const tituloPost = s => (s.vaga && !s.taskId) ? (s.obs || 'Vídeo a criar')   // "falta criar": a nota diz o que é
    : (s.matrizSB && s.matrizSB.tema) || s.titulo || s.tituloCache || (s.banco && s.banco.titulo)
      || (s.formato ? s.formato.charAt(0).toUpperCase() + s.formato.slice(1) : 'Post') + ' sem nome';
  const docDe = s => { const d = s.docId && db.docs ? db.docs[s.docId] : null; return d && !d.excluido ? d : null; };
  const blocoDe = id => (id && blocos()[id]) || null;
  const ehVideo = s => pecaDoPost(s) === 'video' && !(s.sugestao && !s.taskId);
  // o status do MKT Hub por cima (como no /api/state): título e etapa da task de produção
  const comHub = lista => (hub && hub.sobrepoe ? hub.sobrepoe(lista) : lista);
  // a task de produção já passou da edição (em aprovação, ajustar ou pronta): a captação já foi feita. A mesma
  // régua do stBucket do painel (public/index.html).
  const EDITADO = new Set(['aprovar', 'aprovação líder', 'revisão solicitada', 'alterar', 'publicar', 'completo', 'banco de criativos']);
  const editado = s => !!(s.taskId && s.statusCache && EDITADO.has(String(s.statusCache.status || '').trim()));
  /** Vídeo que ainda precisa de bloco: sai entre de e ate, não foi ao ar, não está num bloco e não foi editado. */
  const semBloco = (de, ate) => comHub(db.slots.filter(s => !s.postado && s.date && s.date >= de && s.date <= ate && !blocoDe(s.capBloco))).filter(s => ehVideo(s) && !editado(s));
  /** Os vídeos de um bloco, pela data em que saem. */
  const vidsDo = b => comHub(db.slots.filter(s => s.capBloco === b.id)).filter(ehVideo).sort((a, x) => String(a.date || '').localeCompare(String(x.date || '')));

  // ---------------- v4.04: o bloco no MKT Hub ----------------
  const api = () => (envio && envio.api) || null;
  const hubLigado = () => !!(hub && hub.ligado && hub.ligado());
  const H = b => { if (!b.hub || typeof b.hub !== 'object') b.hub = {}; const h = b.hub; if (!Array.isArray(h.maes)) h.maes = []; if (!h.subs || typeof h.subs !== 'object') h.subs = {}; if (!h.pend || typeof h.pend !== 'object') h.pend = {}; return h; };
  const noHub = b => !!(b.hub && Array.isArray(b.hub.maes) && b.hub.maes.length);
  /** A subtarefa do vídeo neste bloco (só se a task dela ainda é do bloco). */
  const subDe = (b, sid) => { const h = b.hub, x = h && h.subs && h.subs[sid]; return x && h.maes.some(m => m.id === x.mae) ? x : null; };
  const cfgCap = () => { if (!db.hubCfg || typeof db.hubCfg !== 'object') db.hubCfg = {}; if (!db.hubCfg.cap || typeof db.hubCfg.cap !== 'object') db.hubCfg.cap = {}; return db.hubCfg.cap; };
  // envio que o servidor não terminou (reiniciou no meio): fica marcado, e mandar de novo não duplica nada
  for (const b of Object.values(blocos())) if (b.hub && b.hub.job && b.hub.job.st === 'enviando') b.hub.job = { st: 'erro', erro: 'o envio foi interrompido (o servidor reiniciou). Mande de novo: nada duplica.', em: new Date().toISOString() };
  // a subtarefa passou da captação: o filmmaker mandou pra aprovação, publicou ou concluiu (st = statusDoPainel do lib/hub.js)
  const CAPTADO = new Set(['aprovar', 'aprovação líder', 'publicar', 'completo', 'banco de criativos']);
  const LIDO = new Map();          // quando cada subtarefa foi lida (só na memória)

  /** Como está o roteiro: sem (sem doc), vazio (só o modelo), escrevendo, aprovacao, alterar ou aprovado. */
  function estadoRoteiro(s, r) {
    if (!docDe(s)) return 'sem';
    const a = s.aprov && s.aprov.c;
    if (a && a.st === 'aprovado') return 'aprovado';
    if (a && a.st === 'alterar') return 'alterar';
    if (a && a.st === 'enviado') return 'aprovacao';
    return r.vazio ? 'vazio' : 'escrevendo';
  }
  function infoVideo(s) {
    const d = docDe(s), r = lerRoteiro(d ? htmlParaTexto(d.html) : '');
    const b = blocoDe(s.capBloco), sub = b ? subDe(b, s.id) : null;
    return {
      id: s.id, titulo: tituloPost(s), conta: s.conta, contaNome: nomeConta(s), date: s.date || null, docId: d ? d.id : null,
      roteiro: estadoRoteiro(s, r), onde: r.onde, quem: r.quem, levar: r.levar, tomadas: r.tomadas,
      bloco: b ? s.capBloco : null, postado: !!s.postado, vaga: !!(s.vaga && !s.taskId),
      hub: sub ? { codigo: sub.codigo, url: sub.url, captado: !!sub.captado } : null,   // v4.04
    };
  }
  /** O vídeo precisa ir (ou ir de novo) pro Hub: ainda não tem subtarefa, ou o roteiro mudou depois de mandar. */
  const falta = (b, s) => { const x = subDe(b, s.id); return !x || !x.h || x.h !== hash(briefingSub(s)); };
  /** O bloco no Hub, pra tela: as tasks (uma por empresa) com a etapa, o envio e se está travado. */
  function hubPublico(b) {
    if (!b.hub || (!noHub(b) && !b.hub.job)) return null;
    const vids = vidsDo(b), comSub = vids.filter(s => subDe(b, s.id));
    return {
      maes: (b.hub.maes || []).map(m => { const t = hub && hub.acha ? hub.acha(m.id) : null; return { codigo: m.codigo, url: m.url, empresa: m.empresa || null, etapa: t && t.etapa ? t.etapa.nome : null, prazo: (t && t.prazo) || m.prazo || null }; }),
      job: b.hub.job || null, travado: noHub(b),
      enviados: comSub.length, novos: vids.length - comSub.length, captados: comSub.filter(s => subDe(b, s.id).captado).length,
      mudados: comSub.filter(s => subDe(b, s.id).h && falta(b, s)).length,   // roteiro que mudou depois de mandar
    };
  }
  function publico(b) {
    return { id: b.id, semana: b.semana, dia: b.dia || null, inicio: b.inicio || '', fim: b.fim || '', quem: b.quem || '', resp: b.resp || null, nota: b.nota || '', criadoEm: b.criadoEm, por: b.por || '', hub: hubPublico(b) };
  }
  /** O quadro de uma semana (segunda a domingo, pela data em que os vídeos saem). */
  function quadro(sem) {
    const fim = soma(sem, 6);
    const daSemana = Object.values(blocos()).filter(b => b.semana === sem)
      .sort((a, b) => String(a.dia || '9999').localeCompare(String(b.dia || '9999')) || String(a.criadoEm).localeCompare(String(b.criadoEm)));
    const ids = new Set(daSemana.map(b => b.id));
    const videos = comHub(db.slots.filter(s => ids.has(s.capBloco))).filter(ehVideo).concat(semBloco(sem, fim))
      .sort((a, b) => String(a.date || '').localeCompare(String(b.date || ''))).map(infoVideo);
    // posts da semana que ainda não sabem se são arte ou vídeo (o doc pergunta): o quadro avisa, pra nenhum vídeo sumir
    const indefinidos = comHub(db.slots.filter(s => s.date && s.date >= sem && s.date <= fim && !s.postado && !(s.sugestao && !s.taskId)))
      .filter(s => pecaDoPost(s) === null && !editado(s))
      .sort((a, b) => a.date.localeCompare(b.date)).slice(0, 30)
      .map(s => ({ id: s.id, titulo: tituloPost(s), contaNome: nomeConta(s), date: s.date, docId: (docDe(s) || {}).id || null }));
    return { semana: sem, ate: fim, hoje: hojeBRT(), videos, blocos: daSemana.map(publico), indefinidos };
  }
  /** O que o quadro precisa do Hub: se está ligado, se dá pra escrever e as pessoas (o "Quem capta"). */
  async function hubDoQuadro() {
    const A = api();
    if (!hubLigado() || !A) return { ligado: false, escrita: false, pessoas: null };
    const r = { ligado: true, escrita: A.escrita(), pessoas: null, erro: null };
    try { r.pessoas = (await A.pessoas()).filter(p => p && p.id && p.ativo !== false).map(p => ({ id: p.id, nome: p.nome })).sort((x, y) => x.nome.localeCompare(y.nome, 'pt-BR')); }
    catch (e) { r.erro = e.message; }
    return r;
  }
  /** A semana que o quadro abre: a primeira, de hoje em diante, com vídeo sem bloco; senão, a próxima. */
  function semanaSugerida() {
    const hoje = hojeBRT(), s0 = segunda(hoje);
    for (let i = 0; i < 4; i++) {
      const sem = soma(s0, 7 * i), fim = soma(sem, 6);
      if (semBloco(sem < hoje ? hoje : sem, fim).length) return sem;
    }
    return soma(s0, 7);
  }
  /** Nome do bloco: "Qui 08/10 · 9h às 12h" (ou "Sem dia"). */
  function nomeBloco(b) {
    return (b.dia ? diaSemana(b.dia) : 'Sem dia') + (b.inicio ? ' · ' + hora(b.inicio) + (b.fim ? ' às ' + hora(b.fim) : '') : '');
  }
  /** O roteiro na pauta: sem o título do modelo (a pauta já diz) e com as tomadas numeradas (1), 2)...). */
  function textoPauta(texto) {
    let n = 0;
    return texto.split('\n').filter((x, i) => !(i === 0 && /^roteiro de captação$/i.test(x.trim())))
      .map(x => /^tomadas \(o que gravar e o que falar\)$/i.test(x.trim()) ? 'Tomadas:' : /^• /.test(x) ? '  ' + (++n) + ') ' + x.slice(2) : x).join('\n');
  }
  /** O roteiro de um vídeo, como vai na pauta e no briefing da subtarefa. */
  function roteiroDe(s) {
    const d = docDe(s), texto = d ? htmlParaTexto(d.html) : '', a = s.aprov && s.aprov.c;
    return { aprovado: !!(a && a.st === 'aprovado'), por: (a && a.ap) || '', texto: lerRoteiro(texto).vazio ? '(sem roteiro no doc)' : textoPauta(texto) };
  }
  /** A pauta do bloco (ou só destes vídeos): o texto que vai pro WhatsApp ou pra task do MKT Hub, com o roteiro de cada vídeo. */
  function pauta(b, lista) {
    const vids = lista || vidsDo(b);
    const l = ['CAPTAÇÃO · ' + nomeBloco(b)];
    if (b.quem) l.push('Quem capta: ' + b.quem);
    if (b.nota) l.push('Nota: ' + b.nota);
    vids.forEach((s, i) => {
      const r = roteiroDe(s);
      l.push('', (i + 1) + '. ' + tituloPost(s) + ' · ' + nomeConta(s) + (s.date ? ' · sai ' + diaSemana(s.date) : ''));
      if (!r.aprovado) l.push('(roteiro ainda não aprovado)');
      l.push(r.texto);
    });
    if (!vids.length) l.push('', '(nenhum vídeo neste bloco)');
    return l.join('\n').slice(0, 60000);
  }
  const tituloMae = b => ('[CAPTAÇÃO] ' + nomeBloco(b)).slice(0, 200);
  const tituloSub = s => ('[CAPTAÇÃO] ' + tituloPost(s).replace(/\[\s*capta[çc][ãa]o\s*\]\s*/gi, '').trim() + (s.date ? ' · sai ' + diaSemana(s.date) : '')).slice(0, 200);   // sem "[CAPTAÇÃO]" repetido
  const briefingMae = (b, vids) => (pauta(b, vids) + '\n\nCada vídeo é uma subtarefa desta task, com o roteiro no briefing. Mandada pelo B.O.N.E. (quadro de captação).').slice(0, 60000);
  function briefingSub(s) {
    const r = roteiroDe(s);
    return [(s.date ? 'Post de ' + diaSemana(s.date) : 'Post sem dia') + ' (' + nomeConta(s) + ')',
      r.aprovado ? 'Roteiro aprovado' + (r.por ? ' por ' + r.por : '') : '(roteiro ainda não aprovado)', '', r.texto].join('\n').slice(0, 60000);
  }
  /** O bloco com o que veio (dia, horário, quem capta, nota). Devolve o erro, ou null e o bloco novo. */
  function aplica(x, b) {
    const n = Object.assign({}, x);
    if ('dia' in b) { if (b.dia !== null && b.dia !== '' && !dataOk(b.dia)) return { erro: 'dia inválido' }; n.dia = b.dia || null; }
    if ('inicio' in b) { const h = String(b.inicio || ''); if (!horaOk(h)) return { erro: 'horário inválido' }; n.inicio = h; }
    if ('fim' in b) { const h = String(b.fim || ''); if (!horaOk(h)) return { erro: 'horário inválido' }; n.fim = h; }
    if ('quem' in b) n.quem = String(b.quem || '').replace(/\s+/g, ' ').trim().slice(0, 60);
    if ('nota' in b) n.nota = String(b.nota || '').replace(/\s+/g, ' ').trim().slice(0, 300);
    if (n.inicio && n.fim && n.fim <= n.inicio) return { erro: 'o fim tem que ser depois do início' };
    return { bloco: n };
  }

  // ---------------- v4.04: mandar o bloco pro MKT Hub ----------------
  /** Os vídeos do bloco por empresa do Hub (1 task por empresa). */
  async function porEmpresa(b, vids) {
    const g = new Map();
    for (const s of vids) {
      const e = await api().empresaDoPost(s);
      const x = g.get(e.slug) || { emp: { slug: e.slug, nome: e.nome }, vids: [] };
      x.vids.push(s); g.set(e.slug, x);
    }
    return [...g.values()];
  }
  /** Como a task está no Hub: 'sumiu' (404 do próprio Hub), 'arquivada', 'existe' ou null (não deu pra saber agora). */
  async function situacao(id) {
    try { const r = await hub.pede('/tarefas/' + id); if (r && r.id) { hub.guarda(r); return r.arquivada ? 'arquivada' : 'existe'; } return null; }
    catch (e) { return e.status === 404 && e.codigo === 'nao_encontrada' ? 'sumiu' : null; }
  }
  /** A task foi apagada ou arquivada no Hub: sai do bloco com as subtarefas dela (o bloco destrava e manda de novo). */
  function soltaMae(b, mae, motivo) {
    const h = H(b);
    h.maes = h.maes.filter(m => m.id !== mae.id);
    for (const [sid, x] of Object.entries(h.subs)) if (x.mae === mae.id) delete h.subs[sid];
    saveDb();
    console.log('[captação] ' + (mae.codigo || mae.id) + (motivo === 'arquivada' ? ' foi arquivada' : ' não existe mais') + ' no Hub: saiu do bloco ' + b.id);
  }
  const existe = b => { if (blocos()[b.id] !== b) throw new Error('o bloco foi excluído no meio do envio'); };
  const ENVIANDO = new Set();
  /** O envio (no servidor, um bloco por vez): a task de cada empresa, uma subtarefa por vídeo e o roteiro no briefing. */
  async function mandaBloco(b, o, quem) {
    const h = H(b), A = api();
    const job = h.job = { st: 'enviando', feitos: 0, total: 1, erro: null, em: new Date().toISOString(), por: quem };
    saveDb();
    try {
      const vids = vidsDo(b);
      if (!vids.length) throw new Error('o bloco não tem vídeo');
      const grupos = await porEmpresa(b, vids);
      const novos = vids.filter(s => falta(b, s));
      job.total = grupos.filter(g => !h.maes.some(m => m.empresa && m.empresa.slug === g.emp.slug)).length + novos.length * 2 + grupos.length;
      saveDb();
      for (const g of grupos) {
        existe(b);
        let mae = h.maes.find(m => m.empresa && m.empresa.slug === g.emp.slug);
        if (!mae) {
          const texto = briefingMae(b, g.vids);
          const r = await A.cria(b, 'mae|' + g.emp.slug, '/tarefas', {
            titulo: tituloMae(b), empresa: g.emp.slug, tipo: o.tipo, formato: FORMATO_HUB, pontos: o.pontos, prazo: b.dia, prioridade: 'media',
            responsavel: b.resp, descricao: texto,
          }, A.achaMae);
          existe(b);
          mae = { id: String(r.id).toLowerCase(), codigo: r.codigo || '', url: urlOk(r.url), empresa: g.emp, prazo: b.dia, criadaEm: new Date().toISOString(), por: quem, h: hash(texto) };
          h.maes.push(mae);
          if (r.titulo && !r.doCache) hub.guarda(r);
          job.feitos++; saveDb();
        }
        for (const s of g.vids) {
          existe(b);
          let sub = h.subs[s.id];
          if (sub && sub.mae !== mae.id) sub = null;                     // era de uma task que saiu do bloco: entra na desta empresa
          const texto = briefingSub(s), hh = hash(texto);
          if (sub && sub.h === hh) continue;                              // já está no Hub com este roteiro
          for (let tent = 0; ; tent++) {
            try {
              if (!sub) {
                // a criação da subtarefa não aceita briefing: ele vai logo abaixo, no PATCH
                const r = await A.cria(b, 'sub|' + s.id + '|' + mae.id, '/tarefas/' + mae.id + '/subtarefas', {
                  titulo: tituloSub(s), tipo: o.tipo, formato: FORMATO_HUB, pontos: o.pontosSub, responsavel: b.resp,
                }, A.achaSub(mae));
                existe(b);
                sub = h.subs[s.id] = { id: String(r.id).toLowerCase(), codigo: r.codigo || '', url: urlOk(r.url), mae: mae.id, h: null };
                if (r.titulo && !r.doCache) hub.guarda(r);
                job.feitos++; saveDb();
              }
              if (sub.h !== hh) { await A.chama('PATCH', '/tarefas/' + sub.id, { descricao: texto }, crypto.randomUUID()); sub.h = hh; }
              job.feitos++; saveDb();
              break;
            } catch (e) {
              // 404: apagaram a task da empresa no Hub (sai do bloco: mande de novo) ou só a subtarefa (cria de novo)
              if (e.status !== 404 || tent > 0) throw e;
              const sit = await situacao(mae.id);
              if (sit === 'sumiu' || sit === 'arquivada') {
                soltaMae(b, mae, sit);
                throw Object.assign(new Error('a task ' + (mae.codigo || '') + (sit === 'arquivada' ? ' foi arquivada' : ' não existe mais') + ' no MKT Hub: mande de novo (vira outra task)'), { status: 404 });
              }
              delete h.subs[s.id]; sub = null; saveDb();
            }
          }
        }
        // a pauta da task (briefing) acompanha os vídeos que entraram depois
        const resumo = briefingMae(b, g.vids), rh = hash(resumo);
        if (mae.h !== rh) { await A.chama('PATCH', '/tarefas/' + mae.id, { descricao: resumo }, crypto.randomUUID()); mae.h = rh; }
        job.feitos++; saveDb();
      }
      h.job = { st: 'ok', feitos: job.total, total: job.total, em: job.em, ate: new Date().toISOString(), n: novos.length, por: quem };
      saveDb();
      console.log('[captação] bloco ' + b.id + ': ' + novos.length + ' vídeo(s) no Hub (' + h.maes.map(m => m.codigo).join(', ') + ')');
    } catch (e) {
      const msg = e.status === 403 ? 'o Hub recusou (' + e.message + '): a MKH_CHAVE precisa ser de nível completa e a dona dela precisa alcançar essa empresa'
        : e.status === 429 ? 'o Hub está limitando os envios agora: mande de novo em 1 minuto (nada duplica)'
          : e.status === 400 && e.detalhes && e.detalhes.campo ? 'o Hub recusou o campo "' + e.detalhes.campo + '": ' + e.message
            : e.message;
      if (blocos()[b.id] === b) { h.job = Object.assign({}, h.job, { st: 'erro', erro: msg, ate: new Date().toISOString() }); saveDb(); }
      console.log('[captação] envio do bloco ' + b.id + ' falhou: ' + e.message);
    }
  }
  /** A tela de mandar: o que vai (empresas e vídeos), o que falta e as sugestões (tipo e pontos da última captação). */
  async function opcoesHub(b) {
    const A = api(), c = cfgCap();
    const base = { ligado: hubLigado(), escrita: false, nivel: null, job: (b.hub && b.hub.job) || null, faltas: [], grupos: [], erro: null };
    if (!base.ligado || !A) return Object.assign(base, { erro: 'o painel não está ligado ao MKT Hub (falta a MKH_CHAVE)' });
    base.nivel = await A.nivel(); base.escrita = A.escrita();
    const vids = vidsDo(b);
    if (!b.dia) base.faltas.push('escolha o dia do bloco');
    if (!b.resp) base.faltas.push('escolha quem capta (uma pessoa do MKT Hub)');
    if (!vids.length) base.faltas.push('ponha pelo menos 1 vídeo no bloco');
    try {
      base.grupos = (await porEmpresa(b, vids)).map(g => {
        const mae = (b.hub && b.hub.maes || []).find(m => m.empresa && m.empresa.slug === g.emp.slug) || null;
        return { empresa: g.emp, mae: mae ? { codigo: mae.codigo, url: mae.url } : null,
          videos: g.vids.map(s => { const sub = subDe(b, s.id); return { id: s.id, titulo: tituloPost(s), conta: nomeConta(s), date: s.date || null, roteiro: roteiroDe(s).aprovado,
            noHub: !!(sub && sub.h), mudou: !!(sub && sub.h && falta(b, s)), codigo: sub ? sub.codigo : null }; }) };
      });
    } catch (e) { base.erro = e.message; }
    const tipos = A.TIPOS.slice().sort((x, y) => (y === 'Captação') - (x === 'Captação'));
    return Object.assign(base, {
      titulo: tituloMae(b), prazo: b.dia || null, resp: b.resp ? { id: b.resp, nome: b.quem || '' } : null, formato: FORMATO_HUB, tipos,
      sugestao: { tipo: c.tipo || 'Captação', pontos: c.pontos || 1, pontosSub: c.pontosSub || 1 },
    });
  }
  /**
   * Depois de cada leitura do Hub: o captado de cada vídeo (a subtarefa dele) e o dia do bloco pelo prazo da task.
   * Só os blocos de 3 semanas atrás em diante; no máximo 10 leituras por volta, cada subtarefa no máximo a cada 3 min.
   */
  async function confereHub() {
    if (!hubLigado()) return;
    const lo = soma(segunda(hojeBRT()), -21), agora = Date.now();
    let lidas = 0, mexeu = false;
    for (const b of Object.values(blocos())) {
      if (!noHub(b) || b.semana < lo) continue;
      // o prazo da task manda no dia do bloco (quando todas as tasks dele dizem o mesmo dia)
      const prazos = new Set(b.hub.maes.map(m => { const t = hub.acha(m.id); return t && t.prazo; }).filter(Boolean));
      if (prazos.size === 1) { const p = [...prazos][0]; if (dataOk(p) && p !== b.dia) { b.dia = p; mexeu = true; } }
      for (const [sid, sub] of Object.entries(b.hub.subs)) {
        if (sub.captado || !b.hub.maes.some(m => m.id === sub.mae)) continue;
        if (lidas >= RELE_POR_VOLTA) break;
        if (agora - (LIDO.get(sub.id) || 0) < RELE_MS) continue;
        try {
          const r = await hub.pede('/tarefas/' + sub.id); lidas++; LIDO.set(sub.id, agora);
          hub.guarda(r);
          const t = hub.acha(sub.id);
          if (t && (t.concluida || CAPTADO.has(t.st))) { sub.captado = new Date().toISOString(); mexeu = true; }
        } catch (e) {
          if (e.status === 404 && e.codigo === 'nao_encontrada') {
            const mae = b.hub.maes.find(m => m.id === sub.mae), sit = mae ? await situacao(mae.id) : 'sumiu';
            if (mae && (sit === 'sumiu' || sit === 'arquivada')) soltaMae(b, mae, sit);
            else { delete b.hub.subs[sid]; console.log('[captação] a subtarefa ' + (sub.codigo || sub.id) + ' não existe mais no Hub: o vídeo volta pra mandar'); }
            mexeu = true;
          } else break;                                                   // limite ou rede: tenta na próxima volta
        }
      }
    }
    if (mexeu) saveDb();
  }

  async function rota(req, res, p, u) {
    if (p === '/api/captacao' && req.method === 'GET') {
      const q = u.searchParams.get('semana');
      const r = quadro(dataOk(q) ? segunda(q) : semanaSugerida());
      r.hub = await hubDoQuadro();                                        // v4.04: quem capta = pessoa do Hub
      return json(res, 200, r), true;
    }
    if (p === '/api/captacao/blocos' && req.method === 'POST') {
      if (soAdmin(req, res)) return true;
      const b = await readBody(req);
      if (!dataOk(b.semana)) return json(res, 400, { erro: 'semana inválida' }), true;
      const base = { id: 'cb' + crypto.randomBytes(4).toString('hex'), semana: segunda(b.semana), dia: null, inicio: '', fim: '', quem: '', nota: '',
        criadoEm: new Date().toISOString(), por: String((req.eu && req.eu.nome) || b.por || '').slice(0, 40) };
      const r = aplica(base, b);
      if (r.erro) return json(res, 400, { erro: r.erro }), true;
      blocos()[base.id] = r.bloco; saveDb();
      return json(res, 200, { ok: true, bloco: publico(r.bloco) }), true;
    }
    const m = p.match(/^\/api\/captacao\/blocos\/(cb[0-9a-f]{8})(\/pauta|\/hub)?$/);
    if (!m) return false;
    const x = blocos()[m[1]];
    if (!x) return json(res, 404, { erro: 'bloco não encontrado' }), true;
    if (m[2] === '/pauta') return req.method === 'GET' ? (json(res, 200, { texto: pauta(x), nome: nomeBloco(x) }), true) : false;
    if (m[2] === '/hub') {
      if (req.method === 'GET') return json(res, 200, await opcoesHub(x)), true;
      if (req.method !== 'POST') return false;
      if (soAdmin(req, res)) return true;
      if (ENVIANDO.has(x.id)) return json(res, 409, { erro: 'este bloco já está indo pro MKT Hub: espere terminar' }), true;
      const A = api();
      if (!hubLigado() || !A) return json(res, 400, { erro: 'o painel não está ligado ao MKT Hub (falta a MKH_CHAVE)' }), true;
      const n = await A.nivel();
      if (n !== 'completa') return json(res, 400, { erro: n ? 'a chave do MKT Hub é de nível ' + n + ': pra mandar a captação, a MKH_CHAVE do Render precisa ser de nível completa' : 'não consegui ver o nível da chave do MKT Hub agora; tente de novo em 1 minuto' }), true;
      const b = await readBody(req);
      const tipos = (Array.isArray(b.tipo) ? b.tipo : String(b.tipo || '').split(',')).map(t => String(t).trim()).filter(Boolean);
      const pontos = parseInt(b.pontos), pontosSub = parseInt(b.pontosSub);
      if (!tipos.length || tipos.some(t => !A.TIPOS.includes(t))) return json(res, 400, { erro: 'escolha o tipo', campo: 'tipo' }), true;
      if (!(pontos >= 1 && pontos <= 100)) return json(res, 400, { erro: 'pontos da task de 1 a 100', campo: 'pontos' }), true;
      if (!(pontosSub >= 1 && pontosSub <= 100)) return json(res, 400, { erro: 'pontos de cada vídeo de 1 a 100', campo: 'pontosSub' }), true;
      if (!x.dia) return json(res, 400, { erro: 'escolha o dia do bloco antes de mandar', campo: 'dia' }), true;
      if (!x.resp) return json(res, 400, { erro: 'escolha quem capta (uma pessoa do MKT Hub) antes de mandar', campo: 'resp' }), true;
      const vids = vidsDo(x);
      if (!vids.length) return json(res, 400, { erro: 'o bloco não tem vídeo' }), true;
      if (!vids.some(s => falta(x, s))) return json(res, 409, { erro: 'todos os vídeos deste bloco já estão no MKT Hub, com o roteiro de agora' }), true;
      let pessoa;
      try { pessoa = (await A.pessoas()).find(q => q && q.id === x.resp && q.ativo !== false); }
      catch (e) { return json(res, e.status || 502, { erro: e.message }), true; }
      if (!pessoa) return json(res, 400, { erro: 'quem capta não está ativo no MKT Hub: escolha de novo', campo: 'resp' }), true;
      const c = cfgCap(); c.tipo = tipos.join(', '); c.pontos = pontos; c.pontosSub = pontosSub;   // a próxima tela já vem com isso
      ENVIANDO.add(x.id);
      mandaBloco(x, { tipo: tipos.join(', '), pontos, pontosSub }, req.eu ? req.eu.nome : String(b.quem || '').slice(0, 40))
        .finally(() => ENVIANDO.delete(x.id));
      return json(res, 202, { ok: true, job: x.hub.job }), true;
    }
    if (req.method === 'PATCH') {
      if (soAdmin(req, res)) return true;
      const body = await readBody(req);
      // v4.04: depois de mandar, o Hub manda no dia, no horário, em quem capta e na nota (a pauta foi com eles)
      if (noHub(x) && ['dia', 'inicio', 'fim', 'quem', 'resp', 'nota'].some(k => k in body)) {
        return json(res, 409, { erro: 'este bloco já está no MKT Hub (' + x.hub.maes.map(q => q.codigo).filter(Boolean).join(', ') + '): o dia e quem capta mudam lá' }), true;
      }
      if (ENVIANDO.has(x.id)) return json(res, 409, { erro: 'este bloco está indo pro MKT Hub: espere terminar' }), true;
      let resp;
      if ('resp' in body) {
        if (body.resp === null || body.resp === '') { resp = null; body.quem = ''; }
        else {
          const A = api();
          if (!hubLigado() || !A) return json(res, 400, { erro: 'o painel não está ligado ao MKT Hub (falta a MKH_CHAVE)' }), true;
          let pessoa;
          try { pessoa = (await A.pessoas()).find(q => q && q.id === body.resp && q.ativo !== false); }
          catch (e) { return json(res, e.status || 502, { erro: e.message }), true; }
          if (!pessoa) return json(res, 400, { erro: 'pessoa não encontrada no MKT Hub' }), true;
          resp = pessoa.id; body.quem = pessoa.nome;
        }
      }
      const r = aplica(x, body);
      if (r.erro) return json(res, 400, { erro: r.erro }), true;
      if (resp !== undefined) { if (resp) r.bloco.resp = resp; else delete r.bloco.resp; }
      blocos()[x.id] = r.bloco; saveDb();
      return json(res, 200, { ok: true, bloco: publico(r.bloco) }), true;
    }
    if (req.method === 'DELETE') {
      if (soAdmin(req, res)) return true;
      if (ENVIANDO.has(x.id)) return json(res, 409, { erro: 'este bloco está indo pro MKT Hub: espere terminar' }), true;
      let soltos = 0;
      for (const s of db.slots) if (s.capBloco === x.id) { delete s.capBloco; soltos++; }   // os vídeos voltam pra "A organizar"
      const noHubAinda = noHub(x) ? x.hub.maes.map(q => q.codigo).filter(Boolean) : [];   // no Hub, as tasks continuam
      delete blocos()[x.id]; saveDb();
      return json(res, 200, { ok: true, soltos, noHub: noHubAinda }), true;
    }
    return false;
  }
  /** Os blocos das últimas 5 semanas em diante, pro /api/state (o card do vídeo mostra o dia da captação e o captado). */
  rota.publicos = () => {
    const lo = soma(segunda(hojeBRT()), -35);
    return Object.values(blocos()).filter(b => b.semana >= lo).map(b => {
      const o = { id: b.id, semana: b.semana, dia: b.dia || null, inicio: b.inicio || '', fim: b.fim || '' };
      if (noHub(b)) { o.hub = true; o.feitos = Object.entries(b.hub.subs).filter(([, x]) => x.captado && b.hub.maes.some(m => m.id === x.mae)).map(([sid]) => sid); }
      return o;
    });
  };
  /** Vídeos que saem de hoje a 13 dias e ainda não estão em bloco (o número do botão Captação, só do ADMIN). */
  rota.pendentes = () => {
    const hoje = hojeBRT(), ate = soma(hoje, 13);
    return semBloco(hoje, ate).length;
  };
  rota.existe = id => !!blocoDe(id);
  rota.pauta = id => { const b = blocoDe(id); return b ? pauta(b) : ''; };
  rota.nomeBloco = id => { const b = blocoDe(id); return b ? nomeBloco(b) : ''; };
  rota.confereHub = () => confereHub().catch(e => console.log('[captação] leitura do captado: ' + e.message));
  return rota;
};
