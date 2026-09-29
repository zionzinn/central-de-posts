// Tarefas da copywriter no MKT Hub (v3.84). Pedido do Zion em 28/09/2026: o botão de aprovação da tarefa
// "na real vai criar uma TASK MÃE (MATRIZ [PERÍODO X]) e subtasks com as matrizes preenchidas", o mesmo pra copy,
// e a aprovação acontece no Hub. Decisões dele (29/09/2026):
//   - tipo "Copy" na mãe e nas subtarefas (matriz e copy); formato da mãe "Outros"; o da subtarefa vem do post
//   - 1 ponto MKT em cada (dá pra mudar nas Configurações); prazo = o dia em que foi feito
//   - a mesma chave (MKH_CHAVE), agora de nível completa. Com chave de leitura, tudo segue como na v3.80
//   - aprovada = a mãe saiu de Aprovação pra frente (Aprovação líder, Publicar, Completo). Ajustar = pra alterar
// O Hub ainda não lança horas pela API nem tem "mandar pra aprovação": o tempo de cada post vai escrito no
// briefing da subtarefa (e no CSV, como antes), e a Elis move a mãe de Pendente pra Aprovação no Hub.
// Contrato conferido no openapi.json de produção (29/09/2026): a mãe nasce com briefing (descricao); a
// subtarefa NÃO aceita descricao na criação, então o briefing dela vai logo depois pelo PATCH (a única edição
// que a API tem). Nada duplica: cada criação ganha uma Idempotency-Key guardada ANTES de mandar (tf.hub.pend);
// se a resposta se perder, o próximo envio repete a MESMA chamada com a MESMA chave e o Hub devolve o que já
// criou (a chave vale 24 h no Hub; passou disso, o painel procura a tarefa pelo título antes de criar de novo).
// Limite do Hub: 30 escritas por minuto por chave; o envio espera o Retry-After e continua sozinho.
// v3.85 (pedido do Zion: "não quero que tenha esse tipo de trava"): mãe arquivada ou apagada no Hub solta os posts
// sem aprovação (voltam pra mandar de novo e o próximo envio cria outra mãe); excluir a tarefa sempre pode.
'use strict';
const crypto = require('crypto');

const TIPO = 'Copy';
const FORMATO_MAE = 'Outros';
const NIVEL_MS = 10 * 60e3;                 // nível da chave (leitura ou completa): pergunta de novo a cada 10 min
const CADASTRO_MS = 10 * 60e3;              // pessoas e empresas do Hub guardadas 10 min
const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

const semAcento = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const hojeBRT = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
const brData = d => d.slice(8, 10) + '/' + d.slice(5, 7);
const diaSemana = d => DIAS[new Date(d + 'T12:00:00Z').getUTCDay()] + ' ' + brData(d);
const espera = ms => new Promise(r => setTimeout(r, ms));
const hash = t => crypto.createHash('sha1').update(String(t)).digest('hex').slice(0, 16);
/** UUID fixo a partir de um texto (formato v5): a mesma operação manda sempre a mesma Idempotency-Key. */
function uuidDe(txt) {
  const h = crypto.createHash('sha1').update('bone|' + txt).digest('hex');
  return h.slice(0, 8) + '-' + h.slice(8, 12) + '-5' + h.slice(13, 16) + '-' + ((parseInt(h[16], 16) & 3) | 8).toString(16) + h.slice(17, 20) + '-' + h.slice(20, 32);
}
function fmtTempo(seg) {
  if (!(seg > 0)) return 'nada no relógio';
  const m = Math.round(seg / 60);
  if (m < 1) return 'menos de 1 min';
  return m < 60 ? m + ' min' : Math.floor(m / 60) + ' h' + (m % 60 ? ' ' + String(m % 60).padStart(2, '0') + ' min' : '');
}
/** Texto do documento (HTML do editor) em texto simples, que é o que o briefing do Hub aceita. */
function htmlParaTexto(h) {
  return String(h || '')
    .replace(/<li[^>]*>/gi, '• ').replace(/<(br|\/p|\/h\d|\/li|\/tr|\/div|\/blockquote)[^>]*>/gi, '\n').replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
/** Formato do post no B.O.N.E. → formato do Hub (lista que o Zion mandou). Sem formato claro, "Outros". */
function formatoHub(s) {
  const f = semAcento(s.formato);
  const direto = { reels: 'Vídeo', 'corte de podcast': 'Vídeo', 'video medio': 'Vídeo', 'video de anuncio': 'Vídeo Ads', carrossel: 'Carrossel', estatico: 'Estático', story: 'Stories', stories: 'Stories' };
  if (direto[f]) return direto[f];
  const m = semAcento(s.matrizSB && s.matrizSB.formato);                     // na matriz, o formato é descritivo
  if (/carrossel/.test(m)) return 'Carrossel';
  if (/\bstor(y|ies)\b/.test(m)) return 'Stories';
  if (/video|documentario|vlog|\bpov\b|react|trend|cinematico|fala direta|contando|bastidor/.test(m)) return 'Vídeo';
  if (/foto|print|card|numero|placar|meme|grid|colagem|callout|frase|notificacao|checklist|calendario|quadro|tier|selo|starter/.test(m)) return 'Estático';
  return 'Outros';
}

module.exports = function criarHubEnvio(ctx) {
  const { db, saveDb, readBody, json, hub, tempo, itens, soAdmin } = ctx;
  const gravaJa = () => { saveDb(); if (ctx.gravaJa) ctx.gravaJa(); };   // a chave da criação vai pro disco ANTES do pedido sair
  const urlOk = u => /^https?:\/\//i.test(String(u || '')) ? String(u) : '';
  const cfg = () => {
    if (!db.hubCfg || typeof db.hubCfg !== 'object') db.hubCfg = {};
    const c = db.hubCfg;
    c.pontosMae = Math.min(100, Math.max(1, parseInt(c.pontosMae) || 1));
    c.pontosSub = Math.min(100, Math.max(1, parseInt(c.pontosSub) || 1));
    return c;
  };
  const C = { nivel: null, nivelEm: 0, pessoas: null, pessoasEm: 0, empresas: null, empresasEm: 0, fila: Promise.resolve() };
  // o último nível visto fica guardado: depois de reiniciar, o painel segue no modo Hub até conferir de novo (na 1ª leitura)
  if (hub.ligado() && db.hubCfg && (db.hubCfg.nivel === 'completa' || db.hubCfg.nivel === 'leitura')) C.nivel = db.hubCfg.nivel;
  const K = tf => tf.tipo === 'matriz' ? 'm' : 'c';
  const H = tf => { if (!tf.hub || typeof tf.hub !== 'object') tf.hub = {}; const h = tf.hub; if (!Array.isArray(h.maes)) h.maes = []; if (!h.subs || typeof h.subs !== 'object') h.subs = {}; if (!h.pend || typeof h.pend !== 'object') h.pend = {}; return h; };

  // envio que o servidor não terminou (reiniciou no meio): fica marcado, e mandar de novo não duplica nada
  for (const tf of Object.values(db.tarefas || {})) {
    if (tf.hub && tf.hub.job && tf.hub.job.st === 'enviando') tf.hub.job = { st: 'erro', erro: 'o envio foi interrompido (o servidor reiniciou). Mande de novo: nada duplica.', em: new Date().toISOString() };
  }

  /** Nível da chave (leitura | completa). Escrita só com completa; sem chave, null. */
  async function nivel(forca) {
    if (!hub.ligado()) return null;
    if (!forca && C.nivel && Date.now() - C.nivelEm < NIVEL_MS) return C.nivel;
    try {
      const e = await hub.pede('/eu'); C.nivel = (e.chave && e.chave.nivel) || 'leitura'; C.nivelEm = Date.now();
      const c = cfg(); if (c.nivel !== C.nivel) { c.nivel = C.nivel; saveDb(); }
    }
    catch (e) { if (!C.nivel) C.nivelEm = Date.now() - NIVEL_MS + 60e3; }  // sem resposta: tenta de novo em 1 min
    return C.nivel;
  }
  const escrita = () => hub.ligado() && C.nivel === 'completa';
  // o nível é perguntado depois da primeira leitura do Hub (confere), que só roda com alguém usando o painel

  async function pessoas() {
    if (C.pessoas && Date.now() - C.pessoasEm < CADASTRO_MS) return C.pessoas;
    const r = await hub.pede('/pessoas');
    C.pessoas = Array.isArray(r) ? r : (r.dados || []); C.pessoasEm = Date.now();
    return C.pessoas;
  }
  async function empresas() {
    if (C.empresas && Date.now() - C.empresasEm < CADASTRO_MS) return C.empresas;
    const r = await hub.pede('/empresas');
    C.empresas = Array.isArray(r) ? r : (r.dados || []); C.empresasEm = Date.now();
    return C.empresas;
  }
  /** "Elis" no B.O.N.E. → a pessoa do Hub (nome igual ou mesmo primeiro nome, ativa primeiro). */
  async function pessoaDe(nome) {
    const alvo = semAcento(nome), pri = alvo.split(' ')[0];
    const l = (await pessoas()).filter(p => p && p.id);
    let achou = l.filter(p => semAcento(p.nome) === alvo);
    if (!achou.length) achou = l.filter(p => semAcento(p.nome).split(' ')[0] === pri);
    const ativas = achou.filter(p => p.ativo !== false);
    if (ativas.length) achou = ativas;
    if (!achou.length) throw Object.assign(new Error('não achei "' + nome + '" nas pessoas do Hub (confira o nome em "Quem faz")'), { status: 400 });
    if (achou.length > 1) throw Object.assign(new Error('tem mais de uma pessoa chamada "' + nome + '" no Hub (' + achou.map(p => p.nome).join(', ') + '): use o nome completo em "Quem faz"'), { status: 400 });
    return achou[0];
  }
  /** Empresa da tarefa no Hub, pelo nome da aba; na Carbone, pela conta da maioria dos posts. */
  async function empresaDe(tf, slots) {
    const nomeAba = semAcento({ 'SEUBONÉ': 'SeuBoné', 'CARBONE': 'Carbone', 'ONEVO': 'Onevo', 'WEEVO': 'Weevo' }[tf.aba] || tf.aba).replace(/\s/g, '');
    const nome = e => semAcento(e.nome).replace(/\s/g, ''), slug = e => semAcento(e.slug).replace(/[-_\s]/g, '');
    const l = (await empresas()).filter(e => e && e.slug && (nome(e).startsWith(nomeAba) || slug(e).startsWith(nomeAba)));
    if (!l.length) throw Object.assign(new Error('não achei a empresa ' + tf.aba + ' no Hub'), { status: 400 });
    if (l.length === 1) return l[0];
    // mais de uma (ex.: Carbone Educação e Carbone Club): a conta da maioria dos posts decide; senão, a de nome igual
    const club = slots.filter(s => /club/.test(s.conta)).length, edu = slots.filter(s => /edu/.test(s.conta)).length;
    const pista = club > edu ? 'club' : edu ? 'educa' : '';
    return (pista && l.find(e => semAcento(e.nome + ' ' + e.slug).includes(pista))) || l.find(e => nome(e) === nomeAba || slug(e) === nomeAba) || l[0];
  }

  // ---------- o que vai no Hub ----------
  const nomeConta = s => (db.contas[s.conta] && db.contas[s.conta].nome) || s.conta;
  const tituloPost = s => (s.matrizSB && s.matrizSB.tema) || s.titulo || s.tituloCache || (s.matrizSB && s.matrizSB.tipo) || s.formato || 'post';
  const segPost = (tf, s) => (tempo ? tempo.tempoDoPost(s.id)[K(tf) === 'm' ? 0 : 1] : 0) || 0;
  function briefingPost(tf, s) {
    const seg = segPost(tf, s);
    if (tf.tipo === 'matriz') {
      const m = s.matrizSB || {};
      const campos = [['Tipo', m.tipo], ['Formato', m.formato], ['Pauta quente', m.pautaQuente], ['Ângulo', m.angulo], ['Tema', m.tema], ['Tese', m.tese],
        ['Gancho', m.gancho], ['Descrição', m.descricao], ['Referências', m.refs], ['Quem faz', m.responsavel], ['Observação', m.obs]];
      return ['Matriz do post de ' + diaSemana(s.date) + ' (' + nomeConta(s) + ')', '',
        ...campos.filter(([, v]) => v && String(v).trim()).map(([r, v]) => r + ': ' + String(v).trim()), '',
        'Tempo de ' + tf.por + ' nesta matriz: ' + fmtTempo(seg), 'Feita no B.O.N.E. (Central de Posts)'].join('\n');
    }
    const d = s.docId && db.docs ? db.docs[s.docId] : null;
    const texto = d && !d.excluido ? htmlParaTexto(d.html) : '';
    return ['Copy do post de ' + diaSemana(s.date) + ' (' + nomeConta(s) + (s.formato ? ', ' + s.formato : '') + ')', '',
      texto || '(documento vazio)', '',
      'Tempo de ' + tf.por + ' nesta copy: ' + fmtTempo(seg), 'Escrita no B.O.N.E. (Central de Posts)'].join('\n').slice(0, 60000);
  }
  function briefingMae(tf, mae) {
    const h = H(tf), k = K(tf);
    const daMae = db.slots.filter(s => h.subs[s.id] && h.subs[s.id].mae === mae.id).sort((a, b) => String(a.date).localeCompare(String(b.date)));
    const nosPosts = daMae.reduce((a, s) => a + segPost(tf, s), 0);
    const fora = Math.max(0, (tf.seg || 0) - itens(tf).reduce((a, s) => a + segPost(tf, s), 0));
    return [(k === 'm' ? 'Matriz' : 'Copy') + ' de ' + brData(tf.de) + ' a ' + brData(tf.ate) + ', feita por ' + tf.por + ' no B.O.N.E. (Central de Posts).',
      'Cada post é uma subtarefa, com o conteúdo no briefing. Aprovar ou pedir alteração é aqui na tarefa mãe.', '',
      'Posts (' + daMae.length + '):', ...daMae.map(s => '• ' + (s.date ? diaSemana(s.date) : 'sem dia') + ' · ' + tituloPost(s) + (h.subs[s.id].codigo ? ' (' + h.subs[s.id].codigo + ')' : '')), '',
      'Tempo nos posts: ' + fmtTempo(nosPosts) + (fora ? ' · fora dos posts: ' + fmtTempo(fora) : '') + ' · total da tarefa: ' + fmtTempo(tf.seg)].join('\n');
  }
  const tituloMae = (tf, rodada) => (tf.tipo === 'matriz' ? 'MATRIZ' : 'COPY') + ' [' + brData(tf.de) + ' a ' + brData(tf.ate) + ']' + (rodada > 1 ? ' · ' + rodada : '');
  const tituloSub = (tf, s) => ((tf.tipo === 'matriz' ? 'Matriz' : 'Copy') + ' · ' + diaSemana(s.date) + ' · ' + tituloPost(s)).slice(0, 200);
  /** Prazo da subtarefa = o dia em que o post foi feito (a última vez que ganhou tempo nesta atividade); sem tempo, hoje. */
  function ultimoDia(tf, s) {
    const d = tempo && tempo.ultimoDiaDoPost ? tempo.ultimoDiaDoPost(s.id, K(tf)) : null;
    return d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : hojeBRT();
  }

  /** Uma escrita no Hub: espera o limite (429) e a chave ainda rodando (409); repete falha de rede com a MESMA chave. */
  async function chama(metodo, caminho, body, idem) {
    for (let t = 0; ; t++) {
      try { return await hub.pede(caminho, { method: metodo, body, headers: { 'Idempotency-Key': idem } }); }
      catch (e) {
        if (e.status === 429 && t < 10) { await espera(Math.min(75, e.retry || 30) * 1000 + 250); continue; }
        if (e.status === 409 && e.codigo === 'idempotencia_em_andamento' && t < 5) { await espera(3000); continue; }
        if ((e.status === 502 || e.status >= 500) && t < 3) { await espera([2000, 5000, 10000][t]); continue; }
        if (e.codigo === 'idempotencia_reusada') e.message = 'o Hub recusou repetir um envio com outro conteúdo (' + e.message + '). Mande de novo.';
        throw e;
      }
    }
  }
  /** Resposta que não deixa dúvida (o Hub recusou de vez): a chamada guardada pode ir embora. */
  const definitivo = e => e.status >= 400 && e.status < 500 && e.status !== 408 && e.status !== 409 && e.status !== 429;
  /**
   * Chamada que cria algo. A chave e o corpo ficam guardados ANTES de mandar; se a resposta se perder (queda,
   * servidor reiniciou), o próximo envio repete igual e o Hub devolve o que já criou. Guardada há mais de 23 h
   * (o Hub esquece a chave em 24 h): procura a tarefa pelo título antes de criar outra.
   */
  async function cria(tf, ref, caminho, body, acha) {
    const h = H(tf);
    let p = h.pend[ref];
    if (p && (p.caminho !== caminho || !p.em || Date.now() - Date.parse(p.em) > 23 * 3600e3)) {
      // pra procurar pelo título, o painel precisa ter lido o Hub inteiro (depois de reiniciar, espera a 1ª leitura)
      if (p.caminho === caminho && acha && !(hub.completa && hub.completa())) throw Object.assign(new Error('o painel ainda está lendo o MKT Hub: mande de novo em 1 minuto'), { status: 503 });
      const ja = p.caminho === caminho && acha ? acha(p.body) : null;
      delete h.pend[ref]; saveDb();
      if (ja) return Object.assign({ doCache: true }, ja);
      p = null;
    }
    if (!p) { p = h.pend[ref] = { caminho, body, idem: crypto.randomUUID(), em: new Date().toISOString() }; gravaJa(); }
    try {
      const r = await chama('POST', p.caminho, p.body, p.idem);
      delete h.pend[ref];
      return r;
    } catch (e) {
      if (definitivo(e)) { delete h.pend[ref]; saveDb(); }
      throw e;
    }
  }
  /** Tarefa do Hub já criada por nós (na memória da última leitura), pra quando a chave guardada venceu. */
  const achaMae = body => (hub.busca ? hub.busca(t => !t.mae && t.titulo === body.titulo && t.empresa && t.empresa.slug === body.empresa) : [])[0] || null;
  const achaSub = mae => body => (hub.busca ? hub.busca(t => t.mae && (t.mae === mae.codigo || t.mae === mae.id) && t.titulo === body.titulo) : [])[0] || null;

  /** Estado da mãe pelo que o Hub diz da etapa (decisão do Zion: aprovada = saiu de Aprovação pra frente). */
  function estadoDaEtapa(st) {
    if (st === 'alterar') return 'alterar';
    if (st === 'aprovar') return 'aprovacao';
    if (st === 'aprovação líder' || st === 'publicar' || st === 'completo' || st === 'banco de criativos') return 'aprovada';
    return 'pendente';
  }

  /** Muda a aprovação de todos os posts desta mãe (mesmo os que saíram do período ou já foram postados). */
  function marcaSlots(tf, mae, fn) {
    const k = K(tf), agora = new Date().toISOString();
    for (const s of db.slots) {
      const a = s.aprov && s.aprov[k];
      if (a && a.hub === mae.id) s.aprov = Object.assign({}, s.aprov, { [k]: fn(Object.assign({}, a), agora) });
    }
  }
  /** Como a tarefa está no Hub: 'sumiu' (404 do próprio Hub), 'arquivada', 'existe' ou null (não deu pra saber agora). */
  async function situacao(id) {
    try { const r = await hub.pede('/tarefas/' + id); if (r && r.id) { hub.guarda(r); return r.arquivada ? 'arquivada' : 'existe'; } return null; }
    catch (e) { return e.status === 404 && e.codigo === 'nao_encontrada' ? 'sumiu' : null; }
  }
  // v3.85: mãe apagada OU arquivada no Hub fica fechada: nada trava, os posts voltam e o próximo envio cria outra
  const FECHADA = new Set(['sumiu', 'arquivada']);
  /** A mãe foi apagada ou arquivada no Hub: os posts dela que não foram aprovados voltam pra mandar de novo. */
  function fecha(tf, mae, motivo) {
    const k = K(tf), soltos = new Set();
    mae.estado = motivo;
    for (const s of db.slots) { const a = s.aprov && s.aprov[k]; if (a && a.hub === mae.id && a.st !== 'aprovado') { const x = Object.assign({}, s.aprov); delete x[k]; s.aprov = x; soltos.add(s.id); } }
    for (const [sid, x] of Object.entries(tf.hub.subs || {})) if (x.mae === mae.id && soltos.has(sid)) delete tf.hub.subs[sid];
    saveDb();
    console.log('[hub] ' + (mae.codigo || mae.id) + (motivo === 'arquivada' ? ' foi arquivada' : ' não existe mais') + ' no Hub: ' + soltos.size + ' post(s) voltaram pra mandar de novo');
  }
  const erroFechada = (mae, sit) => Object.assign(new Error('a tarefa mãe ' + (mae.codigo || '') + (sit === 'arquivada' ? ' foi arquivada' : ' não existe mais') + ' no Hub: os posts dela voltaram. Mande de novo (vira outra tarefa mãe)'), { status: 404 });

  // ---------- o envio (um por vez, na fila) ----------
  async function envia(tf, ids, quem) {
    const h = H(tf), k = K(tf), c = cfg();
    const job = h.job = { st: 'enviando', feitos: 0, total: ids.length + 1, erro: null, em: new Date().toISOString(), por: quem };
    saveDb();
    try {
      const naTarefa = new Set(itens(tf).map(s => s.id));          // o que saiu do período (ou foi pro banco) no meio do caminho fica de fora
      const posts = ids.map(id => db.slots.find(s => s.id === id)).filter(s => s && naTarefa.has(s.id));
      if (!posts.length) throw new Error('esses posts não estão mais nesta tarefa');
      const pessoa = await pessoaDe(tf.por);
      // a mãe aberta desta tarefa (ainda não aprovada); se todas já foram aprovadas, nasce outra (rodada 2, 3…)
      let mae = h.maes.filter(m => m.estado !== 'aprovada' && !FECHADA.has(m.estado)).slice(-1)[0];
      // arquivada no Hub e o painel ainda não tinha visto: fecha ela e nasce outra
      if (mae) { const tm = hub.acha(mae.id); if (tm && tm.arquivada) { fecha(tf, mae, 'arquivada'); mae = null; } }
      const reenvio = !!mae;
      if (!mae) {
        const empresa = await empresaDe(tf, posts);
        const rodada = h.maes.length + 1;
        const r = await cria(tf, 'mae' + rodada, '/tarefas', {
          titulo: tituloMae(tf, rodada), empresa: empresa.slug, tipo: TIPO, formato: FORMATO_MAE, pontos: c.pontosMae,
          prazo: hojeBRT(), responsavel: pessoa.id, descricao: 'Mandada pelo B.O.N.E. (Central de Posts). Os posts entram como subtarefas.',
        }, achaMae);
        mae = { id: String(r.id).toLowerCase(), codigo: r.codigo || '', url: urlOk(r.url), rodada, criadaEm: new Date().toISOString(), estado: 'pendente',
          etapa: r.etapa ? { slug: r.etapa.slug, nome: r.etapa.nome, cor: r.etapa.cor } : null, trilha: r.trilha || null };
        h.maes.push(mae);
        if (r.titulo && !r.doCache) hub.guarda(r);
        saveDb();
      }
      job.feitos = 1; saveDb();
      const mudados = [];
      const existe = () => { if (db.tarefas[tf.id] !== tf) throw new Error('a tarefa foi excluída no meio do envio'); };
      for (const s of posts) {
        existe();
        // a mãe foi aprovada no Hub enquanto mandava: para aqui (o que faltou vai numa mãe nova no próximo envio)
        const tm = hub.acha(mae.id);
        if (tm && mae.estado !== 'aprovada' && estadoDaEtapa(tm.st) === 'aprovada') throw Object.assign(new Error('a tarefa mãe ' + (mae.codigo || '') + ' foi aprovada no Hub no meio do envio: mande de novo o que faltou (vai numa tarefa mãe nova)'), { status: 409 });
        const texto = briefingPost(tf, s), hh = hash(texto);
        let sub = h.subs[s.id];
        if (sub && sub.mae !== mae.id) sub = null;                           // era de uma mãe já aprovada: entra na nova
        for (let tent = 0; ; tent++) {
          try {
            if (!sub) {
              // a criação da subtarefa não aceita briefing: ele vai logo abaixo, no PATCH
              const r = await cria(tf, 'sub|' + s.id + '|' + mae.id, '/tarefas/' + mae.id + '/subtarefas', {
                titulo: tituloSub(tf, s), tipo: TIPO, formato: formatoHub(s), pontos: c.pontosSub, prazo: ultimoDia(tf, s), responsavel: pessoa.id,
              }, achaSub(mae));
              sub = h.subs[s.id] = { id: String(r.id).toLowerCase(), codigo: r.codigo || '', url: urlOk(r.url), mae: mae.id, h: null };
              if (r.titulo && !r.doCache) hub.guarda(r);
              saveDb();
            }
            if (sub.h !== hh) {
              await chama('PATCH', '/tarefas/' + sub.id, { descricao: texto }, crypto.randomUUID());
              if (sub.h) mudados.push(s);                                    // já tinha briefing: é um ajuste
              sub.h = hh;
            }
            break;
          } catch (e) {
            // 404: apagaram no Hub a mãe (os posts dela voltam; o próximo envio cria outra) ou só a subtarefa (cria de novo)
            if (e.status !== 404 || tent > 0) throw e;
            const sit = await situacao(mae.id);
            if (FECHADA.has(sit)) { fecha(tf, mae, sit); throw erroFechada(mae, sit); }
            delete h.subs[s.id]; sub = null; saveDb();
          }
        }
        // o post fica "no Hub": em aprovação quando a mãe estiver em Aprovação; antes disso, esperando ela mover
        existe();
        const ant = (s.aprov && s.aprov[k]) || {};
        const novo = { st: 'enviado', em: new Date().toISOString(), por: quem, hub: mae.id, sub: sub.codigo, pend: mae.estado !== 'aprovacao' };
        const pedido = ant.st === 'alterar' ? ant.nota : ant.pedido;
        if (pedido) novo.pedido = pedido;
        s.aprov = Object.assign({}, s.aprov, { [k]: novo });
        job.feitos++; saveDb();
      }
      if (!mae.slots) mae.slots = [];
      for (const s of posts) if (!mae.slots.includes(s.id)) mae.slots.push(s.id);
      // o resumo da mãe (lista dos posts e o tempo) acompanha cada envio
      const resumo = briefingMae(tf, mae), rh = hash(resumo);
      if (mae.h !== rh) {
        try { await chama('PATCH', '/tarefas/' + mae.id, { descricao: resumo }, crypto.randomUUID()); }
        catch (e) { if (e.status === 404) { const sit = await situacao(mae.id); if (FECHADA.has(sit)) { fecha(tf, mae, sit); throw erroFechada(mae, sit); } } throw e; }
        mae.h = rh;
      }
      // comentário só quando alguém está olhando a mãe (em Aprovação ou em Ajustar): em Pendente, ninguém revisa ainda
      if (reenvio && (mae.estado === 'aprovacao' || mae.estado === 'alterar')) {
        const n = (mae.envios || 1) + 1;
        const txt = ('Reenviado pelo B.O.N.E.: ' + posts.length + ' post' + (posts.length > 1 ? 's' : '') + (mudados.length ? ' (' + mudados.length + ' ajustado' + (mudados.length > 1 ? 's' : '') + ': ' + mudados.map(s => brData(s.date)).join(', ') + ')' : '') + '.'
          + (mae.estado !== 'aprovacao' ? ' Falta mover esta tarefa pra Aprovação.' : '')).slice(0, 4000);
        await chama('POST', '/tarefas/' + mae.id + '/comentarios', { texto: txt }, uuidDe(mae.id + '|c|' + n + '|' + hash(txt)));
        mae.envios = n;
      } else if (reenvio) mae.envios = (mae.envios || 1) + 1;
      mae.ultimoEnvio = new Date().toISOString();
      h.job = { st: 'ok', feitos: job.total, total: job.total, em: job.em, ate: mae.ultimoEnvio, mae: mae.codigo, n: posts.length };
      saveDb();
      console.log('[hub] ' + tf.id + ': ' + posts.length + ' post(s) no Hub (' + mae.codigo + ')');
    } catch (e) {
      const msg = e.status === 403 ? 'o Hub recusou (' + e.message + '): a MKH_CHAVE precisa ser de nível completa e a dona dela precisa alcançar essa empresa'
        : e.status === 429 ? 'o Hub está limitando os envios agora: mande de novo em 1 minuto (nada duplica)'
          : e.status === 400 && e.detalhes && e.detalhes.campo ? 'o Hub recusou o campo "' + e.detalhes.campo + '": ' + e.message
            : e.message;
      h.job = Object.assign({}, h.job, { st: 'erro', erro: msg, ate: new Date().toISOString() });
      saveDb();
      console.log('[hub] envio da tarefa ' + tf.id + ' falhou: ' + e.message);
    }
  }

  /** Depois de cada leitura do Hub: a etapa de cada mãe decide o estado dos posts dela no B.O.N.E. */
  async function confere() {
    let mexeu = false;
    for (const tf of Object.values(db.tarefas || {})) {
      if (!tf.hub || !Array.isArray(tf.hub.maes)) continue;
      if (tf.hub.job && tf.hub.job.st === 'enviando') continue;
      // código e link que a criação não trouxe (o Hub responde só id e código se a releitura falhar)
      for (const x of Object.values(tf.hub.subs || {})) {
        if (x.url && x.codigo) continue;
        const t = hub.acha(x.id);
        if (t && ((!x.codigo && t.codigo) || (!x.url && urlOk(t.url)))) { x.codigo = x.codigo || t.codigo; x.url = x.url || urlOk(t.url); mexeu = true; }
      }
      for (const mae of tf.hub.maes) {
        if (FECHADA.has(mae.estado)) continue;
        const t = hub.acha(mae.id);
        if (!t) {
          // fora da memória depois de uma leitura completa: confere direto no Hub (no máximo 1 vez por hora por mãe)
          if (mae.estado === 'aprovada' || !hub.completa || !hub.completa()) continue;
          if (Date.now() - Date.parse(mae.criadaEm || 0) < 15 * 60e3 || (mae.checadaEm && Date.now() - Date.parse(mae.checadaEm) < 3600e3)) continue;
          mae.checadaEm = new Date().toISOString(); mexeu = true;
          const sit = await situacao(mae.id);
          if (FECHADA.has(sit)) fecha(tf, mae, sit);
          continue;
        }
        // arquivada no Hub sem ter sido aprovada: os posts voltam pra mandar de novo (nada fica preso)
        if (t.arquivada && mae.estado !== 'aprovada') { fecha(tf, mae, 'arquivada'); mexeu = true; continue; }
        if ((!mae.codigo && t.codigo) || (!mae.url && urlOk(t.url))) { mae.codigo = mae.codigo || t.codigo; mae.url = mae.url || urlOk(t.url); mexeu = true; }
        const etapa = t.etapa ? { slug: t.etapa.slug, nome: t.etapa.nome, cor: t.etapa.cor } : mae.etapa || null;
        if (JSON.stringify(etapa) !== JSON.stringify(mae.etapa || null)) { mae.etapa = etapa; mexeu = true; }
        const novo = estadoDaEtapa(t.st);
        if (novo === mae.estado) continue;
        const antes = mae.estado; mae.estado = novo; mexeu = true;
        // volta de aprovada: o post deixa de estar aprovado; de "pra alterar": o pedido fica visível na revisão
        const limpa = a => { if (a.st === 'alterar' && a.nota) a.pedido = a.nota; delete a.nota; delete a.ap; delete a.apEm; return a; };
        if (novo === 'alterar') {
          // o pedido: o comentário "ALTERAÇÃO SOLICITADA:" que o Hub grava, feito depois do último envio
          let nota = '', ap = '';
          try {
            const desde = mae.ultimoEnvio ? Date.parse(mae.ultimoEnvio) - 60e3 : 0;
            const r = await hub.pede('/tarefas/' + mae.id + '/comentarios');
            const c = (r.dados || []).filter(x => !desde || Date.parse(x.criado_em) >= desde).sort((a, b) => Date.parse(b.criado_em) - Date.parse(a.criado_em))
              .find(x => /^altera[cç][aã]o solicitada/i.test(String(x.corpo_texto || '').trim()));
            if (c) { nota = String(c.corpo_texto).trim().replace(/^altera[cç][aã]o solicitada\s*:?\s*/i, '').trim().slice(0, 500); ap = (c.autor && c.autor.nome) || ''; }
          } catch (e) { console.log('[hub] comentários da ' + mae.codigo + ': ' + e.message); }
          marcaSlots(tf, mae, (a, agora) => Object.assign(a, { st: 'alterar', ap: ap || 'MKT Hub', apEm: agora, nota: nota || 'pediu alteração no MKT Hub (veja os comentários da ' + mae.codigo + ')', pend: false }));
        } else if (novo === 'aprovada') {
          let ap = '';
          try {
            const r = await hub.pede('/tarefas/' + mae.id + '/historico');
            const ev = (r.dados || []).filter(x => /stage/.test(String(x.acao || ''))).sort((a, b) => Date.parse(b.em) - Date.parse(a.em))[0];
            ap = (ev && ev.autor && ev.autor.nome) || '';
          } catch (e) { console.log('[hub] histórico da ' + mae.codigo + ': ' + e.message); }
          marcaSlots(tf, mae, (a, agora) => { const x = Object.assign(a, { st: 'aprovado', ap: ap || 'MKT Hub', apEm: agora, pend: false }); delete x.nota; return x; });
        } else if (novo === 'aprovacao') {
          marcaSlots(tf, mae, (a, agora) => Object.assign(limpa(a), { st: 'enviado', em: agora, pend: false }));
        } else {
          marcaSlots(tf, mae, a => { if (a.st === 'aprovado') { limpa(a); a.st = 'enviado'; } a.pend = true; return a; });
        }
        console.log('[hub] ' + (mae.codigo || mae.id) + ': ' + antes + ' → ' + novo);
      }
    }
    if (mexeu) saveDb();
    if (hub.ligado() && Date.now() - C.nivelEm > NIVEL_MS) await nivel(true).catch(() => {});
  }
  hub.depois = confere;

  async function rota(req, res, p, u) {
    // Configurações: dá pra escrever? (nível da chave) e os pontos de cada tarefa
    if (p === '/api/hub/escrita' && req.method === 'GET') {
      const n = await nivel(u && u.searchParams.get('fresh') === '1');
      return json(res, 200, { ligado: hub.ligado(), nivel: n, escrita: escrita(), cfg: cfg() }), true;
    }
    if (p === '/api/hub/config' && req.method === 'POST') {
      if (soAdmin(req, res)) return true;
      const b = await readBody(req), c = cfg();
      for (const k of ['pontosMae', 'pontosSub']) if (k in b) { const v = parseInt(b[k]); if (!(v >= 1 && v <= 100)) return json(res, 400, { erro: 'pontos de 1 a 100' }), true; c[k] = v; }
      saveDb();
      return json(res, 200, { ok: true, cfg: c }), true;
    }
    const m = p.match(/^\/api\/tarefas\/(t[0-9a-f]{8})\/hub$/);
    if (!m) return false;
    const tf = db.tarefas[m[1]];
    if (!tf) return json(res, 404, { erro: 'tarefa não encontrada' }), true;
    if (req.method === 'GET') return json(res, 200, { hub: publico(tf) }), true;
    if (req.method !== 'POST') return false;
    if (!hub.ligado()) return json(res, 400, { erro: 'o painel não está ligado ao MKT Hub (falta a MKH_CHAVE)' }), true;
    // com login, manda quem faz a tarefa (ou um ADMIN): a tarefa nasce no Hub no nome dela
    if (req.eu && req.eu.papel !== 'admin' && semAcento(req.eu.nome) !== semAcento(tf.por))
      return json(res, 403, { erro: 'só quem faz a tarefa (' + tf.por + ') ou um ADMIN manda pro MKT Hub' }), true;
    const n = await nivel();
    if (!n) return json(res, 502, { erro: 'não consegui confirmar a chave com o MKT Hub agora: tente de novo em 1 minuto' }), true;
    if (n !== 'completa') return json(res, 400, { erro: 'a chave do Hub é de leitura: no Render, a MKH_CHAVE precisa ser de nível completa pra criar tarefas' }), true;
    const h = H(tf);
    const b = await readBody(req);
    if (h.job && h.job.st === 'enviando') return json(res, 409, { erro: 'essa tarefa já está indo pro Hub', hub: publico(tf) }), true;
    const k = K(tf), daTarefa = new Map(itens(tf).map(s => [s.id, s]));
    const lista = (Array.isArray(b.slots) ? b.slots : []).map(id => daTarefa.get(String(id))).filter(Boolean)
      .filter(s => !(s.aprov && s.aprov[k] && s.aprov[k].st === 'aprovado'));
    if (!lista.length) return json(res, 400, { erro: 'nenhum post pra mandar' }), true;
    if (tf.tipo === 'copy') {
      const vazio = lista.find(s => { const d = s.docId && db.docs ? db.docs[s.docId] : null; return !d || d.excluido || !htmlParaTexto(d.html); });
      if (vazio) return json(res, 400, { erro: 'o post de ' + brData(vazio.date) + ' ainda não tem copy no documento' }), true;
    }
    const quem = req.eu ? req.eu.nome : String(b.quem || tf.por || '').slice(0, 24);
    const ids = lista.map(s => s.id);
    h.job = { st: 'enviando', feitos: 0, total: ids.length + 1, em: new Date().toISOString(), por: quem };
    saveDb();
    C.fila = C.fila.then(() => envia(tf, ids, quem)).catch(() => {});
    return json(res, 202, { ok: true, hub: publico(tf) }), true;
  }

  /** O que a tela precisa saber do Hub nesta tarefa. */
  function publico(tf) {
    if (!tf.hub) return null;
    const h = tf.hub;
    return {
      maes: (h.maes || []).map(m => ({ id: m.id, codigo: m.codigo, url: m.url, rodada: m.rodada, estado: m.estado, etapa: m.etapa || null, posts: (m.slots || []).length })),
      job: h.job || null,
      subs: Object.fromEntries(Object.entries(h.subs || {}).map(([sid, x]) => [sid, { codigo: x.codigo, url: x.url }])),
    };
  }

  rota.escrita = escrita;
  rota.publico = publico;
  rota.nivel = nivel;
  rota.confere = confere;
  return rota;
};
module.exports.formatoHub = formatoHub;
module.exports.htmlParaTexto = htmlParaTexto;
module.exports.uuidDe = uuidDe;
