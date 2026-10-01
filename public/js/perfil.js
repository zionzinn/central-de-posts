/* =====================================================================
   B.O.N.E · aba Perfil (v3.99). Pedido do Zion em 01/10/2026: "vamos tentar montar uma aba perfil mais ou menos
   assim ... ter vários personagens pra pessoa escolher" (aprovado depois dos prints: "pode fazer o commit").
   - abre clicando na sua bolinha (canto de cima, à direita); "Calendário" ou Esc voltam
   - card do personagem (12 originais, public/js/personagens.js; 1 por pessoa) e Trocar personagem
   - Comigo agora: o que depende de você (cada quadro abre o lugar certo: Minhas copys, Pra aprovar, a tarefa, o post)
   - Esta semana: copys aprovadas (de primeira), mandadas, aprovadas pelo ADMIN, tempo no relógio por dia
   - Time: o personagem de cada um e quem está online; clique abre o perfil da pessoa (o colega vê só o personagem e
     as copys aprovadas; o ADMIN vê tudo: quem decide é o servidor, lib/perfil.js)
   - a cabeça do personagem vira a bolinha de quem está online (aqui e no documento da copy)
   Os números vêm do GET /api/perfil, contados na hora e só quando a aba abre (nada novo no /api/state).
   Sem nível por enquanto (fica pra quando o Zion escolher a regra).
   ===================================================================== */
'use strict';
const PP = { aberto: false, alvo: null, dados: null, firma: '', pede: 0, timer: null, escolhido: null, donos: {}, meu: '', salvando: false, ofereceu: false, sugestao: false };

function ppChave(t) { return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim(); }
/** Sem login (PC local) o perfil é pelo nome deste navegador. */
function ppNomeLocal() { const p = typeof PERFIL !== 'undefined' ? PERFIL.get() : null; return p ? p.nome : ''; }
function ppMeuId() { return S.eu ? S.eu.id : 'local:' + ppChave(ppNomeLocal()); }
function ppQ(path) { return S.eu ? path : path + (path.includes('?') ? '&' : '?') + 'nome=' + encodeURIComponent(ppNomeLocal()); }
/** "hoje às 14:20", "ontem", "há 3 dias". */
function ppHa(iso) {
  const t = Date.parse(iso || ''); if (isNaN(t)) return '';
  const d = new Date(t), dia = tfIso(d), hoje = hojeStr();
  if (dia === hoje) return 'hoje às ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  const n = Math.round((Date.parse(hoje + 'T12:00:00') - Date.parse(dia + 'T12:00:00')) / 864e5);
  return n === 1 ? 'ontem' : 'há ' + n + ' dias';
}
const ppPl = (n, um, varios) => n + ' ' + (n === 1 ? um : varios);

// ---------------------------------------------------------------- bolinha de quem está online
/**
 * A bolinha com a cabeça do personagem (true se pintou; sem personagem fica o ícone ou as iniciais de antes). A sua
 * bolinha sem personagem pulsa algumas vezes ao abrir o painel: é o convite pra escolher (sem abrir nada por cima).
 */
function ppPintaBolinha(d, p, eu) {
  const x = p && p.personagem && window.PG ? PG.dados(p.personagem) : null;
  if (!x) { if (eu) d.classList.add('sempg'); return false; }
  d.classList.add('pg'); d.style.background = x.fundo; d.style.setProperty('--pc', x.fundo);
  d.innerHTML = '<span class="pd-cab" aria-hidden="true">' + PG.cabeca(p.personagem) + '</span>';
  return true;
}

// ---------------------------------------------------------------- a página
function ppMonta() {
  if (document.getElementById('pp')) return;
  const el = document.createElement('section');
  el.className = 'pp'; el.id = 'pp'; el.hidden = true; el.setAttribute('aria-labelledby', 'ppTit');
  el.innerHTML = '<div class="pp-top"><button type="button" class="pp-volta" id="ppVolta" title="Voltar pro calendário (Esc)">' + icon('chevL') + '<span>Calendário</span></button>' +
    '<h1 class="pp-tit" id="ppTit" tabindex="-1">Meu perfil</h1><div class="pp-topdir" id="ppTopDir"></div></div><div class="pp-corpo" id="ppCorpo"></div>';
  document.body.appendChild(el);
  $('#ppVolta').onclick = fecharPerfil;
}
/** Abre o perfil (o seu, ou o de alguém do time pelo id). Sem login e sem nome: primeiro pede o nome (folha antiga). */
function abrirPerfil(alvo) {
  if (!S.eu && !ppNomeLocal()) { openPerfil(); return; }
  ppMonta();
  const outro = !!alvo && alvo !== ppMeuId();
  if (PP.alvo !== (outro ? alvo : null)) PP.dados = null;
  PP.alvo = outro ? alvo : null;
  if (!PP.aberto) {
    PP.aberto = true;
    $('#pp').hidden = false; document.body.classList.add('pp-on');
    clearInterval(PP.timer);
    PP.timer = setInterval(() => { if (PP.aberto && !document.hidden && !document.querySelector('.ov.open')) ppCarrega(); }, 30000);
  }
  $('#pp').scrollTop = 0;
  ppCarrega();
  // o foco vai pro título (leitor de tela anuncia a página; Tab segue pros botões), sem anel de foco no clique
  setTimeout(() => { const t = $('#ppTit'); if (t && PP.aberto && !document.querySelector('.ov.open')) t.focus({ preventScroll: true }); }, 30);
}
function fecharPerfil() {
  if (!PP.aberto) return;
  PP.aberto = false; clearInterval(PP.timer);
  $('#pp').hidden = true; document.body.classList.remove('pp-on');
}
async function ppCarrega() {
  const n = ++PP.pede;
  if (!PP.dados) { $('#ppCorpo').innerHTML = '<div class="pp-carrega" role="status">carregando o perfil…</div>'; $('#ppTopDir').innerHTML = ''; }
  try {
    const r = await api(ppQ(PP.alvo ? '/api/perfil/pessoa/' + encodeURIComponent(PP.alvo) : '/api/perfil'));
    if (n !== PP.pede) return;
    // a cada 30 s pergunta de novo: só redesenha se mudou algo (não perde o foco, a dica nem a rolagem à toa)
    const firma = JSON.stringify(r);
    if (PP.dados && firma === PP.firma) return;
    PP.dados = r; PP.firma = firma; PP.donos = r.donos || {};
    if (r.eu) PP.meu = r.eu.personagem || '';
    ppDesenha();
    // abriu o próprio perfil sem personagem (com login): a escolha já abre por cima, uma vez por sessão ("Depois" fecha)
    if (r.eu && !PP.meu && S.eu && !PP.ofereceu && !document.querySelector('.ov.open')) { PP.ofereceu = true; abrirEscolha(true); }
  } catch (e) {
    if (n !== PP.pede) return;
    if (e.status === 400 && /sem nome/.test(e.message)) { fecharPerfil(); openPerfil(); return; }
    if (PP.dados) return;                       // falhou só a atualização: fica o que já está na tela
    $('#ppCorpo').innerHTML = '<div class="pp-erro" role="alert">Não consegui carregar o perfil: ' + esc(e.message) + ' <button class="mbtn" data-pp="recarrega">Tentar de novo</button></div>';
    ppLiga($('#ppCorpo'));
  }
}
function ppDesenha() {
  const r = PP.dados; if (!r || !PP.aberto) return;
  const p = r.eu || r.pessoa, souEu = !!r.eu || p.id === ppMeuId();
  $('#ppTit').textContent = souEu ? 'Meu perfil' : 'Perfil de ' + p.nome;
  let topo = '';
  if (souEu) {
    topo += '<button type="button" class="mbtn" data-pp="tempo">' + icon('clock') + 'Meu tempo</button>';
    topo += S.eu ? '<button type="button" class="mbtn" data-pp="sair">Sair</button>' : '<button type="button" class="mbtn" data-pp="nome">' + icon('pencil') + 'Trocar nome</button>';
  } else topo += '<button type="button" class="mbtn" data-pp="meu">' + icon('users') + 'Meu perfil</button>';
  $('#ppTopDir').innerHTML = topo;
  let h = '<aside class="pp-esq">' + ppCard(p, souEu) + '</aside><div class="pp-dir">';
  if (!p.limitado) h += ppAgora(p, souEu);
  h += ppSemana(p, souEu) + ppTime(r, p) + '</div>';
  const corpo = $('#ppCorpo');
  corpo.innerHTML = h;
  ppLiga(corpo); ppLiga($('#ppTopDir'));
  ppLigaGrafico();
}
function ppCard(p, souEu) {
  const d = p.personagem && window.PG ? PG.dados(p.personagem) : null;
  const chips = '<div class="pp-ctopo">' + (S.eu && p.papel === 'admin' ? '<span class="pp-chip">ADMIN</span>' : '<span></span>') +
    (p.online ? '<span class="pp-chip on"><i></i>online</span>' : '') + '</div>';
  if (!d) {
    return '<div class="pp-card vazio">' + chips + '<div class="pp-arte vazia"><i></i><span aria-hidden="true">?</span></div>' +
      '<div class="pp-nome">' + esc(p.nome) + '</div><div class="pp-classe">' + (souEu ? 'você ainda não tem personagem' : 'ainda sem personagem') + '</div>' +
      (souEu ? '<button type="button" class="pp-trocar primeira" data-pp="escolher">' + icon('sparkle') + 'Escolher meu personagem</button>' : '') + '</div>';
  }
  return '<div class="pp-card" style="--bg:' + d.fundo + ';--ci:' + d.circulo + ';--tx:' + (d.texto || '#111') + '">' + chips +
    '<div class="pp-arte"><i></i>' + PG.svg(p.personagem) + '</div>' +
    '<div class="pp-nome">' + esc(p.nome) + '</div><div class="pp-classe">' + esc(d.nome) + ' · ' + esc(d.classe) + '</div>' +
    (souEu ? '<button type="button" class="pp-trocar" data-pp="escolher">' + icon('refresh') + 'Trocar personagem</button>' : '') + '</div>';
}
/** Comigo agora: só o que depende da pessoa, cada quadro abre o lugar de resolver. */
function ppAgora(p, souEu) {
  const a = p.agora, t = [];
  const contas = l => [...new Set(l.map(x => contaCurta(x.conta)))].slice(0, 3).join(', ');
  if (a.alterar.n) {
    const x = a.alterar.itens[0];
    t.push({ cor: 'var(--red)', rot: 'Pra alterar', n: a.alterar.n, sub: (a.alterar.n > 1 ? 'copys' : 'copy') + ' · ' + contas(a.alterar.itens) + (x.quem ? ' · pedido de ' + x.quem : ''), acao: 'alterar' });
  }
  if (a.esperando.n) t.push({ cor: 'var(--orange)', rot: 'Esperando aprovação', n: a.esperando.n,
    sub: (a.esperando.n > 1 ? 'copys prontas' : 'copy pronta') + ' · ' + (a.esperando.n > 1 ? 'a mais antiga mandada ' : 'mandada ') + ppHa(a.esperando.itens[0].em), acao: 'esperando' });
  if (a.praAprovar && a.praAprovar.n) t.push({ cor: 'var(--orange)', rot: 'Pra aprovar', n: a.praAprovar.n,
    sub: (a.praAprovar.n > 1 ? 'copys esperando · a mais antiga mandada ' : 'copy esperando · mandada ') + ppHa(a.praAprovar.itens[0].em), acao: 'praAprovar' });
  for (const f of a.fazer) t.push({ cor: 'var(--blue)', rot: 'Copy pra fazer', n: f.falta, sub: nomeAba(f.aba) + ' · ' + brData(f.de) + ' a ' + brData(f.ate) + ' · ' + f.falta + ' de ' + f.total + ' posts', acao: 'tarefa:' + f.tarefa });
  for (const m of a.matriz) t.push({ cor: 'var(--sb)', rot: 'Matriz', n: m.feitos + '/' + m.total, sub: nomeAba(m.aba) + ' · ' + brData(m.de) + ' a ' + brData(m.ate) + ' · ' + ppPl(m.total - m.feitos, 'card falta', 'cards faltam'), acao: 'tarefa:' + m.tarefa });
  if (a.atrasadas.n || a.risco.n) {
    const x = a.atrasadas.itens[0] || a.risco.itens[0];
    const partes = [a.atrasadas.n ? ppPl(a.atrasadas.n, 'atrasada', 'atrasadas') : '', a.risco.n ? a.risco.n + ' em risco' : ''].filter(Boolean).join(' · ');
    t.push({ cor: a.atrasadas.n ? 'var(--red)' : 'var(--orange)', rot: 'Entrega no MKT Hub', n: a.atrasadas.n + a.risco.n,
      sub: partes + ' · ' + (x.codigo ? x.codigo + ' ' : '') + x.titulo + (a.atrasadas.itens[0] ? ' (era pra ' + brData(x.prazo) + ')' : x.motivo ? ' (' + x.motivo + ')' : ''), acao: 'post:' + x.sid });
  }
  let h = '<section class="pp-sec" aria-labelledby="ppAgoraT"><h2 id="ppAgoraT">Comigo agora <small>' + (souEu ? 'o que depende de você' : 'o que depende de ' + esc(p.nome)) + '</small></h2>';
  if (!t.length) return h + '<div class="pp-vazio">' + icon('check') + (souEu ? 'Nada pendente com você agora.' : 'Nada pendente com ' + esc(p.nome) + ' agora.') + '</div></section>';
  h += '<div class="pp-tiles agora">' + t.map(x => '<button type="button" class="pp-tile" style="--c:' + x.cor + '" data-pp="' + esc(x.acao) + '">' +
    '<span class="pp-tl"><i class="pp-dot"></i>' + esc(x.rot) + '</span><span class="pp-big">' + esc(String(x.n)) + '</span><span class="pp-ts">' + esc(x.sub) + '</span>' +
    '<span class="pp-ir" aria-hidden="true">' + icon('chevR') + '</span></button>').join('') + '</div></section>';
  return h;
}
/** Esta semana: só os números que a pessoa tem (quem não escreve copy não vê quadro de copy zerado). */
function ppSemana(p, souEu) {
  const s = p.semana, n = p.nums, t = [];
  const de = n.aprovadas - n.dePrimeira;
  // quem não escreveu copy na semana (só aprova, só edita, só tem relógio) não vê o quadro de copy zerado
  if (p.limitado || n.aprovadas || n.mandadas) t.push({ rot: 'Copys aprovadas', big: String(n.aprovadas), sub: n.aprovadas ? n.dePrimeira + ' de primeira' + (de ? ' · ' + de + ' depois de ajuste' : '') : 'nenhuma ainda nesta semana' });
  if (!p.limitado) {
    if (n.mandadas) t.push({ rot: 'Copys mandadas', big: String(n.mandadas), sub: 'pra aprovação nesta semana' });
    const tot = n.matrizSeg + n.copySeg;
    if (tot) t.push({ rot: 'Tempo no relógio', big: CRON.fmtLongo(tot), sub: 'matriz ' + CRON.fmtLongo(n.matrizSeg) + ' · copy ' + CRON.fmtLongo(n.copySeg) });
    if (n.copySeg && n.mandadas) t.push({ rot: 'Tempo por copy', big: CRON.fmtLongo(Math.round(n.copySeg / n.mandadas)), sub: 'tempo de copy ÷ copys mandadas' });
    if (n.aprovou) t.push({ rot: souEu ? 'Copys que você aprovou' : 'Copys que aprovou', big: String(n.aprovou), sub: 'esperaram em média ' + CRON.fmtLongo(Math.round(n.esperaMs / n.aprovou / 1000)) });
  }
  let h = '<section class="pp-sec" aria-labelledby="ppSemT"><h2 id="ppSemT">Esta semana <small>' + brData(s.de) + ' a ' + brData(s.ate) + '</small></h2>';
  if (!t.length) return h + '<div class="pp-vazio cinza">' + icon('calendar') + 'Nada registrado nesta semana ainda: copy mandada, aprovada e o tempo no relógio aparecem aqui.</div></section>';
  h += '<div class="pp-tiles">' + t.map(x => '<div class="pp-tile num"><span class="pp-tl">' + esc(x.rot) + '</span><span class="pp-big">' + esc(x.big) + '</span><span class="pp-ts">' + esc(x.sub) + '</span></div>').join('') + '</div>';
  if (p.limitado) return h + '<p class="pp-nota">O tempo no relógio e o que está pendente ficam só pra própria pessoa e pro ADMIN.</p></section>';
  // o gráfico só aparece pra quem usou o relógio na semana (pra quem não usa, seria um quadro vazio)
  const tot = n.matrizSeg + n.copySeg;
  if (tot) h += '<div class="pp-box"><div class="pp-boxh"><b>Tempo no relógio por dia</b><span class="tp-leg"><span><i class="tp-sw m"></i>Matriz ' + CRON.fmtLongo(n.matrizSeg) + '</span><span><i class="tp-sw c"></i>Copy ' + CRON.fmtLongo(n.copySeg) + '</span></span>' +
    '<button type="button" class="mbtn pp-rel" data-pp="relatorio">Relatório completo' + icon('chevR') + '</button></div>' + ppGrafico(p.dias, s.hoje) + '</div>';
  return h + '</section>';
}
/** Barras empilhadas por dia (matriz embaixo, copy em cima), no mesmo desenho do relatório de tempo (tempo.js). */
function ppGrafico(dias, hoje) {
  const max = Math.max(0, ...dias.map(d => d.m + d.c));
  const { passo, topo } = tpEscala(max);
  let linhas = '';
  for (let v = passo; v <= topo; v += passo) linhas += '<div class="tp-linha" style="bottom:' + (v / topo * 100) + '%"><span>' + tpRotEixo(v) + '</span></div>';
  return '<div class="tp-graf pp-graf" id="ppGraf"><div class="tp-grade">' + linhas + '<div class="tp-linha zero" style="bottom:0"><span>0</span></div></div>' +
    '<div class="tp-barras" style="--n:' + dias.length + '">' + dias.map((d, i) => {
      const alt = (d.m + d.c) / topo * 100, futuro = d.dia > hoje;
      return '<div class="tp-col' + (d.dia === hoje ? ' hoje' : '') + (futuro ? ' futuro' : '') + '" data-i="' + i + '" tabindex="' + (d.m + d.c ? 0 : -1) + '" aria-label="' + esc(tfDia(d.dia)) + ': matriz ' + CRON.fmtLongo(d.m) + ', copy ' + CRON.fmtLongo(d.c) + '">' +
        '<div class="tp-pilha" style="height:' + alt.toFixed(2) + '%">' + (d.c ? '<i class="c" style="flex:' + d.c + '"></i>' : '') + (d.m ? '<i class="m" style="flex:' + d.m + '"></i>' : '') + '</div>' +
        '<span class="tp-rot">' + tfDia(d.dia).slice(0, 3) + (d.dia === hoje ? '<span class="pp-hoje"> · hoje</span>' : '') + '</span></div>';
    }).join('') + '</div><div class="tp-dica" id="ppDica" hidden></div></div>';
}
function ppLigaGrafico() {
  const g = $('#ppGraf'); if (!g || !PP.dados) return;
  const p = PP.dados.eu || PP.dados.pessoa, dica = $('#ppDica');
  const mostra = col => {
    const d = p.dias[+col.dataset.i]; if (!d || !(d.m + d.c)) { dica.hidden = true; return; }
    dica.innerHTML = '<b>' + esc(tfDia(d.dia)) + '</b><span><i class="tp-sw m"></i>Matriz ' + CRON.fmtLongo(d.m) + '</span><span><i class="tp-sw c"></i>Copy ' + CRON.fmtLongo(d.c) + '</span><span class="tot">Total ' + CRON.fmtLongo(d.m + d.c) + '</span>';
    dica.hidden = false;
    const r = col.getBoundingClientRect(), rg = g.getBoundingClientRect(), cx = r.left - rg.left + r.width / 2;
    let x = cx + 16;
    if (x + dica.offsetWidth > rg.width) x = cx - 16 - dica.offsetWidth;
    dica.style.left = Math.max(0, x) + 'px';
  };
  g.querySelectorAll('.tp-col').forEach(col => { col.onmouseenter = () => mostra(col); col.onfocus = () => mostra(col); });
  g.onmouseleave = () => { dica.hidden = true; };
  g.addEventListener('focusout', () => { dica.hidden = true; });
}
function ppTime(r, p) {
  const l = r.time || [];
  if (l.length < 2) return '';
  const h = l.map(x => {
    const d = x.personagem && window.PG ? PG.dados(x.personagem) : null;
    const vendo = x.id === p.id, clica = r.login || x.eu;
    const cab = d ? '<span class="pp-cab" style="background:' + d.fundo + '">' + PG.cabeca(x.personagem) + '</span>'
      : '<span class="pp-cab ini">' + esc(avIniciais(x.nome)) + '</span>';
    const sub = [d ? d.nome : 'sem personagem', x.online ? 'online' : ''].filter(Boolean).join(' · ');
    return '<' + (clica ? 'button type="button"' : 'div') + ' class="pp-pess' + (vendo ? ' vendo' : '') + '"' + (clica ? ' data-pp="pessoa:' + esc(x.eu ? '' : x.id) + '"' : '') + (vendo ? ' aria-current="true"' : '') + '>' +
      '<span class="pp-av' + (x.online ? ' on' : '') + '">' + cab + '</span><span class="pp-pt"><b>' + (x.eu ? 'Você' : esc(x.nome)) + '</b><small>' + esc(sub) + '</small></span></' + (clica ? 'button' : 'div') + '>';
  }).join('');
  return '<section class="pp-sec" aria-labelledby="ppTimeT"><h2 id="ppTimeT">Time <small>' + (r.login ? 'clique pra ver o perfil de alguém' : 'quem está online agora') + '</small></h2><div class="pp-time">' + h + '</div></section>';
}
/** Os botões da página (data-pp="acao"). */
function ppLiga(raiz) {
  if (!raiz) return;
  raiz.querySelectorAll('[data-pp]').forEach(b => b.onclick = () => ppAcao(b.dataset.pp));
}
function ppAcao(a) {
  const p = PP.dados ? (PP.dados.eu || PP.dados.pessoa) : null;
  if (a === 'recarrega') return ppCarrega();
  if (a === 'escolher') return abrirEscolha();
  if (a === 'tempo' || a === 'relatorio') { TP.per = 'semana'; TP.aba = ''; TP.por = p ? p.nome : null; return abrirTempo(); }
  if (a === 'sair') return sair();
  if (a === 'nome') return openPerfil();
  if (a === 'meu') return abrirPerfil();
  if (a === 'alterar') return abrirAprovar('alterar');
  if (a === 'esperando' || a === 'praAprovar') return abrirAprovar('esperando');
  if (a.startsWith('pessoa:')) return abrirPerfil(a.slice(7) || null);
  if (a.startsWith('tarefa:')) {
    const id = a.slice(7);
    if (!tfPorId(id)) { toast('Essa tarefa não está aberta no painel agora', true); return; }
    return abrirTarefa(id);
  }
  if (a.startsWith('post:')) {
    // o post pode ser de outra empresa: vai pra aba dela antes (o calendário só desenha a empresa aberta)
    const sid = a.slice(5), s = S.slots.find(x => x.id === sid), aba = s && S.contas[s.conta] ? S.contas[s.conta].aba : null;
    fecharPerfil();
    if (aba && aba !== S.aba) irParaAba(aba);
    return irParaPost(sid);
  }
}

// ---------------------------------------------------------------- escolher o personagem
function ppMontaEscolha() {
  if (document.getElementById('ovPg')) return;
  const ov = document.createElement('div');
  ov.className = 'ov'; ov.id = 'ovPg'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-labelledby', 'pgTit');
  ov.innerHTML = '<div class="modal pg-modal" style="position:relative"><button class="mclose" data-close="ovPg" aria-label="Fechar">✕</button>' +
    '<div class="mhead"><div class="mtit" id="pgTit">Escolha seu personagem</div><div class="pg-sub">Aparece no seu perfil, na bolinha de quem está online e no documento da copy. Dá pra trocar quando quiser.</div></div>' +
    '<div class="mbody"><div class="pg-grade" id="pgGrade" role="group" aria-label="Personagens"></div></div>' +
    '<div class="mfoot"><span class="pg-nota" id="pgNota">1 personagem por pessoa: o que já tem dono fica apagado, com o nome de quem escolheu.</span>' +
    '<button type="button" class="mbtn" id="pgCancela">Cancelar</button><button type="button" class="mbtn primary" id="pgUsar">Usar</button></div></div>';
  document.body.appendChild(ov);
  ov.querySelector('.mclose').onclick = () => closeOv('ovPg');
  ov.addEventListener('mousedown', ev => { if (ev.target === ov) closeOv('ovPg'); });
  $('#pgCancela').onclick = () => closeOv('ovPg');
  $('#pgUsar').onclick = ppSalvaPersonagem;
}
/** sugestao = aberta sozinha na primeira vez (o botão de fechar vira "Depois"). */
function abrirEscolha(sugestao) {
  ppMontaEscolha();
  PP.sugestao = !!sugestao;
  PP.escolhido = PP.meu || null;
  $('#pgCancela').textContent = sugestao ? 'Depois' : 'Cancelar';
  ppDesenhaEscolha();
  $('#ovPg').classList.add('open');
  setTimeout(() => { const b = document.querySelector('#pgGrade .pg-c.sel') || document.querySelector('#pgGrade .pg-c:not(.dono)'); if (b) b.focus({ preventScroll: true }); }, 40);
}
function ppDesenhaEscolha() {
  const donos = PP.donos || {}, meu = ppMeuId();
  $('#pgGrade').innerHTML = PG.ORDEM.map(id => {
    const d = PG.dados(id), dono = donos[id] && donos[id].id !== meu ? donos[id] : null, sel = PP.escolhido === id;
    return '<button type="button" class="pg-c' + (sel ? ' sel' : '') + (dono ? ' dono' : '') + '" data-pg="' + id + '" style="--bg:' + d.fundo + ';--ci:' + d.circulo + ';--tx:' + (d.texto || '#111') + '"' +
      ' aria-pressed="' + sel + '"' + (dono ? ' aria-disabled="true"' : '') + ' aria-label="' + esc(d.nome + ', ' + d.classe + (dono ? ', escolhido por ' + dono.nome : '') + (PP.meu === id ? ', o seu agora' : '')) + '">' +
      (dono ? '<span class="pg-tag">escolhido por ' + esc(dono.nome) + '</span>' : '') +
      (sel ? '<span class="pg-ok">' + icon('check') + '</span>' : '') +
      '<span class="pg-arte"><i></i>' + PG.svg(id) + '</span><b>' + esc(d.nome) + '</b><small>' + esc(d.classe) + '</small></button>';
  }).join('');
  $('#pgGrade').querySelectorAll('.pg-c').forEach(b => {
    b.onclick = () => {
      const id = b.dataset.pg, dono = (PP.donos || {})[id];
      if (b.classList.contains('dono')) { toast(PG.dados(id).nome + ' já foi escolhido por ' + (dono ? dono.nome : 'outra pessoa'), true); return; }
      PP.escolhido = id; ppDesenhaEscolha();
      const nb = document.querySelector('#pgGrade [data-pg="' + id + '"]'); if (nb) nb.focus({ preventScroll: true });
    };
    b.ondblclick = () => { if (!b.classList.contains('dono')) { PP.escolhido = b.dataset.pg; ppSalvaPersonagem(); } };
  });
  ppPintaUsar();
}
function ppPintaUsar() {
  const b = $('#pgUsar'); if (!b) return;
  const d = PP.escolhido ? PG.dados(PP.escolhido) : null;
  b.textContent = !d ? 'Escolha um' : PP.escolhido === PP.meu ? 'É o seu' : 'Usar ' + d.nome;
  b.disabled = !d || PP.escolhido === PP.meu || PP.salvando;
}
async function ppSalvaPersonagem() {
  const id = PP.escolhido;
  if (!id || PP.salvando || id === PP.meu) return;
  PP.salvando = true; ppPintaUsar();
  try {
    const r = await api('/api/perfil/personagem', { method: 'POST', body: JSON.stringify(S.eu ? { personagem: id } : { personagem: id, nome: ppNomeLocal() }) });
    PP.meu = r.personagem; AV.personagem = r.personagem; renderPresenca();
    closeOv('ovPg');
    toast('Personagem salvo: ' + r.nome);
    if (PP.aberto) ppCarrega();
  } catch (e) {
    toast(e.message, true);
    if (e.status === 409) { try { const d = await api(ppQ('/api/perfil')); PP.donos = d.donos || {}; PP.meu = d.eu.personagem || ''; } catch (_) { } PP.escolhido = PP.meu || null; ppDesenhaEscolha(); }
  } finally { PP.salvando = false; ppPintaUsar(); }
}
// Esc volta pro calendário (se não tem folha aberta por cima); com o perfil aberto, 1 a 9, [ e ] não trocam a empresa
// por trás. Registrado antes do script do painel, então roda primeiro.
document.addEventListener('keydown', ev => {
  if (!PP.aberto || document.querySelector('.ov.open') || document.body.classList.contains('comdoc') || document.getElementById('lb')?.classList.contains('open')) return;
  const t = ev.target;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
  if (ev.key === 'Escape') { ev.preventDefault(); ev.stopImmediatePropagation(); fecharPerfil(); return; }
  if (!ev.ctrlKey && !ev.metaKey && !ev.altKey && /^[1-9\[\]]$/.test(ev.key)) ev.stopImmediatePropagation();
});
