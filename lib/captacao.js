// v4.03: QUADRO DE CAPTAÇÃO. Pedido do Zion (02/10/2026): "tem que ter alguma maneira de dividir o bloco de captação
// do jeito que eu quiser, tipo, se elis fizer 4 videos complexos eu divido em duas tasks para dois dias". Escolhas
// dele: o quadro (tela própria) e o filmmaker só no MKT Hub. Os vídeos da semana (pela data em que saem) caem em
// "A organizar" e o ADMIN arrasta pros blocos; cada bloco tem o dia da captação, o horário, quem capta e uma nota.
// O vídeo fica no bloco pelo slot.capBloco (uma fonte só: o bloco não guarda lista). A pauta do bloco (texto pra
// colar no WhatsApp ou na task do MKT Hub) junta o roteiro de cada vídeo, que a Elis escreve no doc (lib/peca.js).
// Dados (regra 11): db.capBlocos e slot.capBloco, opcionais, sem migração.
'use strict';
const crypto = require('crypto');
const { pecaDoPost, lerRoteiro } = require('./peca.js');

const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

module.exports = function criarCaptacao(ctx) {
  const { db, saveDb, readBody, json, soAdmin, htmlParaTexto, hub } = ctx;
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
    return {
      id: s.id, titulo: tituloPost(s), conta: s.conta, contaNome: nomeConta(s), date: s.date || null, docId: d ? d.id : null,
      roteiro: estadoRoteiro(s, r), onde: r.onde, quem: r.quem, levar: r.levar, tomadas: r.tomadas,
      bloco: blocoDe(s.capBloco) ? s.capBloco : null, postado: !!s.postado, vaga: !!(s.vaga && !s.taskId),
    };
  }
  function publico(b) {
    return { id: b.id, semana: b.semana, dia: b.dia || null, inicio: b.inicio || '', fim: b.fim || '', quem: b.quem || '', nota: b.nota || '', criadoEm: b.criadoEm, por: b.por || '' };
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
  /** A pauta do bloco: o texto que vai pro WhatsApp ou pra task do MKT Hub, com o roteiro de cada vídeo. */
  function pauta(b) {
    const vids = comHub(db.slots.filter(s => s.capBloco === b.id)).filter(ehVideo).sort((a, x) => String(a.date || '').localeCompare(String(x.date || '')));
    const l = ['CAPTAÇÃO · ' + nomeBloco(b)];
    if (b.quem) l.push('Quem capta: ' + b.quem);
    if (b.nota) l.push('Nota: ' + b.nota);
    vids.forEach((s, i) => {
      const d = docDe(s), texto = d ? htmlParaTexto(d.html) : '', a = s.aprov && s.aprov.c;
      l.push('', (i + 1) + '. ' + tituloPost(s) + ' · ' + nomeConta(s) + (s.date ? ' · sai ' + diaSemana(s.date) : ''));
      if (!(a && a.st === 'aprovado')) l.push('(roteiro ainda não aprovado)');
      l.push(lerRoteiro(texto).vazio ? '(sem roteiro no doc)' : textoPauta(texto));
    });
    if (!vids.length) l.push('', '(nenhum vídeo neste bloco)');
    return l.join('\n').slice(0, 60000);
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

  async function rota(req, res, p, u) {
    if (p === '/api/captacao' && req.method === 'GET') {
      const q = u.searchParams.get('semana');
      return json(res, 200, quadro(dataOk(q) ? segunda(q) : semanaSugerida())), true;
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
    const m = p.match(/^\/api\/captacao\/blocos\/(cb[0-9a-f]{8})(\/pauta)?$/);
    if (!m) return false;
    const x = blocos()[m[1]];
    if (!x) return json(res, 404, { erro: 'bloco não encontrado' }), true;
    if (m[2]) return req.method === 'GET' ? (json(res, 200, { texto: pauta(x), nome: nomeBloco(x) }), true) : false;
    if (req.method === 'PATCH') {
      if (soAdmin(req, res)) return true;
      const r = aplica(x, await readBody(req));
      if (r.erro) return json(res, 400, { erro: r.erro }), true;
      blocos()[x.id] = r.bloco; saveDb();
      return json(res, 200, { ok: true, bloco: publico(r.bloco) }), true;
    }
    if (req.method === 'DELETE') {
      if (soAdmin(req, res)) return true;
      let soltos = 0;
      for (const s of db.slots) if (s.capBloco === x.id) { delete s.capBloco; soltos++; }   // os vídeos voltam pra "A organizar"
      delete blocos()[x.id]; saveDb();
      return json(res, 200, { ok: true, soltos }), true;
    }
    return false;
  }
  /** Os blocos das últimas 5 semanas em diante, pro /api/state (o card do vídeo mostra o dia da captação). */
  rota.publicos = () => {
    const lo = soma(segunda(hojeBRT()), -35);
    return Object.values(blocos()).filter(b => b.semana >= lo).map(b => ({ id: b.id, semana: b.semana, dia: b.dia || null, inicio: b.inicio || '', fim: b.fim || '' }));
  };
  /** Vídeos que saem de hoje a 13 dias e ainda não estão em bloco (o número do botão Captação, só do ADMIN). */
  rota.pendentes = () => {
    const hoje = hojeBRT(), ate = soma(hoje, 13);
    return semBloco(hoje, ate).length;
  };
  rota.existe = id => !!blocoDe(id);
  rota.pauta = id => { const b = blocoDe(id); return b ? pauta(b) : ''; };
  rota.nomeBloco = id => { const b = blocoDe(id); return b ? nomeBloco(b) : ''; };
  return rota;
};
