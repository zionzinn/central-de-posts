/* =====================================================================
   B.O.N.E · relatório de tempo (v3.80): quanto foi em matriz e em copy, por dia, pessoa e empresa.
   Abre pelo perfil (Meu tempo) e pela folha da tarefa (Ver o tempo). Os números vêm de GET /api/tempo,
   que lê só as somas guardadas (lib/tempo.js). Exporta CSV no formato das horas do MKT Hub
   (data, pessoa, empresa, horas), pra o Zion lançar lá à mão enquanto o Hub não recebe direto.
   Gráfico: barras empilhadas (matriz embaixo, copy em cima), cores validadas pro claro e pro escuro
   (dataviz: amarelo #B38200 / #BF8A00 e azul #0088FF / #0091FF passam em contraste e daltonismo).
   ===================================================================== */
'use strict';
const TP = { per: 'semana', por: null, aba: '', dados: null, tabela: false, lancar: false, editando: null, pede: 0 };
const TP_PERIODOS = [['hoje', 'Hoje'], ['semana', 'Esta semana'], ['mes', 'Este mês'], ['mespassado', 'Mês passado'], ['90', '90 dias']];
const TP_EMPRESA_HUB = { 'SEUBONÉ': 'SeuBoné', 'CARBONE': 'Carbone Educação', 'ONEVO': 'Onevo', 'WEEVO': 'Weevo' };
const TP_ATIVIDADE = { m: 'Criação da matriz', c: 'Criação dos posts' };

function tpPeriodo(per) {
  const hoje = hojeStr(), d = new Date(hoje + 'T12:00:00');
  if (per === 'hoje') return [hoje, hoje];
  if (per === 'semana') { const s = tfSegunda(hoje); return [s, tfSoma(s, 6)]; }
  if (per === 'mes') { const ini = hoje.slice(0, 8) + '01'; return [ini, tfIso(new Date(d.getFullYear(), d.getMonth() + 1, 0, 12))]; }
  if (per === 'mespassado') { const a = new Date(d.getFullYear(), d.getMonth() - 1, 1, 12), b = new Date(d.getFullYear(), d.getMonth(), 0, 12); return [tfIso(a), tfIso(b)]; }
  return [tfSoma(hoje, -89), hoje];
}
/** opts.tarefa: abre já filtrado na empresa e na pessoa da tarefa. */
/** v3.82: com login, o Usuário vê só o próprio tempo (o servidor já manda só o dele); ADMIN vê todo mundo e exporta. */
function tpSoEu() { return !!S.eu && S.eu.papel !== 'admin'; }
function abrirTempo(opts) {
  opts = opts || {};
  if (opts.tarefa) { TP.aba = opts.tarefa.aba; TP.por = opts.tarefa.por; TP.per = opts.tarefa.de <= hojeStr() && hojeStr() <= opts.tarefa.ate ? 'semana' : 'mes'; }
  else if (TP.por === null) TP.por = tfEu() || '';
  if (tpSoEu()) TP.por = S.eu.nome;
  TP.lancar = false; TP.editando = null;
  $('#ovTempo').classList.add('open');
  tpCarrega();
}
async function tpCarrega() {
  const [de, ate] = tpPeriodo(TP.per), n = ++TP.pede;
  $('#tpBody').classList.add('carregando');
  try {
    const q = 'de=' + de + '&ate=' + ate + (TP.por ? '&por=' + encodeURIComponent(TP.por) : '') + (TP.aba ? '&aba=' + encodeURIComponent(TP.aba) : '');
    const d = await api('/api/tempo?' + q);
    if (n !== TP.pede) return;
    TP.dados = d;
    // a pessoa escolhida não tem nada registrado ainda: mostra todo mundo em vez de uma tela vazia
    if (!tpSoEu() && TP.por && !d.pessoas.some(p => tfChave(p) === tfChave(TP.por)) && d.pessoas.length) { TP.por = ''; return tpCarrega(); }
    tpDesenha();
  } catch (e) { $('#tpBody').innerHTML = '<p class="note">Não consegui carregar: ' + esc(e.message) + '</p>'; }
  finally { if (n === TP.pede) $('#tpBody').classList.remove('carregando'); }
}
function tpSoma(par) { return (par[0] || 0) + (par[1] || 0); }
/** Barras do gráfico: um dia por barra até 31 dias; acima disso, uma semana por barra. */
function tpBarras(d) {
  const out = [];
  const dias = Math.round((Date.parse(d.ate) - Date.parse(d.de)) / 864e5) + 1;
  if (dias <= 31) {
    for (let x = d.de; x <= d.ate; x = tfSoma(x, 1)) { const p = d.dias[x] || [0, 0]; out.push({ rot: x.slice(8), dica: tfDia(x), m: p[0], c: p[1], hoje: x === d.hoje }); }
  } else {
    for (let s = tfSegunda(d.de); s <= d.ate; s = tfSoma(s, 7)) {
      let m = 0, c = 0;
      for (let i = 0; i < 7; i++) { const p = d.dias[tfSoma(s, i)]; if (p) { m += p[0]; c += p[1]; } }
      out.push({ rot: brData(s < d.de ? d.de : s), dica: 'semana de ' + brData(s) + ' a ' + brData(tfSoma(s, 6)), m, c, hoje: s <= d.hoje && d.hoje <= tfSoma(s, 6) });
    }
    for (const [mes, p] of Object.entries(d.meses || {})) out.unshift({ rot: mes.slice(5) + '/' + mes.slice(2, 4), dica: 'mês ' + mes.slice(5) + '/' + mes.slice(0, 4), m: p[0], c: p[1] });
  }
  return out;
}
/** Escala do eixo: passo "redondo" (15 min, 30 min, 1 h...) pra ter de 2 a 4 linhas. */
function tpEscala(max) {
  const passos = [300, 900, 1800, 3600, 7200, 10800, 14400, 21600, 28800, 43200];
  let passo = passos.find(p => max / p <= 4) || 86400;
  const topo = Math.max(passo, Math.ceil(max / passo) * passo);
  return { passo, topo };
}
function tpRotEixo(s) { return s % 3600 ? (s / 60) + ' min' : (s / 3600) + ' h'; }
function tpDesenha() {
  const d = TP.dados; if (!d) return;
  const [m, c] = d.total, tot = m + c;
  const comPosts = d.tarefas.filter(t => t.posts > 0);
  const segPosts = comPosts.reduce((a, t) => a + t.seg, 0), nPosts = comPosts.reduce((a, t) => a + t.posts, 0);
  const media = nPosts ? Math.round(segPosts / nPosts) : 0;
  $('#tpSub').textContent = brData(d.de) + (d.de !== d.ate ? ' a ' + brData(d.ate) : '') + (TP.por ? ' · ' + TP.por : ' · todo mundo') + (TP.aba ? ' · ' + nomeAba(TP.aba) : '');
  const chip = (on, attr, rot) => '<button class="echip' + (on ? ' on' : '') + '" ' + attr + '>' + rot + '</button>';
  let h = '<div class="tp-filtros">' +
    '<div class="echips">' + TP_PERIODOS.map(([k, r]) => chip(TP.per === k, 'data-per="' + k + '"', r)).join('') + '</div>' +
    (tpSoEu() ? '' : '<div class="echips">' + chip(!TP.por, 'data-por=""', 'Todo mundo') + d.pessoas.map(p => chip(tfChave(TP.por) === tfChave(p), 'data-por="' + esc(p) + '"', esc(p))).join('') + '</div>') +
    '<div class="echips">' + chip(!TP.aba, 'data-aba=""', 'Todas as empresas') + S.abas.map(a => chip(TP.aba === a, 'data-aba="' + esc(a) + '"', esc(nomeAba(a)))).join('') + '</div>' +
  '</div>';
  // números de destaque
  h += '<div class="tp-tiles">' +
    '<div class="tp-tile"><span>Total</span><b data-conta="' + tot + '">' + CRON.fmtLongo(tot) + '</b></div>' +
    '<div class="tp-tile"><span><i class="tp-sw m"></i>Matriz</span><b data-conta="' + m + '">' + CRON.fmtLongo(m) + '</b></div>' +
    '<div class="tp-tile"><span><i class="tp-sw c"></i>Copy</span><b data-conta="' + c + '">' + CRON.fmtLongo(c) + '</b></div>' +
    '<div class="tp-tile"><span>Média por post</span><b' + (media ? ' data-conta="' + media + '"' : '') + '>' + (media ? CRON.fmtLongo(media) : '–') + '</b><small>' + (nPosts ? nPosts + ' posts nas tarefas' : 'sem post com tempo') + '</small></div>' +
  '</div>';
  // gráfico (ou tabela)
  const barras = tpBarras(d), max = Math.max(0, ...barras.map(b => b.m + b.c));
  h += '<div class="tp-ghead"><b>Por ' + (barras.length && Math.round((Date.parse(d.ate) - Date.parse(d.de)) / 864e5) + 1 > 31 ? 'semana' : 'dia') + '</b>' +
    '<span class="tp-leg"><span><i class="tp-sw m"></i>Matriz</span><span><i class="tp-sw c"></i>Copy</span></span>' +
    '<button class="mbtn tp-vista" id="tpVista">' + icon(TP.tabela ? 'calendar' : 'list') + (TP.tabela ? 'Ver o gráfico' : 'Ver em tabela') + '</button></div>';
  if (!tot) h += '<div class="tp-vazio">Nenhum tempo registrado nesse período' + (TP.por ? ' pra ' + esc(TP.por) : '') + '. O relógio fica na faixa de tarefas, no topo de cada empresa.</div>';
  else if (TP.tabela) {
    h += '<div class="tp-tabw"><table class="tp-tab"><thead><tr><th>' + (barras.length && barras[0].dica.startsWith('semana') ? 'Semana' : 'Dia') + '</th><th>Matriz</th><th>Copy</th><th>Total</th></tr></thead><tbody>' +
      barras.filter(b => b.m + b.c).map(b => '<tr><td>' + esc(b.dica) + '</td><td>' + (b.m ? CRON.fmtLongo(b.m) : '–') + '</td><td>' + (b.c ? CRON.fmtLongo(b.c) : '–') + '</td><td><b>' + CRON.fmtLongo(b.m + b.c) + '</b></td></tr>').join('') +
      '</tbody></table></div>';
  } else {
    const { passo, topo } = tpEscala(max);
    let linhas = '';
    for (let v = passo; v <= topo; v += passo) linhas += '<div class="tp-linha" style="bottom:' + (v / topo * 100) + '%"><span>' + tpRotEixo(v) + '</span></div>';
    h += '<div class="tp-graf" id="tpGraf"><div class="tp-grade">' + linhas + '<div class="tp-linha zero" style="bottom:0"><span>0</span></div></div>' +
      '<div class="tp-barras" style="--n:' + barras.length + '">' + barras.map((b, i) => {
        const alt = (b.m + b.c) / topo * 100;
        return '<div class="tp-col' + (b.hoje ? ' hoje' : '') + '" data-i="' + i + '" tabindex="' + (b.m + b.c ? 0 : -1) + '" aria-label="' + esc(b.dica) + ': matriz ' + CRON.fmtLongo(b.m) + ', copy ' + CRON.fmtLongo(b.c) + '">' +
          '<div class="tp-pilha" style="height:' + alt.toFixed(2) + '%">' + (b.c ? '<i class="c" style="flex:' + b.c + '"></i>' : '') + (b.m ? '<i class="m" style="flex:' + b.m + '"></i>' : '') + '</div>' +
          '<span class="tp-rot">' + esc(b.rot) + '</span></div>';
      }).join('') + '</div><div class="tp-dica" id="tpDica" hidden></div></div>';
  }
  // tarefas do período
  if (d.tarefas.length) {
    h += '<div class="tp-sec"><b>Tarefas</b></div><div class="tp-tabw"><table class="tp-tab tp-tarefas"><thead><tr><th>Tarefa</th><th>Posts de</th><th>Quem</th><th>Tempo</th><th>Posts com tempo</th><th>Média por post</th></tr></thead><tbody>' +
      d.tarefas.map(t => '<tr' + (tfPorId(t.id) ? ' data-tarefa="' + t.id + '" class="link"' : '') + '><td><i class="tp-sw ' + (t.tipo === 'matriz' ? 'm' : 'c') + '"></i>' + TF_TIPOS[t.tipo].nome + ' · ' + esc(nomeAba(t.aba)) + (t.arquivada ? ' <span class="tp-arq">concluída</span>' : '') + '</td>' +
        '<td>' + brData(t.de) + ' a ' + brData(t.ate) + '</td><td>' + esc(t.por) + '</td><td><b>' + (t.seg ? CRON.fmtLongo(t.seg) : '–') + '</b></td><td>' + (t.posts || '–') + '</td><td>' + (t.posts && t.seg ? CRON.fmtLongo(Math.round(t.seg / t.posts)) : '–') + '</td></tr>').join('') +
      '</tbody></table></div>';
  }
  // sessões (as dos últimos 14 dias dá pra corrigir)
  h += '<div class="tp-sec"><b>Sessões do relógio</b><span class="note">dá pra corrigir as dos últimos ' + d.janela.sessoes + ' dias</span>' +
    '<button class="mbtn" id="tpLancarBt">' + icon('plus') + 'Lançar tempo à mão</button></div>';
  if (TP.lancar) h += tpFormLancar();
  if (d.sessoes.length) {
    h += '<div class="tp-sessoes">' + d.sessoes.map(x => {
      const tf = x.tarefaId ? (tfPorId(x.tarefaId) || d.tarefas.find(t => t.id === x.tarefaId)) : null;
      const quando = new Date(x.ini * 1000);
      const ed = TP.editando === x.id;
      return '<div class="tp-ses" data-id="' + x.id + '">' +
        '<span class="tp-sq">' + tfDia(x.dia) + ' <small>' + String(quando.getHours()).padStart(2, '0') + ':' + String(quando.getMinutes()).padStart(2, '0') + '</small></span>' +
        '<span class="tp-satv"><i class="tp-sw ' + x.atv + '"></i>' + (x.atv === 'm' ? 'Matriz' : 'Copy') + ' · ' + esc(nomeAba(x.aba)) + '</span>' +
        '<span class="tp-sque">' + esc(x.por) + (x.manual ? ' <span class="tp-man">à mão</span>' : '') + '</span>' +
        '<span class="tp-sposts">' + (Object.keys(x.posts).length ? Object.keys(x.posts).length + ' post' + (Object.keys(x.posts).length > 1 ? 's' : '') : (tf ? 'sem post aberto' : '')) + '</span>' +
        (ed ? '<span class="tp-sed"><input type="number" id="tpEdMin" min="1" max="480" value="' + Math.max(1, Math.round(x.seg / 60)) + '"> min <button class="mbtn primary" data-salva="' + x.id + '">Salvar</button><button class="mbtn" data-cancela="1">Cancelar</button></span>'
          : '<button class="tp-sdur" data-edita="' + x.id + '" title="Corrigir o tempo">' + CRON.fmtLongo(x.seg) + icon('pencil') + '</button>') +
        '<button class="bin mini" data-apaga="' + x.id + '" aria-label="Apagar esta sessão" title="Apagar esta sessão">' + BIN_SVG + '</button>' +
      '</div>';
    }).join('') + '</div>';
  } else h += '<p class="note tp-nada">Nenhuma sessão nesse período.</p>';
  $('#tpBody').innerHTML = h;
  // rodapé: exportar pro Hub
  $('#tpFoot').innerHTML = tpSoEu() ? '<span class="note">O tempo de todo mundo e a exportação pro MKT Hub ficam com os ADMIN (Zion e Maria).</span>'
    : '<button class="mbtn primary" id="tpCsv"' + (d.linhas.length ? '' : ' disabled') + '>' + icon('share') + 'Exportar pro MKT Hub (CSV)</button>' +
    '<span class="note">uma linha por dia, pessoa, empresa e atividade, com as horas: é só lançar no Hub</span>';
  tpLiga();
  tpContaAnima();
}
function tpFormLancar() {
  const hoje = hojeStr(), eu = tfEu();
  const abas = S.abas;
  return '<div class="tp-lancar" id="tpLancar">' +
    '<div class="tp-lc"><span class="tf-lbl">Atividade</span><div class="echips"><button class="echip on" data-latv="m">Matriz</button><button class="echip" data-latv="c">Copy</button></div></div>' +
    '<div class="tp-lc"><span class="tf-lbl">Empresa</span><select id="tpLAba">' + abas.map(a => '<option value="' + esc(a) + '"' + (a === (TP.aba || S.aba) ? ' selected' : '') + '>' + esc(nomeAba(a)) + '</option>').join('') + '</select></div>' +
    '<div class="tp-lc"><span class="tf-lbl">Dia</span><input type="date" id="tpLDia" value="' + hoje + '" min="' + tfSoma(hoje, -13) + '" max="' + hoje + '"></div>' +
    '<div class="tp-lc"><span class="tf-lbl">Minutos</span><input type="number" id="tpLMin" min="1" max="480" placeholder="ex.: 45"></div>' +
    '<div class="tp-lc"><span class="tf-lbl">Tarefa</span><select id="tpLTarefa"></select></div>' +
    '<div class="tp-lc"><span class="tf-lbl">Quem</span><input id="tpLPor" maxlength="24" value="' + esc(eu) + '"' + (tpSoEu() ? ' readonly' : '') + (S.equipe && !tpSoEu() ? ' list="tfEquipe2"' : '') + '>' +
      (S.equipe && !tpSoEu() ? '<datalist id="tfEquipe2">' + S.equipe.map(n => '<option value="' + esc(n) + '">').join('') + '</datalist>' : '') + '</div>' +
    '<div class="tp-lcb"><button class="mbtn" id="tpLCancela">Cancelar</button><button class="mbtn primary" id="tpLSalva">Lançar</button></div>' +
  '</div>';
}
function tpLiga() {
  const b = $('#tpBody');
  b.querySelectorAll('[data-per]').forEach(x => x.onclick = () => { TP.per = x.dataset.per; tpCarrega(); });
  b.querySelectorAll('[data-por]').forEach(x => x.onclick = () => { TP.por = x.dataset.por; tpCarrega(); });
  b.querySelectorAll('[data-aba]').forEach(x => x.onclick = () => { TP.aba = x.dataset.aba; tpCarrega(); });
  const v = $('#tpVista'); if (v) v.onclick = () => { TP.tabela = !TP.tabela; tpDesenha(); };
  b.querySelectorAll('tr[data-tarefa]').forEach(r => r.onclick = () => { closeOv('ovTempo'); abrirTarefa(r.dataset.tarefa); });
  $('#tpLancarBt').onclick = () => { TP.lancar = !TP.lancar; tpDesenha(); if (TP.lancar) { const x = $('#tpLMin'); if (x) x.focus(); } };
  if (TP.lancar) tpLigaLancar();
  b.querySelectorAll('[data-edita]').forEach(x => x.onclick = () => { TP.editando = x.dataset.edita; tpDesenha(); const i = $('#tpEdMin'); if (i) { i.focus(); i.select(); } });
  b.querySelectorAll('[data-cancela]').forEach(x => x.onclick = () => { TP.editando = null; tpDesenha(); });
  b.querySelectorAll('[data-salva]').forEach(x => x.onclick = () => tpSalvaSessao(x.dataset.salva));
  const ed = $('#tpEdMin'); if (ed) ed.addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); tpSalvaSessao(TP.editando); } if (ev.key === 'Escape') { ev.stopPropagation(); TP.editando = null; tpDesenha(); } });
  b.querySelectorAll('[data-apaga]').forEach(x => x.onclick = () => tpApagaSessao(x.dataset.apaga));
  const csv = $('#tpCsv'); if (csv) csv.onclick = tpExportaCsv;
  // dica por barra (mouse e teclado)
  const g = $('#tpGraf');
  if (g) {
    const dica = $('#tpDica'), barras = tpBarras(TP.dados);
    const mostra = col => {
      const bb = barras[+col.dataset.i]; if (!bb || !(bb.m + bb.c)) { dica.hidden = true; return; }
      dica.innerHTML = '<b>' + esc(bb.dica) + '</b><span><i class="tp-sw m"></i>Matriz ' + CRON.fmtLongo(bb.m) + '</span><span><i class="tp-sw c"></i>Copy ' + CRON.fmtLongo(bb.c) + '</span><span class="tot">Total ' + CRON.fmtLongo(bb.m + bb.c) + '</span>';
      dica.hidden = false;
      // a dica fica dentro do gráfico, ao lado da barra (nunca por cima dela nem dos números de cima)
      const r = col.getBoundingClientRect(), rg = g.getBoundingClientRect(), cx = r.left - rg.left + r.width / 2;
      let x = cx + 16;
      if (x + dica.offsetWidth > rg.width) x = cx - 16 - dica.offsetWidth;
      dica.style.left = Math.max(0, x) + 'px';
    };
    g.querySelectorAll('.tp-col').forEach(col => { col.onmouseenter = () => mostra(col); col.onfocus = () => mostra(col); });
    g.onmouseleave = () => { dica.hidden = true; };
    g.addEventListener('focusout', () => { dica.hidden = true; });
  }
}
function tpLigaLancar() {
  let atv = 'm';
  const tarefas = () => {
    const aba = $('#tpLAba').value, tipo = atv === 'm' ? 'matriz' : 'copy';
    const l = (S.tarefas || []).filter(t => t.aba === aba && t.tipo === tipo);
    $('#tpLTarefa').innerHTML = '<option value="">sem tarefa</option>' + l.map(t => '<option value="' + t.id + '">' + brData(t.de) + ' a ' + brData(t.ate) + ' · ' + esc(t.por) + '</option>').join('');
    if (l.length === 1) $('#tpLTarefa').value = l[0].id;
  };
  document.querySelectorAll('[data-latv]').forEach(x => x.onclick = () => {
    atv = x.dataset.latv;
    document.querySelectorAll('[data-latv]').forEach(y => y.classList.toggle('on', y === x));
    if (atv === 'm') $('#tpLAba').value = 'SEUBONÉ';
    tarefas();
  });
  $('#tpLAba').onchange = () => { if (atv === 'm' && !TF_ABAS_MATRIZ.includes($('#tpLAba').value)) { toast('A matriz existe só na SeuBoné por enquanto', true); $('#tpLAba').value = 'SEUBONÉ'; } tarefas(); };
  if (!TF_ABAS_MATRIZ.includes($('#tpLAba').value)) $('#tpLAba').value = 'SEUBONÉ';
  tarefas();
  $('#tpLCancela').onclick = () => { TP.lancar = false; tpDesenha(); };
  $('#tpLSalva').onclick = async () => {
    const min = Math.round(+$('#tpLMin').value), dia = $('#tpLDia').value, por = $('#tpLPor').value.trim();
    if (!(min >= 1 && min <= 480)) { toast('Minutos de 1 a 480', true); $('#tpLMin').focus(); return; }
    if (!dia) { toast('Escolha o dia', true); return; }
    if (!por) { toast('Diga quem fez', true); return; }
    const reg = { id: 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7), ini: Math.floor(Date.parse(dia + 'T12:00:00-03:00') / 1000), seg: min * 60, atv, aba: $('#tpLAba').value, tarefaId: $('#tpLTarefa').value, por, manual: 1 };
    try { await api('/api/tempo/sessao', { method: 'POST', body: JSON.stringify(reg) }); TP.lancar = false; toast(min + ' min lançados'); tpCarrega(); loadState(false, true); }
    catch (e) { toast(e.message, true); }
  };
}
async function tpSalvaSessao(id) {
  const min = Math.round(+($('#tpEdMin') || {}).value);
  if (!(min >= 1 && min <= 480)) { toast('Minutos de 1 a 480', true); return; }
  try { await api('/api/tempo/sessao/' + id, { method: 'PATCH', body: JSON.stringify({ seg: min * 60 }) }); TP.editando = null; toast('Tempo corrigido'); tpCarrega(); loadState(false, true); }
  catch (e) { toast(e.message, true); }
}
async function tpApagaSessao(id) {
  const x = TP.dados && TP.dados.sessoes.find(s => s.id === id);
  if (!confirm('Apagar esta sessão' + (x ? ' de ' + CRON.fmtLongo(x.seg) : '') + '?\n\nO tempo sai do relatório e da tarefa.')) return;
  try { await api('/api/tempo/sessao/' + id, { method: 'DELETE' }); toast('Sessão apagada'); tpCarrega(); loadState(false, true); }
  catch (e) { toast(e.message, true); }
}
/** CSV no formato das horas do MKT Hub (time_entries: data, pessoa, empresa, horas, descrição). Abre certo no Excel. */
function tpExportaCsv() {
  const d = TP.dados; if (!d || !d.linhas.length) return;
  const q = v => { const s = String(v); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const linhas = [['data', 'pessoa', 'empresa', 'atividade', 'horas', 'minutos', 'descricao'].join(';')];
  for (const [dia, por, aba, atv, seg] of d.linhas) {
    const horas = Math.max(0.01, Math.round(seg / 36) / 100);
    const data = dia.length === 7 ? dia + '-01' : dia;
    linhas.push([data, q(por), q(TP_EMPRESA_HUB[aba] || aba), TP_ATIVIDADE[atv], horas.toFixed(2).replace('.', ','), Math.round(seg / 60), q(TP_ATIVIDADE[atv] + (dia.length === 7 ? ' (total do mês)' : '') + ' · B.O.N.E')].join(';'));
  }
  const blob = new Blob(['﻿' + linhas.join('\r\n') + '\r\n'], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'tempo-bone-' + d.de + (d.de !== d.ate ? '-a-' + d.ate : '') + (TP.por ? '-' + tfChave(TP.por).replace(/[^a-z0-9]+/g, '-') : '') + '.csv';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  toast('CSV baixado: ' + (linhas.length - 1) + ' linha' + (linhas.length > 2 ? 's' : ''));
}
/** Números sobem do zero quando a tela abre (sem isso se "reduzir movimento" estiver ligado). */
function tpContaAnima() {
  let reduz = false; try { reduz = matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}
  if (reduz) return;
  const els = [...document.querySelectorAll('#tpBody [data-conta]')];
  const t0 = performance.now(), dur = 650;
  const passo = agora => {
    const k = Math.min(1, (agora - t0) / dur), f = 1 - Math.pow(1 - k, 3);
    els.forEach(el => { el.textContent = CRON.fmtLongo(Math.round(+el.dataset.conta * f)); });
    if (k < 1) requestAnimationFrame(passo);
  };
  requestAnimationFrame(passo);
}
