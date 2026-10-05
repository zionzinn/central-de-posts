'use strict';
// =====================================================================
// v4.03 · QUADRO DE CAPTAÇÃO (pedido do Zion em 02/10/2026)
// "tem que ter alguma maneira de dividir o bloco de captação do jeito que eu quiser, tipo, se elis fizer 4 videos
// complexos eu divido em duas tasks para dois dias". O doc de cada post é Arte ou Vídeo (public/doc.html); no vídeo, a
// Elis escreve só o roteiro pra captar daquele post. Aqui o ADMIN junta os vídeos da semana (pela data em que SAEM) em
// blocos: dia da captação, horário, quem capta e uma nota. Cada bloco tem a pauta pronta pra copiar (WhatsApp ou a task
// do MKT Hub). O filmmaker trabalha só no MKT Hub.
// Dados: db.capBlocos e slot.capBloco (lib/captacao.js). A regra arte x vídeo mora em lib/peca.js e é repetida aqui em
// pecaDoPost: mudou lá, muda aqui.
// No calendário: a câmera no card do vídeo (capMarca, chamada pelo lpMarcas do js/linha.js) e o botão Captação na barra.
// v4.04 (decisões do Zion em 02/10/2026): o bloco vira task de Captação no MKT Hub, 1 por empresa, no nome de quem
// capta (a lista de pessoas do Hub); os pontos se digitam na folha de mandar (vêm os da última captação). Depois de
// mandar, o bloco trava (dia, horário, quem capta e nota mudam no Hub) e cada vídeo mostra o código da subtarefa e o
// "captado" que volta do Hub (lib/captacao.js).
// =====================================================================
const CAP = { aberto: false, semana: null, dados: null, pede: 0, timer: null, arrasta: null, apaga: null, apagaT: null, ocupado: false, pollT: null, jobs: {} };

// ---------------- arte ou vídeo (a mesma regra do lib/peca.js) ----------------
const CAP_FMT_VIDEO = new Set(['reels', 'video medio', 'video de anuncio']);
const CAP_FMT_ARTE = new Set(['carrossel', 'estatico', 'story', 'stories', 'corte de podcast']);
const CAP_SEM_CAPTACAO = /\bcortes? (do |de )?(podcast|reels)\b|\[cortes?\b|\[edicao|\bedicao (de |do )?depoimento/;   // corte de podcast e edição do que já existe
/** O que o nome do post (o do painel, o da task e o tema da matriz) diz: 'video', 'arte' ou null. */
function capNomeDiz(s) {
  const t = capSemAcento([s.titulo, s.tituloCache, s.matrizSB && s.matrizSB.tema].filter(Boolean).join(' · '));
  if (/\bcaptacao\b/.test(t)) return 'video';
  if (CAP_SEM_CAPTACAO.test(t)) return 'arte';
  if (/\[(reels?|videos?)\]/.test(t)) return 'video';
  if (/\[(carrossel|estatico|story|stories)\]/.test(t)) return 'arte';
  return null;
}
function capSemAcento(t) { return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim(); }
/** 'arte', 'video' ou null (em aberto: o doc pergunta). */
function pecaDoPost(s) {
  if (!s) return null;
  if (s.peca === 'arte' || s.peca === 'video') return s.peca;
  const f = capSemAcento(s.formato);
  if (CAP_FMT_VIDEO.has(f)) return capNomeDiz(s) === 'arte' ? 'arte' : 'video';
  if (CAP_FMT_ARTE.has(f)) return 'arte';
  if (s.banco) return 'arte';                                   // material do banco: já existe, não tem captação
  const n = capNomeDiz(s); if (n) return n;
  const m = capSemAcento(s.matrizSB && s.matrizSB.formato);     // na matriz, o formato é descritivo
  if (!m) return null;
  if (/carrossel|\bstor(y|ies)\b/.test(m) || CAP_SEM_CAPTACAO.test(m)) return 'arte';
  if (/video|reels|documentario|vlog|\bpov\b|react|trend|cinematico|fala direta|contando|bastidor/.test(m)) return 'video';
  if (/foto|print|card|numero|placar|meme|grid|colagem|callout|frase|notificacao|checklist|calendario|quadro|tier|selo|starter|estatic/.test(m)) return 'arte';
  return null;
}

// ---------------- datas e nomes ----------------
const CAP_DS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
function capMs(iso) { return Date.parse(iso + 'T12:00:00Z'); }
function capSoma(iso, n) { return new Date(capMs(iso) + n * 864e5).toISOString().slice(0, 10); }
function capBr(iso) { return iso.slice(8, 10) + '/' + iso.slice(5, 7); }
/** "Qui 08/10" */
function capDiaL(iso) { return CAP_DS[new Date(capMs(iso)).getUTCDay()] + ' ' + capBr(iso); }
/** "9h", "9h30" */
function capHora(h) { return String(h || '').replace(/^0(\d)/, '$1').replace(/:00$/, 'h').replace(/^(\d+):(\d\d)$/, '$1h$2'); }
/** "Qui 08/10 · 9h às 12h" (o mesmo nome do servidor). */
function capNomeBloco(b) { return (b.dia ? capDiaL(b.dia) : 'Sem dia') + (b.inicio ? ' · ' + capHora(b.inicio) + (b.fim ? ' às ' + capHora(b.fim) : '') : ''); }
const capPl = (n, um, varios) => n + ' ' + (n === 1 ? um : varios);

// ícones que o painel ainda não tinha (o resto vem do icon() do index.html)
const CAP_ICONS = {
  copiar: '<rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5"/>',
  lixo: '<path d="M5 7h14M10 7V4.5h4V7M7 7l1 13h8l1-13"/>',
  mover: '<path d="M5 9l-2.5 3L5 15M19 9l2.5 3L19 15M2.5 12h19"/>',
};
function capIc(nome, cls) {
  if (!CAP_ICONS[nome]) return icon(nome, cls);
  return '<svg class="ic' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" aria-hidden="true">' + CAP_ICONS[nome] + '</svg>';
}

// ---------------- no calendário ----------------
/**
 * A marquinha do vídeo no card: câmera (é vídeo), "captar" (roteiro aprovado e ainda sem bloco) ou o dia da captação
 * (já está num bloco). Arte não ganha nada. No mês só o ícone; na semana, o ícone e a palavra.
 */
function capMarca(s, e) {
  if (pecaDoPost(s) !== 'video' || s.postado || (e && (e.k === 'ar' || e.k === 'esp')) || (s.sugestao && !s.taskId)) return '';
  // a task de produção já passou da edição (em aprovação, ajustar ou pronta): a captação ficou pra trás
  if (typeof stBucket === 'function' && ['pronto', 'aprovar', 'alterar'].includes(stBucket(s))) return '';
  const b = s.capBloco ? (S.capBlocos || []).find(x => x.id === s.capBloco) : null;
  // v4.04: a subtarefa dele no MKT Hub passou da captação
  if (b && b.feitos && b.feitos.includes(s.id)) return '<span class="lp-mk cap feito" title="Captado (a subtarefa de captação andou no MKT Hub)">' + icon('check') + '<span class="t">captado</span></span>';
  if (b) return '<span class="lp-mk cap ok" title="' + esc('Captação: ' + (b.dia ? capNomeBloco(b) : 'no bloco, dia a definir')) + '">' + icon('camera') +
    (b.dia ? '<span class="t">' + esc(lpDiaC(b.dia)) + '</span>' : '') + '</span>';
  if (s.aprov && s.aprov.c && s.aprov.c.st === 'aprovado') return '<span class="lp-mk cap pede" title="Roteiro aprovado: pra captar. Falta pôr num bloco do quadro de captação">' +
    icon('camera') + '<span class="t">captar</span></span>';
  return '<span class="lp-mk cap" title="Vídeo: tem captação">' + icon('camera') + '</span>';
}
/** O botão Captação na barra (só ADMIN): o número é de vídeos que saem nos próximos 14 dias sem bloco. */
function capBotao() {
  const b = document.getElementById('btnCap'); if (!b) return;
  const adm = typeof souAdmin === 'function' ? souAdmin() : true;
  b.hidden = !adm;
  if (!adm) { if (CAP.aberto) capFechar(); return; }
  const n = S.capPendentes || 0;
  document.getElementById('capN').textContent = n ? String(n) : '';
  b.classList.toggle('tem', !!n);
  b.dataset.tip = n ? capPl(n, 'vídeo sai', 'vídeos saem') + ' nos próximos 14 dias sem bloco de captação' : 'Quadro de captação: os vídeos da semana em blocos pro filmmaker';
}

// ---------------- a página ----------------
function capMonta() {
  if (document.getElementById('cap')) return;
  const el = document.createElement('section');
  el.className = 'pp cap'; el.id = 'cap'; el.hidden = true; el.setAttribute('aria-labelledby', 'capTit');
  el.innerHTML = '<div class="pp-top cap-top">' +
    '<button type="button" class="pp-volta" id="capVolta" title="Voltar pro calendário (Esc)">' + icon('chevL') + '<span>Calendário</span></button>' +
    '<h1 class="pp-tit" id="capTit" tabindex="-1">Captação</h1>' +
    '<div class="navgrupo cap-nav"><button type="button" class="navbtn" id="capAnt" data-tip="Semana anterior" aria-label="Semana anterior">' + icon('chevL') + '</button>' +
      '<span class="cap-semrot" id="capSemRot"></span>' +
      '<button type="button" class="navbtn" id="capProx" data-tip="Próxima semana" aria-label="Próxima semana">' + icon('chevR') + '</button></div>' +
    '<div class="pp-topdir"><button type="button" class="mbtn primary cap-novo" id="capNovo" aria-label="Novo bloco" title="Novo bloco de captação nesta semana">' + icon('plus') + '<span>Novo bloco</span></button></div></div>' +
    '<div class="cap-corpo" id="capCorpo"></div>';
  document.body.appendChild(el);
  document.getElementById('capVolta').onclick = capFechar;
  document.getElementById('capAnt').onclick = () => capIrSemana(-7);
  document.getElementById('capProx').onclick = () => capIrSemana(7);
  document.getElementById('capNovo').onclick = () => capNovoBloco(null);
}
/** Abre o quadro na semana dada (segunda) ou na que o servidor sugere (a primeira com vídeo sem bloco). */
function capAbrir(semana) {
  if (typeof fecharPerfil === 'function') fecharPerfil();
  capMonta();
  CAP.semana = semana || null; CAP.dados = null; CAP.apaga = null;
  if (!CAP.aberto) {
    CAP.aberto = true;
    document.getElementById('cap').hidden = false; document.body.classList.add('cap-on');
    clearInterval(CAP.timer);
    CAP.timer = setInterval(() => { if (CAP.aberto && !document.hidden && !document.querySelector('.ov.open') && !document.body.classList.contains('comdoc') && !capEditando()) capCarrega(); }, 30000);
  }
  document.getElementById('cap').scrollTop = 0;
  capDesenha(); capCarrega();
  setTimeout(() => { const t = document.getElementById('capTit'); if (t && CAP.aberto) t.focus({ preventScroll: true }); }, 30);
}
function capFechar() {
  if (!CAP.aberto) return;
  CAP.aberto = false; clearInterval(CAP.timer); clearTimeout(CAP.pollT); capFechaMenu(); capFechaFolha();
  document.getElementById('cap').hidden = true; document.body.classList.remove('cap-on');
  const b = document.getElementById('btnCap'); if (b) b.focus({ preventScroll: true });
}
function capEditando() { const a = document.activeElement; return !!(a && a.closest && a.closest('#cap') && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA')); }
/** Chamado quando o documento fecha e depois do Ctrl+Z: o que mudou lá aparece aqui. */
function capAoVoltar() { if (CAP.aberto) capCarrega(); }
async function capCarrega() {
  const n = ++CAP.pede;
  try {
    const d = await api('/api/captacao' + (CAP.semana ? '?semana=' + CAP.semana : ''));
    if (n !== CAP.pede || !CAP.aberto) return;
    CAP.dados = d; CAP.semana = d.semana;
    capDesenha();
  } catch (e) {
    if (n !== CAP.pede) return;
    if (!CAP.dados) document.getElementById('capCorpo').innerHTML = '<div class="pp-erro">Não consegui abrir o quadro: ' + esc(e.message) + '</div>';
    else toast(e.message, true);
  }
}
function capIrSemana(dias) {
  if (!CAP.dados) return;
  CAP.semana = capSoma(CAP.dados.semana, dias); CAP.dados = null; CAP.apaga = null;
  capDesenha(); capCarrega();
}

// ---------------- desenho ----------------
const CAP_ROTEIRO = {
  sem: ['sem doc', 'neu', 'Ainda não tem documento: clique pra criar e escrever o roteiro'],
  vazio: ['roteiro vazio', 'neu', 'O documento só tem o modelo do roteiro'],
  escrevendo: ['escrevendo', 'neu', 'Roteiro sendo escrito'],
  aprovacao: ['em aprovação', 'or', 'Roteiro esperando aprovação'],
  alterar: ['pra alterar', 'red', 'Pediram alteração no roteiro'],
  aprovado: ['aprovado', 'ok', 'Roteiro aprovado'],
};
function capCard(v) {
  const [rot, cls, dica] = CAP_ROTEIRO[v.roteiro] || CAP_ROTEIRO.sem;
  const meta = [v.onde ? v.onde : '', v.tomadas ? capPl(v.tomadas, 'tomada', 'tomadas') : ''].filter(Boolean).join(' · ');
  const nome = (v.titulo || 'vídeo') + ', ' + (v.contaNome || '') + (v.date ? ', sai ' + capDiaL(v.date) : '') + ', roteiro ' + rot;
  return '<article class="cap-card' + (v.postado ? ' postado' : '') + '" draggable="true" tabindex="0" data-id="' + esc(v.id) + '" aria-label="' + esc(nome) + '">' +
    '<div class="cap-k1"><i class="cap-cor" style="background:' + contaCor(v.conta) + '"></i><span class="cap-conta">' + esc(contaCurta(v.conta)) + '</span>' +
      '<span class="cap-sai">' + (v.postado ? 'postado' : v.date ? 'sai ' + esc(lpDiaC(v.date)) : 'sem dia') + '</span>' +
      '<button type="button" class="cap-mv" data-mv="' + esc(v.id) + '" aria-label="Mover pra outro bloco" data-tip="Mover pra…">' + capIc('mover') + '</button></div>' +
    '<div class="cap-tt">' + esc(v.titulo || 'vídeo') + '</div>' +
    '<div class="cap-k2"><span class="lp-pil ' + cls + '" title="' + esc(dica) + '">' + esc(rot) + '</span>' +
      (v.vaga ? '<span class="lp-pil neu">falta criar</span>' : '') + (meta ? '<span class="cap-meta" title="' + esc(meta) + '">' + esc(meta) + '</span>' : '') + '</div>' +
    (v.hub ? '<div class="cap-k3">' + (v.hub.captado ? '<span class="lp-pil ok" title="A subtarefa andou no MKT Hub">' + icon('check') + 'captado</span>' : '<span class="lp-pil neu">pra captar</span>') +
      '<a class="cap-mkt" href="' + esc(v.hub.url || '#') + '" target="_blank" rel="noopener" title="Abrir a subtarefa no MKT Hub">' + esc(v.hub.codigo || 'MKT Hub') + icon('external') + '</a></div>' : '') +
  '</article>';
}
function capColuna(b, vids) {
  const tom = vids.reduce((n, v) => n + (v.tomadas || 0), 0);
  const semAp = vids.filter(v => v.roteiro !== 'aprovado').length;
  let cab;
  if (!b) {
    cab = '<div class="cap-ch"><div class="cap-ct">' + capIc('box') + '<b>A organizar</b><span class="cap-n">' + vids.length + '</span></div>' +
      '<div class="cap-cs">' + (vids.length ? 'Arraste cada vídeo pro bloco do dia em que vai ser captado' : 'Nenhum vídeo desta semana sem bloco') + '</div></div>';
  } else {
    const armado = CAP.apaga === b.id, hb = b.hub || null, trava = !!(hb && hb.travado), dis = trava ? ' disabled' : '';
    const job = hb && hb.job, indo = !!(job && job.st === 'enviando'), hubT = (CAP.dados && CAP.dados.hub) || {};
    // quem capta: com o MKT Hub ligado, a lista de pessoas do Hub (vira o responsável da task); sem ele, texto
    const pess = hubT.ligado && hubT.pessoas ? hubT.pessoas.slice() : null;
    if (pess && b.resp && !pess.some(q => q.id === b.resp)) pess.push({ id: b.resp, nome: (b.quem || 'pessoa') + ' (fora do Hub)' });
    const quem = pess
      ? '<label class="cap-f cap-fq' + (b.resp ? '' : ' falta') + '"><span>Quem capta</span><select data-bid="' + b.id + '" data-k="resp"' + dis + '><option value="">escolha a pessoa do MKT Hub</option>' +
        pess.map(q => '<option value="' + esc(q.id) + '"' + (q.id === b.resp ? ' selected' : '') + '>' + esc(q.nome) + '</option>').join('') + '</select></label>'
      : '<label class="cap-f cap-fq"><span>Quem capta</span><input type="text" data-bid="' + b.id + '" data-k="quem" maxlength="60" value="' + esc(b.quem || '') + '" placeholder="filmmaker"' + dis + '></label>';
    // o bloco no Hub: a task de cada empresa, o envio e o que falta mandar
    let hubH = '';
    if (hb && hb.maes && hb.maes.length) hubH += '<div class="cap-hub">' + hb.maes.map(m => '<a class="cap-mkt" href="' + esc(m.url || '#') + '" target="_blank" rel="noopener" title="Abrir a task no MKT Hub">' + esc(m.codigo || 'MKT Hub') + icon('external') + '</a>' +
      '<span class="cap-hube">' + esc([m.empresa && m.empresa.nome, m.etapa].filter(Boolean).join(' · ')) + '</span>').join('') + '</div>';
    if (trava) hubH += '<div class="cap-trava">' + icon('pin') + 'Dia, quem capta e nota mudam no MKT Hub.</div>';
    if (indo) hubH += '<div class="cap-envio" role="status"><i></i>Mandando pro MKT Hub… ' + Math.min(job.feitos || 0, job.total || 1) + ' de ' + (job.total || 1) + '</div>';
    else if (job && job.st === 'erro') hubH += '<div class="cap-erro" role="alert">' + icon('alerta') + '<span>Não foi pro MKT Hub: ' + esc(job.erro || 'erro') + '</span></div>';
    const pend = hb ? (hb.novos || 0) + (hb.mudados || 0) : vids.length;
    let mandaB = '';
    if (hubT.escrita && vids.length && !indo && (!trava || pend)) {
      const rot = !trava ? 'Mandar pro MKT Hub' : hb.novos && hb.mudados ? 'Mandar ' + capPl(pend, 'mudança', 'mudanças') : hb.novos ? 'Mandar ' + capPl(hb.novos, 'vídeo novo', 'vídeos novos') : 'Atualizar ' + capPl(hb.mudados, 'roteiro', 'roteiros');
      mandaB = '<button type="button" class="mbtn primary cap-manda" data-hub="' + b.id + '" title="' + esc(!trava ? 'Cria a task de Captação no MKT Hub (1 por empresa), com uma subtarefa por vídeo' : 'Manda pro MKT Hub o que entrou ou mudou depois do envio') + '">' + icon('hub') + esc(rot) + '</button>';
    }
    cab = '<div class="cap-ch">' +
      '<div class="cap-ct">' + icon('camera') + '<b>' + esc(capNomeBloco(b)) + '</b><span class="cap-n">' + vids.length + '</span></div>' + hubH +
      '<div class="cap-campos">' +
        '<label class="cap-f cap-fd' + (b.dia ? '' : ' falta') + '"><span>Dia</span><input type="date" data-bid="' + b.id + '" data-k="dia" value="' + esc(b.dia || '') + '"' + dis + '></label>' +
        '<label class="cap-f cap-fh"><span>Das</span><input type="text" inputmode="numeric" maxlength="6" data-bid="' + b.id + '" data-k="inicio" value="' + esc(capHora(b.inicio)) + '" placeholder="9h" title="9, 9h, 9:30 ou 930"' + dis + '></label>' +
        '<label class="cap-f cap-fh"><span>Às</span><input type="text" inputmode="numeric" maxlength="6" data-bid="' + b.id + '" data-k="fim" value="' + esc(capHora(b.fim)) + '" placeholder="12h" title="12, 12h, 12:30 ou 1230"' + dis + '></label>' +
        quem +
        '<label class="cap-f cap-fn"><span>Nota</span><input type="text" data-bid="' + b.id + '" data-k="nota" maxlength="300" value="' + esc(b.nota || '') + '" placeholder="local, luz, o que levar"' + dis + '></label>' +
      '</div>' +
      '<div class="cap-tot">' + capPl(vids.length, 'vídeo', 'vídeos') + (tom ? ' · ' + capPl(tom, 'tomada', 'tomadas') : '') +
        (trava ? ' · <span class="cap-feitos">' + (hb.captados || 0) + ' de ' + (hb.enviados || 0) + ' ' + ((hb.enviados || 0) === 1 ? 'captado' : 'captados') + '</span>' : '') +
        (semAp && vids.length ? ' · <span class="cap-falta">' + semAp + ' sem roteiro aprovado</span>' : '') + '</div>' +
      '<div class="cap-acoes">' + mandaB +
        '<button type="button" class="mbtn cap-pauta" data-pauta="' + b.id + '"' + (vids.length ? '' : ' disabled') + ' title="Copia o roteiro de cada vídeo do bloco, pra colar no WhatsApp ou na task do MKT Hub">' + capIc('copiar') + 'Copiar pauta</button>' +
        '<button type="button" class="mbtn critbtn cap-del' + (armado ? ' armado' : '') + '" data-del="' + b.id + '"' + (indo ? ' disabled' : '') + ' aria-label="' + (armado ? 'Excluir mesmo?' : 'Excluir o bloco') + '" title="' + (armado ? 'Clique de novo pra excluir' + (trava ? ' (as tasks continuam no MKT Hub)' : '') : 'Excluir o bloco (os vídeos voltam pra A organizar)') + '">' +
          capIc('lixo') + (armado ? 'Excluir mesmo?' : '') + '</button>' +   // só o ícone; armado, a pergunta
      '</div></div>';
  }
  return '<section class="cap-col' + (b ? ' bloco' + (b.dia ? '' : ' semdia') + (b.hub && b.hub.travado ? ' nohub' : '') : ' solta') + '" data-drop="' + (b ? b.id : 'solto') + '" aria-label="' + esc(b ? 'Bloco ' + capNomeBloco(b) : 'A organizar') + '">' + cab +
    '<div class="cap-lista">' + (vids.length ? vids.map(capCard).join('') : '<div class="cap-vazio">' + (b ? 'Arraste pra cá os vídeos deste bloco' : 'Tudo organizado') + '</div>') + '</div></section>';
}
function capDesenha() {
  const corpo = document.getElementById('capCorpo'); if (!corpo) return;
  const d = CAP.dados;
  const rot = document.getElementById('capSemRot');
  const semRot = (a, b) => '<span class="cap-pre">Saem de </span>' + capBr(a) + ' a ' + capBr(b);   // no celular, só as datas
  if (!d) { rot.innerHTML = CAP.semana ? semRot(CAP.semana, capSoma(CAP.semana, 6)) : 'carregando'; corpo.innerHTML = '<div class="pp-carrega" role="status">carregando o quadro…</div>'; return; }
  rot.innerHTML = semRot(d.semana, d.ate);
  rot.title = 'Os vídeos que vão ao ar de ' + capDiaL(d.semana) + ' a ' + capDiaL(d.ate);
  // guarda o campo em que o cursor está e o que já foi digitado nele (o redesenho troca os elementos)
  const a = document.activeElement, foco = a && a.dataset && a.dataset.bid && a.closest('#capCorpo') ? { bid: a.dataset.bid, k: a.dataset.k, valor: a.value } : null;
  const soltos = d.videos.filter(v => !v.bloco);
  let h = '';
  if (d.indefinidos && d.indefinidos.length) {
    h += '<div class="cap-aviso" role="note">' + icon('alerta') + '<span><b>' + capPl(d.indefinidos.length, 'post desta semana ainda não diz', 'posts desta semana ainda não dizem') + ' se é arte ou vídeo.</b> Abra e escolha no topo do doc:</span>' +
      '<span class="cap-indef">' + d.indefinidos.map(x => '<button type="button" class="mbtn" data-indef="' + esc(x.id) + '" title="' + esc(x.titulo + ' · ' + x.contaNome + ' · sai ' + capDiaL(x.date)) + '"><span class="ci-t">' + esc(x.titulo) + '</span><small>' + esc(lpDiaC(x.date)) + '</small></button>').join('') + '</span></div>';
  }
  if (!d.videos.length && !d.blocos.length) {
    h += '<div class="cap-nada"><div class="cap-nada-ic">' + icon('camera') + '</div><b>Nenhum vídeo sai nesta semana</b><span>Os vídeos aparecem aqui pela data em que vão ao ar. Use as setas pra ver outra semana.</span></div>';
  }
  h += '<div class="cap-cols" id="capCols">' + capColuna(null, soltos);
  d.blocos.forEach(b => { h += capColuna(b, d.videos.filter(v => v.bloco === b.id)); });
  h += '<button type="button" class="cap-col cap-nova" data-drop="novo" id="capNova">' + icon('plus') + '<b>Novo bloco</b><span>clique, ou arraste um vídeo pra cá</span></button></div>';
  corpo.innerHTML = h;
  capLiga(corpo);
  capAcompanha(d);
  if (foco) {
    const el = corpo.querySelector('[data-bid="' + foco.bid + '"][data-k="' + foco.k + '"]');
    if (el) { if (el.value !== foco.valor) { el.value = foco.valor; el.dataset.sujo = '1'; } el.focus({ preventScroll: true }); }
  }
}

// ---------------- interação ----------------
function capVideo(id) { return CAP.dados && CAP.dados.videos.find(v => v.id === id); }
function capLiga(raiz) {
  raiz.querySelectorAll('.cap-card').forEach(c => {
    c.addEventListener('click', ev => { if (ev.target.closest('.cap-mv, a')) return; const v = capVideo(c.dataset.id); if (v) capAbreDoc(v); });
    c.addEventListener('keydown', ev => {
      if (ev.target !== c) return;
      if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); const v = capVideo(c.dataset.id); if (v) capAbreDoc(v); }
    });
    c.addEventListener('dragstart', ev => {
      CAP.arrasta = c.dataset.id; c.classList.add('arrastando'); document.getElementById('capCols').classList.add('arrastando');
      try { ev.dataTransfer.setData('text/plain', c.dataset.id); ev.dataTransfer.effectAllowed = 'move'; } catch (e) { }
    });
    c.addEventListener('dragend', () => {
      CAP.arrasta = null; c.classList.remove('arrastando');
      raiz.querySelectorAll('.alvo').forEach(x => x.classList.remove('alvo'));
      const cols = document.getElementById('capCols'); if (cols) cols.classList.remove('arrastando');
    });
  });
  raiz.querySelectorAll('[data-drop]').forEach(col => {
    col.addEventListener('dragover', ev => { if (!CAP.arrasta) return; ev.preventDefault(); try { ev.dataTransfer.dropEffect = 'move'; } catch (e) { } col.classList.add('alvo'); });
    col.addEventListener('dragleave', ev => { if (!col.contains(ev.relatedTarget)) col.classList.remove('alvo'); });
    col.addEventListener('drop', ev => {
      if (!CAP.arrasta) return;
      ev.preventDefault(); col.classList.remove('alvo');
      const id = CAP.arrasta; CAP.arrasta = null;
      capMover(id, col.dataset.drop);
    });
  });
  raiz.querySelectorAll('[data-mv]').forEach(b => b.onclick = ev => { ev.stopPropagation(); capMenuMover(b, b.dataset.mv); });
  // o campo grava quando o cursor sai dele (ou no Enter): digitar a data ou a hora dispara "change" a cada número, e
  // gravar no meio redesenharia o quadro debaixo dos dedos
  raiz.querySelectorAll('input[data-bid]').forEach(inp => {
    const grava = () => { delete inp.dataset.sujo; capCampo(inp.dataset.bid, inp.dataset.k, inp.value); };
    inp.addEventListener('change', () => { if (document.activeElement === inp) inp.dataset.sujo = '1'; else grava(); });
    inp.addEventListener('blur', () => { if (inp.dataset.sujo) grava(); });
    inp.addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); inp.blur(); } });
  });
  raiz.querySelectorAll('select[data-bid]').forEach(sel => sel.addEventListener('change', () => capCampo(sel.dataset.bid, sel.dataset.k, sel.value)));   // v4.04: quem capta
  raiz.querySelectorAll('[data-hub]').forEach(b => b.onclick = () => capFolhaHub(b.dataset.hub));
  raiz.querySelectorAll('[data-pauta]').forEach(b => b.onclick = () => capPauta(b.dataset.pauta));
  raiz.querySelectorAll('[data-del]').forEach(b => b.onclick = () => capApaga(b.dataset.del));
  raiz.querySelectorAll('[data-indef]').forEach(b => b.onclick = () => { const x = CAP.dados.indefinidos.find(i => i.id === b.dataset.indef); if (x) capAbreDoc(x); });
  const nova = raiz.querySelector('#capNova'); if (nova) nova.onclick = () => capNovoBloco(null);
}
/** Abre o doc do post (cria, se ainda não tem). O doc abre por cima do quadro; ao fechar, o quadro se atualiza. */
async function capAbreDoc(v) {
  let id = v.docId;
  if (!id) {
    try { const r = await api('/api/docs', { method: 'POST', body: JSON.stringify({ slotId: v.id, por: ((typeof PERFIL !== 'undefined' && PERFIL.get()) || {}).nome || '' }) }); id = r.id; v.docId = id; }
    catch (e) { toast(e.message, true); return; }
  }
  abrirDoc(id);
}
/** Depois de mexer: o quadro e o calendário (a câmera do card mostra o dia da captação). */
function capDepois() { capCarrega(); loadState(false, true).catch(() => { }); }
async function capMover(id, alvo) {
  const v = capVideo(id); if (!v || CAP.ocupado) return;
  let bloco = alvo === 'solto' ? null : alvo;
  if (alvo === 'novo') { bloco = await capNovoBloco(null, true); if (!bloco) return; }
  if ((v.bloco || null) === bloco) return;
  const antes = v.bloco || null;
  v.bloco = bloco; capDesenha();                               // já aparece no lugar novo; o servidor confirma
  CAP.ocupado = true;
  try {
    await api('/api/slots/' + id, { method: 'PATCH', body: JSON.stringify({ capBloco: bloco }) });
    const b = bloco && CAP.dados.blocos.find(x => x.id === bloco);
    toast((b ? 'No bloco ' + capNomeBloco(b) : 'De volta pra A organizar') + (v.hub ? '. A subtarefa ' + (v.hub.codigo || '') + ' continua no MKT Hub' : '') + ' · Ctrl+Z desfaz', false, v.hub ? 6000 : 0);
  } catch (e) { v.bloco = antes; capDesenha(); toast(e.message, true); }
  finally { CAP.ocupado = false; }
  capDepois();
}
/** Bloco novo na semana do quadro. Com "devolve", só cria e devolve o id (o vídeo arrastado vai pra ele em seguida). */
async function capNovoBloco(dia, devolve) {
  if (!CAP.dados) return null;
  try {
    const r = await api('/api/captacao/blocos', { method: 'POST', body: JSON.stringify(Object.assign({ semana: CAP.dados.semana }, dia ? { dia } : {})) });
    CAP.dados.blocos.push(r.bloco);
    if (devolve) return r.bloco.id;
    capDesenha();
    const el = document.querySelector('#capCorpo input[data-bid="' + r.bloco.id + '"][data-k="dia"]');
    if (el) { el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' }); el.focus({ preventScroll: true }); }
    capDepois();
    return r.bloco.id;
  } catch (e) { toast(e.message, true); return null; }
}
/** Hora digitada do jeito que sair: 9, 9h, 9:30, 9h30, 930, 14 → "09:00", "09:30", "14:00". Vazio = ''; inválida = null. */
function capLeHora(t) {
  t = String(t || '').trim().toLowerCase().replace(/\s+/g, '').replace(/(hs|hrs|h)$/, '');
  if (!t) return '';
  let h, m = 0, x;
  if ((x = t.match(/^(\d{1,2})$/))) h = +x[1];
  else if ((x = t.match(/^(\d{1,2})[:h.](\d{1,2})$/))) { h = +x[1]; m = +x[2]; }
  else if ((x = t.match(/^(\d{1,2})(\d{2})$/))) { h = +x[1]; m = +x[2]; }
  else return null;
  if (h > 23 || m > 59) return null;
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}
async function capCampo(bid, k, valor) {
  const b = CAP.dados && CAP.dados.blocos.find(x => x.id === bid); if (!b) return;
  if (k === 'inicio' || k === 'fim') {
    const h = capLeHora(valor);
    if (h === null) { toast('Horário não entendido: escreva 9, 9h, 9:30 ou 930', true); capDesenha(); return; }
    valor = h;
  }
  if ((b[k] || '') === (valor || '')) return;
  try {
    const r = await api('/api/captacao/blocos/' + bid, { method: 'PATCH', body: JSON.stringify({ [k]: valor || (k === 'dia' ? null : '') }) });
    Object.assign(b, r.bloco);
  } catch (e) { toast(e.message, true); }
  capDepois();
}
async function capApaga(bid) {
  if (CAP.apaga !== bid) {
    CAP.apaga = bid; capDesenha(); clearTimeout(CAP.apagaT);
    CAP.apagaT = setTimeout(() => { if (CAP.apaga === bid) { CAP.apaga = null; capDesenha(); } }, 4000);
    return;
  }
  CAP.apaga = null; clearTimeout(CAP.apagaT);
  try {
    const r = await api('/api/captacao/blocos/' + bid, { method: 'DELETE' });
    toast('Bloco excluído' + (r.soltos ? ': ' + capPl(r.soltos, 'vídeo voltou', 'vídeos voltaram') + ' pra A organizar' : '') +
      (r.noHub && r.noHub.length ? '. No MKT Hub, ' + r.noHub.join(' e ') + (r.noHub.length === 1 ? ' continua lá' : ' continuam lá') : ''), false, r.noHub && r.noHub.length ? 7000 : 0);
  } catch (e) { toast(e.message, true); }
  capDepois();
}
async function capCopia(t) {
  try { await navigator.clipboard.writeText(t); return true; }
  catch (e) {
    const ta = document.createElement('textarea'); ta.value = t; ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
    document.body.appendChild(ta); ta.select(); let ok = false; try { ok = document.execCommand('copy'); } catch (e2) { } ta.remove(); return ok;
  }
}
async function capPauta(bid) {
  try {
    const r = await api('/api/captacao/blocos/' + bid + '/pauta');
    const ok = await capCopia(r.texto);
    toast(ok ? 'Pauta copiada (' + r.nome + '): cole no WhatsApp ou na task do MKT Hub' : 'Não consegui copiar a pauta', !ok);
  } catch (e) { toast(e.message, true); }
}

// ---------------- v4.04: mandar o bloco pro MKT Hub ----------------
/** Enquanto um bloco vai pro Hub, o quadro pergunta de novo a cada 1,2 s; quando termina, avisa como foi. */
function capAcompanha(d) {
  let indo = false;
  for (const b of d.blocos) {
    const j = b.hub && b.hub.job, st = j ? j.st : null, antes = CAP.jobs[b.id];
    if (antes === 'enviando' && st === 'ok') toast('No MKT Hub: ' + (b.hub.maes || []).map(m => m.codigo).filter(Boolean).join(', ') + ' (' + capNomeBloco(b) + ')', false, 6000);
    if (antes === 'enviando' && st === 'erro') toast('O bloco ' + capNomeBloco(b) + ' não foi pro MKT Hub: ' + (j.erro || 'erro'), true);
    CAP.jobs[b.id] = st;
    if (st === 'enviando') indo = true;
  }
  clearTimeout(CAP.pollT); CAP.pollT = null;
  if (indo && CAP.aberto) CAP.pollT = setTimeout(() => { CAP.pollT = null; if (CAP.aberto && !capEditando()) capCarrega(); }, 1200);
  else if (Object.values(CAP.jobs).length && !indo && CAP.jobsMudou) { CAP.jobsMudou = false; loadState(false, true).catch(() => { }); }
}
function capFechaFolha() { const f = document.getElementById('capFolha'); if (f) f.remove(); }
/** A folha de mandar: o que vai (1 task por empresa, os vídeos), o que falta e os pontos (digitados na hora). */
async function capFolhaHub(bid) {
  capFechaFolha();
  const b = CAP.dados && CAP.dados.blocos.find(x => x.id === bid); if (!b) return;
  const f = document.createElement('div'); f.id = 'capFolha'; f.className = 'cap-folha-fundo';
  f.innerHTML = '<div class="cap-folha" role="dialog" aria-modal="true" aria-labelledby="cfTit"><div class="cf-topo"><h2 id="cfTit">Mandar pro MKT Hub</h2>' +
    '<button type="button" class="cf-x" aria-label="Fechar">' + icon('x') + '</button></div><div class="cf-corpo" id="cfCorpo"><div class="pp-carrega" role="status">conferindo o MKT Hub…</div></div></div>';
  document.body.appendChild(f);   // no body (como o menu): dentro do quadro rolado, o fixed ficaria preso à página (a animação deixa transform)
  f.addEventListener('mousedown', ev => { if (ev.target === f) capFechaFolha(); });
  f.querySelector('.cf-x').onclick = capFechaFolha;
  let o;
  try { o = await api('/api/captacao/blocos/' + bid + '/hub'); }
  catch (e) { const c = document.getElementById('cfCorpo'); if (c) c.innerHTML = '<div class="pp-erro">' + esc(e.message) + '</div>'; return; }
  const c = document.getElementById('cfCorpo'); if (!c) return;
  const novaMae = o.grupos.some(g => !g.mae);
  const vai = o.grupos.reduce((n, g) => n + g.videos.filter(v => !v.noHub || v.mudou).length, 0);
  const faltas = (o.faltas || []).concat(o.erro ? [o.erro] : []).concat(!o.escrita ? ['a chave do MKT Hub precisa ser de nível completa (está ' + (o.nivel || 'sem resposta') + ')'] : []);
  c.innerHTML =
    '<p class="cf-sub"><b>' + esc(capNomeBloco(b)) + '</b> · prazo ' + esc(o.prazo ? capDiaL(o.prazo) : 'sem dia') + ' · quem capta: ' + esc((o.resp && o.resp.nome) || 'ninguém') + '</p>' +
    (faltas.length ? '<div class="cap-erro" role="alert">' + icon('alerta') + '<span>' + faltas.map(esc).join('; ') + '.</span></div>' : '') +
    '<div class="cf-grupos">' + o.grupos.map(g => '<div class="cf-g"><div class="cf-gt"><b>' + esc(g.empresa.nome) + '</b>' +
      (g.mae ? '<a class="cap-mkt" href="' + esc(g.mae.url || '#') + '" target="_blank" rel="noopener">' + esc(g.mae.codigo) + icon('external') + '</a>' : '<span class="cf-nova">task nova</span>') + '</div>' +
      '<ul>' + g.videos.map(v => '<li><span class="cf-vt">' + esc(v.titulo) + '</span><span class="cf-vm">' + esc(v.conta) + (v.date ? ' · sai ' + esc(lpDiaC(v.date)) : '') + '</span>' +
        (v.noHub && !v.mudou ? '<span class="lp-pil neu">' + esc(v.codigo || 'no Hub') + '</span>' : v.mudou ? '<span class="lp-pil or">roteiro mudou</span>' : '<span class="lp-pil ' + (v.roteiro ? 'ok' : 'or') + '">' + (v.roteiro ? 'roteiro aprovado' : 'roteiro não aprovado') + '</span>') +
        '</li>').join('') + '</ul></div>').join('') + '</div>' +
    '<div class="cf-campos">' +
      '<label class="cap-f"><span>Tipo</span><select id="cfTipo">' + o.tipos.map(t => '<option' + (t === o.sugestao.tipo ? ' selected' : '') + '>' + esc(t) + '</option>').join('') + '</select></label>' +
      (novaMae ? '<label class="cap-f"><span>Pontos da task</span><input id="cfPontos" type="number" min="1" max="100" step="1" value="' + esc(o.sugestao.pontos) + '"></label>' : '') +
      '<label class="cap-f"><span>Pontos de cada vídeo</span><input id="cfPontosSub" type="number" min="1" max="100" step="1" value="' + esc(o.sugestao.pontosSub) + '"></label>' +
    '</div>' +
    '<p class="cf-nota">' + (novaMae ? '1 task de Captação por empresa, no nome de quem capta, com a pauta no briefing; cada vídeo vira subtarefa com o roteiro. ' : 'Os vídeos entram como subtarefa na task que já existe. ') +
      'Os pontos vêm da última captação: confira antes de mandar.</p>' +
    '<div class="cf-pe"><button type="button" class="mbtn" id="cfCancela">Cancelar</button>' +
      '<button type="button" class="mbtn primary" id="cfManda"' + (faltas.length || !vai ? ' disabled' : '') + '>' + icon('hub') + 'Mandar ' + capPl(vai, 'vídeo', 'vídeos') + '</button></div>';
  c.querySelector('#cfCancela').onclick = capFechaFolha;
  c.querySelector('#cfManda').onclick = () => capMandaHub(bid);
  const foco = c.querySelector('#cfPontos') || c.querySelector('#cfPontosSub');
  if (foco && !faltas.length) { foco.focus(); foco.select(); }
  c.querySelectorAll('input').forEach(i => i.addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); capMandaHub(bid); } }));
}
async function capMandaHub(bid) {
  const bt = document.getElementById('cfManda'); if (!bt || bt.disabled) return;
  const pts = document.getElementById('cfPontos'), sub = document.getElementById('cfPontosSub');
  const corpo = { tipo: document.getElementById('cfTipo').value, pontos: pts ? +pts.value : 1, pontosSub: sub ? +sub.value : 1 };
  const rot = bt.innerHTML; bt.disabled = true; bt.innerHTML = icon('hub') + 'Mandando…';   // até o servidor aceitar
  try {
    await api('/api/captacao/blocos/' + bid + '/hub', { method: 'POST', body: JSON.stringify(corpo) });
    capFechaFolha();
    CAP.jobs[bid] = 'enviando'; CAP.jobsMudou = true;
    toast('Mandando pro MKT Hub…');
    capCarrega();
  } catch (e) {
    bt.disabled = false; bt.innerHTML = rot; toast(e.message, true);
    const campo = e.j && e.j.campo, el = campo === 'pontos' ? pts : campo === 'pontosSub' ? sub : null;
    if (el) { el.focus(); el.select(); }
  }
}

// ---------------- mover pelo menu (teclado e celular, onde não tem arrastar) ----------------
function capFechaMenu() { const m = document.getElementById('capMenu'); if (m) m.remove(); }
function capMenuMover(ancora, id) {
  capFechaMenu();
  const v = capVideo(id); if (!v || !CAP.dados) return;
  const destinos = [{ k: 'solto', r: 'A organizar' }].concat(CAP.dados.blocos.map(b => ({ k: b.id, r: capNomeBloco(b) }))).concat([{ k: 'novo', r: 'Bloco novo' }]);
  const m = document.createElement('div'); m.id = 'capMenu'; m.className = 'cap-menu'; m.setAttribute('role', 'menu');
  m.innerHTML = '<div class="cap-mtit">Mover pra</div>' + destinos.map(x => {
    const atual = (v.bloco || 'solto') === x.k;
    return '<button type="button" role="menuitem" data-pra="' + esc(x.k) + '"' + (atual ? ' disabled aria-current="true"' : '') + '>' +
      (x.k === 'novo' ? icon('plus') : x.k === 'solto' ? capIc('box') : icon('camera')) + '<span>' + esc(x.r) + '</span>' + (atual ? icon('check', 'cap-atual') : '') + '</button>';
  }).join('');
  document.body.appendChild(m);
  const r = ancora.getBoundingClientRect(), w = m.offsetWidth, h = m.offsetHeight;
  m.style.left = Math.max(8, Math.min(r.right - w, innerWidth - w - 8)) + 'px';
  m.style.top = (r.bottom + 6 + h > innerHeight - 8 ? Math.max(8, r.top - h - 6) : r.bottom + 6) + 'px';
  m.querySelectorAll('[data-pra]').forEach(b => b.onclick = () => { capFechaMenu(); capMover(id, b.dataset.pra); });
  const primeiro = m.querySelector('button:not([disabled])'); if (primeiro) primeiro.focus();
  setTimeout(() => document.addEventListener('mousedown', function fora(ev) {
    if (!ev.target.closest || !ev.target.closest('#capMenu')) { capFechaMenu(); document.removeEventListener('mousedown', fora); }
  }), 0);
}

// Esc volta pro calendário (o menu e os campos primeiro); com o quadro aberto, os atalhos de 1 tecla do painel ficam
// quietos (1 a 9, [ e ] trocariam a empresa por trás). Registrado antes do script do painel, então roda primeiro.
document.addEventListener('keydown', ev => {
  if (!CAP.aberto || document.querySelector('.ov.open') || document.body.classList.contains('comdoc')) return;
  const t = ev.target, campo = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
  if (ev.key === 'Escape') {
    ev.preventDefault(); ev.stopImmediatePropagation();
    if (document.getElementById('capMenu')) { capFechaMenu(); return; }
    if (document.getElementById('capFolha')) { capFechaFolha(); return; }
    if (campo) { t.blur(); return; }
    capFechar(); return;
  }
  if (campo) return;
  if (!ev.ctrlKey && !ev.metaKey && !ev.altKey && /^[1-9\[\]]$/.test(ev.key)) ev.stopImmediatePropagation();
});
// no menu: setas sobem e descem
document.addEventListener('keydown', ev => {
  const m = document.getElementById('capMenu'); if (!m || !m.contains(document.activeElement)) return;
  if (ev.key !== 'ArrowDown' && ev.key !== 'ArrowUp') return;
  ev.preventDefault();
  const bs = [...m.querySelectorAll('button:not([disabled])')], i = bs.indexOf(document.activeElement);
  const j = ev.key === 'ArrowDown' ? (i + 1) % bs.length : (i - 1 + bs.length) % bs.length;
  if (bs[j]) bs[j].focus();
});
