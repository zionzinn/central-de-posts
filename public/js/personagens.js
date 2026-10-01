// B.O.N.E · personagens do perfil (v3.99). Pedido do Zion em 01/10/2026: "vamos tentar montar uma aba perfil mais ou
// menos assim ... ter vários personagens pra pessoa escolher". Personagens ORIGINAIS, desenhados aqui em SVG (nada
// copiado de jogo, filme ou marca; da referência só o formato de card): o time de marketing em versão "chibi", todo
// mundo de boné. Cada um tem a classe (o título embaixo do nome), a cor do card e o objeto na mão.
// Desenhado no navegador a partir deste código (não tem imagem pra baixar): os 12 cabem em ~8 KB comprimidos.
// Usado no painel (perfil, escolha, bolinha de quem está online) e no documento da copy (quem está com ele aberto).
// A lista de ids precisa bater com PERSONAGENS em lib/perfil.js (o teste api399 confere).
(function () {
'use strict';
const PERSONAGENS = {
  gancho:  { nome: 'Gancho', funcao: 'Copy', classe: 'caçadora de ganchos', fundo: '#F5C033', circulo: '#FFF4D2',
    pele: '#F3C6A3', cabelo: '#3A2417', estilo: 'rabo', bone: { tipo: 'trucker', cor: '#211E26', frente: '#FFD23A', aba: '#211E26', marca: 'aspas' },
    roupa: { cor: '#2B2831', det: '#FFC21A' }, calca: '#3F5E8C', tenis: '#F4F4F4', sola: '#C9CCD3',
    rosto: { olhos: 'abertos', sobr: 'firme', boca: 'sorriso', blush: true, brinco: true }, bracoE: 'cintura', objeto: 'caneta' },
  corte:   { nome: 'Corte Seco', funcao: 'Edição de vídeo', classe: 'mestre do corte seco', fundo: '#FF6A55', circulo: '#FFF1E8',
    pele: '#C68A61', cabelo: '#1F1714', estilo: 'raspado', barba: true, bone: { tipo: 'tras', cor: '#E8402F', aba: '#B92C1F', marca: '' },
    roupa: { cor: '#5C6372', det: '#E8402F' }, calca: '#24242A', tenis: '#E8402F', sola: '#F2F2F2', fone: true,
    rosto: { olhos: 'abertos', sobr: 'firme', boca: 'smirk', blush: false }, bracoE: 'baixo', objeto: 'tesoura' },
  pixel:   { nome: 'Pixel', funcao: 'Design', classe: 'domadora de pixels', fundo: '#6F66FF', circulo: '#E6E3FF',
    pele: '#E2A57B', cabelo: '#2A1912', estilo: 'cacheado', oculos: 'redondo', bone: { tipo: 'lado', cor: '#4D44E0', aba: '#2F28A8', marca: 'pena' },
    roupa: { cor: '#FFD43B', det: '#4D44E0' }, calca: '#2E2A4F', tenis: '#FFFFFF', sola: '#4D44E0',
    rosto: { olhos: 'felizes', sobr: 'alegre', boca: 'aberta', blush: true }, bracoE: 'baixo', objeto: 'lapis' },
  take:    { nome: 'Take Único', funcao: 'Captação', classe: 'caçador de takes', fundo: '#14B8A6', circulo: '#D8FAF4',
    pele: '#7A4A32', cabelo: '#15100D', estilo: 'curto', barba: 'curta', bone: { tipo: 'frente', cor: '#0E3B38', aba: '#0A2B29', frente: '#14B8A6', marca: 'rec' },
    roupa: { cor: '#3F4B40', det: '#E9E4D4' }, calca: '#A88A5C', tenis: '#5B3A24', sola: '#E9E4D4', colete: true,
    rosto: { olhos: 'abertos', sobr: 'alegre', boca: 'sorriso', blush: false }, bracoE: 'baixo', objeto: 'camera' },
  viral:   { nome: 'Viral', funcao: 'Social media', classe: 'rainha do alcance', fundo: '#FF4D8D', circulo: '#FFE4EF',
    pele: '#F6D1BA', cabelo: '#FF86AF', estilo: 'longo', bone: { tipo: 'trucker', cor: '#FF2D78', frente: '#FFFFFF', aba: '#FF2D78', marca: 'coracao' },
    roupa: { cor: '#2C2A33', det: '#FF2D78' }, calca: '#F2E9EE', tenis: '#FF2D78', sola: '#FFFFFF',
    rosto: { olhos: 'piscando', sobr: 'alegre', boca: 'aberta', blush: true, brinco: true }, bracoE: 'cintura', objeto: 'celular' },
  mira:    { nome: 'Mira', funcao: 'Tráfego', classe: 'atiradora de ROAS', fundo: '#2DC66F', circulo: '#DDF7E7',
    pele: '#D49A70', cabelo: '#1A1310', estilo: 'coque', oculos: 'quadrado', bone: { tipo: 'frente', cor: '#1FA85B', aba: '#157A41', frente: '#E9FFF2', marca: 'alvo' },
    roupa: { cor: '#1B3A2B', det: '#7CF0AE' }, calca: '#2A2D33', tenis: '#F4F4F4', sola: '#1FA85B',
    rosto: { olhos: 'abertos', sobr: 'firme', boca: 'smirk', blush: false, brinco: true }, bracoE: 'cintura', objeto: 'alvo' },
  pauta:   { nome: 'Pauta', funcao: 'Planejamento', classe: 'arquiteto da semana', fundo: '#FF9E40', circulo: '#FFF3E3',
    pele: '#EEC2A0', cabelo: '#B9502A', estilo: 'curto', sardas: true, bone: { tipo: 'frente', cor: '#FF8A1F', aba: '#D96A06', frente: '#FFFFFF', marca: 'check' },
    roupa: { cor: '#4A6BB5', det: '#E7EEFF' }, calca: '#2D3445', tenis: '#FFFFFF', sola: '#FF8A1F',
    rosto: { olhos: 'abertos', sobr: 'alegre', boca: 'sorriso', blush: true }, bracoE: 'baixo', objeto: 'prancheta' },
  voz:     { nome: 'Microfone Aberto', funcao: 'Podcast', classe: 'voz do episódio', fundo: '#9A6BFF', circulo: '#EEE6FF',
    pele: '#B7774F', cabelo: '#1C1512', estilo: 'cacheado', bone: { tipo: 'tras', cor: '#7C4DFF', aba: '#5A2FD6', marca: '' },
    roupa: { cor: '#3A2A5E', det: '#C8B4FF' }, calca: '#1F1C26', tenis: '#C8B4FF', sola: '#FFFFFF', fone: true,
    rosto: { olhos: 'felizes', sobr: 'alegre', boca: 'aberta', blush: false }, bracoE: 'cintura', objeto: 'microfone' },
  hype:    { nome: 'Hype', funcao: 'Lançamento', classe: 'mestre do hype', fundo: '#2EA8FF', circulo: '#E2F3FF',
    pele: '#8D5A3B', cabelo: '#2B1E17', estilo: 'afro', bone: { tipo: 'trucker', cor: '#0B6BD3', frente: '#FFFFFF', aba: '#0B6BD3', marca: 'raio' },
    roupa: { cor: '#14243D', det: '#5CC0FF' }, calca: '#3B4A63', tenis: '#FFD23A', sola: '#FFFFFF',
    rosto: { olhos: 'abertos', sobr: 'alegre', boca: 'aberta', blush: false }, bracoE: 'baixo', objeto: 'megafone' },
  metrica: { nome: 'Métrica', funcao: 'Dados', classe: 'leitora de métricas', fundo: '#A6E05A', circulo: '#F1FBE4',
    pele: '#F1D0B5', cabelo: '#17171C', estilo: 'chanel', bone: { tipo: 'lado', cor: '#3E7A12', aba: '#2B5A0B', marca: 'barras' },
    roupa: { cor: '#2F3540', det: '#A6E05A' }, calca: '#5A6B85', tenis: '#FFFFFF', sola: '#3E7A12',
    rosto: { olhos: 'abertos', sobr: 'alegre', boca: 'sorriso', blush: true }, bracoE: 'cintura', objeto: 'tablet' },
  plot:    { nome: 'Plot Twist', funcao: 'Roteiro', classe: 'dona da virada', fundo: '#3A3F4B', circulo: '#E7E9EF', texto: '#FFFFFF',
    pele: '#6B4130', cabelo: '#16110E', estilo: 'trancas', bone: { tipo: 'tras', cor: '#E8504A', aba: '#B83A35', marca: '' },
    roupa: { cor: '#F2C94C', det: '#3A3F4B' }, calca: '#2A2D35', tenis: '#FFFFFF', sola: '#E8504A',
    rosto: { olhos: 'piscando', sobr: 'firme', boca: 'smirk', blush: false, brinco: true }, bracoE: 'cintura', objeto: 'claquete' },
  ponto:   { nome: 'Ponto Cheio', funcao: 'Bordado', classe: 'mestre do bordado 3D', fundo: '#D4924F', circulo: '#FFF1E3',
    pele: '#E8B894', cabelo: '#A9A9B0', estilo: 'raspado', barba: true, oculos: 'redondo', bone: { tipo: 'frente', cor: '#7A4A22', aba: '#5A3415', frente: '#FFE6C7', marca: 'estrela' },
    roupa: { cor: '#2F5D50', det: '#FFE6C7' }, calca: '#3B3B44', tenis: '#7A4A22', sola: '#FFE6C7',
    rosto: { olhos: 'felizes', sobr: 'alegre', boca: 'sorriso', blush: true }, bracoE: 'baixo', objeto: 'agulha' },
};
const ORDEM = ['gancho', 'corte', 'pixel', 'take', 'viral', 'mira', 'pauta', 'voz', 'hype', 'metrica', 'plot', 'ponto'];

// ---------- cor: escurece ou clareia um #RRGGBB ----------
function tom(hex, f) {
  const n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  const c = v => Math.max(0, Math.min(255, Math.round(f < 0 ? v * (1 + f) : v + (255 - v) * f)));
  return '#' + [c(r), c(g), c(b)].map(v => v.toString(16).padStart(2, '0')).join('');
}

// ---------- partes ----------
const INK = '#231F26';
function cabeloAtras(p) {
  const h = p.cabelo, s = p.estilo;
  if (s === 'longo') return '<path d="M73 96 C64 142 70 182 90 194 L150 194 C170 182 176 142 167 96 Z" fill="' + h + '"/>' +
    '<path d="M96 186 C100 176 104 172 110 170" stroke="' + tom(h, -0.18) + '" stroke-width="3" fill="none" stroke-linecap="round"/>';
  if (s === 'rabo') return '<path d="M146 84 C178 78 192 112 186 146 C183 166 172 180 160 184 C168 160 166 128 148 106 Z" fill="' + h + '"/>' +
    '<path d="M160 96 C176 108 182 130 176 158" stroke="' + tom(h, 0.2) + '" stroke-width="3" fill="none" stroke-linecap="round"/>';
  // coque baixo, saindo de trás da cabeça (em cima do boné parecia uma bola)
  if (s === 'coque') return '<circle cx="164" cy="134" r="13" fill="' + h + '"/><path d="M156 126 C160 132 160 140 156 146" stroke="' + tom(h, 0.25) + '" stroke-width="2.6" fill="none" stroke-linecap="round"/>';
  // black power: nuvem de cachos em volta (mais larga dos lados, o boné em cima)
  if (s === 'afro') {
    let t = '<ellipse cx="120" cy="104" rx="58" ry="52" fill="' + h + '"/>';
    for (let g = 0; g < 360; g += 24) { const a = g * Math.PI / 180; t += '<circle cx="' + (120 + 58 * Math.cos(a)).toFixed(1) + '" cy="' + (104 + 52 * Math.sin(a)).toFixed(1) + '" r="12" fill="' + h + '"/>'; }
    [[72, 84], [168, 84], [64, 116], [176, 116], [78, 146], [162, 146], [96, 58], [144, 58]].forEach(([x, y]) => { t += '<path d="M' + (x - 5) + ' ' + y + ' q5 -6 10 0" stroke="' + tom(h, 0.22) + '" stroke-width="2.2" fill="none" stroke-linecap="round"/>'; });
    return t;
  }
  if (s === 'chanel') return '<path d="M74 96 C69 124 71 146 80 158 L160 158 C169 146 171 124 166 96 Z" fill="' + h + '"/>';
  if (s === 'trancas') return [70, 81, 92, 148, 159, 170].map((x, i) => {
    const y2 = 196 + (i % 3) * 6;
    let t = '<path d="M' + x + ' 100 V' + y2 + '" stroke="' + h + '" stroke-width="10" stroke-linecap="round"/>';
    for (let y = 112; y < y2; y += 10) t += '<path d="M' + (x - 4) + ' ' + y + ' l8 4" stroke="' + tom(h, 0.22) + '" stroke-width="1.6" stroke-linecap="round"/>';
    return t;
  }).join('');
  if (s === 'cacheado') return [[76, 132, 12], [164, 132, 12], [84, 146, 10], [156, 146, 10]].map(([x, y, r]) => '<circle cx="' + x + '" cy="' + y + '" r="' + r + '" fill="' + h + '"/>').join('');
  return '';
}
function cabeloFrente(p) {
  const h = p.cabelo, s = p.estilo, d = tom(h, -0.2);
  if (s === 'curto' || s === 'rabo') return '<path d="M77 94 C73 112 76 124 82 130 L88 100 Z" fill="' + h + '"/><path d="M163 94 C167 112 164 124 158 130 L152 100 Z" fill="' + h + '"/>';
  if (s === 'longo') return '<path d="M77 94 C72 120 74 144 84 160 L90 102 Z" fill="' + h + '"/><path d="M163 94 C168 120 166 144 156 160 L150 102 Z" fill="' + h + '"/>' +
    '<path d="M88 98 C100 108 112 106 118 98" fill="' + h + '"/>';
  if (s === 'cacheado') return [[78, 100, 11], [74, 116, 11], [166, 116, 11], [162, 100, 11], [96, 94, 9], [144, 94, 9]].map(([x, y, r]) => '<circle cx="' + x + '" cy="' + y + '" r="' + r + '" fill="' + h + '"/>').join('') +
    '<path d="M70 112 C74 108 78 108 80 112" stroke="' + d + '" stroke-width="2" fill="none"/>';
  if (s === 'coque') return '<path d="M78 94 C74 110 76 120 80 126 L88 100 Z" fill="' + h + '"/><path d="M162 94 C166 110 164 120 160 126 L152 100 Z" fill="' + h + '"/>';
  if (s === 'raspado') return '<path d="M78 96 C76 110 78 118 82 122 L86 100 Z" fill="' + h + '" opacity=".75"/><path d="M162 96 C164 110 162 118 158 122 L154 100 Z" fill="' + h + '" opacity=".75"/>';
  if (s === 'chanel') return '<path d="M77 94 C71 118 73 140 82 154 L92 104 Z" fill="' + h + '"/><path d="M163 94 C169 118 167 140 158 154 L148 104 Z" fill="' + h + '"/>';
  if (s === 'trancas') return '<path d="M78 94 C74 110 76 120 80 126 L88 100 Z" fill="' + h + '"/><path d="M162 94 C166 110 164 120 160 126 L152 100 Z" fill="' + h + '"/>';
  return '';
}
function marca(tipo, cor) {
  if (tipo === 'aspas') return '<path d="M111 70 h6 v6 c0 5 -2 8 -6 9 v-3 c2 -1 3 -3 3 -5 h-3 z M122 70 h6 v6 c0 5 -2 8 -6 9 v-3 c2 -1 3 -3 3 -5 h-3 z" fill="' + cor + '"/>';
  if (tipo === 'coracao') return '<path d="M120 86 C108 78 108 68 114 66 C117 65 119 67 120 69 C121 67 123 65 126 66 C132 68 132 78 120 86 Z" fill="' + cor + '"/>';
  if (tipo === 'check') return '<path d="M110 76 l7 7 l13 -14" stroke="' + cor + '" stroke-width="4.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>';
  if (tipo === 'rec') return '<circle cx="114" cy="76" r="5" fill="#FF3B30"/><rect x="122" y="72" width="10" height="8" rx="2" fill="' + cor + '"/>';
  if (tipo === 'alvo') return '<circle cx="120" cy="76" r="8" fill="none" stroke="' + cor + '" stroke-width="2.6"/><circle cx="120" cy="76" r="3" fill="' + cor + '"/>';
  if (tipo === 'pena') return '<path d="M114 84 L126 68 C130 64 134 68 130 72 L118 86 Z" fill="' + cor + '"/><path d="M114 84 l-3 3" stroke="' + cor + '" stroke-width="2.5" stroke-linecap="round"/>';
  if (tipo === 'raio') return '<path d="M124 65 L111 80 H119 L115 90 L129 74 H121 Z" fill="' + cor + '"/>';
  if (tipo === 'barras') return '<rect x="110" y="78" width="5.5" height="8" rx="1.5" fill="' + cor + '"/><rect x="117.5" y="72" width="5.5" height="14" rx="1.5" fill="' + cor + '"/><rect x="125" y="66" width="5.5" height="20" rx="1.5" fill="' + cor + '"/>';
  if (tipo === 'estrela') {
    let d = '';
    for (let i = 0; i < 10; i++) { const r = i % 2 ? 4.2 : 9.5, a = -Math.PI / 2 + i * Math.PI / 5; d += (i ? 'L' : 'M') + (120 + r * Math.cos(a)).toFixed(1) + ' ' + (77 + r * Math.sin(a)).toFixed(1) + ' '; }
    return '<path d="' + d + 'Z" fill="' + cor + '" stroke="' + cor + '" stroke-width="1.5" stroke-linejoin="round"/>';
  }
  return '';
}
function bone(p) {
  const b = p.bone, esc = tom(b.cor, -0.28);
  let atras = '', frente = '';
  let s = '<path d="M74 98 C72 64 92 50 120 50 C148 50 168 64 166 98 Z" fill="' + b.cor + '"/>';
  if (b.tipo === 'trucker') {
    s += '<path d="M88 97 C88 70 101 57 120 57 C139 57 152 70 152 97 Z" fill="' + b.frente + '"/>';
    for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) s += '<circle cx="' + (80 + j * 4) + '" cy="' + (72 + i * 6) + '" r="1" fill="' + tom(b.cor, 0.35) + '"/><circle cx="' + (152 + j * 4) + '" cy="' + (72 + i * 6) + '" r="1" fill="' + tom(b.cor, 0.35) + '"/>';
  }
  s += '<path d="M120 51 V96 M98 56 C92 70 90 84 92 97 M142 56 C148 70 150 84 148 97" stroke="' + esc + '" stroke-opacity=".35" stroke-width="2" fill="none"/>';
  s += '<circle cx="120" cy="51" r="4.5" fill="' + esc + '"/>';
  if (b.tipo === 'frente' || b.tipo === 'trucker') {
    if (b.tipo === 'frente' && b.frente) s += '<rect x="103" y="64" width="34" height="24" rx="7" fill="' + b.frente + '"/>';
    s += marca(b.marca, b.tipo === 'trucker' ? b.cor : b.cor);
    // aba 4 px mais alta que no primeiro desenho: os olhos ficam mais à mostra
    frente = '<g transform="translate(0 -4)"><path d="M68 96 C96 89 144 89 172 96 C179 99 177 107 168 109 C140 118 100 118 72 109 C63 107 61 99 68 96 Z" fill="' + b.aba + '"/>' +
      '<path d="M76 105 C100 112 140 112 164 105" stroke="#000" stroke-opacity=".18" stroke-width="2" fill="none"/></g>';
  } else if (b.tipo === 'lado') {
    s += marca(b.marca, '#FFFFFF');
    frente = '<path d="M146 93 C170 82 202 83 210 94 C207 103 188 108 158 105 Z" fill="' + b.aba + '"/><path d="M98 97 C120 93 142 93 150 96 L150 99 C130 97 110 98 98 100 Z" fill="' + esc + '"/>';
  } else if (b.tipo === 'tras') {
    frente = '<path d="M104 98 C104 86 111 81 120 81 C129 81 136 86 136 98 Z" fill="' + p.cabelo + '"/><rect x="103" y="95" width="34" height="4" rx="2" fill="' + esc + '"/>';
  }
  return { atras, s: s + frente };
}
function rosto(p) {
  const r = p.rosto, sob = tom(p.cabelo, 0.05);
  let s = '';
  if (r.blush) s += '<ellipse cx="92" cy="126" rx="7.5" ry="4.2" fill="#FF6F7D" opacity=".38"/><ellipse cx="148" cy="126" rx="7.5" ry="4.2" fill="#FF6F7D" opacity=".38"/>';
  if (p.sardas) [[90, 120], [95, 123], [88, 125], [150, 120], [145, 123], [152, 125]].forEach(([x, y]) => { s += '<circle cx="' + x + '" cy="' + y + '" r="1.3" fill="' + tom(p.pele, -0.35) + '"/>'; });
  const olhoAberto = x => '<ellipse cx="' + x + '" cy="113" rx="5.2" ry="6.6" fill="' + INK + '"/><circle cx="' + (x + 1.8) + '" cy="110.4" r="1.9" fill="#fff"/>';
  const olhoFeliz = x => '<path d="M' + (x - 6.5) + ' 115 q6.5 -7 13 0" stroke="' + INK + '" stroke-width="3.4" fill="none" stroke-linecap="round"/>';
  if (r.olhos === 'felizes') s += olhoFeliz(103) + olhoFeliz(137);
  else if (r.olhos === 'piscando') s += olhoAberto(103) + olhoFeliz(137);
  else s += olhoAberto(103) + olhoAberto(137);
  if (r.sobr === 'firme') s += '<path d="M94 100 L110 97 M146 100 L130 97" stroke="' + sob + '" stroke-width="3.6" stroke-linecap="round"/>';
  else s += '<path d="M95 100 q8 -5 15 -1 M145 100 q-8 -5 -15 -1" stroke="' + sob + '" stroke-width="3.4" fill="none" stroke-linecap="round"/>';
  s += '<path d="M118 120 q2 3 4 0" stroke="' + tom(p.pele, -0.3) + '" stroke-width="2.2" fill="none" stroke-linecap="round"/>';
  if (r.boca === 'aberta') s += '<path d="M108 127 C111 141 129 141 132 127 Z" fill="#4A1C25"/><ellipse cx="120" cy="135" rx="6" ry="3" fill="#E9707A"/>';
  else if (r.boca === 'smirk') s += '<path d="M111 130 C117 134 124 133 131 126" stroke="' + INK + '" stroke-width="3.2" fill="none" stroke-linecap="round"/>';
  else s += '<path d="M110 128 C114 136 126 136 130 128" stroke="' + INK + '" stroke-width="3.2" fill="none" stroke-linecap="round"/>';
  return s;
}
function barba(p) {
  if (!p.barba) return '';
  const h = p.cabelo;
  if (p.barba === 'curta') return '<path d="M82 120 C86 146 102 156 120 156 C138 156 154 146 158 120 C152 138 138 146 120 146 C102 146 88 138 82 120 Z" fill="' + h + '" opacity=".9"/>';
  return '<path d="M80 114 C82 150 100 162 120 162 C140 162 158 150 160 114 C154 140 140 148 120 148 C100 148 86 140 80 114 Z" fill="' + h + '"/>' +
    '<path d="M106 124 C112 119 128 119 134 124 C128 127 112 127 106 124 Z" fill="' + h + '"/>';
}
function oculos(p) {
  if (p.oculos === 'redondo') return '<circle cx="103" cy="113" r="11" fill="#fff" fill-opacity=".18" stroke="' + INK + '" stroke-width="3"/><circle cx="137" cy="113" r="11" fill="#fff" fill-opacity=".18" stroke="' + INK + '" stroke-width="3"/><path d="M114 112 q6 -4 12 0" stroke="' + INK + '" stroke-width="3" fill="none"/>';
  if (p.oculos === 'quadrado') return '<rect x="91" y="104" width="24" height="18" rx="5" fill="#fff" fill-opacity=".16" stroke="' + INK + '" stroke-width="3"/><rect x="125" y="104" width="24" height="18" rx="5" fill="#fff" fill-opacity=".16" stroke="' + INK + '" stroke-width="3"/><path d="M115 111 h10" stroke="' + INK + '" stroke-width="3"/>';
  return '';
}
function fone(p) {
  if (!p.fone) return '';
  return '<path d="M90 152 C96 174 144 174 150 152" stroke="#1D1C22" stroke-width="6" fill="none" stroke-linecap="round"/>' +
    '<rect x="81" y="144" width="15" height="20" rx="6" fill="#1D1C22"/><rect x="144" y="144" width="15" height="20" rx="6" fill="#1D1C22"/>' +
    '<rect x="85" y="148" width="7" height="12" rx="3" fill="' + p.roupa.det + '"/><rect x="148" y="148" width="7" height="12" rx="3" fill="' + p.roupa.det + '"/>';
}
// braço = traço grosso (a manga) + mão; o objeto entra entre a manga e a mão
const BRACOS_E = { baixo: ['M88 174 C78 190 74 206 76 222', 77, 229], cintura: ['M88 174 C74 192 76 208 92 214', 96, 215] };
const BRACOS_D = { baixo: ['M152 174 C162 190 166 206 164 222', 164, 229], alto: ['M152 172 C170 166 180 150 183 134', 184, 127], frente: ['M152 174 C168 186 170 198 160 208', 157, 211], boca: ['M152 174 C172 178 172 156 158 146', 155, 143] };
function manga(d, cor) { return '<path d="' + d + '" stroke="' + cor + '" stroke-width="17" fill="none" stroke-linecap="round"/>'; }
function mao(x, y, pele) { return '<circle cx="' + x + '" cy="' + y + '" r="8.6" fill="' + pele + '"/>'; }
function objeto(p) {
  const o = p.objeto;
  // [pose do braço direito, desenho do objeto (antes da mão), desenho depois da mão]
  if (o === 'caneta') return ['baixo', '<g transform="translate(164 229) rotate(24)"><rect x="-8" y="-96" width="16" height="92" rx="7" fill="#1E1C22"/><rect x="-8" y="-70" width="16" height="6" fill="#FFC21A"/><rect x="5" y="-92" width="4" height="30" rx="2" fill="#FFC21A"/><path d="M-8 -4 L8 -4 L0 24 Z" fill="#E8E9EE"/><path d="M0 2 V20" stroke="#8B8F99" stroke-width="1.6"/><circle cx="0" cy="4" r="1.8" fill="#8B8F99"/></g>', ''];
  if (o === 'tesoura') return ['alto', '<g transform="translate(184 127) rotate(14)"><path d="M-3 2 L-11 -60 C-9 -66 -4 -66 -2 -60 L4 -2 Z" fill="#DDE1E7" stroke="#9AA3AD" stroke-width="1.5"/><path d="M3 2 L11 -60 C9 -66 4 -66 2 -60 L-4 -2 Z" fill="#EEF1F4" stroke="#9AA3AD" stroke-width="1.5"/><circle cx="0" cy="-6" r="3.2" fill="#6B7280"/><circle cx="-9" cy="14" r="8.5" fill="none" stroke="#E8402F" stroke-width="6"/><circle cx="9" cy="14" r="8.5" fill="none" stroke="#E8402F" stroke-width="6"/></g>', ''];
  if (o === 'lapis') return ['baixo', '<g transform="translate(164 229) rotate(22)"><rect x="-9" y="-100" width="18" height="12" rx="4" fill="#FF8FB1"/><rect x="-9" y="-90" width="18" height="8" fill="#C9CDD6"/><rect x="-9" y="-82" width="18" height="84" fill="#FFB020"/><rect x="-3" y="-82" width="6" height="84" fill="#FFC85A"/><path d="M-9 2 L9 2 L0 28 Z" fill="#F2D3A6"/><path d="M-3.5 18 L3.5 18 L0 28 Z" fill="#2B2B33"/></g>', ''];
  if (o === 'camera') return ['frente', '', '<g><rect x="140" y="190" width="58" height="38" rx="8" fill="#26262E"/><rect x="148" y="184" width="16" height="8" rx="3" fill="#26262E"/><circle cx="174" cy="209" r="13" fill="#3A3A46" stroke="#8A8FA3" stroke-width="3.5"/><circle cx="174" cy="209" r="6.5" fill="#5DE0FF" opacity=".75"/><circle cx="171" cy="206" r="2" fill="#fff" opacity=".9"/><circle cx="150" cy="200" r="3.2" fill="#FF3B30"/></g>'];
  if (o === 'celular') return ['alto', '<g transform="translate(184 127) rotate(10)"><rect x="-15" y="-46" width="30" height="54" rx="7" fill="#1F1F25"/><rect x="-12" y="-42" width="24" height="44" rx="4" fill="#FFE4EF"/><path d="M0 -14 C-8 -20 -8 -27 -4 -28 C-2 -29 -1 -27 0 -26 C1 -27 2 -29 4 -28 C8 -27 8 -20 0 -14 Z" fill="#FF2D78"/><rect x="-8" y="-8" width="16" height="3" rx="1.5" fill="#FF9DC0"/></g><g transform="translate(206 92)"><circle r="12" fill="#FF2D78"/><path d="M0 5 C-6 1 -6 -4 -3 -5 C-1.5 -5.5 -0.5 -4.5 0 -3.5 C0.5 -4.5 1.5 -5.5 3 -5 C6 -4 6 1 0 5 Z" fill="#fff"/></g>', ''];
  if (o === 'alvo') return ['frente', '', '<g><circle cx="174" cy="206" r="27" fill="#fff"/><circle cx="174" cy="206" r="21" fill="#FF4245"/><circle cx="174" cy="206" r="14" fill="#fff"/><circle cx="174" cy="206" r="7" fill="#FF4245"/><path d="M174 206 L196 186" stroke="#1E1C22" stroke-width="3.5" stroke-linecap="round"/><path d="M193 183 l9 -3 l-3 9 z" fill="#2DC66F"/></g>'];
  if (o === 'prancheta') return ['frente', '', '<g transform="rotate(-8 172 206)"><rect x="148" y="176" width="48" height="60" rx="6" fill="#8B5E3C"/><rect x="153" y="183" width="38" height="49" rx="3" fill="#FFFFFF"/><rect x="162" y="171" width="20" height="10" rx="3" fill="#C9CDD6"/>' +
    [0, 1, 2].map(i => '<path d="M158 ' + (195 + i * 12) + ' l3 3 l5 -6" stroke="#2DC66F" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/><rect x="170" y="' + (193 + i * 12) + '" width="16" height="3" rx="1.5" fill="#C9CDD6"/>').join('') + '</g>'];
  if (o === 'microfone') return ['boca', '<g transform="translate(155 143) rotate(-28)"><rect x="-5" y="-6" width="10" height="34" rx="5" fill="#2A2830"/><circle cx="0" cy="-16" r="12" fill="#A9AFB8"/><path d="M-9 -20 h18 M-11 -14 h22 M-8 -8 h16" stroke="#7D838D" stroke-width="1.4"/><rect x="-6" y="-5" width="12" height="4" rx="2" fill="#C8B4FF"/></g>', ''];
  if (o === 'megafone') return ['boca', '<g transform="translate(156 142) rotate(-24)"><rect x="-2" y="2" width="8" height="15" rx="3" fill="#20242C"/><path d="M-6 -7 L34 -20 L34 20 L-6 7 Z" fill="#F4F6F9" stroke="#C3CAD4" stroke-width="1.5" stroke-linejoin="round"/><path d="M6 -10.8 L6 10.8" stroke="#0B6BD3" stroke-width="5"/><ellipse cx="34" cy="0" rx="5.5" ry="20" fill="#0B6BD3"/><ellipse cx="34" cy="0" rx="3" ry="15" fill="#08509E"/><rect x="-14" y="-5.5" width="10" height="11" rx="3" fill="#20242C"/>' +
    '<path d="M46 -14 q8 14 0 28 M55 -21 q12 21 0 42" stroke="#0B6BD3" stroke-width="3.2" fill="none" stroke-linecap="round"/></g>', ''];
  if (o === 'tablet') return ['frente', '', '<g transform="rotate(-7 173 207)"><rect x="146" y="176" width="54" height="64" rx="8" fill="#1F232B"/><rect x="151" y="181" width="44" height="54" rx="4" fill="#F6FAF0"/>' +
    '<rect x="157" y="214" width="7" height="14" rx="1.5" fill="#B9E58A"/><rect x="168" y="206" width="7" height="22" rx="1.5" fill="#8FD14F"/><rect x="179" y="196" width="7" height="32" rx="1.5" fill="#4FA61B"/>' +
    '<path d="M156 204 L166 196 L174 199 L188 186" stroke="#FF4245" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M182 185 l7 -1 l-1 7" stroke="#FF4245" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></g>'];
  if (o === 'claquete') return ['alto', '<g transform="translate(184 127) rotate(10)"><rect x="-27" y="-44" width="54" height="40" rx="4" fill="#23262E"/>' +
    '<path d="M-21 -30 H21 M-21 -21 H8 M-21 -12 H14" stroke="#F4F4F4" stroke-opacity=".75" stroke-width="2.2" stroke-linecap="round"/>' +
    '<rect x="-27" y="-50" width="54" height="7" fill="#F4F4F4"/><path d="M-20 -50 l-6 7 h6 l6 -7 Z M-4 -50 l-6 7 h6 l6 -7 Z M12 -50 l-6 7 h6 l6 -7 Z" fill="#23262E"/>' +
    '<g transform="rotate(-16 -27 -50)"><rect x="-27" y="-59" width="54" height="8" rx="1.5" fill="#F4F4F4"/><path d="M-18 -59 l-6 8 h6 l6 -8 Z M-2 -59 l-6 8 h6 l6 -8 Z M14 -59 l-6 8 h6 l6 -8 Z" fill="#23262E"/></g></g>', ''];
  if (o === 'agulha') return ['alto', '<g transform="translate(184 127) rotate(16)"><path d="M-3.4 6 L-3.4 -68 L0 -86 L3.4 -68 L3.4 6 C3.4 9 -3.4 9 -3.4 6 Z" fill="#E3E7EC" stroke="#9AA3AD" stroke-width="1.4" stroke-linejoin="round"/><rect x="-1.2" y="-4" width="2.4" height="8" rx="1.2" fill="#6B7280"/>' +
    '<path d="M0 -2 C18 4 22 -18 10 -26 C0 -32 -14 -22 -8 -12 C-4 -6 6 -8 8 -14" stroke="#FFC21A" stroke-width="3" fill="none" stroke-linecap="round"/></g>', ''];
  return ['baixo', '', ''];
}

/** O personagem inteiro (fundo transparente), em SVG. viewBox 240 x 320. */
function personagemSVG(id) {
  const p = dados(id); if (!p) return '';
  const pelEsc = tom(p.pele, -0.12), roupaEsc = tom(p.roupa.cor, -0.22);
  const [poseD, objAntes, objDepois] = objeto(p);
  const bE = BRACOS_E[p.bracoE || 'baixo'], bD = BRACOS_D[poseD];
  const bn = bone(p);
  let s = '';
  s += '<ellipse cx="120" cy="300" rx="58" ry="8" fill="#000" opacity=".22"/>';
  s += bn.atras + cabeloAtras(p);
  // pernas e tênis
  s += '<path d="M98 236 H116 V284 Q116 288 112 288 H102 Q98 288 98 284 Z" fill="' + p.calca + '"/><path d="M124 236 H142 V284 Q142 288 138 288 H128 Q124 288 124 284 Z" fill="' + p.calca + '"/>';
  s += '<path d="M86 296 Q86 281 101 281 H114 Q118 281 118 285 V296 Z" fill="' + p.tenis + '"/><rect x="85" y="293" width="34" height="6.5" rx="3.2" fill="' + p.sola + '"/>';
  s += '<path d="M154 296 Q154 281 139 281 H126 Q122 281 122 285 V296 Z" fill="' + p.tenis + '"/><rect x="121" y="293" width="34" height="6.5" rx="3.2" fill="' + p.sola + '"/>';
  // pescoço e tronco
  s += '<rect x="110" y="136" width="20" height="26" rx="8" fill="' + pelEsc + '"/>';
  s += '<path d="M82 176 C82 162 92 156 106 156 H134 C148 156 158 162 158 176 L154 234 C154 240 150 244 144 244 H96 C90 244 86 240 86 234 Z" fill="' + p.roupa.cor + '"/>';
  s += '<rect x="86" y="233" width="68" height="11" rx="5.5" fill="' + p.roupa.det + '"/>';
  if (p.colete) {
    s += '<path d="M100 158 L104 242 H86 L84 176 C84 166 90 160 100 158 Z M140 158 L136 242 H154 L156 176 C156 166 150 160 140 158 Z" fill="' + tom(p.roupa.cor, -0.18) + '"/>';
    s += '<rect x="88" y="196" width="13" height="14" rx="3" fill="' + tom(p.roupa.cor, 0.12) + '"/><rect x="139" y="196" width="13" height="14" rx="3" fill="' + tom(p.roupa.cor, 0.12) + '"/>';
    s += '<path d="M104 158 C110 170 130 170 136 158" fill="' + p.roupa.det + '"/>';
  } else {
    s += '<path d="M96 158 C104 180 136 180 144 158 C134 150 106 150 96 158 Z" fill="' + roupaEsc + '"/>';
    s += '<path d="M112 168 L110 186 M128 168 L130 186" stroke="' + p.roupa.det + '" stroke-width="2.6" stroke-linecap="round"/><circle cx="110" cy="188" r="2.6" fill="' + p.roupa.det + '"/><circle cx="130" cy="188" r="2.6" fill="' + p.roupa.det + '"/>';
    s += '<path d="M100 206 H140 L145 226 H95 Z" fill="#000" opacity=".14"/>';
  }
  s += fone(p);
  // braço esquerdo (da tela)
  s += manga(bE[0], p.roupa.cor) + mao(bE[1], bE[2], p.pele);
  // cabeça
  s += '<ellipse cx="77" cy="112" rx="7" ry="9.5" fill="' + p.pele + '"/><ellipse cx="163" cy="112" rx="7" ry="9.5" fill="' + p.pele + '"/>';
  if (p.rosto.brinco) s += '<circle cx="76" cy="124" r="3" fill="#FFD23A"/>';
  s += '<ellipse cx="120" cy="106" rx="44" ry="43" fill="' + p.pele + '"/>';
  s += barba(p) + rosto(p) + oculos(p) + cabeloFrente(p) + bn.s;
  // braço direito com o objeto
  s += manga(bD[0], p.roupa.cor) + objAntes + mao(bD[1], bD[2], p.pele) + objDepois;
  return '<svg viewBox="0 0 240 320" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="' + p.nome + '">' + s + '</svg>';
}
/** Só a cabeça (pro avatar redondo da equipe e da bolinha de quem está online). */
function cabecaSVG(id) {
  const s = personagemSVG(id);
  return s.replace('viewBox="0 0 240 320"', 'viewBox="62 40 116 116"');
}

/** Os dados de um personagem (nome, classe, cores) ou null. */
function dados(id) { return Object.prototype.hasOwnProperty.call(PERSONAGENS, id) ? PERSONAGENS[id] : null; }
const PG = { ORDEM, dados, svg: personagemSVG, cabeca: cabecaSVG, tom };
if (typeof module !== 'undefined' && module.exports) module.exports = Object.assign({ PERSONAGENS }, PG);
else window.PG = PG;
})();
