// B.O.N.E · banco de cada empresa (v3.83). Arquivo separado do index.html (regra 8 das INSTRUCOES: arquivos
// pequenos por responsabilidade). Usa o que o painel define (S, api, toast, icon, esc, contasDaAba, contaCor,
// contaCurta, drawerSec, cardEl, slotsVisiveis, slotMatch, matchBusca, openEdit, loadState, brData, nomeAba, BIN_SVG, $):
// as funções daqui só rodam depois que o painel carregou. Servidor em lib/banco.js.
'use strict';
// ================= banco de cada empresa (v3.83) =================
// Pedido do Zion em 28/09/2026: a gaveta vira o banco da empresa aberta, só com as seções dela. Cada item é um link
// + um texto. Arrastar pro dia cria o post com o link (no campo Drive / referência). Reutilizar sai do banco ao virar
// post; Drive, Referência e Cortes ficam (contam o uso) e saem no Concluído. No fim, "Sem dia": posts tirados do
// calendário (só aparece quando tem). Servidor em lib/banco.js.
// v3.96: o link do Drive já vem com o nome do arquivo e só o ADMIN escreve outro título; o ADMIN também anota à mão
// quantas vezes o item foi usado e o último uso (os dois opcionais). Depoimentos da Weevo em Workshop e Imersão.
const BANCO_SEC = {
  reutilizar: { nome:'Reutilizar', icone:'refresh', fica:false, padrao:'Post pra refazer', phUrl:'link do post antigo (Instagram, TikTok…)', phTit:'o que refazer (opcional)',
    vazio:'Guarde posts antigos que dá pra refazer. Arrastou pro dia, vira post e sai daqui.' },
  drive: { nome:'Drive de conteúdos', icone:'folder', fica:true, padrao:'Conteúdo do Drive', phUrl:'link do Drive', phTit:'título (vazio: o nome do arquivo no Drive)',
    vazio:'Guarde os links do Drive com o que é cada um. Arraste pro dia quantas vezes precisar; sai daqui no Concluído.' },
  referencia: { nome:'Referência de posts', icone:'bookmark', fica:true, padrao:'Referência', phUrl:'link do post (Instagram, TikTok, YouTube…)', phTit:'nota: por que é boa (opcional)',
    vazio:'Guarde posts que inspiram, de qualquer rede. Arraste pro dia pra virar post; sai daqui no Concluído.' },
  cortes: { nome:'Cortes de podcasts', icone:'mic', fica:true, padrao:'Corte de podcast', phUrl:'link do corte (Drive ou outro site)', phTit:'título (vazio: o nome do arquivo no Drive)',
    vazio:'Guarde os cortes prontos (link do Drive ou de outro site). Arraste pro dia; sai daqui no Concluído.' },
  // v3.96 (pedido do Zion): depoimentos de clientes e alunos. Fica no banco e mostra quantas vezes e onde foi usado.
  depoimentos: { nome:'Depoimentos', icone:'msg', fica:true, padrao:'Depoimento', phUrl:'link do depoimento (Drive, Instagram, YouTube…)', phTit:'de quem é e sobre o quê (vazio: o nome no Drive)',
    vazio:'Guarde os depoimentos de clientes e alunos. Arraste pro dia ou use "Do banco" no card do dia; fica aqui e mostra onde já foi usado.' },
  // v3.96 (pedido do Zion): na Weevo, os depoimentos separados em Workshop e Imersão
  'depoimentos-workshop': { nome:'Depoimentos · Workshop', icone:'msg', fica:true, padrao:'Depoimento do Workshop', phUrl:'link do depoimento do Workshop', phTit:'de quem é e sobre o quê (vazio: o nome no Drive)',
    vazio:'Depoimentos de quem fez o Workshop. Arraste pro dia ou use "Do banco" no card do dia; fica aqui e mostra onde já foi usado.' },
  'depoimentos-imersao': { nome:'Depoimentos · Imersão', icone:'msg', fica:true, padrao:'Depoimento da Imersão', phUrl:'link do depoimento da Imersão', phTit:'de quem é e sobre o quê (vazio: o nome no Drive)',
    vazio:'Depoimentos de quem fez a Imersão. Arraste pro dia ou use "Do banco" no card do dia; fica aqui e mostra onde já foi usado.' },
};
// v3.96: o que pode ser o material de um post pelo "Do banco" (Referência é inspiração, não material)
const BANCO_MATERIAL = ['cortes','depoimentos','depoimentos-workshop','depoimentos-imersao','reutilizar','drive'];
const BANCO_ABA = { 'SEUBONÉ':['reutilizar','drive','referencia'], 'CARBONE':['cortes','depoimentos','drive','referencia'], 'WEEVO':['cortes','depoimentos-workshop','depoimentos-imersao','drive','referencia'], 'ONEVO':['drive','referencia'] };
function bancoSecoes(aba){ return BANCO_ABA[aba] || ['drive','referencia']; }
/** De onde é o link: ícone genérico (sem logo de marca), o nome da rede e o resto do endereço (no Drive, o tipo). */
function bancoOrigem(url){
  let h = '', path = '';
  try{ const u = new URL(url); h = u.hostname.replace(/^www\./,'').toLowerCase(); path = decodeURIComponent(u.pathname).replace(/^\/+|\/+$/g,''); }
  catch(e){ return { icone:'link', nome:'link', resto:String(url||'') }; }
  const de = (...ds)=> ds.some(d=> h===d || h.endsWith('.'+d));
  if(de('drive.google.com','docs.google.com')){
    const tipo = /\/folders\//.test(url) ? 'pasta' : /\/document\//.test(url) ? 'documento' : /\/spreadsheets\//.test(url) ? 'planilha'
      : /\/presentation\//.test(url) ? 'apresentação' : /\/file\//.test(url) ? 'arquivo' : '';
    return { icone:'folder', nome:'Drive', resto:tipo };
  }
  if(de('instagram.com')) return { icone:'image', nome:'Instagram', resto:path };
  if(de('tiktok.com')) return { icone:'film', nome:'TikTok', resto:path };
  if(de('youtube.com','youtu.be')) return { icone:'film', nome:'YouTube', resto:path };
  if(de('facebook.com','fb.watch')) return { icone:'image', nome:'Facebook', resto:path };
  if(de('pinterest.com','pin.it')) return { icone:'image', nome:'Pinterest', resto:path };
  if(de('linkedin.com')) return { icone:'link', nome:'LinkedIn', resto:path };
  if(de('x.com','twitter.com')) return { icone:'link', nome:'X', resto:path };
  return { icone:'link', nome:h || 'link', resto:path };
}
function bancoMatch(it){ return matchBusca([it.titulo, it.url, bancoOrigem(it.url).nome, (BANCO_SEC[it.sec]||{}).nome].join(' ')); }
function bancoItemEl(it){
  const o = bancoOrigem(it.url), sec = BANCO_SEC[it.sec] || BANCO_SEC.drive;
  const d = document.createElement('div');
  d.className = 'ref bk'; d.draggable = true; d.dataset.id = it.id;
  d.title = 'Arraste pro dia pra virar post' + (it.por ? ' · guardado por '+it.por : '');
  d.innerHTML =
    '<div class="ic-wrap">'+icon(o.icone)+'</div>'+
    '<div class="rb"><div class="rn">'+esc(it.titulo || sec.padrao)+'</div>'+
      '<div class="ru"><b>'+esc(o.nome)+'</b>'+(it.tituloDrive && it.tituloDrive !== it.titulo ? ' · '+esc(it.tituloDrive) : o.resto ? ' · '+esc(o.resto) : '')+'</div>'+
      (sec.fica && (it.usos || it.usadoDia) ? '<button type="button" class="usochip" data-a="onde" aria-expanded="'+(S.bancoOnde===it.id)+'" title="'+esc(bancoUsoTitulo(it))+': clique pra ver onde">'+esc(bancoUsoTxt(it))+'</button>' : '')+
      (S.bancoOnde===it.id ? bancoOndeHtml(it) : '')+'</div>'+
    '<div class="ra">'+
      '<a href="'+esc(it.url)+'" target="_blank" rel="noopener" title="Abrir o link" aria-label="Abrir o link">'+icon('external','s')+'</a>'+
      '<button data-a="edit" title="Editar" aria-label="Editar">'+icon('pencil','s')+'</button>'+
      (sec.fica ? '<button data-a="tira" class="bk-ok" title="Concluído: tirar do banco (Ctrl+Z desfaz)" aria-label="Concluído">'+icon('check','s')+'</button>'
                : '<button data-a="tira" class="bin mini" title="Excluir do banco (Ctrl+Z desfaz)" aria-label="Excluir">'+BIN_SVG+'</button>')+
    '</div>';
  d.addEventListener('dragstart', ev=>{ S.dragging=true; d.classList.add('dragging'); ev.dataTransfer.setData('text/plain','bk:'+it.id); ev.dataTransfer.effectAllowed='move'; });
  d.addEventListener('dragend', ()=>{ S.dragging=false; d.classList.remove('dragging'); });
  d.querySelector('[data-a=edit]').onclick = ()=>{
    S.bancoEdit = it.id; renderDrawer();
    const f = document.querySelector('#drBody .refform[data-sec="'+it.sec+'"] .bkU'); if(f){ f.focus(); f.select(); }
  };
  d.querySelector('[data-a=tira]').onclick = ()=> bancoTirar(it);
  const on = d.querySelector('[data-a=onde]');
  if(on){ on.onclick = ev=>{ ev.stopPropagation(); S.bancoOnde = S.bancoOnde===it.id ? null : it.id; renderDrawer(); }; on.draggable = false; }
  d.querySelectorAll('[data-onde]').forEach(b=> b.onclick = ev=>{ ev.stopPropagation(); irParaPost(b.dataset.onde); });
  return d;
}
/** v3.96: onde o item já virou post (o mais novo primeiro). Clique leva até o post, que pisca. */
function bancoOndeHtml(it){
  const l = it.onde || [], semReg = Math.max(0, (it.usos || 0) - l.length);
  const mao = semReg || it.usadoDia
    ? '<span class="bk-ondev" title="Uso anotado à mão pelo ADMIN, ou de antes da v3.96 (sem o registro do post)">'+icon('pencil')+
        (semReg ? semReg+' uso'+(semReg>1?'s':'')+' sem o post registrado' : 'anotado à mão')+(it.usadoDia ? ' · último uso '+brData(it.usadoDia)+'/'+it.usadoDia.slice(2,4) : '')+'</span>'
    : '';
  if(!l.length) return '<div class="bk-onde">'+mao+'</div>';
  return '<div class="bk-onde">'+l.map(o=>{
    const s = S.slots.find(x=>x.id===o.slot), d = (s && s.date) || o.date;
    const rot = (d ? tfDia(d) : 'sem dia')+' · '+esc(contaCurta(s ? s.conta : o.conta));
    return s ? '<button type="button" data-onde="'+esc(o.slot)+'" title="Ver esse post no calendário">'+icon('calendar')+rot+'</button>'
             : '<span class="bk-ondev" title="Esse post foi excluído ou mudou de empresa">'+icon('calendar')+rot+' · post excluído</span>';
  }).join('')+mao+'</div>';
}
/** v3.96: o último uso: o mais recente entre o dia anotado à mão e o dia dos posts registrados ('' se não tem). */
function bancoUltimoUso(it){
  return [it.usadoDia || ''].concat((it.onde || []).map(o=>{ const s = S.slots.find(x=>x.id===o.slot); return (s && s.date) || o.date || ''; }))
    .filter(Boolean).sort().pop() || '';
}
/** v3.96: o texto do chip ("3x usado · 12/09") e a dica dele. */
function bancoUsoTxt(it){ const u = bancoUltimoUso(it); return (it.usos ? it.usos+'x usado' : 'usado')+(u ? ' · '+brData(u) : ''); }
function bancoUsoTitulo(it){
  const u = bancoUltimoUso(it);
  return (it.usos ? 'Usado '+it.usos+' vez'+(it.usos>1?'es':'') : 'Já foi usado')+(u ? ', o último em '+brData(u)+'/'+u.slice(0,4) : '');
}
/** v3.96: os materiais da empresa pro "Do banco" do card do dia (cortes, depoimentos, Reutilizar e Drive). */
function bancoMateriais(aba){
  const secs = bancoSecoes(aba).filter(k=>BANCO_MATERIAL.includes(k));
  return secs.map(k=>({ sec:k, itens:(S.banco||[]).filter(x=>x.aba===aba && x.sec===k) })).filter(g=>g.itens.length);
}
/** Link + texto de uma seção. Enter guarda; editando, Esc cancela. */
function bancoForm(sk){
  const sec = BANCO_SEC[sk];
  const ed = S.bancoEdit ? (S.banco||[]).find(x=>x.id===S.bancoEdit && x.sec===sk && x.aba===S.aba) : null;
  const adm = souAdmin(), comUso = adm && sec.fica;            // v3.96: título e uso à mão só pro ADMIN
  const f = document.createElement('div'); f.className = 'refform'; f.dataset.sec = sk;
  f.innerHTML =
    '<div class="bk-add"><input class="bkU" placeholder="'+esc(sec.phUrl)+'" autocomplete="off" inputmode="url" aria-label="Link pra guardar em '+esc(sec.nome)+'">'+
      '<button class="bk-mais" title="'+(ed ? 'Salvar a edição (Enter)' : 'Guardar (Enter)')+'" aria-label="'+(ed ? 'Salvar a edição' : 'Guardar')+'">'+icon(ed ? 'check' : 'plus')+'</button></div>'+
    (adm ? '<div class="bk-add bkT-linha"'+(ed ? '' : ' hidden')+'><input class="bkT" placeholder="'+esc(sec.phTit)+'" maxlength="140" autocomplete="off" aria-label="Título">'+
      (ed && !comUso ? '<button class="rfcancel">cancelar</button>' : '')+'</div>' : '')+
    (comUso ? '<div class="bk-add bk-uso"'+(ed ? '' : ' hidden')+'>'+
      '<label title="Quantas vezes já foi usado, contando fora do painel (opcional; o painel soma quando vira post)">usado <input class="bkN" type="number" min="0" max="999" step="1" inputmode="numeric" placeholder="0" aria-label="Quantas vezes já foi usado"> vezes</label>'+
      '<label title="O dia do último uso (opcional)">último <input class="bkD" type="date" aria-label="Dia do último uso"></label>'+
      (ed ? '<button class="rfcancel">cancelar</button>' : '')+'</div>' : '')+
    (ed && !adm ? '<div class="bk-add"><button class="rfcancel">cancelar</button></div>' : '');
  const iu = f.querySelector('.bkU'), itx = f.querySelector('.bkT'), inN = f.querySelector('.bkN'), inD = f.querySelector('.bkD');
  const linhas = [...f.querySelectorAll('.bkT-linha, .bk-uso')];
  if(ed){ iu.value = ed.url; if(itx) itx.value = ed.titulo || ''; if(inN) inN.value = ed.usos || ''; if(inD) inD.value = ed.usadoDia || ''; }
  const salvar = ()=> bancoSalvar(sk, { iu, itx, inN, inD, bt: f.querySelector('.bk-mais') }, ed);
  f.querySelector('.bk-mais').onclick = salvar;
  // os campos do ADMIN aparecem quando já tem link (o formulário vazio ocupa 1 linha só)
  iu.addEventListener('input', ()=>{ if(!ed) linhas.forEach(l=> l.hidden = !iu.value.trim()); });
  f.querySelectorAll('input').forEach(inp=> inp.addEventListener('keydown', ev=>{
    if(ev.key==='Enter'){ ev.preventDefault(); salvar(); }
    else if(ev.key==='Escape' && ed){ ev.stopPropagation(); S.bancoEdit = null; renderDrawer(); }
  }));
  f.querySelectorAll('.rfcancel').forEach(c=> c.onclick = ()=>{ S.bancoEdit = null; renderDrawer(); });
  return f;
}
/** v3.96: o motivo de o link do Drive não ter vindo com o nome do arquivo, pra pessoa saber o que fazer. */
function bancoMotivoDrive(m){
  return m==='restrito' ? 'o link do Drive está restrito (pra puxar o nome, ele precisa estar como "Qualquer pessoa com o link")'
    : m==='nao-achou' ? 'o Drive não achou esse arquivo' : 'o Drive não respondeu a tempo';
}
async function bancoSalvar(sk, c, ed){
  const url = c.iu.value.trim();
  if(!/^https?:\/\/\S+$/i.test(url)){ toast('Cole o link completo (começa com https://)', true); c.iu.focus(); return; }
  if(c.bt.disabled) return;
  // v3.96: só o ADMIN manda título e uso à mão (o servidor confere); sem título, o link do Drive vem com o nome do arquivo
  // só vai o que mudou no lápis (outra pessoa pode ter usado o item enquanto o formulário estava aberto)
  const corpo = { url }, antes = (k, v) => String(ed ? (ed[k] || '') : '') !== v;
  if(c.itx && antes('titulo', c.itx.value.trim())) corpo.titulo = c.itx.value.trim();
  if(c.inN && antes('usos', c.inN.value.trim())) corpo.usos = c.inN.value.trim();
  if(c.inD && antes('usadoDia', c.inD.value)) corpo.usadoDia = c.inD.value;
  c.bt.disabled = true; c.bt.classList.add('carregando');
  try{
    const r = ed ? await api('/api/banco/'+ed.id, {method:'PATCH', body:JSON.stringify(corpo)})
                 : await api('/api/banco', {method:'POST', body:JSON.stringify(Object.assign({aba:S.aba, sec:sk}, corpo))});
    if(ed){ const i = S.banco.findIndex(x=>x.id===ed.id); if(i>=0) S.banco[i] = r.item; S.bancoEdit = null; }
    else S.banco = [r.item].concat(S.banco||[]);
    renderDrawer();
    const d = r.drive;
    if(d && d.ok) toast((ed ? 'Atualizado' : 'Guardado')+' com o nome do Drive: "'+r.item.titulo+'" · Ctrl+Z desfaz', false, 4200);
    else if(d) toast((ed ? 'Atualizado' : 'Guardado')+' sem o nome: '+bancoMotivoDrive(d.motivo)+(souAdmin() ? '. Dá pra escrever o título no lápis.' : '. Um ADMIN pode dar o título.'), false, 7000);
    else toast((ed ? 'Atualizado' : 'Guardado em '+BANCO_SEC[sk].nome)+' · Ctrl+Z desfaz');
    if(!ed){ const nf = document.querySelector('#drBody .refform[data-sec="'+sk+'"] .bkU'); if(nf) nf.focus(); }
  }catch(e){ toast(e.message, true); }
  finally{ if(c.bt.isConnected){ c.bt.disabled = false; c.bt.classList.remove('carregando'); } }
}
async function bancoTirar(it){
  try{
    await api('/api/banco/'+it.id, {method:'DELETE'});
    S.banco = (S.banco||[]).filter(x=>x.id!==it.id);
    if(S.bancoEdit===it.id) S.bancoEdit = null;
    renderDrawer();
    toast(((BANCO_SEC[it.sec]||{}).fica ? 'Concluído: saiu do banco' : 'Excluído do banco')+' · Ctrl+Z desfaz');
  }catch(e){ toast(e.message, true); }
}
/** Empresa com 2 contas (Carbone, Onevo): pergunta pra qual conta vai o post, ali onde soltou. Esc cancela. */
function escolheConta(x, y, contas){
  return new Promise(res=>{
    const m = document.createElement('div'); m.className = 'vagapop bk-escolhe'; m.id = 'bkEscolhe'; m.setAttribute('role','menu');
    m.innerHTML = '<h4>Pra qual conta?</h4>'+contas.map(k=>'<button type="button" role="menuitem" data-k="'+esc(k)+'"><i style="background:'+contaCor(k)+'"></i>'+esc(contaCurta(k))+'</button>').join('');
    document.body.appendChild(m);
    const r = m.getBoundingClientRect();
    m.style.left = Math.max(8, Math.min(x + 6, innerWidth - r.width - 8))+'px';
    m.style.top = Math.max(8, Math.min(y + 6, innerHeight - r.height - 8))+'px';
    const fecha = v=>{ document.removeEventListener('mousedown', fora, true); document.removeEventListener('keydown', tecla, true); m.remove(); res(v); };
    const fora = ev=>{ if(!m.contains(ev.target)) fecha(null); };
    const tecla = ev=>{ if(ev.key==='Escape'){ ev.preventDefault(); ev.stopPropagation(); fecha(null); } };
    m.querySelectorAll('button').forEach(b=> b.onclick = ()=> fecha(b.dataset.k));
    setTimeout(()=>{ document.addEventListener('mousedown', fora, true); document.addEventListener('keydown', tecla, true); const b = m.querySelector('button'); if(b) b.focus(); }, 0);
  });
}
/** Soltou um item do banco num dia: vira post (numa empresa com 2 contas, pergunta qual). */
async function bancoUsar(id, date, ev){
  const it = (S.banco||[]).find(x=>x.id===id); if(!it) return;
  const todas = contasDaAba(it.aba), vis = todas.filter(k=>!S.filtroConta.has(k));
  const lista = vis.length ? vis : todas;
  const conta = lista.length===1 ? lista[0] : await escolheConta(ev ? ev.clientX : innerWidth/2, ev ? ev.clientY : innerHeight/2, lista);
  if(!conta) return;
  try{
    const r = await api('/api/banco/'+id+'/usar', {method:'POST', body:JSON.stringify({conta, date})});
    await loadState();
    toast('Post criado em '+brData(date)+(lista.length>1 ? ' na '+contaCurta(conta) : '')+(r.saiu ? ' · saiu do banco' : '')+' · Ctrl+Z desfaz');
  }catch(e){ toast(e.message, true); }
}
function renderDrawer(){
  document.body.classList.toggle('drawer-open', S.drawer);
  $('#drawer').classList.toggle('open', S.drawer);
  const secs = bancoSecoes(S.aba);
  const itens = (S.banco||[]).filter(x=>x.aba===S.aba && secs.includes(x.sec));
  const semDia = slotsVisiveis().filter(s=>!s.date);
  const total = itens.length + semDia.length;
  const dn = $('#drawerN'); if(dn) dn.textContent = total ? total : '';
  if(!S.drawer) return;
  $('#drTitle').innerHTML = icon('box') + 'Banco · ' + esc(nomeAba(S.aba));
  const body = $('#drBody'); body.innerHTML = '';
  for(const sk of secs){
    const sec = BANCO_SEC[sk], lista = itens.filter(x=>x.sec===sk), vis = lista.filter(bancoMatch);
    const el = drawerSec(icon(sec.icone)+' '+esc(sec.nome), vis.length, w=>{
      w.appendChild(bancoForm(sk));
      if(!lista.length) w.insertAdjacentHTML('beforeend','<div class="dr-empty">'+esc(sec.vazio)+'</div>');
      else if(!vis.length) w.insertAdjacentHTML('beforeend','<div class="dr-empty">nada com essa busca aqui</div>');
      vis.forEach(it=>w.appendChild(bancoItemEl(it)));
    });
    el.dataset.sec = sk;
    body.appendChild(el);
  }
  // Sem dia: posts tirados do calendário. Só aparece quando tem (nenhum post se perde).
  if(semDia.length){
    const semDiaV = semDia.filter(slotMatch);
    const el = drawerSec(icon('calendar')+' Sem dia', semDiaV.length, w=>{
      w.insertAdjacentHTML('afterbegin', '<button class="novobanco" id="novoBanco">+ post sem dia</button>');
      w.querySelector('#novoBanco').onclick = ()=> openEdit(null, null);
      if(!semDiaV.length) w.insertAdjacentHTML('beforeend','<div class="dr-empty">nada com essa busca aqui</div>');
      semDiaV.forEach(s=>w.appendChild(cardEl(s)));
    });
    el.classList.add('semdia'); el.dataset.sec = 'semdia';
    body.appendChild(el);
  }
}
