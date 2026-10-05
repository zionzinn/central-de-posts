// MKT Hub (v3.81): o painel LÊ as tasks de produção do sistema interno pela API v1. Só leitura.
// A chave mora SÓ na variável MKH_CHAVE (nível leitura, nome "Central de Posts"). Nunca em arquivo, git ou chat.
// Sem chave, tudo aqui fica desligado e o painel funciona como na v3.80.
//
// Custo (regra 11): o que vem do Hub fica SÓ NA MEMÓRIA do servidor, nada no data.json (que vai inteiro pro
// GitHub a cada gravação). Status, título e responsável entram no /api/state por cima dos posts ligados.
// Artes e comentários são buscados quando alguém abre o post. Imagem NUNCA passa pelo Render: o Hub devolve um
// link assinado (30 min) e o navegador baixa direto do armazenamento. O Hub só é consultado com alguém usando o
// painel: 1 pedido por minuto (só o que mudou desde a última vez) e a lista de ids 1 vez por dia.
//
// v3.86 (o Zion colava o link da tarefa e não vinha nada): a API lista só as tarefas PRINCIPAIS, por mudou_em
// CRESCENTE, 50 por página, e deixa de fora as arquivadas e o banco de criativos. A leitura antiga parava em 80
// páginas: com mais de 4.000 tarefas, as MAIS NOVAS nunca entravam na memória, e subtarefa nunca entrava. Agora:
// a exportação vai até o fim (100 por página, 50 páginas por volta, uma volta por minuto: metade do limite de 120
// leituras por minuto, e continua de onde parou se der erro); o incremental traz também arquivadas e o banco; a
// tarefa colada num post é achada NA HORA (pelo endereço, pelo uuid ou pelo código, direto no Hub se preciso, vale
// subtarefa); e as ligadas que a lista não traz (subtarefas) são relidas uma a uma, poucas por volta.
'use strict';

const BASE = String(process.env.MKH_BASE || 'https://www.mkthub.space/api/v1').replace(/\/+$/, '');
const CHAVE = String(process.env.MKH_CHAVE || '').trim();
const INTERVALO = +process.env.MKH_SYNC_MS || 60e3;   // sincroniza no máximo 1 vez por minuto (MKH_SYNC_MS: só nos testes)
const ATIVO_MS = 3 * 60e3;       // "alguém usando" = pediu o /api/state nos últimos 3 min
const DETALHE_MS = 60e3;         // detalhe da task (artes e comentários) guardado 1 min
const URL_MS = 20 * 60e3;        // link assinado vale 30 min no Hub; aqui reaproveita por 20
const PAGINA = 100;              // o máximo por página que a API aceita
const PAGS_POR_VOLTA = +process.env.MKH_PAGS || 50;   // exportação grande: 50 páginas por volta (limite: 120 leituras/min)
const RELE_MS = +process.env.MKH_RELE_MS || 5 * 60e3;   // tarefa ligada que a lista não traz (subtarefa): relida no máximo a cada 5 min
const RELE_POR_VOLTA = 10;       // e no máximo 10 por volta
const FALTA_MS = 3600e3;         // tarefa que o Hub disse que não existe: pergunta de novo 1 h depois
// v4.10: as tasks dos posts perto de hoje (7 dias atrás a 21 à frente, sem postar e ainda não prontas) são relidas uma
// a uma no máximo a cada 10 min, dentro das 10 leituras por volta: se o Hub muda a etapa sem a lista trazer, o card acerta
const QUENTE_MS = +process.env.MKH_QUENTE_MS || 10 * 60e3;
const FINAIS = new Set(['publicar', 'completo', 'banco de criativos']);

const semAcento = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const ehUuid = t => /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(String(t || ''));
const ehCodigo = t => /^MKT-\d+$/i.test(String(t || ''));
function erro(status, msg) { return Object.assign(new Error(msg), { status }); }

/**
 * Status do Hub no vocabulário que o painel já entende (os baldes do card). A etapa manda; o status_clickup é o reserva.
 * v4.10 (o Zion viu task em Aprovação líder aparecendo "na fila, atrasada", e concluída como não entregue): a etapa é
 * lida pelo slug E pelo nome; "líder" sozinho já é Aprovação líder; concluída é pronta (a mesma régua do captado da
 * v4.04); e etapa que o painel não conhece vira 'desconhecida' (o card mostra o nome dela, sem alarme), em vez de
 * fingir que está na fila.
 */
function statusDoPainel(t) {
  const e = semAcento([t.etapa && t.etapa.slug, t.etapa && t.etapa.nome].filter(Boolean).join(' ')).replace(/[-_]+/g, ' ');
  if (/aprovacao lider|\blider\b/.test(e)) return 'aprovação líder';
  if (/aprova/.test(e)) return 'aprovar';
  if (/ajust|alter/.test(e)) return 'alterar';
  if (/publica/.test(e)) return 'publicar';
  if (/complet|conclu|finaliz/.test(e)) return 'completo';
  if (/banco/.test(e)) return 'banco de criativos';
  if (/revisao ia/.test(e)) return 'revisão ia';
  if (/andamento|producao|progresso|revisao/.test(e)) return 'em progresso';
  if (/solicit|pendent|a fazer|fila/.test(e)) return 'pendente';
  if (t.concluida) return 'completo';
  const sc = String(t.status || '').toLowerCase().trim();
  if (sc) return sc;
  return e ? 'desconhecida' : 'pendente';
}

module.exports = function criarHub(ctx) {
  const { db, json, saveDb, limpaHtml } = ctx;
  const H = {
    ligado: !!CHAVE, tarefas: new Map(), porCodigo: new Map(), cursor: null, idsEm: 0, pausaAte: 0, rodando: null,
    erro: null, syncEm: 0, completa: false, versao: 0, ativoEm: 0, detalhe: new Map(), urls: new Map(),
    passe: null, faltam: new Map(), etapaBanco: undefined, etapasEm: 0,
  };

  async function pede(caminho, opts) {
    opts = opts || {};
    if (Date.now() < H.pausaAte) { const s = Math.ceil((H.pausaAte - Date.now()) / 1000); throw Object.assign(erro(429, 'limite de pedidos do Hub: esperando ' + s + ' s'), { retry: s }); }
    const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), 15000);
    let r;
    try {
      r = await fetch(BASE + caminho, {
        method: opts.method || 'GET', signal: ctrl.signal,
        headers: { Authorization: 'Bearer ' + CHAVE, Accept: 'application/json', ...(opts.body ? { 'Content-Type': 'application/json' } : {}), ...(opts.headers || {}) },
        body: opts.body ? JSON.stringify(opts.body) : undefined,
      });
    } catch (e) { throw erro(502, e.name === 'AbortError' ? 'o Hub demorou demais pra responder' : 'não consegui falar com o Hub (' + e.message + ')'); }
    finally { clearTimeout(timer); }
    if (r.status === 429) {
      // leitura espera no mínimo 5 s; escrita (v3.84) respeita o Retry-After exato que o Hub mandou
      const ra = +r.headers.get('retry-after') || 30, s = opts.method && opts.method !== 'GET' ? Math.max(1, ra) : Math.max(5, ra);
      H.pausaAte = Date.now() + s * 1000;
      throw Object.assign(erro(429, 'limite de pedidos do Hub: esperando ' + s + ' s'), { retry: s });
    }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const m = (j && j.erro && j.erro.mensagem) || ('HTTP ' + r.status);
      throw Object.assign(erro(r.status, r.status === 401 ? 'a chave do Hub foi recusada (' + m + '): confira a MKH_CHAVE no Render' : m),
        { codigo: (j && j.erro && j.erro.codigo) || null, detalhes: (j && j.erro && j.erro.detalhes) || null });
    }
    return j;
  }

  /** Guarda só o que o painel usa. */
  function guarda(t) {
    if (!t || !t.id) return;
    const id = String(t.id).toLowerCase();
    const velha = H.tarefas.get(id);
    const x = {
      id, codigo: String(t.codigo || '').toUpperCase(), titulo: t.titulo || '',
      empresa: t.empresa ? { slug: t.empresa.slug || '', nome: t.empresa.nome || '' } : null,
      etapa: t.etapa ? { slug: t.etapa.slug || '', nome: t.etapa.nome || '', cor: t.etapa.cor || '#8E8E93', tinta: t.etapa.tinta || '#000' } : null,
      status: t.status_clickup || null, prazo: t.prazo || null, resp: t.responsavel ? (t.responsavel.nome || '') : '',
      tipo: t.tipo || '', formato: t.formato || '', trilha: t.trilha || '', url: t.url || '', arquivada: !!t.arquivada,
      concluida: t.concluida_em || null, mudou: t.mudou_em || null, mae: t.mae ? (t.mae.codigo || t.mae.id || null) : null,
      vistoEm: Date.now(),
    };
    x.st = statusDoPainel(x);
    if (velha && velha.codigo && velha.codigo !== x.codigo) H.porCodigo.delete(velha.codigo);
    H.tarefas.set(id, x);
    if (x.codigo) H.porCodigo.set(x.codigo, id);
  }
  function acha(ref) {
    if (!ref) return null;
    const k = String(ref);
    if (ehUuid(k)) return H.tarefas.get(k.toLowerCase()) || null;
    if (ehCodigo(k)) { const id = H.porCodigo.get(k.toUpperCase()); return id ? H.tarefas.get(id) : null; }
    return null;
  }

  /** Posts ligados só pelo código MKT passam a guardar o id do Hub (a API pede pra guardar o id; o código é o que se mostra). */
  function resolveCodigos() {
    let mudou = 0;
    for (const s of db.slots) {
      if (!ehCodigo(s.taskId)) continue;
      const t = acha(s.taskId);
      if (!t) continue;
      s.taskId = t.id; if (!s.taskUrl && t.url) s.taskUrl = t.url;
      mudou++;
    }
    if (mudou) { saveDb(); console.log('[hub] ' + mudou + ' post(s) ligado(s) pelo código agora guardam o id do Hub'); }
  }

  /** Slug da etapa "Banco de criativos" (a lista padrão deixa ela de fora). Pergunta 1 vez por dia; sem ela, null. */
  async function etapaBanco() {
    if (H.etapaBanco !== undefined && Date.now() - H.etapasEm < 24 * 3600e3) return H.etapaBanco;
    try {
      const r = await pede('/etapas');
      const e = (r.dados || []).find(x => /banco/.test(semAcento((x.slug || '') + ' ' + (x.nome || ''))));
      H.etapaBanco = e ? e.slug : null;
    } catch (e) { if (H.etapaBanco === undefined) H.etapaBanco = null; }
    H.etapasEm = Date.now();
    return H.etapaBanco;
  }
  /** Uma lista inteira (todas as páginas) de um filtro pequeno, como o banco de criativos que mudou. */
  async function listaToda(params) {
    let cursor = null, pags = 0, n = 0;
    do {
      const q = new URLSearchParams(Object.assign({ limite: String(PAGINA) }, params));
      if (cursor) q.set('cursor', cursor);
      const j = await pede('/tarefas?' + q);
      for (const t of j.dados || []) { guarda(t); n++; }
      cursor = j.proximo_cursor || null;
    } while (cursor && ++pags < PAGS_POR_VOLTA);
    return n;
  }
  /**
   * Posts ligados a tarefas que a lista não traz (subtarefa; ou principal que ficou fora da exportação: arquivada ou
   * no banco de criativos): lê uma por uma, no máximo 10 por volta, cada uma no máximo a cada 5 min. Só os posts
   * de 30 dias atrás pra frente.
   */
  async function releLigadas() {
    const agora = Date.now(), lo = new Date(agora - 30 * 864e5).toISOString().slice(0, 10);
    const refs = new Set();
    for (const s of db.slots) {
      if (!s.taskId || !(ehUuid(s.taskId) || ehCodigo(s.taskId)) || (s.date && s.date < lo)) continue;
      const t = acha(s.taskId);
      if (t && !t.mae) continue;                                  // principal na memória: a lista cuida
      if (t && agora - (t.vistoEm || 0) < RELE_MS) continue;
      const f = H.faltam.get(String(s.taskId).toLowerCase());
      if (f && agora - f < FALTA_MS) continue;
      refs.add(s.taskId);
      if (refs.size >= RELE_POR_VOLTA) break;
    }
    if (refs.size < RELE_POR_VOLTA) {
      const dia = ms => new Date(ms - 3 * 3600e3).toISOString().slice(0, 10);   // o dia em Brasília
      const hoje = dia(agora), de = dia(agora - 7 * 864e5), ate = dia(agora + 21 * 864e5), quentes = [];
      for (const s of db.slots) {
        if (s.postado || !s.date || s.date < de || s.date > ate || !s.taskId || !(ehUuid(s.taskId) || ehCodigo(s.taskId))) continue;
        const t = acha(s.taskId);
        if (!t || t.mae || FINAIS.has(t.st) || agora - (t.vistoEm || 0) < QUENTE_MS) continue;
        quentes.push({ ref: t.id, d: Math.abs(Date.parse(s.date) - Date.parse(hoje)) });
      }
      quentes.sort((a, b) => a.d - b.d);
      for (const q of quentes) { if (refs.size >= RELE_POR_VOLTA) break; refs.add(q.ref); }
    }
    let n = 0;
    for (const ref of refs) {
      try { guarda(await pede('/tarefas/' + encodeURIComponent(ref))); n++; }
      catch (e) { if (e.status === 404) H.faltam.set(String(ref).toLowerCase(), agora); else break; }
    }
    if (n) H.versao++;
  }

  /**
   * Lê o Hub. Na primeira vez é a exportação inteira (pode levar várias voltas; continua de onde parou se der erro);
   * depois, só o que mudou, com as arquivadas (arquivar também é mudança) e o banco de criativos. Só roda com alguém
   * usando o painel.
   */
  function sincroniza(forca) {
    if (!H.ligado) return Promise.resolve();
    if (H.rodando) return H.rodando;
    if (!forca && (Date.now() - H.syncEm < INTERVALO || Date.now() - H.ativoEm > ATIVO_MS)) return Promise.resolve();
    H.rodando = (async () => {
      H.syncEm = Date.now();
      try {
        if (!H.passe) H.passe = { desde: H.cursor, cursor: null, inicioEm: null, lidas: 0 };
        const P = H.passe;
        let pags = 0, n = 0;
        do {
          const q = new URLSearchParams({ limite: String(PAGINA) });
          if (P.desde) { q.set('updated_since', P.desde); q.set('arquivadas', 'tambem'); }
          if (P.cursor) q.set('cursor', P.cursor);
          const j = await pede('/tarefas?' + q);
          if (!P.inicioEm) P.inicioEm = j.servidor_em || null;
          for (const t of j.dados || []) { guarda(t); n++; P.lidas++; }
          P.cursor = j.proximo_cursor || null;
        } while (P.cursor && ++pags < PAGS_POR_VOLTA);
        if (n) H.versao++;
        H.erro = null;
        if (P.cursor) { await releLigadas(); return; }             // a exportação continua na próxima volta
        // o banco de criativos fica fora da lista padrão: no incremental, pergunta à parte
        // (pedido que o Hub recusa, 4xx: segue sem o banco nesta volta; limite, 5xx ou rede: tenta tudo de novo na próxima)
        if (P.desde) {
          try { const slug = await etapaBanco(); if (slug && await listaToda({ updated_since: P.desde, etapa: slug, arquivadas: 'tambem' })) H.versao++; }
          catch (e) { if (e.status === 429 || !(e.status >= 400 && e.status < 500)) throw e; console.log('[hub] banco de criativos: ' + e.message); }
        }
        if (P.inicioEm && !isNaN(Date.parse(P.inicioEm))) H.cursor = new Date(Date.parse(P.inicioEm) - 5000).toISOString();
        if (!P.desde) console.log('[hub] exportação completa: ' + P.lidas + ' tarefa(s) na memória');
        H.passe = null;
        // 1 vez por dia: tarefa principal apagada sai da memória (subtarefa não está nessa lista: fica)
        if (Date.now() - H.idsEm > 24 * 3600e3) {
          const r = await pede('/tarefas/ids');
          if (Array.isArray(r.ids)) {
            const vivos = new Set(r.ids.map(x => String(x).toLowerCase()));
            for (const [id, t] of H.tarefas) if (!t.mae && !vivos.has(id)) { H.tarefas.delete(id); if (t.codigo) H.porCodigo.delete(t.codigo); H.versao++; }
          }
          H.idsEm = Date.now();
        }
        H.completa = true;
        resolveCodigos();
        await releLigadas();
        if (rota.depois) await rota.depois().catch(e => console.log('[hub] depois da sincronização: ' + e.message));   // v3.84: etapa das tarefas mandadas
      } catch (e) {
        H.erro = e.message;
        // o Hub não aceitou o cursor da página (400): recomeça esta leitura na próxima volta (o que já leu fica)
        if (e.status === 400 && H.passe && H.passe.cursor) H.passe = null;
        console.log('[hub] sincronização: ' + e.message);
      } finally { H.rodando = null; }
    })();
    return H.rodando;
  }

  /**
   * v3.86: o link (ou o código) colado num post → a tarefa do Hub, NA HORA: pelo endereço dela (o mesmo que o Hub
   * dá), pelo uuid ou pelo código MKT (na memória ou perguntando ao Hub, vale subtarefa). Devolve a tarefa, null
   * (não achou) ou { erro } (o Hub não respondeu).
   */
  const normUrl = u => String(u || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/#.*$/, '').replace(/\/+(\?|$)/, '$1');
  async function resolveLink(texto) {
    const u = String(texto || '').trim();
    if (!H.ligado || !u) return null;
    if (/^https?:\/\//i.test(u)) { const n = normUrl(u); for (const t of H.tarefas.values()) if (t.url && normUrl(t.url) === n) return t; }
    const refs = [...new Set([...(u.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi) || []).map(x => x.toLowerCase()),
      ...(u.match(/MKT-\d+/gi) || []).map(x => x.toUpperCase())])];
    // endereço do Hub sem uuid nem código, mas com o número da tarefa no fim (ex.: .../tarefas/412): tenta MKT-0412
    if (!refs.length && /mkthub/i.test(u)) { const m = u.replace(/[?#].*$/, '').match(/\/(\d{1,6})\/?$/); if (m) refs.push('MKT-' + m[1].padStart(4, '0')); }
    for (const ref of refs) { const t = acha(ref); if (t) return t; }
    for (const ref of refs.slice(0, 3)) {
      try { const j = await pede('/tarefas/' + encodeURIComponent(ref)); guarda(j); H.versao++; H.faltam.delete(String(ref).toLowerCase()); return H.tarefas.get(String(j.id).toLowerCase()) || null; }
      catch (e) { if (e.status !== 404) return { erro: e.message }; }
    }
    return null;
  }
  if (H.ligado) setInterval(() => { sincroniza().catch(() => {}); }, 20e3).unref();

  /** Por cima dos posts ligados a uma task do Hub: status (etapa), título e responsável. Não grava nada. */
  function sobrepoe(slots) {
    if (!H.ligado || !H.tarefas.size) return slots;
    return slots.map(s => {
      const t = acha(s.taskId);
      if (!t) return s;
      return Object.assign({}, s, {
        tituloCache: t.titulo || s.tituloCache, assigneeCache: t.resp || s.assigneeCache,
        statusCache: { status: t.st, color: t.etapa ? t.etapa.cor : '#8E8E93', nome: t.etapa ? t.etapa.nome : t.st },
        hub: { codigo: t.codigo, url: t.url, prazo: t.prazo, etapa: t.etapa, tipo: t.tipo, formato: t.formato },
      });
    });
  }

  // ---------- detalhe: artes (peças, versão corrente) e comentários ----------
  const extDe = (nome, mime) => { const m = String(nome || '').match(/\.([a-z0-9]{2,5})$/i); if (m) return m[1].toLowerCase(); const x = String(mime || '').split('/')[1] || ''; return x.replace('jpeg', 'jpg').replace('quicktime', 'mov').slice(0, 5); };
  async function assina(ids) {
    const agora = Date.now(), falta = ids.filter(id => { const u = H.urls.get(id); return !u || u.ate < agora; });
    for (let i = 0; i < falta.length; i += 100) {
      const r = await pede('/arquivos/urls', { method: 'POST', body: { arquivos: falta.slice(i, i + 100), uso: 'ver', versoes: 'corrente' } });
      for (const u of r.urls || []) H.urls.set(u.id, { url: u.url, ate: agora + URL_MS });
    }
    const o = {}; for (const id of ids) { const u = H.urls.get(id); if (u) o[id] = u.url; }
    if (H.urls.size > 3000) for (const [k, u] of H.urls) if (u.ate < agora) H.urls.delete(k);
    return o;
  }
  async function detalhe(ref, fresco) {
    const chave = String(ref).toLowerCase();
    const c = H.detalhe.get(chave);
    if (c && !fresco && Date.now() - c.em < DETALHE_MS) return c;
    if (c && c.pedindo) return c.pedindo;
    const pedindo = (async () => {
      const t = await pede('/tarefas/' + encodeURIComponent(ehCodigo(ref) ? String(ref).toUpperCase() : ref));
      guarda(t); H.versao++;
      // peças: só a versão corrente de cada uma (a de número maior), na ordem da tarefa
      const pecas = (t.pecas || []).slice().sort((a, b) => (a.posicao || 0) - (b.posicao || 0));
      const correntes = [];
      const porNome = new Map();
      for (const p of pecas) { const k = p.nome || p.id; const v = porNome.get(k); if (!v || (p.versao || 0) > (v.versao || 0)) porNome.set(k, p); }
      for (const p of porNome.values()) for (const a of (p.arquivos || []).slice().sort((x, y) => (x.ordem || 0) - (y.ordem || 0))) correntes.push({ p, a });
      const coms = (t.comentarios || []).slice().sort((a, b) => String(b.criado_em).localeCompare(String(a.criado_em)));
      const ids = correntes.filter(x => x.a.tipo !== 'link').map(x => x.a.id).concat(...coms.map(cm => (cm.anexos || []).map(an => an.id)));
      let urls = {};
      if (ids.length) { try { urls = await assina(ids); } catch (e) { console.log('[hub] links das artes: ' + e.message); } }
      const arquivos = correntes.map(({ p, a }) => {
        const url = a.tipo === 'link' ? (a.link || '') : (urls[a.id] || '');
        return { id: a.id, name: p.nome && p.arquivos.length === 1 ? p.nome : (a.nome || p.nome || 'arquivo'), url, thumb: a.tipo === 'link' ? '' : url, ext: a.tipo === 'link' ? 'link' : extDe(a.nome, a.tipo_mime),
          versions: p.versao || 1, date: t.mudou_em ? Date.parse(t.mudou_em) : null, user: p.nota || '' };
      }).filter(a => a.url);
      const comments = coms.map(cm => {
        const nome = (cm.autor && cm.autor.nome) || 'alguém';
        return { id: cm.id, user: nome, initials: nome.split(/\s+/).slice(0, 2).map(x => x[0] || '').join('').toUpperCase(), userColor: '#52514e',
          date: Date.parse(cm.criado_em) || null, text: cm.corpo_texto || '',
          attachments: (cm.anexos || []).filter(an => urls[an.id]).map(an => ({ name: an.nome, url: urls[an.id], thumb: /^image\//.test(an.tipo_mime || '') ? urls[an.id] : '', ext: extDe(an.nome, an.tipo_mime), versions: 1 })) };
      });
      const x = H.tarefas.get(String(t.id).toLowerCase());
      const task = {
        id: t.id, codigo: t.codigo, name: t.titulo, status: x ? x.st : '', color: t.etapa ? t.etapa.cor : '#8E8E93',
        etapa: t.etapa ? { nome: t.etapa.nome, cor: t.etapa.cor, tinta: t.etapa.tinta, slug: t.etapa.slug } : null,
        assignees: t.responsavel ? [{ nome: t.responsavel.nome }] : [], prazo: t.prazo || null, url: t.url || '',
        tipo: t.tipo || '', formato: t.formato || '', trilha: t.trilha || '', legenda: t.legenda || '',
        descricaoHtml: limpaHtml(t.descricao || ''), _cachedAt: Date.now(),
      };
      const pronto = { em: Date.now(), task, com: { arquivos, comments, _cachedAt: Date.now() } };
      H.detalhe.set(chave, pronto);
      if (H.detalhe.size > 200) H.detalhe.delete(H.detalhe.keys().next().value);
      return pronto;
    })();
    H.detalhe.set(chave, Object.assign({}, c || { em: 0 }, { pedindo }));
    try { return await pedindo; }
    catch (e) { if (c && c.task) H.detalhe.set(chave, c); else H.detalhe.delete(chave); throw e; }
  }

  /** Tasks do Hub pra ligar num post: mesma empresa, prazo perto do dia do post, a mais perto primeiro. */
  function candidatas(slot, q) {
    const abaNome = semAcento(({ 'SEUBONÉ': 'SeuBoné', 'CARBONE': 'Carbone', 'ONEVO': 'Onevo', 'WEEVO': 'Weevo' })[db.contas[slot.conta] ? db.contas[slot.conta].aba : ''] || '');
    const dia = slot.date ? Date.parse(slot.date + 'T12:00:00Z') : Date.now();
    const busca = semAcento(q || '');
    const ligadas = new Set(db.slots.filter(s => s.id !== slot.id && s.taskId).map(s => { const t = acha(s.taskId); return t ? t.id : null; }).filter(Boolean));
    // v3.84: as tarefas de matriz e copy que o próprio painel mandou pro Hub não são de produção
    const nossas = new Set(Object.values(db.tarefas || {}).flatMap(tf => ((tf.hub && tf.hub.maes) || []).map(m => m.id)));
    return [...H.tarefas.values()]
      .filter(t => !t.arquivada && !t.mae && !nossas.has(t.id) && (!abaNome || semAcento(t.empresa && t.empresa.nome).startsWith(abaNome) || semAcento(t.empresa && t.empresa.slug).startsWith(abaNome.replace(/\s/g, ''))))
      .filter(t => !busca || semAcento(t.titulo + ' ' + t.codigo).includes(busca))
      .map(t => ({ t, d: t.prazo ? Math.round(Math.abs(Date.parse(t.prazo + 'T12:00:00Z') - dia) / 864e5) : 99 }))
      .filter(x => busca || x.d <= 14)
      .sort((a, b) => a.d - b.d || String(b.t.mudou || '').localeCompare(String(a.t.mudou || '')))
      .slice(0, 30)
      .map(({ t, d }) => ({ id: t.id, codigo: t.codigo, titulo: t.titulo, etapa: t.etapa, prazo: t.prazo, resp: t.resp, tipo: t.tipo, formato: t.formato, url: t.url, dias: d, ligada: ligadas.has(t.id) }));
  }

  async function rota(req, res, p, u) {
    if (!p.startsWith('/api/hub') && !p.startsWith('/api/task/')) return false;
    // detalhe da task do post (a folha do post chama estas duas rotas; as duas saem do mesmo pedido ao Hub)
    const mt = p.match(/^\/api\/task\/([^/]+)(\/comments)?$/);
    if (mt && req.method === 'GET') {
      const ref = decodeURIComponent(mt[1]);
      if (!H.ligado) return json(res, 404, { erro: 'o painel ainda não está ligado ao MKT Hub' }), true;
      if (!ehUuid(ref) && !ehCodigo(ref)) return json(res, 404, { erro: 'esta task não é do MKT Hub (link antigo ou de outro sistema)' }), true;
      try {
        const d = await detalhe(ref, u.searchParams.get('fresh') === '1');
        return json(res, 200, mt[2] ? d.com : d.task), true;
      } catch (e) { return json(res, e.status === 404 ? 404 : 502, { erro: e.message }), true; }
    }
    if (p === '/api/hub' && req.method === 'GET') {
      return json(res, 200, { ligado: H.ligado, completa: H.completa, tarefas: H.tarefas.size, syncEm: H.syncEm ? new Date(H.syncEm).toISOString() : null, erro: H.erro, base: BASE.replace(/^https?:\/\//, ''),
        lendo: H.passe && H.passe.cursor ? H.passe.lidas : null, rodando: !!H.rodando }), true;
    }
    // Configurações > Testar conexão: quem é a dona da chave e o nível dela (a chave nunca sai do servidor)
    if (p === '/api/hub/eu' && req.method === 'GET') {
      if (!H.ligado) return json(res, 200, { ok: false, erro: 'falta a variável MKH_CHAVE no Render' }), true;
      try {
        const e = await pede('/eu');
        sincroniza(true).catch(() => {});
        return json(res, 200, { ok: true, nome: e.nome, papel: e.papel, empresas: e.empresas || [], chave: e.chave ? { nome: e.chave.nome, nivel: e.chave.nivel } : null }), true;
      } catch (err) { return json(res, 200, { ok: false, erro: err.message }), true; }
    }
    if (p === '/api/hub/candidatas' && req.method === 'GET') {
      const s = db.slots.find(x => x.id === u.searchParams.get('slot'));
      if (!s) return json(res, 404, { erro: 'post não encontrado' }), true;
      if (!H.ligado) return json(res, 200, { ligado: false, tarefas: [] }), true;
      if (!H.completa && Date.now() - H.syncEm > 10e3) await sincroniza(true).catch(() => {});
      return json(res, 200, { ligado: true, completa: H.completa, erro: H.erro, tarefas: candidatas(s, u.searchParams.get('q')) }), true;
    }
    return false;
  }

  rota.ligado = () => H.ligado;
  // v3.84: o envio das tarefas (lib/hubenvio.js) usa o mesmo cliente (mesma chave, mesma pausa do limite)
  rota.pede = pede;
  rota.guarda = t => { guarda(t); H.versao++; };
  rota.busca = fn => [...H.tarefas.values()].filter(fn);
  rota.completa = () => H.completa;
  rota.resolveLink = resolveLink;
  rota.releLigadas = releLigadas;
  rota.depois = null;
  rota.toque = () => { H.ativoEm = Date.now(); if (H.ligado && Date.now() - H.syncEm >= INTERVALO) sincroniza().catch(() => {}); };
  rota.sobrepoe = sobrepoe;
  rota.versao = () => H.versao;
  rota.sincroniza = sincroniza;
  rota.acha = acha;
  return rota;
};
module.exports.statusDoPainel = statusDoPainel;
