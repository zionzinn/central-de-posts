// docx.js (v3.72): monta .docx e .zip de verdade no navegador, sem biblioteca.
// Saiu de dentro do doc.html pra ser usado em dois lugares: o botão "Baixar .docx" do documento
// e o "Arquivar documentos antigos" do painel (que junta vários .docx num .zip).
// Tudo global dentro de window.DOCX; zip sem compressão (STORE), nomes em UTF-8.
(function(){
'use strict';
const CRC_T = (()=>{ const t=new Uint32Array(256); for(let n=0;n<256;n++){ let c=n; for(let k=0;k<8;k++) c = c&1 ? 0xEDB88320^(c>>>1) : c>>>1; t[n]=c>>>0; } return t; })();
function crc32(u8){ let c=0xFFFFFFFF; for(let i=0;i<u8.length;i++) c = CRC_T[(c^u8[i])&255]^(c>>>8); return (c^0xFFFFFFFF)>>>0; }
function zipBytes(arquivos){
  const enc = new TextEncoder(); const partes=[], central=[]; let off=0;
  const dt = new Date(); const dosT=(dt.getHours()<<11)|(dt.getMinutes()<<5)|(dt.getSeconds()>>1); const dosD=((dt.getFullYear()-1980)<<9)|((dt.getMonth()+1)<<5)|dt.getDate();
  for(const a of arquivos){
    const nome = enc.encode(a.nome), dados = a.bytes instanceof Uint8Array ? a.bytes : enc.encode(a.texto), crc = crc32(dados);
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0,0x04034b50,true); h.setUint16(4,20,true); h.setUint16(6,0x0800,true); h.setUint16(8,0,true); h.setUint16(10,dosT,true); h.setUint16(12,dosD,true);
    h.setUint32(14,crc,true); h.setUint32(18,dados.length,true); h.setUint32(22,dados.length,true); h.setUint16(26,nome.length,true); h.setUint16(28,0,true);
    partes.push(new Uint8Array(h.buffer), nome, dados);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0,0x02014b50,true); c.setUint16(4,20,true); c.setUint16(6,20,true); c.setUint16(8,0x0800,true); c.setUint16(10,0,true); c.setUint16(12,dosT,true); c.setUint16(14,dosD,true);
    c.setUint32(16,crc,true); c.setUint32(20,dados.length,true); c.setUint32(24,dados.length,true); c.setUint16(28,nome.length,true);
    c.setUint16(30,0,true); c.setUint16(32,0,true); c.setUint16(34,0,true); c.setUint16(36,0,true); c.setUint32(38,0,true); c.setUint32(42,off,true);
    central.push(new Uint8Array(c.buffer), nome);
    off += 30 + nome.length + dados.length;
  }
  const tamC = central.reduce((a,b)=>a+b.length,0);
  const e = new DataView(new ArrayBuffer(22));
  e.setUint32(0,0x06054b50,true); e.setUint16(4,0,true); e.setUint16(6,0,true); e.setUint16(8,arquivos.length,true); e.setUint16(10,arquivos.length,true); e.setUint32(12,tamC,true); e.setUint32(16,off,true); e.setUint16(20,0,true);
  const todas = [...partes, ...central, new Uint8Array(e.buffer)];
  const out = new Uint8Array(todas.reduce((a,p)=>a+p.length,0)); let k = 0;
  for(const p of todas){ out.set(p, k); k += p.length; }
  return out;
}
function zipBlob(arquivos, tipo){ return new Blob([zipBytes(arquivos)], {type: tipo || 'application/zip'}); }
const X = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F​]/g,'');
const PT_PALAVRA = { 'xx-small':7, 'x-small':7.5, small:10, medium:12, large:13.5, 'x-large':18, 'xx-large':24, 'xxx-large':36 };
function ptDe(v){ if(!v) return 0; v=String(v).trim(); if(PT_PALAVRA[v]) return PT_PALAVRA[v]; const n=parseFloat(v); if(!n) return 0; if(/pt$/.test(v)) return n; if(/px$/.test(v)) return n*0.75; if(/em$/.test(v)) return n*11; return 0; }
function hexDe(c){
  if(!c) return null; c=String(c).trim();
  const m = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/);
  if(m){ if(m[4]!==undefined && +m[4]===0) return null; return [m[1],m[2],m[3]].map(x=>(+x).toString(16).padStart(2,'0')).join('').toUpperCase(); }
  if(/^#[0-9a-f]{6}$/i.test(c)) return c.slice(1).toUpperCase();
  if(/^#[0-9a-f]{3}$/i.test(c)) return c.slice(1).split('').map(x=>x+x).join('').toUpperCase();
  return null;
}
/** Monta um .docx a partir de um elemento com o HTML do documento. Devolve os bytes do arquivo. */
function docxBytes(page, opcoes){
  const o = opcoes || {};
  const rels = []; let prox = 10; const nums = []; let numId = 1;
  function run(t, f){
    let p = '';
    if(f.link) p += '<w:rStyle w:val="Hyperlink"/>';
    if(f.fonte) p += '<w:rFonts w:ascii="'+X(f.fonte)+'" w:hAnsi="'+X(f.fonte)+'" w:cs="'+X(f.fonte)+'"/>';
    if(f.b) p += '<w:b/>'; if(f.i) p += '<w:i/>'; if(f.s) p += '<w:strike/>';
    if(f.cor) p += '<w:color w:val="'+f.cor+'"/>';
    if(f.pt) p += '<w:sz w:val="'+Math.round(f.pt*2)+'"/><w:szCs w:val="'+Math.round(f.pt*2)+'"/>';
    if(f.u) p += '<w:u w:val="single"/>';
    if(f.fundo) p += '<w:shd w:val="clear" w:color="auto" w:fill="'+f.fundo+'"/>';
    if(f.va) p += '<w:vertAlign w:val="'+f.va+'"/>';
    const rpr = p ? '<w:rPr>'+p+'</w:rPr>' : '';
    return t.split('\t').map((pedaco,i)=> (i?'<w:r>'+rpr+'<w:tab/></w:r>':'') + (pedaco ? '<w:r>'+rpr+'<w:t xml:space="preserve">'+X(pedaco)+'</w:t></w:r>' : '')).join('');
  }
  function runs(n, f){
    if(n.nodeType===3) return n.data ? run(n.data.replace(/\n/g,' '), f) : '';
    if(n.nodeType!==1) return '';
    const tg = n.tagName;
    if(tg==='BR') return '<w:r><w:br/></w:r>';
    if(/^(UL|OL|TABLE|P|H1|H2|H3|LI|BLOCKQUOTE|HR)$/.test(tg)) return '';
    const g = Object.assign({}, f);
    if(/^(B|STRONG)$/.test(tg)) g.b = true; if(/^(I|EM)$/.test(tg)) g.i = true; if(tg==='U') g.u = true; if(/^(S|STRIKE|DEL)$/.test(tg)) g.s = true;
    if(tg==='SUP') g.va = 'superscript'; if(tg==='SUB') g.va = 'subscript';
    const st = n.style;
    if(st){
      if(st.fontWeight) g.b = /bold|[6-9]00/.test(st.fontWeight);
      if(st.fontStyle) g.i = st.fontStyle==='italic';
      const td = st.textDecorationLine || st.textDecoration || '';
      if(/underline/.test(td)) g.u = true; if(/line-through/.test(td)) g.s = true;
      if(st.color){ const h = hexDe(st.color); if(h) g.cor = h; }
      if(st.backgroundColor){ g.fundo = hexDe(st.backgroundColor); }
      if(st.fontSize){ const pt = ptDe(st.fontSize); if(pt) g.pt = pt; }
      if(st.fontFamily) g.fonte = st.fontFamily.split(',')[0].replace(/["']/g,'').trim();
      if(st.verticalAlign==='super') g.va = 'superscript'; if(st.verticalAlign==='sub') g.va = 'subscript';
    }
    if(tg==='IMG'){ const src = n.getAttribute('src')||''; const id = 'rId'+(prox++); rels.push({id, href:src}); return '<w:hyperlink r:id="'+id+'" w:history="1">'+run('[imagem: '+src+']', Object.assign({}, g, {link:true}))+'</w:hyperlink>'; }
    if(tg==='A'){
      const href = n.getAttribute('href')||'';
      if(href && href!=='#'){ const id = 'rId'+(prox++); rels.push({id, href}); g.link = true; return '<w:hyperlink r:id="'+id+'" w:history="1">'+[...n.childNodes].map(c=>runs(c,g)).join('')+'</w:hyperlink>'; }
    }
    return [...n.childNodes].map(c=>runs(c,g)).join('');
  }
  function par(el, o){
    const st = (el && el.style) || {};
    let p = '';
    if(o.estilo) p += '<w:pStyle w:val="'+o.estilo+'"/>';
    if(o.num) p += '<w:numPr><w:ilvl w:val="'+o.num.lvl+'"/><w:numId w:val="'+o.num.id+'"/></w:numPr>';
    if(o.borda) p += '<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="9AA0A6"/></w:pBdr>';
    const lh = parseFloat(st.lineHeight)||0, mt = ptDe(st.marginTop), mb = ptDe(st.marginBottom);
    if(lh || mt || mb) p += '<w:spacing'+(mt?' w:before="'+Math.round(mt*20)+'"':'')+(mb?' w:after="'+Math.round(mb*20)+'"':'')+(lh?' w:line="'+Math.round(lh*240)+'" w:lineRule="auto"':'')+'/>';
    const recuo = (o.recuo||0) + Math.round(ptDe(st.marginLeft)*20);
    if(recuo && !o.num) p += '<w:ind w:left="'+recuo+'"/>';
    const jc = ({center:'center', right:'right', justify:'both'})[st.textAlign];
    if(jc) p += '<w:jc w:val="'+jc+'"/>';
    return '<w:p>'+(p?'<w:pPr>'+p+'</w:pPr>':'')+(o.xml||'')+'</w:p>';
  }
  function lista(el, lvl, recuo){
    let id = null;
    if(el.tagName==='OL'){ id = ++numId; nums.push({id, abs:1}); }
    else if(!el.classList.contains('chk')) id = 1;
    let x = '';
    for(const li of el.children){
      if(li.tagName!=='LI') continue;
      const subs = [...li.childNodes].filter(c=>c.nodeType===1 && /^(UL|OL)$/.test(c.tagName));
      let conteudo = [...li.childNodes].filter(c=>!subs.includes(c)).map(c=>runs(c,{})).join('');
      if(id===null){ conteudo = run(li.getAttribute('data-checked')==='1' ? '☑ ' : '☐ ', {}) + conteudo; x += par(li, {xml:conteudo, recuo: recuo + 360 + lvl*360}); }
      else x += par(li, {xml:conteudo, num:{id, lvl:Math.min(lvl,8)}});
      subs.forEach(s=> x += lista(s, lvl+1, recuo));
    }
    return x;
  }
  function tabela(t){
    const linhas = [...t.querySelectorAll('tr')].filter(tr=>tr.closest('table')===t);
    const nc = Math.max(1, ...linhas.map(r=>[...r.children].reduce((a,c)=>a+(+c.getAttribute('colspan')||1),0)));
    const w = Math.floor(9026/nc);
    let x = '<w:tbl><w:tblPr><w:tblW w:w="'+(w*nc)+'" w:type="dxa"/><w:tblBorders>'+['top','left','bottom','right','insideH','insideV'].map(b=>'<w:'+b+' w:val="single" w:sz="4" w:space="0" w:color="000000"/>').join('')+'</w:tblBorders><w:tblLayout w:type="fixed"/><w:tblCellMar><w:left w:w="100" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>'+('<w:gridCol w:w="'+w+'"/>').repeat(nc)+'</w:tblGrid>';
    linhas.forEach(tr=>{
      x += '<w:tr>';
      [...tr.children].forEach(td=>{ const sp = +td.getAttribute('colspan')||1; let dentro = blocos(td, 0); if(!dentro) dentro = '<w:p/>'; x += '<w:tc><w:tcPr><w:tcW w:w="'+(w*sp)+'" w:type="dxa"/>'+(sp>1?'<w:gridSpan w:val="'+sp+'"/>':'')+'</w:tcPr>'+dentro+'</w:tc>'; });
      x += '</w:tr>';
    });
    return x + '</w:tbl>';
  }
  function blocos(box, recuo){
    let x = '', inl = [];
    const solta = () => { if(inl.length){ x += par(null, {xml: inl.map(c=>runs(c,{})).join(''), recuo}); inl = []; } };
    const filhos = [...box.childNodes];
    filhos.forEach((n, k)=>{
      const tg = n.nodeType===1 ? n.tagName : '';
      if(n.nodeType===3 || (n.nodeType===1 && !/^(P|H1|H2|H3|UL|OL|TABLE|BLOCKQUOTE|HR|DIV)$/.test(tg))){ if(n.nodeType===3 && !n.data.trim() && !inl.length) return; inl.push(n); return; }
      solta();
      if(/^(P|DIV|H1|H2|H3)$/.test(tg)){
        const estilo = n.classList.contains('title') ? 'Title' : n.classList.contains('subtitle') ? 'Subtitle' : ({H1:'Heading1',H2:'Heading2',H3:'Heading3'})[tg] || null;
        x += par(n, {estilo, recuo, xml:[...n.childNodes].map(c=>runs(c,{})).join('')});
      } else if(tg==='BLOCKQUOTE'){ x += blocos(n, recuo + 720); }
      else if(tg==='HR'){ x += par(null, {borda:true}); }
      else if(tg==='UL' || tg==='OL'){ x += lista(n, 0, recuo); }
      else if(tg==='TABLE'){ x += tabela(n); if(k===filhos.length-1) x += '<w:p/>'; }
    });
    solta();
    return x;
  }
  const corpo = blocos(page, 0) || '<w:p/>';
  const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
  const cab = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  const documento = cab+'<w:document '+NS+'><w:body>'+corpo+'<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>';
  const est = (id, nome, ppr, rpr) => '<w:style w:type="paragraph" w:styleId="'+id+'"><w:name w:val="'+nome+'"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/>'+(ppr?'<w:pPr>'+ppr+'</w:pPr>':'')+'<w:rPr>'+rpr+'</w:rPr></w:style>';
  const estilos = cab+'<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'+
    '<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Arial" w:cs="Arial"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="pt-BR"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>'+
    '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>'+
    est('Title','Title','<w:keepNext/><w:spacing w:after="60"/>','<w:sz w:val="52"/><w:szCs w:val="52"/>')+
    est('Subtitle','Subtitle','<w:keepNext/><w:spacing w:after="320"/>','<w:color w:val="666666"/><w:sz w:val="30"/><w:szCs w:val="30"/>')+
    est('Heading1','heading 1','<w:keepNext/><w:spacing w:before="400" w:after="120"/><w:outlineLvl w:val="0"/>','<w:sz w:val="40"/><w:szCs w:val="40"/>')+
    est('Heading2','heading 2','<w:keepNext/><w:spacing w:before="360" w:after="120"/><w:outlineLvl w:val="1"/>','<w:sz w:val="32"/><w:szCs w:val="32"/>')+
    est('Heading3','heading 3','<w:keepNext/><w:spacing w:before="320" w:after="80"/><w:outlineLvl w:val="2"/>','<w:color w:val="434343"/><w:sz w:val="28"/><w:szCs w:val="28"/>')+
    '<w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/><w:rPr><w:color w:val="1155CC"/><w:u w:val="single"/></w:rPr></w:style>'+
    '</w:styles>';
  const lvlB = i => '<w:lvl w:ilvl="'+i+'"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="'+['●','○','■'][i%3]+'"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="'+(720*(i+1))+'" w:hanging="360"/></w:pPr></w:lvl>';
  const lvlN = i => '<w:lvl w:ilvl="'+i+'"><w:start w:val="1"/><w:numFmt w:val="'+['decimal','lowerLetter','lowerRoman'][i%3]+'"/><w:lvlText w:val="%'+(i+1)+'."/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="'+(720*(i+1))+'" w:hanging="360"/></w:pPr></w:lvl>';
  const niveis = f => Array.from({length:9}, (_,i)=>f(i)).join('');
  const numeracao = cab+'<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'+
    '<w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="hybridMultilevel"/>'+niveis(lvlB)+'</w:abstractNum>'+
    '<w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="hybridMultilevel"/>'+niveis(lvlN)+'</w:abstractNum>'+
    '<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>'+
    nums.map(n=>'<w:num w:numId="'+n.id+'"><w:abstractNumId w:val="1"/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="1"/></w:lvlOverride></w:num>').join('')+
    '</w:numbering>';
  const relsDoc = cab+'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'+
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>'+
    rels.map(r=>'<Relationship Id="'+r.id+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="'+X(r.href)+'" TargetMode="External"/>').join('')+
    '</Relationships>';
  const agora = new Date().toISOString().replace(/\.\d+Z$/,'Z');
  const core = cab+'<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>'+X(o.titulo||'Documento')+'</dc:title><dc:creator>'+X(o.autor||'')+' (B.O.N.E)</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">'+agora+'</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">'+agora+'</dcterms:modified></cp:coreProperties>';
  const tipos = cab+'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>'+
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'+
    '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>'+
    '<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>'+
    '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>';
  const raiz = cab+'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>';
  return zipBytes([
    {nome:'[Content_Types].xml', texto:tipos}, {nome:'_rels/.rels', texto:raiz}, {nome:'docProps/core.xml', texto:core},
    {nome:'word/document.xml', texto:documento}, {nome:'word/styles.xml', texto:estilos}, {nome:'word/numbering.xml', texto:numeracao},
    {nome:'word/_rels/document.xml.rels', texto:relsDoc},
  ]);
}

const TIPO_DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
window.DOCX = {
  crc32, zipBytes, zipBlob, docxBytes,
  docxBlob(page, opcoes){ return new Blob([docxBytes(page, opcoes)], {type: TIPO_DOCX}); },
  /** Converte um HTML (texto) em .docx sem colocar nada na tela (DOMParser: imagem não carrega, script não roda). */
  docxDeHtml(html, opcoes){ const d = new DOMParser().parseFromString('<!doctype html><body>'+(html||'')+'</body>', 'text/html'); return docxBytes(d.body, opcoes); },
};
})();
