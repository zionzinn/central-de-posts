// Documentos (a COPY do post), estilo Google Docs, guardados DENTRO do painel.
// Moram no data.json (db.docs), porque no Render é o único arquivo que o start.js
// devolve pro GitHub. Por isso: só texto (imagem entra como link), versões antigas
// compactadas com zlib e limite de tamanho por documento.
// O editor fica em public/doc.html e só é carregado quando alguém abre um documento.
'use strict';
const crypto = require('crypto');
const zlib = require('zlib');

const MAX_HTML = 400_000;          // ~400 KB de HTML: um texto de copy fica em 5 a 20 KB
const MAX_VERSOES = 15;            // histórico de versões guardado por documento
const JANELA_VERSAO = 15 * 60_000; // guarda uma versão a cada 15 min de edição ou quando muda quem edita
const PRESENCA_TTL = 45_000;       // "fulano está com o documento aberto" vale 45 s sem sinal
const MARCA_COPY = '## COPY (escrita no B.O.N.E)';

/** Defesa extra no servidor (o editor já limpa tudo antes de salvar): tira script, estilo,
    iframe, formulário, atributos on* e links javascript:/data:. */
function limpaHtml(h) {
  return String(h || '')
    .replace(/<\s*(script|style|iframe|object|embed|form|textarea|select|svg|math|template|noscript)\b[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<\s*\/?\s*(script|style|iframe|object|embed|link|meta|base|form|input|button|textarea|select|svg|math|template|noscript|frame|frameset)\b[^>]*>/gi, '')
    .replace(/\s(on[a-z]+|srcdoc|formaction)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s(href|src)\s*=\s*(["'])\s*(javascript|data|vbscript)\s*:[^"']*\2/gi, ' $1="#"')
    .replace(/\s(href|src)\s*=\s*(javascript|data|vbscript)\s*:[^\s>]*/gi, ' $1="#"');
}
function textoDoHtml(h) {
  return String(h || '').replace(/<(br|\/p|\/h\d|\/li|\/tr|\/div)[^>]*>/gi, '\n').replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}
const zip = html => zlib.deflateRawSync(Buffer.from(html, 'utf8')).toString('base64');
const unzip = z => zlib.inflateRawSync(Buffer.from(z, 'base64')).toString('utf8');

/** Tira a seção de copy que o painel mandou antes (pra mandar de novo sem duplicar) e põe a nova no fim. */
function juntaCopy(desc, md) {
  const titulo = String.raw`#{1,6}\s*COPY\s*\\?\(escrita no B\\?\.O\\?\.N\\?\.E\\?\)`;
  const re = new RegExp(String.raw`(?:\n\s*(?:[-*_]\s*){3,}\s*)?\n*\s*` + titulo + String.raw`[\s\S]*$`);
  let base = String(desc || '');
  const m = base.match(new RegExp(titulo));
  if (m) base = base.replace(re, '');
  base = base.replace(/\s+$/, '');
  return (base ? base + '\n\n---\n\n' : '') + MARCA_COPY + '\n\n' + String(md || '').trim() + '\n';
}

module.exports = function criarDocs(ctx) {
  const { db, saveDb, readBody, json, cuFetch, cuWrite, cuCache, pushUndo, MZ } = ctx;
  if (!db.docs || typeof db.docs !== 'object' || Array.isArray(db.docs)) db.docs = {};
  const presenca = {}; // docId -> { sessao: { por, ate } } (só na memória)

  const slotDe = doc => db.slots.find(s => s.id === doc.slotId) || null;
  function tituloPost(s) {
    if (!s) return '';
    if (s.titulo) return s.titulo;
    if (s.tituloCache) return s.tituloCache;
    if (s.matrizSB && s.matrizSB.tema) return s.matrizSB.tema;
    return '';
  }
  function meta(doc) {
    const s = slotDe(doc);
    const conta = s ? s.conta : doc.contaSnap;
    return {
      id: doc.id, slotId: doc.slotId, titulo: doc.titulo, excluido: !!doc.excluido,
      conta, contaNome: db.contas[conta] ? db.contas[conta].nome : (conta || ''), aba: db.contas[conta] ? db.contas[conta].aba : '',
      date: s ? s.date : doc.dateSnap, taskId: s ? s.taskId || null : null, postExiste: !!s,
      post: tituloPost(s), temMatriz: !!(s && s.matrizSB),
      criadoEm: doc.criadoEm, atualizadoEm: doc.atualizadoEm, por: doc.por || '', palavras: doc.palavras || 0, caracteres: doc.caracteres || 0,
    };
  }
  function outros(docId, sessao) {
    const p = presenca[docId] || {}; const agora = Date.now(); const lista = [];
    for (const [k, v] of Object.entries(p)) { if (v.ate < agora) { delete p[k]; continue; } if (k !== sessao) lista.push({ por: v.por, desde: v.desde }); }
    return lista;
  }
  function docCompleto(doc, sessao) {
    const s = slotDe(doc);
    const m = s && s.matrizSB ? s.matrizSB : null;
    return {
      doc: { id: doc.id, titulo: doc.titulo, html: doc.html, versao: doc.versao, atualizadoEm: doc.atualizadoEm, por: doc.por || '', checklist: doc.checklist || [], excluido: !!doc.excluido },
      post: s ? {
        id: s.id, conta: s.conta, contaNome: db.contas[s.conta] ? db.contas[s.conta].nome : s.conta, date: s.date || null,
        titulo: tituloPost(s), taskId: s.taskId || null, formato: s.formato || '', obs: s.obs || '',
        status: s.postado ? 'postado' : (s.statusCache && s.statusCache.status) || '', responsavel: s.assigneeCache || s.responsavelManual || '',
      } : null,
      matriz: m, tipo: m && MZ.TIPOS[m.tipo] ? MZ.TIPOS[m.tipo] : null,
      regras: m ? MZ.REGRAS : [], checklistMatriz: m ? MZ.CHECKLIST : [],
      editando: outros(doc.id, sessao),
    };
  }
  function contadores(doc) {
    const t = textoDoHtml(doc.html).trim();
    doc.palavras = t ? t.split(/\s+/).filter(Boolean).length : 0;
    doc.caracteres = t.length;
  }

  /** Trata as rotas /api/docs*. Devolve true se respondeu. */
  return async function rotaDocs(req, res, p, u) {
    if (!p.startsWith('/api/docs')) return false;

    // lista (tela "Documentos" e "Arquivo > Abrir")
    if (p === '/api/docs' && req.method === 'GET') {
      const exc = u.searchParams.get('excluidos') === '1';
      const lista = Object.values(db.docs).filter(d => !!d.excluido === exc).map(meta)
        .sort((a, b) => String(b.atualizadoEm || b.criadoEm).localeCompare(String(a.atualizadoEm || a.criadoEm)));
      return json(res, 200, { docs: lista }), true;
    }
    // criar (ou devolver o que já existe) pro post
    if (p === '/api/docs' && req.method === 'POST') {
      const b = await readBody(req);
      const s = db.slots.find(x => x.id === b.slotId);
      if (!s) return json(res, 404, { erro: 'post não encontrado' }), true;
      if (s.docId && db.docs[s.docId] && !db.docs[s.docId].excluido) return json(res, 200, { ok: true, id: s.docId, novo: false }), true;
      const id = 'd' + crypto.randomBytes(5).toString('hex');
      const agora = new Date().toISOString();
      db.docs[id] = {
        id, slotId: s.id, titulo: tituloPost(s) || 'Documento sem título', html: '', versao: 0,
        criadoEm: agora, criadoPor: String(b.por || '').slice(0, 40), atualizadoEm: agora, por: String(b.por || '').slice(0, 40), sessao: '',
        palavras: 0, caracteres: 0, checklist: [], versoes: [], contaSnap: s.conta, dateSnap: s.date || null,
      };
      s.docId = id; saveDb();
      return json(res, 200, { ok: true, id, novo: true }), true;
    }

    const m = p.match(/^\/api\/docs\/(d[0-9a-f]{6,})(?:\/([a-z]+)(?:\/(\d+))?)?$/);
    if (!m) return json(res, 404, { erro: 'rota de documento desconhecida' }), true;
    const doc = db.docs[m[1]];
    if (!doc) return json(res, 404, { erro: 'documento não encontrado' }), true;
    const acao = m[2] || '';

    if (!acao && req.method === 'GET') return json(res, 200, docCompleto(doc, u.searchParams.get('sessao') || '')), true;

    // salvar (PUT normal; POST = navigator.sendBeacon ao fechar a aba)
    if (!acao && (req.method === 'PUT' || req.method === 'POST')) {
      const b = await readBody(req);
      if (doc.excluido) return json(res, 410, { erro: 'este documento foi excluído' }), true;
      const por = String(b.por || '').slice(0, 40);
      const sessao = String(b.sessao || '').slice(0, 40);
      const agora = Date.now();
      if (b.soVersao) { // guarda um texto no histórico sem mexer no atual (usado no conflito)
        const h = limpaHtml(b.html);
        if (h.length > MAX_HTML) return json(res, 413, { erro: 'documento grande demais' }), true;
        doc.versoes.push({ em: new Date(agora).toISOString(), por, z: zip(h), nota: 'cópia de quem perdeu o conflito' });
        while (doc.versoes.length > MAX_VERSOES) doc.versoes.shift();
        saveDb();
        return json(res, 200, { ok: true }), true;
      }
      if (typeof b.html === 'string') {
        const html = limpaHtml(b.html);
        if (html.length > MAX_HTML) return json(res, 413, { erro: 'documento grande demais (' + Math.round(html.length / 1000) + ' KB). Imagem entra só como link.' }), true;
        // conflito: alguém de OUTRA sessão salvou depois da versão que este navegador tinha
        if (!b.forcar && Number(b.baseVersao) !== doc.versao && doc.sessao && doc.sessao !== sessao) {
          return json(res, 409, { erro: 'conflito', atual: { html: doc.html, versao: doc.versao, por: doc.por, atualizadoEm: doc.atualizadoEm, titulo: doc.titulo } }), true;
        }
        if (html !== doc.html) {
          const ult = doc.versoes[doc.versoes.length - 1];
          const trocouAutor = doc.por && por && doc.por !== por;
          if (doc.html && (trocouAutor || !ult || agora - Date.parse(ult.em) > JANELA_VERSAO)) {
            doc.versoes.push({ em: doc.atualizadoEm, por: doc.por || '', z: zip(doc.html) });
            while (doc.versoes.length > MAX_VERSOES) doc.versoes.shift();
          }
          doc.html = html; doc.versao += 1; contadores(doc);
        }
      }
      if (typeof b.titulo === 'string') doc.titulo = b.titulo.trim().slice(0, 160) || 'Documento sem título';
      if (Array.isArray(b.checklist)) doc.checklist = b.checklist.slice(0, 30).map(Boolean);
      doc.atualizadoEm = new Date(agora).toISOString(); doc.por = por || doc.por; doc.sessao = sessao;
      const s = slotDe(doc); if (s) { doc.contaSnap = s.conta; doc.dateSnap = s.date || null; if (!s.docId) s.docId = doc.id; }
      saveDb();
      return json(res, 200, { ok: true, versao: doc.versao, atualizadoEm: doc.atualizadoEm, palavras: doc.palavras, caracteres: doc.caracteres }), true;
    }

    // presença: "fulano está com este documento aberto"
    if (acao === 'presenca' && req.method === 'POST') {
      const b = await readBody(req);
      const sessao = String(b.sessao || '').slice(0, 40);
      presenca[doc.id] = presenca[doc.id] || {};
      if (b.sair) delete presenca[doc.id][sessao];
      else if (sessao) presenca[doc.id][sessao] = { por: String(b.por || 'alguém').slice(0, 40), ate: Date.now() + PRESENCA_TTL, desde: (presenca[doc.id][sessao] || {}).desde || Date.now() };
      return json(res, 200, { editando: outros(doc.id, sessao), versao: doc.versao, por: doc.por, atualizadoEm: doc.atualizadoEm }), true;
    }

    // histórico de versões
    if (acao === 'versoes' && req.method === 'GET') {
      if (m[3] != null) {
        const v = doc.versoes[Number(m[3])];
        if (!v) return json(res, 404, { erro: 'versão não encontrada' }), true;
        return json(res, 200, { em: v.em, por: v.por, html: unzip(v.z) }), true;
      }
      return json(res, 200, { versoes: doc.versoes.map((v, i) => ({ i, em: v.em, por: v.por, nota: v.nota || '' })).reverse(), atual: { em: doc.atualizadoEm, por: doc.por } }), true;
    }

    // mandar a copy pra descrição da task no ClickUp (seção própria no fim, substituída a cada envio)
    if (acao === 'clickup' && req.method === 'POST') {
      const b = await readBody(req);
      const s = slotDe(doc);
      if (!s || !s.taskId) return json(res, 400, { erro: 'este post ainda não tem task no ClickUp: cole ou crie a task no painel primeiro' }), true;
      const md = String(b.markdown || '').trim();
      if (!md) return json(res, 400, { erro: 'o documento está vazio' }), true;
      let antes = '';
      try { const data = await cuFetch(`/task/${s.taskId}`, { fresh: true }); antes = (data && (data.markdown_description || data.text_content)) || ''; }
      catch (e) { return json(res, 502, { erro: 'não consegui ler a task no ClickUp: ' + e.message }), true; }
      const novo = juntaCopy(antes, md);
      pushUndo({ tipo: 'descricao', desc: 'mandar a copy pro ClickUp', taskId: s.taskId, textoAntes: antes });
      try { await cuWrite(`/task/${s.taskId}`, 'PUT', { markdown_description: novo }); }
      catch (e) {
        if (e.code === 'CU_400') await cuWrite(`/task/${s.taskId}`, 'PUT', { description: novo });
        else return json(res, 502, { erro: 'o ClickUp não aceitou: ' + e.message }), true;
      }
      cuCache.delete(`/task/${s.taskId}`);
      doc.enviadoClickUp = { em: new Date().toISOString(), por: String(b.por || '').slice(0, 40), versao: doc.versao };
      saveDb();
      return json(res, 200, { ok: true, taskId: s.taskId, url: 'https://app.clickup.com/t/' + s.taskId }), true;
    }

    // excluir (vai pra lixeira: nada some de verdade) e restaurar
    if (!acao && req.method === 'DELETE') {
      doc.excluido = true; doc.excluidoEm = new Date().toISOString();
      const s = slotDe(doc); if (s && s.docId === doc.id) delete s.docId;
      saveDb();
      return json(res, 200, { ok: true }), true;
    }
    if (acao === 'restaurar' && req.method === 'POST') {
      doc.excluido = false; delete doc.excluidoEm;
      const s = slotDe(doc); if (s && (!s.docId || !db.docs[s.docId] || db.docs[s.docId].excluido)) s.docId = doc.id;
      saveDb();
      return json(res, 200, { ok: true }), true;
    }
    return json(res, 405, { erro: 'ação não suportada' }), true;
  };
};
module.exports.juntaCopy = juntaCopy;
module.exports.limpaHtml = limpaHtml;
