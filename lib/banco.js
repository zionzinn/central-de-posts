// Banco de cada empresa (v3.83). Pedido do Zion em 28/09/2026: "preciso mudar o jeito que é o banco hoje em dia.
// remover tudo e adicionar", com as seções de cada empresa:
//   SeuBoné: Reutilizar, Drive de conteúdos, Referência de posts
//   Carbone e Weevo: Cortes de podcasts, Drive de conteúdos, Referência de posts
//   Onevo: Drive de conteúdos, Referência de posts
// Cada item é um link + um texto (o que é). Arrastar o item pro dia cria o post com o link já no campo certo.
// Decisão do Zion: Reutilizar SAI do banco quando vira post (é 1 pra 1); Drive, Referência e Cortes FICAM, contam
// quantas vezes viraram post e saem no Concluído. Tudo desfaz com Ctrl+Z (a pilha é a do servidor).
// Mora em db.banco (vai no data.json, que no Render sobe inteiro pro GitHub): ~200 bytes por item.
// v3.96 (pedidos do Zion em 01/10/2026): banco de DEPOIMENTOS na Carbone e na Weevo (fica no banco, "conta quantas
// vezes foi usado e aonde foi usado": todo item que fica guarda onde virou post, em it.onde, até 30); e "ADICIONAR
// DO BANCO" no card do dia, no lugar de escrever a copy: o material (corte, depoimento, Drive ou Reutilizar) vai pro
// post que já existe (slot.banco), a copy fica opcional e a task de produção pode nascer sem copy (lib/hubenvio.js).
// Depois, no mesmo dia: os depoimentos da Weevo em duas seções (Workshop e Imersão); o uso anotado à mão (quantas vezes
// foi usado e o último uso, só ADMIN, os dois opcionais); e o link do Drive com o nome do arquivo (lib/drivenome.js),
// com o título escrito só pelo ADMIN.
// v3.97 (pedido do Zion em 01/10/2026): os cortes de podcast (Carbone e Weevo) em PASTAS POR PESSOA: "uma pasta com o
// nome da pessoa e dentro teria o bruto + os cortes, o link separadamente de cada corte sinalizando o que foi utilizado
// e quantas vezes". As pastas moram em db.bancoPastas ({id, aba, nome}); o item do corte guarda a pasta (it.pasta) e,
// se for o vídeo bruto, it.tipo = 'bruto' (vários por pessoa). Corte de antes, sem pasta, fica em "Sem pessoa".
'use strict';
const crypto = require('crypto');
const DRIVE = require('./drivenome.js');

const SECOES = {
  'SEUBONÉ': ['reutilizar', 'drive', 'referencia'],
  'CARBONE': ['cortes', 'depoimentos', 'drive', 'referencia'],   // v3.96: depoimentos
  'WEEVO': ['cortes', 'depoimentos-workshop', 'depoimentos-imersao', 'drive', 'referencia'],   // v3.96: Workshop e Imersão
  'ONEVO': ['drive', 'referencia'],
};
const SAI_AO_USAR = new Set(['reutilizar']);
// v3.96: as seções de depoimento e o nome do post que nasce de cada uma
const DEPO = { depoimentos: 'Depoimento', 'depoimentos-workshop': 'Depoimento do Workshop', 'depoimentos-imersao': 'Depoimento da Imersão' };
// v3.96: o que pode ser o material de um post pelo "Adicionar do banco" (Referência é inspiração, não material)
const MATERIAL = new Set(['reutilizar', 'drive', 'cortes'].concat(Object.keys(DEPO)));
const MAX_ONDE = 30;
// v3.96: o título deixou de ser obrigatório no Drive ("links do Drive + título do que é", v3.83): o link do Drive já
// vem com o nome do arquivo, e só o ADMIN escreve outro título.
const MAX_POR_SECAO = 200;                                 // cada item pesa no data.json de todo envio pro GitHub
const MAX_SECAO = { cortes: 300 };                         // v3.97: os cortes ganharam os brutos de cada pessoa
const COM_PASTA = new Set(['cortes']);                     // v3.97: seção com pasta por pessoa (bruto + cortes)
const MAX_PASTAS = 100;
const chaveNome = t => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const limpaTexto = t => String(t || '').replace(/[<>]/g, '').replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 140);
const chaveUrl = u => String(u || '').trim().replace(/^https?:\/\/(www\.)?/i, '').replace(/[?#].*$/, '').replace(/\/+$/, '').toLowerCase();

module.exports = function criarBanco(ctx) {
  const { db, saveDb, readBody, json, pushUndo, montaSlot } = ctx;
  if (!Array.isArray(db.banco)) db.banco = [];
  if (!Array.isArray(db.bancoPastas)) db.bancoPastas = [];   // v3.97

  const copia = o => JSON.parse(JSON.stringify(o));
  const acha = id => db.banco.findIndex(x => x.id === id);
  const achaPasta = id => db.bancoPastas.findIndex(x => x.id === id);
  const nomePasta = id => { const k = id ? achaPasta(id) : -1; return k >= 0 ? db.bancoPastas[k].nome : ''; };
  function urlOk(u) { return /^https?:\/\/\S+$/i.test(u) && u.length <= 1000; }

  /** O post que nasce de um item (o link vai no campo "Drive / referência" do post, que abre pela folha). */
  function postDoItem(it, conta, date) {
    const b = { conta, date, drive: it.url, titulo: null, obs: '', formato: '' };
    if (it.sec === 'reutilizar') { b.titulo = 'Reutilizar' + (it.titulo ? ': ' + it.titulo : ''); }
    else if (it.sec === 'drive') { b.titulo = it.titulo || null; }
    else if (it.sec === 'cortes') {
      const pessoa = nomePasta(it.pasta);                                    // v3.97: o nome da pessoa vai junto
      if (it.tipo === 'bruto') b.titulo = 'Vídeo bruto' + (pessoa ? ' · ' + pessoa : '') + (it.titulo ? ': ' + it.titulo : '');
      else { b.titulo = (pessoa ? pessoa + ': ' : '') + (it.titulo || 'Corte de podcast'); b.formato = 'corte de podcast'; }
    }
    else if (DEPO[it.sec]) { b.titulo = it.titulo ? DEPO[it.sec] + ': ' + it.titulo : DEPO[it.sec]; }   // v3.96
    else if (it.sec === 'referencia') { b.titulo = it.titulo || null; }
    return b;
  }
  /** v3.96: o item virou post (arrastado pro dia ou pelo "Adicionar do banco"): conta o uso e guarda ONDE. */
  function registraUso(it, s) {
    it.usos = (it.usos || 0) + 1; it.usadoEm = new Date().toISOString();
    it.onde = [{ slot: s.id, conta: s.conta, date: s.date || null, em: it.usadoEm }].concat((it.onde || []).filter(o => o.slot !== s.id)).slice(0, MAX_ONDE);
  }
  /**
   * v3.96: o uso anotado à mão (só ADMIN; os dois opcionais): quantas vezes foi usado (o total, que o painel continua
   * somando quando o item vira post) e o dia do último uso. Volta { usos?, usadoDia? } ou { erro, st }. Pra quem não é
   * ADMIN, campo vazio é ignorado e campo preenchido dá 403.
   */
  function lerUso(b, admin) {
    const o = {};
    if ('usos' in b && b.usos !== '' && b.usos !== null && b.usos !== undefined) {
      const n = Number(b.usos);
      if (!Number.isInteger(n) || n < 0 || n > 999) return { erro: 'quantas vezes foi usado: um número de 0 a 999', st: 400 };
      o.usos = n;
    }
    if ('usadoDia' in b) {
      const d = String(b.usadoDia || '').trim();
      if (d && (!/^\d{4}-\d{2}-\d{2}$/.test(d) || isNaN(Date.parse(d + 'T12:00:00Z')) || d < '2015-01-01' || d > '2100-12-31')) return { erro: 'último uso: dia inválido', st: 400 };
      o.usadoDia = d;                                          // vazio apaga
    }
    if (!admin) return ('usos' in o || o.usadoDia) ? { erro: 'só ADMIN (Zion ou Maria) anota o uso à mão', st: 403 } : {};
    return o;
  }
  /** v3.97: a pasta (pessoa) e o tipo (bruto ou corte) de um item dos cortes. Volta { pasta?, tipo? } ou { erro, st }. */
  function lerPasta(b, aba, sec) {
    const o = {};
    if ('pasta' in b) {
      const id = String(b.pasta || '');
      if (id) {
        if (!COM_PASTA.has(sec)) return { erro: 'só os cortes de podcast ficam em pasta por pessoa', st: 400 };
        const k = achaPasta(id);
        if (k < 0 || db.bancoPastas[k].aba !== aba) return { erro: 'essa pasta não existe mais', st: 404 };
      }
      o.pasta = id;                                                          // vazio: "Sem pessoa"
    }
    if ('tipo' in b && b.tipo) {
      const t = String(b.tipo);
      if (!COM_PASTA.has(sec)) return { erro: 'só os cortes de podcast têm bruto e corte', st: 400 };
      if (t !== 'bruto' && t !== 'corte') return { erro: 'tipo inválido: bruto ou corte', st: 400 };
      o.tipo = t;
    }
    return o;
  }
  function aplicaPasta(it, o) {
    if ('pasta' in o) { if (o.pasta) it.pasta = o.pasta; else delete it.pasta; }
    if ('tipo' in o) { if (o.tipo === 'bruto') it.tipo = 'bruto'; else delete it.tipo; }
  }
  function aplicaUso(it, o) {
    if ('usos' in o) it.usos = Math.max(o.usos, (it.onde || []).length);   // nunca menos que os posts registrados
    if ('usadoDia' in o) { if (o.usadoDia) it.usadoDia = o.usadoDia; else delete it.usadoDia; }
  }
  /**
   * v3.96: tira o material do banco que estava no post (trocar ou tirar). O item que fica perde o uso deste post;
   * o Reutilizar (que tinha saído do banco) volta pra ele. Tudo vai no registro do Ctrl+Z (u).
   */
  function soltaDoPost(s, u) {
    const b = s.banco; if (!b) return null;
    const k = acha(b.id);
    if (k >= 0) {
      const it = db.banco[k];
      if (!u.antes.some(x => x.item.id === it.id)) u.antes.push({ item: copia(it), pos: k });
      const tinha = (it.onde || []).some(o => o.slot === s.id);
      it.onde = (it.onde || []).filter(o => o.slot !== s.id);
      if (tinha) it.usos = Math.max(0, (it.usos || 0) - 1);
    } else if (SAI_AO_USAR.has(b.sec) && b.aba && b.url) {
      const volta = { id: b.id, aba: b.aba, sec: b.sec, url: b.url, titulo: b.titulo || '', usos: 0, criadoEm: new Date().toISOString(), por: b.por || '' };
      db.banco.unshift(volta); u.criados.push(volta.id);
    }
    if (s.drive && s.drive === b.url) s.drive = '';
    delete s.banco;
    return b;
  }

  async function rota(req, res, p) {
    if (!p.startsWith('/api/banco')) return false;
    const quem = req.eu ? req.eu.nome : '';
    const admin = !req.eu || req.eu.papel === 'admin';       // sem login (PC local), todo mundo é ADMIN, como antes

    // guardar um link numa seção
    if (p === '/api/banco' && req.method === 'POST') {
      const b = await readBody(req);
      const aba = String(b.aba || ''), sec = String(b.sec || '');
      if (!SECOES[aba]) return json(res, 400, { erro: 'empresa inválida' }), true;
      if (!SECOES[aba].includes(sec)) return json(res, 400, { erro: 'essa seção não existe no banco dessa empresa' }), true;
      const url = String(b.url || '').trim();
      if (!urlOk(url)) return json(res, 400, { erro: 'cole um link válido (começa com https://)' }), true;
      let titulo = limpaTexto(b.titulo);
      if (titulo && !admin) return json(res, 403, { erro: 'só ADMIN (Zion ou Maria) escreve o título: o link do Drive já vem com o nome do arquivo' }), true;   // v3.96
      const uso = lerUso(b, admin);
      if (uso.erro) return json(res, uso.st, { erro: uso.erro }), true;
      const pt = lerPasta(b, aba, sec);                                      // v3.97
      if (pt.erro) return json(res, pt.st, { erro: pt.erro }), true;
      const repetido = () => db.banco.find(x => x.aba === aba && x.sec === sec && chaveUrl(x.url) === chaveUrl(url));
      let igual = repetido();
      if (igual) return json(res, 409, { erro: 'esse link já está nessa seção' + (igual.titulo ? ' ("' + igual.titulo + '")' : ''), id: igual.id }), true;
      const max = MAX_SECAO[sec] || MAX_POR_SECAO;
      if (db.banco.filter(x => x.aba === aba && x.sec === sec).length >= max) return json(res, 400, { erro: 'essa seção já tem ' + max + ' links: conclua os que já foram usados' }), true;
      // v3.96: sem título escrito, o link do Drive ganha o nome do arquivo (só com o link aberto; restrito fica sem)
      let drive = null, tituloDrive = '';
      if (!titulo && DRIVE.linkDoDrive(url)) {
        drive = await DRIVE.nomeDoDrive(url);
        if (drive.ok) titulo = tituloDrive = limpaTexto(drive.nome);
        if ((igual = repetido())) return json(res, 409, { erro: 'esse link já está nessa seção', id: igual.id }), true;   // guardado por outra pessoa enquanto o Drive respondia
      }
      const it = { id: 'b' + crypto.randomBytes(4).toString('hex'), aba, sec, url, titulo, usos: 0, criadoEm: new Date().toISOString(), por: quem };
      if (tituloDrive) it.tituloDrive = tituloDrive;
      aplicaUso(it, uso);
      if (pt.pasta && achaPasta(pt.pasta) < 0) return json(res, 404, { erro: 'essa pasta saiu enquanto o Drive respondia' }), true;
      aplicaPasta(it, pt);
      db.banco.unshift(it);
      pushUndo({ tipo: 'banco', desc: 'guardar no banco', antes: [], criados: [it.id], slots: [] });
      saveDb();
      return json(res, 200, { ok: true, item: it, drive }), true;
    }

    // v3.96: tirar o material do banco do post (o card volta a ser o card da matriz)
    if (p === '/api/banco/solta' && req.method === 'POST') {
      const b = await readBody(req);
      const s = db.slots.find(x => x.id === String(b.slot || ''));
      if (!s) return json(res, 404, { erro: 'post não encontrado' }), true;
      if (!s.banco) return json(res, 400, { erro: 'este post não tem material do banco' }), true;
      const u = { tipo: 'banco', desc: 'tirar o material do banco do post', antes: [], criados: [], slots: [], slotsAntes: [copia(s)] };
      soltaDoPost(s, u);
      pushUndo(u); saveDb();
      return json(res, 200, { ok: true, slot: s }), true;
    }

    // v3.97: pastas por pessoa nos cortes de podcast. Criar e renomear: qualquer pessoa (quem edita os cortes também
    // organiza); excluir: só pasta vazia. Tudo desfaz com Ctrl+Z.
    if (p === '/api/banco/pastas' && req.method === 'POST') {
      const b = await readBody(req);
      const aba = String(b.aba || '');
      if (!SECOES[aba] || !SECOES[aba].some(x => COM_PASTA.has(x))) return json(res, 400, { erro: 'essa empresa não tem cortes de podcast' }), true;
      const nome = limpaTexto(b.nome).slice(0, 60);
      if (!nome) return json(res, 400, { erro: 'diga o nome da pessoa' }), true;
      const igual = db.bancoPastas.find(x => x.aba === aba && chaveNome(x.nome) === chaveNome(nome));
      if (igual) return json(res, 409, { erro: 'já tem a pasta "' + igual.nome + '"', id: igual.id }), true;
      if (db.bancoPastas.filter(x => x.aba === aba).length >= MAX_PASTAS) return json(res, 400, { erro: 'já são ' + MAX_PASTAS + ' pessoas nessa empresa' }), true;
      const pa = { id: 'p' + crypto.randomBytes(4).toString('hex'), aba, nome, criadoEm: new Date().toISOString(), por: quem };
      db.bancoPastas.push(pa);
      pushUndo({ tipo: 'banco', desc: 'criar a pasta ' + nome, antes: [], criados: [], slots: [], pastasCriadas: [pa.id] });
      saveDb();
      return json(res, 200, { ok: true, pasta: pa }), true;
    }
    const mp = p.match(/^\/api\/banco\/pastas\/(p[0-9a-f]{8})$/);
    if (mp) {
      const k = achaPasta(mp[1]);
      if (k < 0) return json(res, 404, { erro: 'essa pasta não existe mais' }), true;
      const pa = db.bancoPastas[k];
      if (req.method === 'PATCH') {
        const b = await readBody(req);
        const nome = limpaTexto(b.nome).slice(0, 60);
        if (!nome) return json(res, 400, { erro: 'diga o nome da pessoa' }), true;
        const igual = db.bancoPastas.find(x => x.id !== pa.id && x.aba === pa.aba && chaveNome(x.nome) === chaveNome(nome));
        if (igual) return json(res, 409, { erro: 'já tem a pasta "' + igual.nome + '"', id: igual.id }), true;
        pushUndo({ tipo: 'banco', desc: 'renomear a pasta', antes: [], criados: [], slots: [], pastasAntes: [{ pasta: copia(pa), pos: k }] });
        pa.nome = nome;
        saveDb();
        return json(res, 200, { ok: true, pasta: pa }), true;
      }
      if (req.method === 'DELETE') {
        const dentro = db.banco.filter(x => x.pasta === pa.id).length;
        if (dentro) return json(res, 409, { erro: 'a pasta ainda tem ' + dentro + ' link' + (dentro > 1 ? 's' : '') + ': conclua ou arraste pra outra pasta antes' }), true;
        pushUndo({ tipo: 'banco', desc: 'excluir a pasta ' + pa.nome, antes: [], criados: [], slots: [], pastasAntes: [{ pasta: copia(pa), pos: k }] });
        db.bancoPastas.splice(k, 1);
        saveDb();
        return json(res, 200, { ok: true }), true;
      }
      return json(res, 405, { erro: 'método não aceito' }), true;
    }

    const m = p.match(/^\/api\/banco\/(b[0-9a-f]{8})(\/usar|\/no-post)?$/);
    if (!m) return json(res, 404, { erro: 'rota do banco não existe' }), true;
    const i = acha(m[1]);
    if (i < 0) return json(res, 404, { erro: 'esse item não está mais no banco' }), true;
    const it = db.banco[i];

    // v3.96: "Adicionar do banco": o material vai pro post que já existe (o card do dia); trocar devolve o anterior
    if (m[2] === '/no-post' && req.method === 'POST') {
      const b = await readBody(req);
      const s = db.slots.find(x => x.id === String(b.slot || ''));
      if (!s) return json(res, 404, { erro: 'post não encontrado' }), true;
      if (!db.contas[s.conta] || db.contas[s.conta].aba !== it.aba) return json(res, 400, { erro: 'esse material é do banco de outra empresa' }), true;
      if (!MATERIAL.has(it.sec)) return json(res, 400, { erro: 'referência é inspiração, não material: arraste ela pro dia se quiser um post novo' }), true;
      if (s.taskId) return json(res, 409, { erro: 'este post já tem task de produção' }), true;
      if (s.banco && s.banco.id === it.id) return json(res, 200, { ok: true, slot: s, item: it, igual: true }), true;
      const u = { tipo: 'banco', desc: 'material do banco no post', antes: [{ item: copia(it), pos: i }], criados: [], slots: [], slotsAntes: [copia(s)] };
      soltaDoPost(s, u);                                                   // trocar: o anterior sai antes
      s.banco = { id: it.id, aba: it.aba, sec: it.sec, url: it.url, titulo: it.titulo || '', por: it.por || '', em: new Date().toISOString() };
      if (it.tipo === 'bruto') s.banco.tipo = 'bruto';                     // v3.97
      if (nomePasta(it.pasta)) s.banco.pessoa = nomePasta(it.pasta);
      if (!s.drive) s.drive = it.url;                                      // o link abre pela folha do post, como no arrastar
      const saiu = SAI_AO_USAR.has(it.sec);
      if (saiu) { const k = acha(it.id); if (k >= 0) db.banco.splice(k, 1); } else registraUso(it, s);
      pushUndo(u); saveDb();
      return json(res, 200, { ok: true, slot: s, item: saiu ? null : it, saiu }), true;
    }
    // arrastou pro dia: vira post (Reutilizar sai do banco; o resto fica e conta o uso)
    if (m[2] === '/usar' && req.method === 'POST') {
      const b = await readBody(req);
      const conta = String(b.conta || ''), date = String(b.date || '');
      if (!db.contas[conta] || db.contas[conta].aba !== it.aba) return json(res, 400, { erro: 'escolha uma conta da ' + it.aba }), true;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json(res, 400, { erro: 'dia inválido' }), true;
      const slot = montaSlot(postDoItem(it, conta, date));
      const antes = [{ item: copia(it), pos: i }];
      db.slots.push(slot);
      const saiu = SAI_AO_USAR.has(it.sec);
      if (saiu) db.banco.splice(i, 1);
      else registraUso(it, slot);                                    // v3.96: e onde foi usado
      pushUndo({ tipo: 'banco', desc: 'post do banco', antes, criados: [], slots: [slot.id] });
      saveDb();
      return json(res, 200, { ok: true, slot, item: saiu ? null : it, saiu }), true;
    }
    // corrigir o link ou o texto
    if (!m[2] && req.method === 'PATCH') {
      const b = await readBody(req);
      if ('titulo' in b && !admin && limpaTexto(b.titulo) !== (it.titulo || '')) return json(res, 403, { erro: 'só ADMIN (Zion ou Maria) muda o título' }), true;   // v3.96
      const uso = lerUso(b, admin);
      if (uso.erro) return json(res, uso.st, { erro: uso.erro }), true;
      const pt = lerPasta(b, it.aba, it.sec);                                // v3.97: mudar de pasta ou de tipo
      if (pt.erro) return json(res, pt.st, { erro: pt.erro }), true;
      const antes = [{ item: copia(it), pos: i }];
      let novaUrl = null;
      if ('url' in b) {
        const url = String(b.url || '').trim();
        if (!urlOk(url)) return json(res, 400, { erro: 'cole um link válido (começa com https://)' }), true;
        const igual = db.banco.find(x => x.id !== it.id && x.aba === it.aba && x.sec === it.sec && chaveUrl(x.url) === chaveUrl(url));
        if (igual) return json(res, 409, { erro: 'esse link já está nessa seção', id: igual.id }), true;
        if (url !== it.url) novaUrl = url;
      }
      // v3.96: o título é o nome do Drive ou o que o ADMIN escreveu. Título apagado, ou link novo quando o título era
      // o nome do Drive (ou nenhum), puxa o nome de novo; título escrito pelo ADMIN fica.
      let titulo = admin && 'titulo' in b ? limpaTexto(b.titulo) : null, tituloDrive;   // null: não mexe
      if (titulo && titulo === (it.titulo || '')) titulo = null;                         // igual ao de antes: não mexeu
      const eraDoDrive = !it.titulo || it.titulo === it.tituloDrive;
      let drive = null;
      if (titulo === '' || (titulo === null && novaUrl && eraDoDrive)) {
        const alvo = novaUrl || it.url;
        drive = DRIVE.linkDoDrive(alvo) ? await DRIVE.nomeDoDrive(alvo) : null;
        titulo = tituloDrive = drive && drive.ok ? limpaTexto(drive.nome) : '';
        if (acha(it.id) < 0) return json(res, 404, { erro: 'esse item saiu do banco enquanto o Drive respondia' }), true;
      }
      if (novaUrl) it.url = novaUrl;
      if (titulo !== null) it.titulo = titulo;
      if (tituloDrive !== undefined) { if (tituloDrive) it.tituloDrive = tituloDrive; else delete it.tituloDrive; }
      aplicaUso(it, uso);
      if (pt.pasta && achaPasta(pt.pasta) < 0) return json(res, 404, { erro: 'essa pasta não existe mais' }), true;
      aplicaPasta(it, pt);
      pushUndo({ tipo: 'banco', desc: 'pasta' in pt && Object.keys(b).length === 1 ? 'mudar o corte de pasta' : 'editar item do banco', antes, criados: [], slots: [] });
      saveDb();
      return json(res, 200, { ok: true, item: it, drive }), true;
    }
    // Concluído (ou excluir): sai do banco
    if (!m[2] && req.method === 'DELETE') {
      pushUndo({ tipo: 'banco', desc: 'tirar do banco', antes: [{ item: copia(it), pos: i }], criados: [], slots: [] });
      db.banco.splice(i, 1);
      saveDb();
      return json(res, 200, { ok: true }), true;
    }
    return json(res, 405, { erro: 'método não aceito' }), true;
  }

  /** Ctrl+Z de uma ação do banco (chamado pelo /api/undo do servidor). */
  rota.desfaz = e => {
    for (const id of e.slots || []) db.slots = db.slots.filter(s => s.id !== id);
    for (const sa of e.slotsAntes || []) { const k = db.slots.findIndex(s => s.id === sa.id); if (k >= 0) db.slots[k] = sa; else db.slots.push(sa); }   // v3.96
    for (const id of e.criados || []) db.banco = db.banco.filter(x => x.id !== id);
    for (const id of e.pastasCriadas || []) db.bancoPastas = db.bancoPastas.filter(x => x.id !== id);   // v3.97
    for (const { pasta, pos } of e.pastasAntes || []) {
      const j = achaPasta(pasta.id);
      if (j >= 0) db.bancoPastas[j] = pasta; else db.bancoPastas.splice(Math.min(pos, db.bancoPastas.length), 0, pasta);
    }
    for (const { item, pos } of e.antes || []) {
      const j = acha(item.id);
      if (j >= 0) db.banco[j] = item; else db.banco.splice(Math.min(pos, db.banco.length), 0, item);
    }
    saveDb();
  };

  /**
   * Uma vez só (v3.96): os itens do banco com link do Drive e SEM título ganham o nome do arquivo no Drive ("preciso
   * que o link fique com o título do Drive"). Roda em segundo plano depois da subida, um link por vez (até 80); link
   * restrito fica sem nome. Título escrito por alguém não muda.
   */
  rota.nomesDoDrive = async (backupAgora, log) => {
    if (!db.migracoes || typeof db.migracoes !== 'object') db.migracoes = {};
    if (db.migracoes.v396) return;
    const alvos = db.banco.filter(x => !x.titulo && DRIVE.linkDoDrive(x.url)).slice(0, 80);
    const achou = [];
    for (const it of alvos) { const r = await DRIVE.nomeDoDrive(it.url); if (r.ok) achou.push([it.id, limpaTexto(r.nome)]); }
    // só o que continua no banco e sem título (alguém pode ter mexido enquanto o Drive respondia); backup antes de gravar
    const vale = achou.filter(([id]) => { const k = acha(id); return k >= 0 && !db.banco[k].titulo; });
    if (vale.length) backupAgora('antes do nome do Drive nos itens do banco (v3.96)');
    for (const [id, nome] of vale) { const it = db.banco[acha(id)]; it.titulo = it.tituloDrive = nome; }
    db.migracoes.v396 = { em: new Date().toISOString(), drive: alvos.length, nomes: vale.length };
    saveDb();
    log('[v3.96] nome do Drive nos itens do banco sem título: ' + vale.length + ' de ' + alvos.length);
  };

  /**
   * Uma vez só (v3.83): o banco antigo sai ("remover tudo", pedido do Zion). Referências gerais e os posts sem dia
   * que eram do banco antigo (Reutilizáveis da planilha, Criativos e as categorias da Carbone) ficam 30 dias em
   * db.removidosV383 (dá pra devolver) e no backup; os posts sem dia comuns continuam, na seção Sem dia.
   */
  rota.migra = (backupAgora, log) => {
    if (!db.migracoes || typeof db.migracoes !== 'object') db.migracoes = {};
    if (db.removidosV383 && Date.now() > Date.parse(db.removidosV383.ate || 0)) { delete db.removidosV383; saveDb(); }
    if (db.migracoes.v383) return;
    const refs = Array.isArray(db.referencias) ? db.referencias : [];
    const velhos = db.slots.filter(s => !s.date && (s.origem === 'banco' || s.origem === 'criativo'));
    if (refs.length || velhos.length) {
      backupAgora('antes do banco novo v3.83');
      db.removidosV383 = {
        em: new Date().toISOString(), ate: new Date(Date.now() + 30 * 864e5).toISOString(),
        motivo: 'banco antigo (pedido do Zion em 28/09/2026: remover tudo e criar as seções novas de cada empresa)',
        referencias: refs, slots: velhos.map(copia),
      };
      const fora = new Set(velhos.map(s => s.id));
      db.slots = db.slots.filter(s => !fora.has(s.id));
    }
    delete db.referencias;
    db.migracoes.v383 = { em: new Date().toISOString(), referencias: refs.length, slots: velhos.length };
    saveDb();
    log('[v3.83] banco novo: ' + (refs.length || velhos.length ? refs.length + ' referência(s) e ' + velhos.length + ' post(s) do banco antigo guardados 30 dias em removidosV383' : 'o banco antigo estava vazio'));
  };
  return rota;
};
module.exports.SECOES = SECOES;
