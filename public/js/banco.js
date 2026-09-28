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
const BANCO_SEC = {
  reutilizar: { nome:'Reutilizar', icone:'refresh', fica:false, padrao:'Post pra refazer', phUrl:'link do post antigo (Instagram, TikTok…)', phTit:'o que refazer (opcional)',
    vazio:'Guarde posts antigos que dá pra refazer. Arrastou pro dia, vira post e sai daqui.' },
  drive: { nome:'Drive de conteúdos', icone:'folder', fica:true, padrao:'Conteúdo do Drive', phUrl:'link do Drive', phTit:'o que é (obrigatório)',
    vazio:'Guarde os links do Drive com o que é cada um. Arraste pro dia quantas vezes precisar; sai daqui no Concluído.' },
  referencia: { nome:'Referência de posts', icone:'bookmark', fica:true, padrao:'Referência', phUrl:'link do post (Instagram, TikTok, YouTube…)', phTit:'nota: por que é boa (opcional)',
    vazio:'Guarde posts que inspiram, de qualquer rede. Arraste pro dia pra virar post; sai daqui no Concluído.' },
  cortes: { nome:'Cortes de podcasts', icone:'mic', fica:true, padrao:'Corte de podcast', phUrl:'link do corte (Drive ou outro site)', phTit:'título do corte (opcional)',
    vazio:'Guarde os cortes prontos (link do Drive ou de outro site). Arraste pro dia; sai daqui no Concluído.' },
};
const BANCO_ABA = { 'SEUBONÉ':['reutilizar','drive','referencia'], 'CARBONE':['cortes','drive','referencia'], 'WEEVO':['cortes','drive','referencia'], 'ONEVO':['drive','referencia'] };
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
      '<div class="ru"><b>'+esc(o.nome)+'</b>'+(o.resto ? ' · '+esc(o.resto) : '')+'</div>'+
      (sec.fica && it.usos ? '<span class="usochip" title="Já virou post '+it.usos+' vez'+(it.usos>1?'es':'')+'">'+it.usos+'x usado</span>' : '')+'</div>'+
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
  return d;
}
/** Link + texto de uma seção. Enter guarda; editando, Esc cancela. */
function bancoForm(sk){
  const sec = BANCO_SEC[sk];
  const ed = S.bancoEdit ? (S.banco||[]).find(x=>x.id===S.bancoEdit && x.sec===sk && x.aba===S.aba) : null;
  const f = document.createElement('div'); f.className = 'refform'; f.dataset.sec = sk;
  f.innerHTML =
    '<div class="bk-add"><input class="bkU" placeholder="'+esc(sec.phUrl)+'" autocomplete="off" inputmode="url" aria-label="Link pra guardar em '+esc(sec.nome)+'">'+
      '<button class="bk-mais" title="'+(ed ? 'Salvar a edição (Enter)' : 'Guardar (Enter)')+'" aria-label="'+(ed ? 'Salvar a edição' : 'Guardar')+'">'+icon(ed ? 'check' : 'plus')+'</button></div>'+
    '<div class="bk-add bkT-linha"'+(ed ? '' : ' hidden')+'><input class="bkT" placeholder="'+esc(sec.phTit)+'" maxlength="140" autocomplete="off" aria-label="'+(sk==='drive'?'O que é':'Texto')+'">'+
      (ed ? '<button class="rfcancel">cancelar</button>' : '')+'</div>';
  const iu = f.querySelector('.bkU'), itx = f.querySelector('.bkT'), linha = f.querySelector('.bkT-linha');
  if(ed){ iu.value = ed.url; itx.value = ed.titulo || ''; }
  const salvar = ()=> bancoSalvar(sk, iu, itx, ed);
  f.querySelector('.bk-mais').onclick = salvar;
  // o campo do texto aparece quando já tem link (o formulário vazio ocupa 1 linha só)
  iu.addEventListener('input', ()=>{ if(!ed) linha.hidden = !iu.value.trim(); });
  iu.addEventListener('keydown', ev=>{
    if(ev.key==='Enter'){ ev.preventDefault(); if(sk==='drive' && !itx.value.trim() && iu.value.trim()){ linha.hidden = false; itx.focus(); } else salvar(); }
    else if(ev.key==='Escape' && ed){ ev.stopPropagation(); S.bancoEdit = null; renderDrawer(); }
  });
  itx.addEventListener('keydown', ev=>{
    if(ev.key==='Enter'){ ev.preventDefault(); salvar(); }
    else if(ev.key==='Escape' && ed){ ev.stopPropagation(); S.bancoEdit = null; renderDrawer(); }
  });
  const c = f.querySelector('.rfcancel'); if(c) c.onclick = ()=>{ S.bancoEdit = null; renderDrawer(); };
  return f;
}
async function bancoSalvar(sk, iu, itx, ed){
  const url = iu.value.trim(), titulo = itx.value.trim();
  if(!/^https?:\/\/\S+$/i.test(url)){ toast('Cole o link completo (começa com https://)', true); iu.focus(); return; }
  if(sk==='drive' && !titulo){ toast('Diga o que é esse conteúdo do Drive', true); itx.closest('.bkT-linha').hidden = false; itx.focus(); return; }
  try{
    if(ed){
      const r = await api('/api/banco/'+ed.id, {method:'PATCH', body:JSON.stringify({url, titulo})});
      const i = S.banco.findIndex(x=>x.id===ed.id); if(i>=0) S.banco[i] = r.item;
      S.bancoEdit = null; renderDrawer();
      toast('Atualizado · Ctrl+Z desfaz');
    } else {
      const r = await api('/api/banco', {method:'POST', body:JSON.stringify({aba:S.aba, sec:sk, url, titulo})});
      S.banco = [r.item].concat(S.banco||[]);
      renderDrawer();
      toast('Guardado em '+BANCO_SEC[sk].nome+' · Ctrl+Z desfaz');
      const nf = document.querySelector('#drBody .refform[data-sec="'+sk+'"] .bkU'); if(nf) nf.focus();
    }
  }catch(e){ toast(e.message, true); }
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
