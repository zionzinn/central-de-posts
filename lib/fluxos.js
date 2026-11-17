'use strict';
/**
 * v4.25: o fluxograma da captação de eventos é a REGRA do sistema (o protótipo do Ultron virou código).
 *
 * Cada tipo de evento (Liga, Conselho, Experiência, Workshop Carbone, Workshop Weevo, Imersão) tem uma sequência de
 * etapas. Etapa tem checks; decisão tem rotas; "par" são raias que correm juntas (ex.: Malu no começo do CEC e
 * Richard no fim). Uma etapa só destrava quando todas as anteriores da rota ativa estão feitas.
 *
 * v4.32 (pedido do Zion: "preciso conseguir preencher os checkbox a vontade quando quiser"): marca em qualquer ordem.
 * Etapa com todos os checks é "feita" mesmo que a de cima não esteja; "a vez" (avail) continua sendo a próxima da ordem.
 * Decisão do v4.25: desmarcar uma etapa NÃO apaga o que vem depois. As de baixo voltam a ficar trancadas (com as
 * marcas guardadas) e destravam de novo quando a de cima é refeita. Trocar de rota também guarda as marcas da rota
 * que saiu. Nada que a equipe marcou se perde.
 *
 * Os horários (q) são relativos ao evento: { r: 'ini' | 'fim', m: minutos } ou relógio fixo num dia relativo
 * { r: 'd', o: -1 | 0 | 1, h: 'HH:MM' } (o = dias a partir do evento: -1 véspera, 1 dia seguinte).
 * "ate": true quer dizer que é o prazo (até aquela hora), não a hora de começar.
 */

const L = {
  bone: 'https://central-de-posts.onrender.com', gal: 'https://membros.carboneeducacao.com.br/concierge/galeria',
  cec: 'https://membros.carboneeducacao.com.br/app/conselho', ligas: 'https://membros.carboneeducacao.com.br/concierge/ligas',
  plan: 'https://docs.google.com/spreadsheets/d/12A1-LNxGDEXUy3hiG6Axk1jRlBTxAJUqZWRhIDAsFN0/edit',
  ssb: 'https://gestao.grupoquatro5.com/salas', hub: 'https://www.mkthub.space/trabalho',
  pop: 'https://docs.google.com/document/d/1iz1uZxj6jeDKwT0v07ENZhTq7Nv0Hua5azhGBsQa1VE/edit?tab=t.kkt0wkjbvl7i',   // v4.32: o POP que o Zion mandou
};
const S = (id, t, o) => Object.assign({ k: 'step', id, t }, o);
const D = (id, q, br, o) => Object.assign({ k: 'dec', id, t: q, br }, o || {});
const P = (id, lanes) => ({ k: 'par', id, lanes });
const ATIVO = 'ativo', PROP = 'proposta';
const ini = m => ({ r: 'ini', m }), fim = m => ({ r: 'fim', m }), dia = (o, h) => ({ r: 'd', o, h });

// ---------------- o que é igual em todo tipo ----------------
const RAIZ = [
  S('varredura', 'Varredura do Ultron', { kind: 'agent', w: 'Seg a sex · 08:45', who: 'Ultron',
    faz: ['Lê a agenda das salas no SSB e o sistema do Clebinho', 'Cria e atualiza os cards no B.O.N.E com POP, horários e escala sugerida', 'Manda o resumo: hoje, véspera de amanhã, 7 dias, conflitos e o que verificar'],
    checks: ['Cards da semana criados ou atualizados no B.O.N.E', '"Verificar" e conflitos respondidos pelo Zion'],
    auto: [ATIVO, 'Tarefa "Ultron - Eventos SSB". Na segunda faz a leitura da semana; nos outros dias atualiza o que mudou ou saiu'],
    senao: ['B.O.N.E, SSB ou sistema pediram login: Zion entra e manda rodar de novo'], links: [['B.O.N.E', L.bone], ['Salas no SSB', L.ssb]] }),
  S('escala', 'Escala da semana', { w: 'Segunda', who: 'Zion com Malu e Richard',
    faz: ['Bater a escala da semana entre Malu e Richard', 'Regra fixa do CEC: manhã Malu no começo e Richard no fim; tarde Richard inteiro', 'Confirmar o responsável de cada card'],
    checks: ['Escala fechada com Malu e Richard', 'Todo card da semana com responsável'],
    senao: ['Card sem responsável não destrava nada: Zion define no mesmo dia'] }),
];
const aviso = p => S(p + '-agente', 'Aviso da véspera', { kind: 'agent', w: 'D-1 · 14:51', q: dia(-1, '14:51'), who: 'Ultron avisa o Zion',
  faz: ['Lista os eventos de amanhã', 'Checklist do que combinar, por pessoa', 'Rascunho de WhatsApp pronto para cada pessoa'],
  checks: ['Zion leu o aviso'], auto: [ATIVO, 'Tarefa "Ultron - Véspera dos eventos" (sexta cobre sáb, dom e seg)'] });
const capt = p => S(p + '-capt', 'Aviso ao captador', { kind: 'agent', w: 'D-1 · até 18:00', q: dia(-1, '18:00'), ate: true, who: 'B.O.N.E envia para quem está na escala',
  faz: ['Mensagem para quem está na escala com horário, local e o checklist do dia'],
  checks: ['Captador confirmou que vai'], auto: [PROP, 'Envio automático pelo B.O.N.E. Hoje o Zion manda pelo botão do card'],
  senao: ['Não confirmou até 18:00: Zion liga e, se precisar, troca a escala'] });
const cheg = (id, w, who) => S(id, 'Chegada', { w, q: ini(-30), who, faz: ['Estar no local 30 min antes do início'], checks: ['No local 30 min antes'],
  auto: [ATIVO, 'Alarme do B.O.N.E 1 h antes'], senao: ['Não chegou até o início: Zion aciona outro captador'] });
const aud = p => S(p + '-aud', 'Auditoria', { kind: 'end', w: 'D+1 · 09:15', q: dia(1, '09:15'), who: 'Ultron confere, Zion decide',
  faz: ['Confere stories, Drive, Galeria e tasks contra o card'], checks: ['Tudo conferido sem pendência'],
  auto: [PROP, 'Entra no bom-dia do dia seguinte'], senao: ['O que faltou volta para o responsável com prazo no mesmo dia'] });

// ---------------- Liga Academy ----------------
const ligaRota = (s, ugc) => [
  ...(ugc ? [S('liga-arroba' + s, '@ da turma e figurinha', { w: 'D-1', q: dia(-1, '17:00'), ate: true, who: 'Captador com Igor Maia',
    faz: ['Pedir os @ da turma ao Igor Maia', 'Deixar a figurinha da Liga pronta no celular'], checks: ['@ recebidos do Igor Maia', 'Figurinha da Liga pronta'],
    senao: ['@ não chegou: no dia posta sem marcação e marca depois'] })] : []),
  cheg('liga-cheg' + s, '06:30', 'Captador da escala'),
  S('liga-takes' + s, 'Takes gerais da abertura', { w: '07:00', q: ini(0), who: 'Captador', faz: ['Foto e vídeo, horizontal e vertical'], checks: ['Takes da abertura em H e V'] }),
  ...(ugc ? [S('liga-ugc' + s, 'UGC na hora', { w: '07:00 às 09:00', q: ini(0), who: 'Captador',
    faz: ['Foto de cada pessoa', 'Postar nos stories na mesma hora, com a figurinha, marcando a pessoa'], checks: ['Stories de todos os presentes no ar'],
    senao: ['Story não saiu na hora: postar no mesmo dia e dizer o motivo ao Zion'] })] : []),
  S('liga-pitch' + s, 'Gravar os pitchs', { w: '08:00 às 08:30', q: ini(60), who: 'Captador',
    faz: ['Pitch de todos os empresários, 30 s cada', 'Microfone na JBL, gravar em 8 bits (não RAW)'], checks: ['Pitch de todos os presentes gravado', 'Áudio conferido'],
    senao: ['Empresário sem pitch ou áudio ruim: gravar na próxima Liga e avisar o Zion'] }),
  S('liga-enc' + s, 'Takes do encerramento', { w: '08:30 às 09:00', q: ini(90), who: 'Captador', faz: ['Takes de ROTA ou EDUCACIONAL, PEC e encerramento, H e V'], checks: ['Takes do encerramento feitos'] }),
];
const TIPOS = {
  liga: { nome: 'Liga Academy', sub: 'Ter (Turma A) e qua (Turma B), 07:00 às 09:00, Auditório 3º andar', dur: 120, items: [
    aviso('liga'),
    S('liga-vesp', 'Combinar véspera', { w: 'D-1', q: dia(-1, '17:00'), ate: true, who: 'Captador', faz: ['Separar microfone, JBL e cartão com espaço', 'Ver no sistema do Clebinho o encontro aberto e os confirmados'],
      checks: ['Microfone, JBL e cartão separados', 'Confirmados vistos no sistema'], links: [['Ligas no sistema', L.ligas]] }),
    capt('liga'),
    D('liga-dec', 'É a 1ª Liga do mês? (1ª terça Turma A ou 1ª quarta Turma B)', [
      { lab: 'Sim · com UGC', items: ligaRota('-u', true) },
      { lab: 'Não · Liga normal', items: ligaRota('-n', false) }], { auto: 'liga1' }),
    S('liga-edit', 'Fotos editadas', { w: 'Até 10:00', q: fim(60), ate: true, who: 'Captador', checks: ['Fotos editadas no Drive'], senao: ['Passou das 10:00: avisar o Zion e entregar até o fim do dia'] }),
    S('liga-ent', 'Entrega no sistema', { kind: 'end', w: 'Mesmo dia', q: dia(0, '20:00'), ate: true, who: 'Captador',
      faz: ['Pitchs editados e fotos no Drive', 'Álbum na Galeria do sistema do Clebinho, com turma e data', 'Link do Drive no card do B.O.N.E'],
      checks: ['Pitchs no Drive', 'Álbum publicado na Galeria', 'Link do Drive no card'], links: [['Galeria', L.gal]] }),
    aud('liga')] },

  // ---------------- Conselho (CEC) ----------------
  cec: { nome: 'Conselho (CEC)', sub: 'Manhã 09:00 às 13:00 ou tarde 14:00 às 18:00, pelo sistema do Clebinho. Sala de Reuniões, Andar Diretoria', dur: 240, items: [
    aviso('cec'),
    S('cec-vesp', 'Combinar véspera', { w: 'D-1', q: dia(-1, '17:00'), ate: true, who: 'Zion e Richard',
      faz: ['Abrir a planilha DEPOIMENTO CEC e ver quem falta gravar no grupo', 'Cássio (ou Pedro) confirma 2 depoentes e 1 reserva', 'Pedir os @ do grupo ao Igor Maia', 'Figurinha do conselho pronta', 'Reservar a sala de depoimento (Tuanne ou Pedro) e separar o roteiro'],
      checks: ['2 depoentes + 1 reserva confirmados', '@ do grupo recebidos', 'Figurinha pronta', 'Sala de depoimento reservada', 'Roteiro e equipamento separados'],
      senao: ['Cássio não confirmou até 17:00: Zion cobra', 'Ninguém confirmado: encontro sem depoimento, só fotos', '@ não chegou: posta sem marcação e marca depois'],
      links: [['Planilha DEPOIMENTO CEC', L.plan], ['Conselhos no sistema', L.cec]] }),
    capt('cec'),
    D('cec-dec', 'O encontro é de manhã ou de tarde? (horário do sistema do Clebinho)', [
      { lab: 'Manhã · 09:00 às 13:00', items: [P('cec-par', [
        { lab: 'Malu · começo', papel: 'inicio', items: [
          cheg('cec-m-cheg', '08:30', 'Malu'),
          S('cec-m-ugc', 'Chegada e UGC', { w: '09:00', q: ini(0), who: 'Malu', faz: ['Takes gerais da chegada dos empresários', 'Foto de cada um, postar nos stories com a figurinha do conselho e marcar, na hora'],
            checks: ['Takes da chegada', 'Stories de cada membro no ar'], senao: ['Conselho começou: ninguém entra na sala. O que faltou, só por fora'] }),
          S('cec-m-sai', 'Malu sai', { w: '11:40', q: ini(160), who: 'Malu', faz: ['Subir as fotos da chegada no Drive antes de sair'], checks: ['Fotos da chegada no Drive'] })] },
        { lab: 'Richard · fim', papel: 'fim', items: [
          S('cec-m-sala', 'Montar a sala de depoimento', { w: '12:30', q: ini(210), who: 'Richard', faz: ['Tripé, luz, softbox, microfone e roteiro'], checks: ['Sala montada e testada'] }),
          S('cec-m-geral', 'Foto geral', { w: '13:00', q: fim(0), who: 'Richard', faz: ['Na porta na hora de acabar', 'Mandar na hora no grupo Marketing + Carbone, marcando Pedro e Clebinho', 'Postar nos stories'],
            checks: ['Foto geral enviada no grupo', 'Foto geral nos stories'], senao: ['Grupo saiu antes da foto: avisar o Zion; no próximo, na porta 10 min antes'] })] }])] },
      { lab: 'Tarde · 14:00 às 18:00', items: [
        cheg('cec-t-cheg', '13:30', 'Richard'),
        S('cec-t-ugc', 'Chegada e UGC', { w: '14:00', q: ini(0), who: 'Richard', faz: ['Takes gerais da chegada', 'Foto de cada um, postar nos stories com a figurinha e marcar, na hora'],
          checks: ['Takes da chegada', 'Stories de cada membro no ar'], senao: ['Conselho começou: ninguém entra na sala'] }),
        S('cec-t-sala', 'Montar a sala de depoimento', { w: '17:30', q: ini(210), who: 'Richard', faz: ['Tripé, luz, softbox, microfone e roteiro'], checks: ['Sala montada e testada'] }),
        S('cec-t-geral', 'Foto geral', { w: '18:00', q: fim(0), who: 'Richard', faz: ['Na porta na hora de acabar', 'Mandar no grupo Marketing + Carbone marcando Pedro e Clebinho', 'Postar nos stories'],
          checks: ['Foto geral enviada no grupo', 'Foto geral nos stories'] })] }], { auto: 'turno' }),
    D('cec-dep', 'Os 2 depoentes combinados estão lá?', [
      { lab: 'Sim', items: [S('cec-dep-ok', 'Gravar os 2 depoimentos', { w: '13:05 ou 18:05', q: fim(5), who: 'Richard', faz: ['Roteiro de perguntas, um de cada vez'], checks: ['Depoimento 1 gravado', 'Depoimento 2 gravado'] })] },
      { lab: 'Faltou alguém', items: [S('cec-dep-res', 'Gravar com o reserva', { w: '13:05 ou 18:05', q: fim(5), who: 'Richard', faz: ['Grava quem veio e o reserva', 'Sem reserva: avisa o Cássio e remarca para o próximo encontro'],
        checks: ['Depoimentos possíveis gravados', 'Cássio avisado de quem faltou'] })] }]),
    S('cec-drive', 'Subir no Drive', { w: 'Até 14:00 ou 19:00', q: fim(60), ate: true, who: 'Richard', checks: ['Fotos editadas no Drive', 'Depoimentos brutos no Drive'] }),
    S('cec-plan', 'Atualizar a planilha', { w: 'Mesmo dia', q: dia(0, '20:00'), ate: true, who: 'Richard', checks: ['Planilha DEPOIMENTO CEC com quem gravou'], links: [['Planilha DEPOIMENTO CEC', L.plan]] }),
    S('cec-tasks', 'Tasks de depoimento', { w: 'Mesmo dia', q: dia(0, '20:00'), ate: true, who: 'Richard', faz: ['Uma task por depoimento no MKT Hub, com o link do Drive e o nome do membro'],
      checks: ['Uma task criada por depoimento'], links: [['MKT Hub', L.hub]] }),
    S('cec-edicao', 'Mandar para a edição', { kind: 'end', w: 'Mesmo dia', q: dia(0, '20:00'), ate: true, who: 'Richard', faz: ['Ligar as tasks de depoimento na task de edição do vídeo'], checks: ['Tasks ligadas à task de edição'] }),
    aud('cec')] },
};
function eventoSimples(p, nome, sub, arroba, fig, carbone) {
  return { nome, sub, dur: 180, items: [
    aviso(p),
    S(p + '-vesp', 'Combinar véspera', { w: 'D-1', q: dia(-1, '17:00'), ate: true, who: 'Captador com ' + arroba,
      faz: ['Pedir a lista de participantes e os @ a ' + arroba, 'Deixar a ' + fig + ' pronta', 'Separar câmera, cartão e bateria'],
      checks: ['@ recebidos de ' + arroba, 'Figurinha pronta', 'Equipamento separado'], senao: ['@ não chegou: posta sem marcação e marca depois', 'Figurinha não existe: avisar o Zion na véspera'] }),
    capt(p), cheg(p + '-cheg', '30 min antes', 'Captador da escala'),
    S(p + '-ugc', 'Stories de cada pessoa', { w: 'Primeira hora', q: ini(0), who: 'Captador', faz: ['Foto de cada pessoa, postar e marcar com a ' + fig], checks: ['Stories de cada participante no ar'],
      senao: ['Não saiu na hora: postar no mesmo dia e dizer o motivo ao Zion'] }),
    S(p + '-takes', 'Fotos gerais e takes', { w: 'Durante', q: ini(60), who: 'Captador', checks: ['Fotos gerais', 'Takes de banco em H e V'] }),
    S(p + '-edit', 'Fotos editadas', { w: 'Fim + 1 h', q: fim(60), ate: true, who: 'Captador', checks: ['Fotos editadas no Drive' + (carbone ? '' : ' da Weevo')], senao: ['Passou de 1 h: avisar o Zion e entregar até o fim do dia'] }),
    S(p + '-ent', 'Entrega', { kind: 'end', w: 'Mesmo dia', q: dia(0, '20:00'), ate: true, who: 'Captador', checks: carbone ? ['Álbum na Galeria do sistema do Clebinho', 'Link do Drive no card'] : ['Link do Drive no card'], links: carbone ? [['Galeria', L.gal]] : [] }),
    aud(p)] };
}
TIPOS.exp = eventoSimples('exp', 'Experiência Carbone', 'Só quando a turma fecha. Data e horário no SSB e no sistema do Clebinho', 'Igor Maia', 'figurinha da Experiência Carbone', true);
TIPOS.wsc = eventoSimples('wsc', 'Workshop Carbone', 'Workshops internos e externos da Carbone', 'Igor Maia', 'figurinha "Workshop Carbone + tema"', true);
TIPOS.wsw = eventoSimples('wsw', 'Workshop Weevo', 'Só quando a turma fecha. Stories na @weevo_edu', 'Raí', 'figurinha do Workshop Weevo', false);
TIPOS.ime = { nome: 'Imersão Weevo', sub: 'Abertas ou in company, só quando a turma fecha. Repete por dia de imersão', dur: 480, items: [
  aviso('ime'),
  S('ime-vesp', 'Combinar véspera', { w: 'D-1', q: dia(-1, '17:00'), ate: true, who: 'Captador com Raí', faz: ['Lista e @ com o Raí', 'Figurinha da Imersão pronta', 'Backdrop confirmado'], checks: ['@ recebidos do Raí', 'Figurinha pronta', 'Backdrop confirmado'] }),
  capt('ime'), cheg('ime-cheg', '30 min antes', 'Captadores'),
  D('ime-dec', 'Tem 2 captadores?', [
    { lab: 'Sim · 2 captadores', items: [P('ime-par', [
      { lab: 'Captador 1 · backdrop', papel: 'backdrop', items: [S('ime-bk', 'Backdrop', { w: 'Abertura', q: ini(0), who: 'Captador 1', faz: ['Foto de cada pessoa no backdrop com a câmera', 'Editar, postar e marcar com a figurinha no mesmo dia'], checks: ['Todos fotografados no backdrop', 'Fotos postadas e marcadas'] })] },
      { lab: 'Captador 2 · takes', papel: 'takes', items: [S('ime-tk', 'Takes e fotos gerais', { w: 'Durante', q: ini(30), who: 'Captador 2', checks: ['Fotos gerais', 'Takes de banco em H e V'] })] }])] },
    { lab: 'Não · 1 captador', items: [
      S('ime-bk1', 'Backdrop primeiro', { w: 'Abertura', q: ini(0), who: 'Captador', faz: ['Foto de cada pessoa no backdrop, postar e marcar'], checks: ['Todos fotografados no backdrop', 'Fotos postadas e marcadas'] }),
      S('ime-tk1', 'Takes depois', { w: 'Durante', q: ini(60), who: 'Captador', checks: ['Fotos gerais', 'Takes de banco em H e V'] })] }], { auto: 'dupla' }),
  S('ime-edit', 'Fotos editadas', { w: 'Fim + 1 h', q: fim(60), ate: true, who: 'Captadores', checks: ['Fotos no Drive da Weevo, pasta do dia'] }),
  S('ime-ent', 'Entrega', { kind: 'end', w: 'Mesmo dia', q: dia(0, '20:00'), ate: true, who: 'Captadores', checks: ['Link do Drive no card'] }),
  aud('ime')] };
const ORDEM = ['liga', 'cec', 'exp', 'wsc', 'wsw', 'ime'];
/** Os papéis da escala: quem faz o quê no dia (as raias). "apoio" e o responsável fazem as etapas fora das raias. */
const PAPEIS = { apoio: 'Apoio', inicio: 'Começo (CEC manhã)', fim: 'Fim (CEC manhã)', backdrop: 'Backdrop (Imersão)', takes: 'Takes (Imersão)' };

// ---------------- o grafo de cada tipo (montado uma vez) ----------------
function monta(items) {
  const nos = {}, ordem = [], preds = {}, succ = {};
  const liga = (a, b) => { (succ[a] = succ[a] || []).push(b); (preds[b] = preds[b] || []).push(a); };
  (function place(its, prev, ctx, raia) {
    for (const it of its) {
      if (it.k === 'step' || it.k === 'dec') {
        nos[it.id] = { def: it, ctx, raia: raia || null }; ordem.push(it.id);
        prev.forEach(p => liga(p, it.id));
        prev = [it.id];
        if (it.k === 'dec') {
          let lasts = [];
          it.br.forEach((br, i) => { lasts = lasts.concat(place(br.items, [it.id], ctx.concat([[it.id, i]]), raia)); });
          prev = lasts;
        }
      } else if (it.k === 'par') {
        let lasts = [];
        it.lanes.forEach(ln => { lasts = lasts.concat(place(ln.items, prev, ctx, ln.papel || raia)); });
        prev = lasts;
      }
    }
    return prev;
  })(items, [], [], null);
  return { nos, ordem, preds, succ };
}
const GRAFO = {};
for (const k of ORDEM) GRAFO[k] = monta(TIPOS[k].items);

// ---------------- o tipo do evento pelo título ----------------
const sem = x => String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
/** Liga / conselho|cec / experiência / workshop (+ Weevo) / imersão. Sem casar, null (o evento fica sem fluxo). */
function inferir(titulo, aba) {
  const t = sem(titulo), weevo = /weevo/.test(t) || sem(aba) === 'weevo';
  if (/\bliga\b/.test(t)) return 'liga';
  if (/conselho|\bcec\b/.test(t)) return 'cec';
  if (/imersao/.test(t)) return 'ime';
  if (/workshop|\bwork shop\b/.test(t)) return weevo ? 'wsw' : 'wsc';
  if (/experiencia/.test(t)) return 'exp';
  return null;
}

// ---------------- as decisões automáticas ----------------
const semana = d => new Date(Date.parse(d + 'T12:00:00Z')).getUTCDay();
/** A rota que o sistema escolhe sozinho (a escolha à mão vence). undefined = sem como saber. */
function autoDe(def, ctx) {
  if (def.auto === 'liga1') {   // 1ª terça (Turma A) ou 1ª quarta (Turma B) do mês tem UGC
    const w = semana(ctx.d), dm = +ctx.d.slice(8, 10);
    return (w === 2 || w === 3) && dm <= 7 ? 0 : 1;
  }
  if (def.auto === 'turno') { if (!ctx.h) return undefined; return ctx.h < '12:00' ? 0 : 1; }   // manhã ou tarde pelo horário do sistema do Clebinho
  if (def.auto === 'dupla') { if (!ctx.nEscala) return undefined; return ctx.nEscala >= 2 ? 0 : 1; }   // 2 captadores na escala: raias juntas
  return undefined;
}

// ---------------- o estado de um dia do evento ----------------
/**
 * tipo: liga|cec|...; st: { rotas: {decId: i}, etapas: {stepId: [marca|null]} }; ctx: { d, h, hf, nEscala }.
 * Devolve { rotas (as que valem), auto (as automáticas), est: {id: 'x'|'done'|'avail'|'locked'}, feitas, total, prox }.
 */
function estado(tipo, st, ctx) {
  const g = GRAFO[tipo];
  if (!g) return null;
  st = st || {};
  const manual = st.rotas || {}, etapas = st.etapas || {}, rotas = {}, auto = {};
  for (const id of g.ordem) {
    const n = g.nos[id];
    if (n.def.k !== 'dec') continue;
    const a = autoDe(n.def, ctx || {});
    if (a !== undefined) auto[id] = a;
    if (Number.isInteger(manual[id])) rotas[id] = manual[id]; else if (a !== undefined) rotas[id] = a;
  }
  const on = c => c.every(([d, i]) => rotas[d] === i);
  const fora = c => c.some(([d, i]) => rotas[d] !== undefined && rotas[d] !== i);
  const memo = {};
  const marcas = id => (etapas[id] || []);
  function feito(id) {
    if (id in memo) return memo[id];
    memo[id] = false;   // trava contra ciclo (não há, mas garante)
    const n = g.nos[id];
    let r;
    if (!on(n.ctx)) r = false;   // v4.32: feita é feita, em qualquer ordem (só a rota que não vale fica de fora)
    else if (n.def.k === 'dec') r = rotas[id] !== undefined;
    else { const cs = n.def.checks || [], m = marcas(id); r = cs.length > 0 && cs.every((_, j) => !!m[j]); }
    return (memo[id] = r);
  }
  function livre(id) {
    const n = g.nos[id];
    if (!on(n.ctx)) return false;
    const todos = g.preds[id] || [];
    if (!todos.length) return true;
    const ps = todos.filter(p => on(g.nos[p].ctx));
    return ps.length > 0 && ps.every(feito);
  }
  const est = {};
  let feitas = 0, total = 0, prox = null;
  // pra contar, a decisão ainda sem rota conta a 1ª (senão as duas rotas somariam)
  const rotasConta = Object.assign({}, rotas);
  for (const id of g.ordem) if (g.nos[id].def.k === 'dec' && rotasConta[id] === undefined) rotasConta[id] = 0;
  const conta = c => c.every(([d, i]) => rotasConta[d] === i);
  for (const id of g.ordem) {
    const n = g.nos[id];
    est[id] = fora(n.ctx) ? 'x' : feito(id) ? 'done' : livre(id) ? 'avail' : 'locked';
    if (n.def.k === 'step' && conta(n.ctx)) { total++; if (est[id] === 'done') feitas++; }
    if (!prox && n.def.k !== 'par' && est[id] === 'avail') prox = id;
  }
  return { rotas, auto, est, feitas, total, prox };
}

// ---------------- o horário de cada etapa ----------------
const hm = min => { const m = ((min % 1440) + 1440) % 1440; return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };
const mins = h => (h && /^\d\d:\d\d$/.test(h) ? +h.slice(0, 2) * 60 + +h.slice(3) : null);
const somaD = (iso, n) => new Date(Date.parse(iso + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
/** { d, h } da etapa num dia do evento (sem horário do evento, só o que é relógio fixo). null = sem hora. */
function quando(tipo, id, ctx) {
  const g = GRAFO[tipo], n = g && g.nos[id];
  if (!n || !n.def.q || !ctx || !ctx.d) return null;
  const q = n.def.q;
  if (q.r === 'd') return { d: somaD(ctx.d, q.o), h: q.h };
  const i = mins(ctx.h);
  if (i === null) return null;
  const f = mins(ctx.hf) !== null && mins(ctx.hf) > i ? mins(ctx.hf) : i + (TIPOS[tipo].dur || 180);
  const t = (q.r === 'ini' ? i : f) + q.m;
  return { d: somaD(ctx.d, Math.floor(t / 1440)), h: hm(t) };
}
/** O fim do evento num dia (hf ou início + a duração do tipo). */
function fimDe(tipo, h, hf) {
  const i = mins(h);
  if (i === null) return '';
  if (mins(hf) !== null && mins(hf) > i) return hf;
  return hm(i + ((TIPOS[tipo] && TIPOS[tipo].dur) || 180));
}

// ---------------- quem faz a etapa ----------------
/** O papel da raia da etapa (inicio/fim/backdrop/takes) ou null (todos da escala). */
const raiaDe = (tipo, id) => { const n = GRAFO[tipo] && GRAFO[tipo].nos[id]; return n ? n.raia : null; };
const ehAgente = (tipo, id) => { const n = GRAFO[tipo] && GRAFO[tipo].nos[id]; return !!(n && n.def.kind === 'agent'); };
const no = (tipo, id) => (GRAFO[tipo] && GRAFO[tipo].nos[id]) || null;

// ---------------- o que vai pra tela (/api/fluxos) ----------------
const limpa = it => {
  if (it.k === 'step') return Object.assign({}, it);
  if (it.k === 'dec') return Object.assign({}, it, { br: it.br.map(b => ({ lab: b.lab, items: b.items.map(limpa) })) });
  return { k: 'par', id: it.id, lanes: it.lanes.map(l => ({ lab: l.lab, papel: l.papel || null, items: l.items.map(limpa) })) };
};
const DEF = { raiz: RAIZ.map(limpa), ordem: ORDEM, papeis: PAPEIS, links: L,
  tipos: Object.fromEntries(ORDEM.map(k => [k, { nome: TIPOS[k].nome, sub: TIPOS[k].sub, dur: TIPOS[k].dur, items: TIPOS[k].items.map(limpa) }])) };
const DEF_JSON = JSON.stringify(DEF);
const DEF_ETAG = 'W/"fx-' + require('crypto').createHash('sha1').update(DEF_JSON).digest('hex').slice(0, 16) + '"';

module.exports = { TIPOS, ORDEM, PAPEIS, GRAFO, inferir, estado, quando, fimDe, raiaDe, ehAgente, no, DEF_JSON, DEF_ETAG, nome: k => (TIPOS[k] ? TIPOS[k].nome : '') };
