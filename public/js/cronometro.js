/* =====================================================================
   B.O.N.E · relógio das tarefas (v3.80). Usado pelo painel (index.html) e pelo doc da copy (doc.html).

   O relógio roda NO NAVEGADOR: o estado fica no localStorage ('bone.cron'), então sobrevive a recarregar
   a página e é o mesmo no painel e no doc (que abre dentro dele). O servidor só fica sabendo quando ele
   para: 1 envio por sessão. Sem internet, a sessão espera na fila ('bone.cronFila') e vai depois; o
   servidor não duplica se chegar duas vezes.

   Enquanto roda, ele anota qual post está aberto (card da matriz ou doc da copy) e soma o tempo nele.
   É assim que a tarefa sabe o que foi feito sem ninguém marcar nada.

   15 min sem mexer no B.O.N.E: pausa no último movimento e pergunta se aquele tempo conta.

   Visual: dígitos que rolam (ideia do Skiper37, do Skiper UI, e do NumberFlow, de Maxwell Barvian, MIT,
   refeitos em CSS puro) e botão redondo com anel (ideia do circle-button de vikramsinghnegi, Uiverse, MIT).
   ===================================================================== */
(function () {
  'use strict';
  const CHAVE = 'bone.cron', FILA = 'bone.cronFila';
  const OCIOSO_MS = 15 * 60e3;      // parado há 15 min: pausa e pergunta
  const MIN_MS = 30e3;              // menos de 30 s não conta (clique sem querer)
  const ATIVO_MS = 15e3;            // grava "mexeu agora" no máximo a cada 15 s

  const ls = {
    get(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } },
    set(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  };
  const ouvintes = new Set(), ouvintesSalvo = new Set();
  function avisa() { const e = estado(); ouvintes.forEach(f => { try { f(e); } catch (x) { console.error(x); } }); }
  // o doc e o painel são duas páginas: quando uma muda o relógio, a outra fica sabendo por aqui
  window.addEventListener('storage', ev => { if (ev.key === CHAVE || ev.key === null) avisa(); });

  function estado() { const e = ls.get(CHAVE); return e && e.id ? e : null; }
  function grava(e) { ls.set(CHAVE, e); avisa(); }
  function novoId() { return (Date.now().toString(36) + Math.random().toString(36).slice(2, 9)).slice(0, 16); }

  /** Fecha a conta até "ate": o trecho corrido entra no total e no post que estava aberto. */
  function assenta(e, ate) {
    if (!e || !e.rodando) return e;
    const fim = Math.min(ate, Date.now());
    const dt = Math.max(0, fim - e.marca);
    e.acum += dt;
    if (e.foco) e.posts[e.foco] = (e.posts[e.foco] || 0) + dt;
    e.marca = Math.max(e.marca, fim);
    return e;
  }
  function decorrido(e) {
    e = e === undefined ? estado() : e;
    if (!e) return 0;
    return e.acum + (e.rodando ? Math.max(0, Date.now() - e.marca) : 0);
  }
  /** Quanto do tempo desta sessão foi em cada post (ms), contando o trecho que está correndo agora. */
  function postsAgora(e) {
    e = e === undefined ? estado() : e;
    if (!e) return {};
    const o = Object.assign({}, e.posts);
    if (e.rodando && e.foco) o[e.foco] = (o[e.foco] || 0) + Math.max(0, Date.now() - e.marca);
    return o;
  }

  // ---------- fila de envio (1 POST por sessão; tenta de novo sem internet) ----------
  function enfileira(reg) { const f = ls.get(FILA) || []; f.push(reg); ls.set(FILA, f.slice(-60)); }
  function naFila(id) { return (ls.get(FILA) || []).some(x => x.id === id); }
  let enviando = null;
  function enviarFila() {
    if (enviando) return enviando;
    enviando = (async () => {
      for (const reg of (ls.get(FILA) || []).slice()) {
        let r;
        try { r = await fetch('/api/tempo/sessao', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(reg) }); }
        catch (e) { break; }                                   // sem internet: tenta depois
        if (!r.ok && r.status !== 400 && r.status !== 409) break;   // 401 (login) ou servidor fora: tenta depois
        if (r.status === 409) continue;                        // v3.82: sessão de outra conta da equipe: fica até ela entrar
        const j = await r.json().catch(() => ({}));
        const resto = (ls.get(FILA) || []).filter(x => x.id !== reg.id);
        ls.set(FILA, resto.length ? resto : null);
        if (!r.ok) { console.warn('[relógio] sessão recusada:', j.erro || r.status); continue; }   // dado ruim: não adianta insistir
        ouvintesSalvo.forEach(f => { try { f(j, reg); } catch (x) {} });
      }
    })().finally(() => { enviando = null; });
    return enviando;
  }
  setInterval(enviarFila, 60e3);
  window.addEventListener('online', () => enviarFila());
  setTimeout(enviarFila, 2500);

  // ---------- comandos ----------
  /** Liga o relógio de uma tarefa. Se outro estiver ligado, para e salva ele antes (um relógio por vez). */
  function iniciar(o) {
    const e0 = estado();
    if (e0 && e0.tarefaId === o.tarefaId) { if (!e0.rodando) retomar(); return Promise.resolve(null); }
    const antes = e0 ? parar() : Promise.resolve(null);
    const agora = Date.now();
    grava({
      v: 1, id: novoId(), tarefaId: o.tarefaId, atv: o.atv, aba: o.aba, titulo: o.titulo || '', por: o.por,
      ini: agora, acum: 0, rodando: true, marca: agora, ativo: agora, ocioso: null,
      foco: o.foco || null, focoTit: o.foco ? (o.focoTit || '') : '', posts: {},
    });
    return antes;
  }
  function pausar() { const e = estado(); if (!e || !e.rodando) return; assenta(e, Date.now()); e.rodando = false; grava(e); }
  function retomar() {
    const e = estado(); if (!e) return;
    const agora = Date.now();
    e.ocioso = null; e.rodando = true; e.marca = agora; e.ativo = agora;
    grava(e);
  }
  function alternar() { const e = estado(); if (!e) return; if (e.rodando) pausar(); else retomar(); }
  /** Para e salva. Devolve { reg, curto } (curto = menos de 30 s, não conta) ou null se não tinha relógio. */
  function parar() {
    const e = estado();
    if (!e) return Promise.resolve(null);
    assenta(e, Date.now());                                    // parado no meio da pergunta de ócio = não conta o ócio
    const reg = { id: e.id, ini: Math.floor(e.ini / 1000), seg: Math.round(e.acum / 1000), tarefaId: e.tarefaId, atv: e.atv, aba: e.aba, por: e.por, posts: {} };
    for (const [k, v] of Object.entries(e.posts || {})) { const s = Math.round(v / 1000); if (s > 0) reg.posts[k] = s; }
    grava(null);
    if (e.acum < MIN_MS) return Promise.resolve({ reg, curto: true });
    enfileira(reg);
    return enviarFila().then(() => ({ reg, curto: false, pendente: naFila(reg.id) }));
  }
  /** Qual post está aberto agora (card da matriz ou doc da copy). null = nenhum (conta na tarefa, sem post). */
  function foco(slotId, titulo) {
    const e = estado(); if (!e) return;
    slotId = slotId || null;
    if ((e.foco || null) === slotId) { if (slotId && titulo && e.focoTit !== titulo) { e.focoTit = titulo; grava(e); } return; }
    assenta(e, Date.now());
    e.foco = slotId; e.focoTit = slotId ? (titulo || '') : '';
    grava(e);
  }
  /** Resposta da pergunta "ficou X parado: conta?". Nos dois casos o relógio volta a andar. */
  function responderOcioso(conta) {
    const e = estado(); if (!e || !e.ocioso) return;
    const agora = Date.now();
    if (conta) {
      const dt = Math.max(0, agora - e.ocioso.desde);
      e.acum += dt;
      if (e.foco) e.posts[e.foco] = (e.posts[e.foco] || 0) + dt;
    }
    e.ocioso = null; e.rodando = true; e.marca = agora; e.ativo = agora;
    grava(e);
  }

  // ---------- ócio: 15 min sem mexer pausa no último movimento ----------
  function checaOcioso() {
    const e = estado();
    if (!e || !e.rodando) return false;
    const ult = Math.max(e.ativo || 0, e.marca);
    if (Date.now() - ult < OCIOSO_MS) return false;
    assenta(e, ult);                                           // o tempo parado não entra (a não ser que ela diga que conta)
    e.rodando = false; e.ocioso = { desde: ult };
    grava(e);
    return true;
  }
  let ultAtivo = 0;
  function mexeu() {
    const agora = Date.now();
    if (agora - ultAtivo < ATIVO_MS) return;
    ultAtivo = agora;
    const e = estado();
    if (!e || !e.rodando) return;
    if (checaOcioso()) return;                                 // voltou depois de muito tempo: pergunta antes de seguir
    e.ativo = agora;
    ls.set(CHAVE, e);                                          // sem avisar ninguém: nada muda na tela
  }
  ['pointerdown', 'keydown', 'wheel', 'touchstart', 'input'].forEach(ev => window.addEventListener(ev, mexeu, { passive: true, capture: true }));
  window.addEventListener('pointermove', mexeu, { passive: true });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checaOcioso(); });
  setInterval(checaOcioso, 20e3);
  setTimeout(checaOcioso, 800);

  // ---------- formatos ----------
  function fmt(ms) {
    const s = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60;
    return (h ? h + ':' + String(m).padStart(2, '0') : String(m).padStart(2, '0')) + ':' + String(x).padStart(2, '0');
  }
  /** Segundos em texto curto: "45 s", "12 min", "2 h 05". */
  function fmtLongo(seg) {
    seg = Math.max(0, Math.round(seg || 0));
    if (!seg) return '0 min';
    if (seg < 60) return seg + ' s';
    const h = Math.floor(seg / 3600), m = Math.round(seg % 3600 / 60);
    if (!h) return m + ' min';
    return h + ' h' + (m ? ' ' + String(m).padStart(2, '0') : '');
  }

  // ---------- dígitos que rolam (NumberFlow em CSS puro) ----------
  const REDUZ = (() => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } })();
  function colHtml(base) {
    let h = '';
    for (let i = 0; i < base; i++) h += '<i>' + i + '</i>';
    return '<span class="nf-d"><span class="nf-col" data-b="' + base + '">' + h + '<i>0</i></span></span>';   // o 0 extra é pra virar (9 → 0) andando pra frente
  }
  function poeCol(col, v, anima) {
    const b = +col.dataset.b, ant = col._v;
    col._v = v;
    const seco = n => { col.style.transition = 'none'; col.style.setProperty('--i', n); void col.offsetHeight; col.style.transition = ''; };
    if (ant == null || !anima || REDUZ) { clearTimeout(col._t); seco(v); return; }
    if (v === ant) return;
    if (v === 0 && ant === b - 1) {                            // virou: anda até o 0 extra e depois pula pro 0 de cima sem animar
      col.style.setProperty('--i', b);
      clearTimeout(col._t); col._t = setTimeout(() => seco(0), 620);
    } else { clearTimeout(col._t); col.style.setProperty('--i', v); }
  }
  /** Pinta um tempo (ms) num elemento .nf. anima=false pula direto (primeira pintura, relógio zerado). */
  function pintaDigitos(el, ms, anima) {
    if (!el) return;
    const txt = fmt(ms);
    if (el._txt === txt) return;
    const forma = txt.length + (txt.split(':').length === 3 ? 'h' : '');
    if (el._forma !== forma) {
      // base de cada posição: dezena de minuto e de segundo vai de 0 a 5; o resto de 0 a 9
      const partes = txt.split(':');
      el.innerHTML = partes.map((p, i) => {
        const hora = partes.length === 3 && i === 0;
        return [...p].map((c, j) => colHtml(!hora && j === 0 && p.length === 2 ? 6 : 10)).join('');
      }).join('<span class="nf-sep">:</span>');
      el._forma = forma; anima = false;
    }
    const cols = el.querySelectorAll('.nf-col'), dig = txt.replace(/:/g, '');
    cols.forEach((c, i) => poeCol(c, +dig[i], anima !== false));
    el._txt = txt;
    el.setAttribute('aria-label', txt);
  }

  // ---------- botão redondo com anel ----------
  const BOTAO_HTML = '<svg class="rl-anel" viewBox="0 0 48 48" aria-hidden="true"><circle class="rl-trilho" cx="24" cy="24" r="21"/><circle class="rl-arco" cx="24" cy="24" r="21" pathLength="100"/></svg>' +
    '<svg class="rl-ic" viewBox="0 0 24 24" aria-hidden="true"><path class="rl-play" d="M8.5 5.8v12.4a.8.8 0 0 0 1.2.7l9.6-6.2a.8.8 0 0 0 0-1.4L9.7 5.1a.8.8 0 0 0-1.2.7z"/><g class="rl-pause"><rect x="6.5" y="5.5" width="4" height="13" rx="1.3"/><rect x="13.5" y="5.5" width="4" height="13" rx="1.3"/></g></svg>';
  /** st: 'parado' (play), 'rodando' (anel girando, pause), 'pausado' (play, anel cheio), 'outro' (outra tarefa rodando). */
  function pintaBotao(el, st, rotulo) {
    if (!el) return;
    if (!el.querySelector('.rl-anel')) { el.classList.add('rl-btn'); el.innerHTML = BOTAO_HTML; el.type = 'button'; }
    if (el.dataset.st !== st) el.dataset.st = st;
    const r = rotulo || (st === 'rodando' ? 'Pausar o relógio' : st === 'pausado' ? 'Continuar o relógio' : 'Começar o relógio');
    if (el.getAttribute('aria-label') !== r) { el.setAttribute('aria-label', r); el.dataset.tip = r; }
  }

  // ---------- tique: repinta 2x por segundo enquanto tem relógio andando e a página está à vista ----------
  const tiques = new Set();
  let tTimer = null;
  function roda() {
    const e = estado();
    tiques.forEach(f => { try { f(e); } catch (x) {} });
    tTimer = e && e.rodando && !document.hidden ? setTimeout(roda, 500) : null;
  }
  function tique(f) { tiques.add(f); acorda(); }
  function acorda() { if (!tTimer) roda(); }
  ouvintes.add(() => acorda());
  document.addEventListener('visibilitychange', () => { if (!document.hidden) acorda(); });

  window.CRON = {
    estado, decorrido, postsAgora, iniciar, pausar, retomar, alternar, parar, foco, responderOcioso, checaOcioso,
    rodando: () => { const e = estado(); return !!(e && e.rodando); },
    on: f => { ouvintes.add(f); return () => ouvintes.delete(f); },
    onSalvo: f => { ouvintesSalvo.add(f); return () => ouvintesSalvo.delete(f); },
    tique, enviarFila, fila: () => (ls.get(FILA) || []).length,
    fmt, fmtLongo, pintaDigitos, pintaBotao, OCIOSO_MS, MIN_MS,
  };
})();
