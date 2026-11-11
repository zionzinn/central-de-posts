// Task de produção no MKT Hub (v3.90, decisão 19). O ADMIN (Zion ou Maria) cria a task de arte ou vídeo de um post
// numa tela com título, tipo, formato, responsável, entrega, data do post, pontos e prioridade; o briefing é o do
// post (e o material do banco, quando tem) e dá pra editar antes de mandar (v3.93). A data do post vai pelo
// POST /prazos (data_publicacao, que só a API grava) e acompanha quando o post muda de dia no B.O.N.E. O post fica
// ligado à task no dia dele (taskId).
// v4.22 (pedido do Zion em 11/11/2026: a copywriter não usa mais o B.O.N.E): saiu tudo da tarefa de matriz e de copy
// que ia pro Hub como tarefa mãe com subtarefas (v3.84, parada desde a v3.88) e a exigência de copy aprovada pra criar
// a task de produção. O código antigo está no backup _backup-v4.21-fluxo-copy.
'use strict';
const crypto = require('crypto');

const NIVEL_MS = 10 * 60e3;                 // nível da chave (leitura ou completa): pergunta de novo a cada 10 min
const CADASTRO_MS = 10 * 60e3;              // pessoas e empresas do Hub guardadas 10 min
const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

const semAcento = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const hojeBRT = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
const brData = d => d.slice(8, 10) + '/' + d.slice(5, 7);
const diaSemana = d => DIAS[new Date(d + 'T12:00:00Z').getUTCDay()] + ' ' + brData(d);
const espera = ms => new Promise(r => setTimeout(r, ms));

/** Formato do post no B.O.N.E. → formato do Hub (lista que o Zion mandou). Sem formato claro, "Outros". */
function formatoHub(s) {
  const f = semAcento(s.formato);
  if (!f && s.banco && /^(cortes|depoimentos)/.test(s.banco.sec)) return 'Vídeo';   // v3.96: corte e depoimento são vídeo
  const direto = { reels: 'Vídeo', 'corte de podcast': 'Vídeo', 'video medio': 'Vídeo', 'video de anuncio': 'Vídeo Ads', carrossel: 'Carrossel', estatico: 'Estático', story: 'Stories', stories: 'Stories' };
  if (direto[f]) return direto[f];
  const m = semAcento(s.matrizSB && s.matrizSB.formato);                     // card antigo da matriz (o dado ficou): o formato é descritivo
  if (/carrossel/.test(m)) return 'Carrossel';
  if (/\bstor(y|ies)\b/.test(m)) return 'Stories';
  if (/video|documentario|vlog|\bpov\b|react|trend|cinematico|fala direta|contando|bastidor/.test(m)) return 'Vídeo';
  if (/foto|print|card|numero|placar|meme|grid|colagem|callout|frase|notificacao|checklist|calendario|quadro|tier|selo|starter/.test(m)) return 'Estático';
  return 'Outros';
}

module.exports = function criarHubEnvio(ctx) {
  const { db, saveDb, readBody, json, hub } = ctx;
  const gravaJa = () => { saveDb(); if (ctx.gravaJa) ctx.gravaJa(); };   // a chave da criação vai pro disco ANTES do pedido sair
  const urlOk = u => /^https?:\/\//i.test(String(u || '')) ? String(u) : '';
  const cfg = () => { if (!db.hubCfg || typeof db.hubCfg !== 'object') db.hubCfg = {}; return db.hubCfg; };
  const C = { nivel: null, nivelEm: 0, pessoas: null, pessoasEm: 0, empresas: null, empresasEm: 0 };
  // o último nível visto fica guardado: depois de reiniciar, o painel segue no modo Hub até conferir de novo (na 1ª leitura)
  if (hub.ligado() && db.hubCfg && (db.hubCfg.nivel === 'completa' || db.hubCfg.nivel === 'leitura')) C.nivel = db.hubCfg.nivel;

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
  /** Empresa no Hub pelo nome da aba; na Carbone, pela conta da maioria dos posts. */
  async function empresaDe(aba, slots) {
    const nomeAba = semAcento({ 'SEUBONÉ': 'SeuBoné', 'CARBONE': 'Carbone', 'ONEVO': 'Onevo', 'WEEVO': 'Weevo' }[aba] || aba).replace(/\s/g, '');
    const nome = e => semAcento(e.nome).replace(/\s/g, ''), slug = e => semAcento(e.slug).replace(/[-_\s]/g, '');
    const l = (await empresas()).filter(e => e && e.slug && (nome(e).startsWith(nomeAba) || slug(e).startsWith(nomeAba)));
    if (!l.length) throw Object.assign(new Error('não achei a empresa ' + aba + ' no Hub'), { status: 400 });
    if (l.length === 1) return l[0];
    // mais de uma (ex.: Carbone Educação e Carbone Club): a conta da maioria dos posts decide; senão, a de nome igual
    const club = slots.filter(s => /club/.test(s.conta)).length, edu = slots.filter(s => /edu/.test(s.conta)).length;
    const pista = club > edu ? 'club' : edu ? 'educa' : '';
    return (pista && l.find(e => semAcento(e.nome + ' ' + e.slug).includes(pista))) || l.find(e => nome(e) === nomeAba || slug(e) === nomeAba) || l[0];
  }

  const nomeConta = s => (db.contas[s.conta] && db.contas[s.conta].nome) || s.conta;
  const tituloPost = s => s.titulo || s.tituloCache || (s.banco && s.banco.titulo) || (s.matrizSB && (s.matrizSB.tema || s.matrizSB.tipo)) || s.formato || 'post';

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
  // ================= v3.90: task de produção (arte ou vídeo no Hub) =================
  // Tipos e formatos: os catálogos do Hub que o Zion mandou (v3.84); a ordem vem do que o time mais usa (tasks na
  // memória da leitura do Hub). "Copy" fica de fora (não é produção).
  const TIPOS_PROD = ['Arte de post', 'Vídeo', 'Edição de vídeo', 'Captação', 'Fotos', 'Roteiro de vídeo', 'Conteúdo', 'Post feed', 'Stories', 'Outros', 'Alteração', 'Demanda extra'];
  const FORMATOS_PROD = ['Vídeo', 'Vídeo Ads', 'Carrossel', 'Estático', 'Stories', 'Outros'];
  const PRIORIDADES = ['urgente', 'alta', 'media', 'baixa'];
  const TIPO_DO_FORMATO = { 'Vídeo': 'Vídeo', 'Vídeo Ads': 'Vídeo', 'Carrossel': 'Arte de post', 'Estático': 'Arte de post', 'Stories': 'Stories', 'Outros': 'Arte de post' };
  const dataOk = d => /^\d{4}-\d{2}-\d{2}$/.test(String(d || '')) && !isNaN(Date.parse(d + 'T12:00:00Z'));
  const diaAntes = iso => new Date(Date.parse(iso + 'T12:00:00Z') - 864e5).toISOString().slice(0, 10);
  /** Quantas vezes cada valor aparece nas tasks do Hub que o painel tem na memória (tipo pode vir "A, B"). */
  function contagem(campo, filtro) {
    const n = new Map();
    for (const t of (hub.busca ? hub.busca(filtro || (() => true)) : [])) for (const v of String(t[campo] || '').split(',').map(x => x.trim()).filter(Boolean)) n.set(v, (n.get(v) || 0) + 1);
    return n;
  }
  const porUso = (lista, n) => lista.slice().sort((a, b) => (n.get(b) || 0) - (n.get(a) || 0));
  /** Empresa do post no Hub: primeiro pelo nome da conta (Carbone Club, Onevo Energia...), senão pela aba. */
  async function empresaDoPost(s) {
    const alvo = semAcento(nomeConta(s)).replace(/\s/g, '');
    const l = (await empresas()).filter(e => e && e.slug);
    const igual = l.find(e => semAcento(e.nome).replace(/\s/g, '') === alvo);
    if (igual) return igual;
    return empresaDe(db.contas[s.conta] ? db.contas[s.conta].aba : '', [s]);
  }
  const tituloProd = (s, formato) => ('[' + String(formato || 'post').toUpperCase() + '] ' + tituloPost(s)).slice(0, 200);
  /** Briefing da task de produção: o post e, quando tem, o material do banco e a observação. A tela deixa editar (v3.93). */
  const NOME_SEC = { reutilizar: 'Reutilizar', drive: 'Drive de conteúdos', cortes: 'Corte de podcast', depoimentos: 'Depoimento', 'depoimentos-workshop': 'Depoimento do Workshop', 'depoimentos-imersao': 'Depoimento da Imersão' };
  function briefingProd(s) {
    const linhas = [(s.date ? 'Post de ' + diaSemana(s.date) : 'Post sem dia') + ' (' + nomeConta(s) + (s.formato ? ', ' + s.formato : '') + ')'];
    if (s.banco) linhas.push('', 'MATERIAL DO BANCO (' + (s.banco.tipo === 'bruto' ? 'Vídeo bruto' : (NOME_SEC[s.banco.sec] || 'Banco')) + (s.banco.pessoa ? ' · ' + s.banco.pessoa : '') + '): ' + (s.banco.titulo || 'sem título'), s.banco.url);   // v3.97: bruto e pessoa
    if (s.obs) linhas.push('', 'OBSERVAÇÃO', String(s.obs));
    return linhas.join('\n').slice(0, 60000);
  }
  /** v3.93: o briefing que veio da tela (editado ou não). Sem o campo (tela antiga), vale o padrão; vazio = null (recusa). */
  function briefingDoPedido(b, s) {
    if (!b || typeof b.briefing !== 'string') return briefingProd(s);
    const t = b.briefing.replace(/\r\n?/g, '\n').replace(/[ \t]+$/gm, '').replace(/\n{4,}/g, '\n\n\n').trim().slice(0, 60000);
    return t || null;
  }
  const publicoProd = x => x ? { id: x.id || null, codigo: x.codigo || '', url: urlOk(x.url), criadaEm: x.criadaEm || null, por: x.por || '', dataPost: x.dataPost || null, dataPostPend: x.dataPostPend === undefined ? undefined : x.dataPostPend, pend: !!x.pend } : null;
  const doPost = sid => db.slots.find(x => x.id === sid) || null;   // sempre o post de agora (o Ctrl+Z troca o objeto)
  /** Grava a data do post no Hub (data_publicacao). Erro do item (a task sumiu, por exemplo) vem com item e codigo. */
  async function gravaDataPost(tarefa, data) {
    const r = await chama('POST', '/prazos', { prazos: [{ tarefa, data_publicacao: data || null }] }, crypto.randomUUID());
    const x = r && Array.isArray(r.resultados) ? r.resultados[0] : null;
    if (!x || !x.ok) throw Object.assign(new Error((x && x.erro && x.erro.mensagem) || 'o Hub não confirmou a data do post'), { status: 422, item: true, codigo: (x && x.erro && x.erro.codigo) || null });
  }
  // A data do post vai pro Hub um pedido por vez por post, sempre a mais nova: se o post mudou de dia enquanto um
  // pedido estava no ar, manda de novo logo depois (a ordem nunca inverte). Sem resposta, fica pendente no post.
  const ENVIANDO = new Map();                 // post -> envio da data em andamento
  const FILA_DATA = new Map();                // post -> espera de 1,5 s (arrastar várias vezes vira 1 pedido)
  function enviaData(sid) {
    if (ENVIANDO.has(sid)) return ENVIANDO.get(sid);
    const p = (async () => {
      try {
        for (let volta = 0; volta < 5; volta++) {
          const s = doPost(sid);
          if (!s || !s.prod || !s.prod.id || s.taskId !== s.prod.id || s.prod.dataPostPend === undefined) return null;
          const alvo = s.prod.dataPostPend;
          try { await gravaDataPost(s.prod.id, alvo); }
          catch (e) {
            // a task não existe mais no Hub: para de tentar (a próxima mudança de dia tenta de novo)
            const x = doPost(sid);
            if (e.codigo === 'nao_encontrada' && x && x.prod && x.prod.dataPostPend === alvo) { delete x.prod.dataPostPend; saveDb(); }
            return e;
          }
          const x = doPost(sid);
          if (!x || !x.prod) return null;
          x.prod.dataPost = alvo;
          if (x.prod.dataPostPend === alvo) delete x.prod.dataPostPend;
          saveDb();
          if (x.prod.dataPostPend === undefined) return null;             // mudou de dia no meio: manda a nova
        }
        return null;
      } finally { ENVIANDO.delete(sid); }
    })();
    ENVIANDO.set(sid, p);
    return p;
  }
  /** O post mudou de dia no B.O.N.E: a data do post acompanha no Hub (sem travar a tela). */
  function moveDataPost(s) {
    if (!s || !s.prod || !s.prod.id || s.taskId !== s.prod.id || !escrita()) return;
    const data = s.date || null, sid = s.id;
    if (s.prod.dataPost === data && s.prod.dataPostPend === undefined) return;
    s.prod.dataPostPend = data; saveDb();
    clearTimeout(FILA_DATA.get(sid));
    const t = setTimeout(() => {
      FILA_DATA.delete(sid);
      enviaData(sid).then(e => { if (e) console.log('[hub] data do post ' + sid + ' não foi pro Hub: ' + e.message); });
    }, 1500);
    if (t.unref) t.unref();
    FILA_DATA.set(sid, t);
  }
  /** Depois de cada leitura do Hub: a data do post que não foi na hora (Hub fora do ar) vai de novo, até 5 por volta. */
  async function reenviaDatas() {
    let n = 0;
    if (escrita()) for (const s of db.slots.slice()) {
      if (n >= 5) break;
      if (!s.prod || !s.prod.id || s.taskId !== s.prod.id || s.prod.dataPostPend === undefined || FILA_DATA.has(s.id) || ENVIANDO.has(s.id)) continue;
      n++;
      const e = await enviaData(s.id);
      console.log('[hub] data do post de ' + (s.prod.codigo || s.prod.id) + (e ? ' ainda não foi: ' + e.message : ' foi pro Hub (de novo)'));
      if (e && !e.item) break;                // o Hub não respondeu: o resto espera a próxima leitura
    }
    if (hub.ligado() && Date.now() - C.nivelEm > NIVEL_MS) await nivel(true).catch(() => {});
  }
  /** A task foi criada (ou achada) no Hub: liga no post de agora e manda o dia dele. Devolve o aviso, se algo não foi. */
  async function ligaProd(sid, r, por) {
    const s = doPost(sid), id = String(r.id).toLowerCase();
    if (r.titulo && !r.doCache) hub.guarda(r);
    if (!s) return 'A task ' + (r.codigo || '') + ' foi criada no MKT Hub, mas o post foi excluído no meio: ela ficou no Hub sem post.';
    s.prod = { id, codigo: r.codigo || '', url: urlOk(r.url), criadaEm: new Date().toISOString(), por, dataPost: null };
    if (s.date) s.prod.dataPostPend = s.date;
    s.taskId = id; s.taskUrl = urlOk(r.url) || s.taskUrl || null; s.vaga = false; s.sugestao = false;
    saveDb();
    const e = await enviaData(sid);
    return e ? 'A task foi criada (' + (r.codigo || 'MKT Hub') + '), mas a data do post não foi pro Hub agora (' + e.message + ')' + (e.item ? '.' : ': o painel manda de novo sozinho.') : null;
  }
  /** A tela de criar: opções (pessoas, tipos, formatos) e o que já vem preenchido. */
  async function producaoOpcoes(req, res, s) {
    const c = cfg();
    // v4.22: qualquer post cria a task (antes: só com a copy aprovada ou com material do banco)
    const base = { escrita: escrita(), banco: s.banco ? { sec: s.banco.sec, titulo: s.banco.titulo || '', url: s.banco.url } : null,
      taskId: s.taskId || null, prod: publicoProd(s.prod), briefing: briefingProd(s), briefingCopy: briefingProd(s),
      post: { date: s.date || null, conta: nomeConta(s), contaId: s.conta, titulo: tituloPost(s) } };
    // um envio anterior ficou sem resposta: a tela mostra o que foi mandado (mandar de novo repete igual, nada duplica)
    const pb = s.prod && s.prod.pend && !s.taskId ? s.prod.pend.body : null;
    if (pb) base.briefing = pb.descricao || base.briefing;
    if (!hub.ligado()) return json(res, 200, Object.assign(base, { erro: 'o painel não está ligado ao MKT Hub (falta a MKH_CHAVE)' })), true;
    const n = await nivel();
    base.nivel = n; base.escrita = escrita();
    let pess = [], emp = null, erro = null;
    try { pess = (await pessoas()).filter(p => p && p.id && p.ativo !== false).map(p => ({ id: p.id, nome: p.nome })).sort((x, y) => x.nome.localeCompare(y.nome, 'pt-BR')); } catch (e) { erro = e.message; }
    try { emp = await empresaDoPost(s); } catch (e) { erro = erro || e.message; }
    const fmt = formatoHub(s);
    const formatos = porUso(FORMATOS_PROD, contagem('formato'));
    const nTipo = contagem('tipo', t => t.formato === fmt), tipos = porUso(TIPOS_PROD, nTipo);
    const tipo = [...nTipo.entries()].filter(([k]) => TIPOS_PROD.includes(k)).sort((x, y) => y[1] - x[1]).map(x => x[0])[0] || TIPO_DO_FORMATO[fmt] || 'Arte de post';
    let prazo = s.date ? diaAntes(s.date) : hojeBRT(); if (prazo < hojeBRT()) prazo = hojeBRT();
    const resp = c.respProd && c.respProd[fmt] && pess.some(p => p.id === c.respProd[fmt]) ? c.respProd[fmt] : null;
    // a data do post é a do calendário (uma fonte só): a tela mostra, não edita; ela acompanha o post no Hub
    const sugestao = pb
      ? { titulo: pb.titulo, tipo: String(pb.tipo || '').split(',').map(x => x.trim()).filter(Boolean), formato: pb.formato, prazo: pb.prazo, dataPost: s.date || null, pontos: pb.pontos, prioridade: pb.prioridade, responsavel: pb.responsavel }
      : { titulo: tituloProd(s, fmt), tipo: [tipo], formato: fmt, prazo, dataPost: s.date || null, pontos: c.pontosProd || 1, prioridade: 'media', responsavel: resp };
    // quem foi escolhido no envio pendurado e depois saiu do Hub continua aparecendo (o envio repete igual)
    if (pb && pb.responsavel && !pess.some(p => p.id === pb.responsavel)) {
      const x = (C.pessoas || []).find(p => p && p.id === pb.responsavel);
      pess = pess.concat([{ id: pb.responsavel, nome: x ? x.nome : 'responsável do envio anterior' }]);
    }
    return json(res, 200, Object.assign(base, {
      pessoas: pess, empresa: emp ? { slug: emp.slug, nome: emp.nome } : null, erro, tipos, formatos, prioridades: PRIORIDADES, sugestao, pendente: !!pb,
    })), true;
  }
  /** Cria a task de produção e liga no post. Com login, só ADMIN. Um pedido por post de cada vez. */
  const CRIANDO = new Set();
  async function producaoCria(req, res, s0) {
    const sid = s0.id;
    if (req.eu && req.eu.papel !== 'admin') return json(res, 403, { erro: 'só ADMIN (Zion ou Maria) cria a task de produção' }), true;
    if (CRIANDO.has(sid)) return json(res, 409, { erro: 'a task deste post já está sendo criada: espere a resposta' }), true;
    CRIANDO.add(sid);
    try { return await criaProducao(req, res, sid); }
    finally { CRIANDO.delete(sid); }
  }
  async function criaProducao(req, res, sid) {
    let s = doPost(sid);
    if (!s) return json(res, 404, { erro: 'post não encontrado' }), true;
    if (!hub.ligado()) return json(res, 400, { erro: 'o painel não está ligado ao MKT Hub (falta a MKH_CHAVE)' }), true;
    // já criada e só a data do post ficou pendente: tenta de novo só ela
    if (s.prod && s.prod.id && s.taskId === s.prod.id) {
      if (s.prod.dataPostPend === undefined) return json(res, 409, { erro: 'este post já tem task de produção (' + (s.prod.codigo || 'MKT Hub') + ')' }), true;
      const e = await enviaData(sid), x = doPost(sid);
      if (e) return json(res, e.item ? 400 : 502, { erro: 'a task existe (' + ((x && x.prod && x.prod.codigo) || '') + '), mas a data do post não foi pro Hub: ' + e.message }), true;
      return json(res, 200, { ok: true, prod: publicoProd(x && x.prod) }), true;
    }
    if (s.taskId) return json(res, 409, { erro: 'este post já tem task de produção ligada' }), true;
    const n = await nivel();
    if (n !== 'completa') return json(res, 400, { erro: n ? 'a chave do MKT Hub é de nível ' + n + ': pra criar a task de produção, a MKH_CHAVE do Render precisa ser de nível completa' : 'não consegui ver o nível da chave do MKT Hub agora; tente de novo em 1 minuto' }), true;
    const b = await readBody(req), c = cfg();
    const por = req.eu ? req.eu.nome : String(b.quem || '').slice(0, 40);
    s = doPost(sid);
    if (!s) return json(res, 404, { erro: 'post não encontrado' }), true;
    if (s.taskId) return json(res, 409, { erro: 'este post já tem task de produção ligada' }), true;
    let pend = s.prod && s.prod.pend ? s.prod.pend : null;
    // pendurado há mais de 23 h (o Hub esquece a chave em 24 h): procura a task pelo título antes de criar outra (pra
    // isso, o painel precisa ter lido o Hub inteiro)
    if (pend && (!pend.em || Date.now() - Date.parse(pend.em) > 23 * 3600e3)) {
      if (!(hub.completa && hub.completa())) return json(res, 503, { erro: 'o painel ainda está lendo o MKT Hub: tente de novo em 1 minuto' }), true;
      const pb = pend.body;
      const ja = (hub.busca ? hub.busca(t => !t.mae && t.titulo === pb.titulo && t.empresa && t.empresa.slug === pb.empresa && !t.arquivada) : [])[0] || null;
      delete s.prod; saveDb(); pend = null;
      if (ja && !db.slots.some(x => x.id !== sid && x.taskId === ja.id)) {
        const aviso = await ligaProd(sid, Object.assign({ doCache: true }, ja), por), x = doPost(sid);
        console.log('[hub] task de produção ' + (ja.codigo || ja.id) + ' achada pelo título e ligada ao post ' + sid);
        return json(res, 200, { ok: true, prod: publicoProd(x && x.prod), aviso, achada: true }), true;
      }
    }
    if (!pend) {
      // pedido novo: confere tudo. (Com um envio pendurado, repete ele igual: o que veio agora não vale.)
      const titulo = String(b.titulo || '').replace(/\s+/g, ' ').trim().slice(0, 200);
      const tipos = (Array.isArray(b.tipo) ? b.tipo : String(b.tipo || '').split(',')).map(x => String(x).trim()).filter(Boolean);
      const formato = String(b.formato || '').trim(), pontos = parseInt(b.pontos), prioridade = PRIORIDADES.includes(b.prioridade) ? b.prioridade : 'media';
      if (titulo.length < 2) return json(res, 400, { erro: 'título de 2 a 200 caracteres', campo: 'titulo' }), true;
      if (!tipos.length) return json(res, 400, { erro: 'escolha o tipo', campo: 'tipo' }), true;
      if (!formato) return json(res, 400, { erro: 'escolha o formato', campo: 'formato' }), true;
      if (!(pontos >= 1 && pontos <= 100)) return json(res, 400, { erro: 'pontos de 1 a 100', campo: 'pontos' }), true;
      if (!dataOk(b.prazo)) return json(res, 400, { erro: 'data de entrega inválida', campo: 'prazo' }), true;
      const briefing = briefingDoPedido(b, s);
      if (!briefing) return json(res, 400, { erro: 'o briefing está vazio', campo: 'briefing' }), true;
      let pessoa, emp;
      try { pessoa = (await pessoas()).find(p => p && p.id === b.responsavel && p.ativo !== false); emp = await empresaDoPost(s); }
      catch (e) { return json(res, e.status || 502, { erro: e.message }), true; }
      if (!pessoa) return json(res, 400, { erro: 'escolha o responsável', campo: 'responsavel' }), true;
      s = doPost(sid);
      if (!s) return json(res, 404, { erro: 'post não encontrado' }), true;
      if (s.taskId) return json(res, 409, { erro: 'este post já tem task de produção ligada' }), true;
      // a chave e o corpo ficam no disco ANTES do pedido: resposta perdida não duplica (mandar de novo repete igual)
      s.prod = { pend: { body: { titulo, empresa: emp.slug, tipo: tipos.join(', '), formato, pontos, prazo: b.prazo, prioridade, responsavel: pessoa.id, descricao: briefing }, idem: crypto.randomUUID(), em: new Date().toISOString() } };
      gravaJa();
      pend = s.prod.pend;
    }
    let r;
    try { r = await chama('POST', '/tarefas', pend.body, pend.idem); }
    catch (e) {
      const x = doPost(sid);
      if (definitivo(e) && x && x.prod && x.prod.pend === pend) { delete x.prod; saveDb(); }
      const msg = e.status === 403 ? 'o Hub recusou (' + e.message + '): a MKH_CHAVE precisa ser de nível completa e a dona dela precisa alcançar essa empresa'
        : e.status === 400 && e.detalhes && e.detalhes.campo ? 'o Hub recusou o campo "' + e.detalhes.campo + '": ' + e.message : e.message;
      return json(res, e.status && e.status < 500 ? 400 : 502, { erro: msg + (definitivo(e) ? '' : ' (nada duplica: mande de novo)'), campo: e.detalhes && e.detalhes.campo }), true;
    }
    c.pontosProd = pend.body.pontos; c.respProd = Object.assign({}, c.respProd, { [pend.body.formato]: pend.body.responsavel });   // a próxima tela já vem com isso
    const aviso = await ligaProd(sid, r, por), x = doPost(sid);
    console.log('[hub] task de produção ' + (r.codigo || r.id) + ' criada pro post ' + sid);
    return json(res, 200, { ok: true, prod: publicoProd(x && x.prod), aviso }), true;
  }

  async function rota(req, res, p, u) {
    // v3.90: a task de produção de um post (tela do ADMIN)
    const mp = p.match(/^\/api\/slots\/([a-z0-9]+)\/producao$/i);
    if (mp) {
      const s = db.slots.find(x => x.id === mp[1]);
      if (!s) return json(res, 404, { erro: 'post não encontrado' }), true;
      if (req.method === 'GET') return producaoOpcoes(req, res, s);
      if (req.method === 'POST') return producaoCria(req, res, s);
      return false;
    }
    // dá pra escrever no Hub? (nível da chave)
    if (p === '/api/hub/escrita' && req.method === 'GET') {
      const n = await nivel(u && u.searchParams.get('fresh') === '1');
      return json(res, 200, { ligado: hub.ligado(), nivel: n, escrita: escrita() }), true;
    }
    return false;
  }

  rota.escrita = escrita;
  rota.moveDataPost = moveDataPost;           // v3.90: o post mudou de dia, a data do post acompanha no Hub
  rota.reenviaDatas = reenviaDatas;           // v3.90: depois de cada leitura do Hub, a data que ficou pra trás
  rota.nivel = nivel;
  return rota;
};
module.exports.formatoHub = formatoHub;
