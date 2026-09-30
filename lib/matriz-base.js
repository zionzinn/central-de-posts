// v3.91: o que toda matriz de conteúdo faz igual (semana A/B, tipo do dia, limpeza dos campos, card vazio e card novo),
// a partir das regras de cada empresa. A da Weevo usa daqui; a da SeuBoné (lib/matriz-seubone.js) continua com as
// funções dela, que são as mesmas, pra não mexer no que já roda.
'use strict';

const DIA_MS = 86400000;
const utc = iso => Date.parse(iso + 'T12:00:00Z');

module.exports = function baseMatriz(cfg) {
  const { TIPOS, SEMANAS, ANCORA, INICIO, STATUS, CAMPOS, OBRIGATORIOS, CONTEUDO } = cfg;
  /** Semana A ou B de uma data, contando a partir da âncora (segunda-feira de uma semana A). */
  function semanaDe(iso) {
    const d = utc(iso), dowSeg = (new Date(d).getUTCDay() + 6) % 7; // 0 = segunda
    const semanas = Math.round((d - dowSeg * DIA_MS - utc(ANCORA)) / DIA_MS / 7);
    return ((semanas % 2) + 2) % 2 === 0 ? 'A' : 'B';
  }
  /** O que a matriz pede num dia: {semana, tipo (ou null se em aberto), opcoes}. Antes do início da matriz: null. */
  function tipoDoDia(iso) {
    if (!iso || (INICIO && iso < INICIO)) return null;
    const semana = semanaDe(iso);
    const dowSeg = (new Date(utc(iso)).getUTCDay() + 6) % 7;
    const v = SEMANAS[semana][dowSeg];
    return Array.isArray(v) ? { semana, tipo: null, opcoes: v.slice() } : { semana, tipo: v, opcoes: null };
  }
  /** Saneia o que vem do navegador. Tipo só se for um tipo conhecido; status só da lista. */
  function limpa(m, anterior) {
    if (!m || typeof m !== 'object') return null;
    const out = Object.assign({}, anterior || {});
    for (const k of CAMPOS) {
      if (!(k in m)) continue;
      let v = String(m[k] == null ? '' : m[k]).replace(/[<>]/g, '').trim().slice(0, k === 'descricao' || k === 'refs' ? 4000 : 1500);
      if (k === 'tipo' && v && !TIPOS[v]) v = '';
      if (k === 'status' && !STATUS.includes(v)) v = 'Não iniciado';
      out[k] = v;
    }
    if (!out.status) out.status = 'Não iniciado';
    // preencheu tudo que é obrigatório e ainda estava "Não iniciado": o briefing está criado
    if (out.status === 'Não iniciado' && OBRIGATORIOS.every(k => out[k])) out.status = 'Briefing criado';
    return out;
  }
  /** Card sem nenhum conteúdo (só o tipo do dia). */
  function vazio(m) { return !m || CONTEUDO.every(k => !String(m[k] || '').trim()); }
  /** Card novo, só com o tipo do dia (quem preenche é a copywriter). */
  function cardDoDia(iso) { return limpa({ tipo: (tipoDoDia(iso) || {}).tipo || '', status: 'Não iniciado' }); }
  return { semanaDe, tipoDoDia, limpa, vazio, cardDoDia };
};
